/**
 * Word index — one walk per engaged text (`architecture-depth/08`).
 *
 * ## The anchored word definition
 *
 * A `wordOffset` is an index into **the reading word sequence**: the words the
 * tokenizer produces from a text, in document order, counted from 0. That is the
 * space every persisted offset already lives in — a bookmark's `wordOffset`
 * (ADR-0024) and a saved reading position are both produced by converting a
 * stack index through {@link StackWordIndex.offsetAtStack}, whose input is
 * `buildStacks(content, …)`.
 *
 * `forEachWord` in `wordHighlight.ts` walks the *same* sequence over the text
 * itself, and since `architecture-depth/08` it strips markdown-headline prefixes
 * with the tokenizer's own rule, so the two agree word for word. That agreement
 * is what makes an offset produced against Stacks safe to look up against
 * characters, paragraphs and Pages — it is asserted directly in
 * `__tests__/wordIndex.test.ts` rather than assumed.
 *
 * **One definition stays deliberately outside this index:** the frozen
 * `countWords` in `src/shared/importTextCleanup.ts`, which derives a
 * `TextSegment`'s `startWordOffset`/`endWordOffset` at import. It counts
 * `text.trim().split(/\s+/)` over the whole string, with no paragraph splitting
 * and no headline stripping, so a text carrying literal `#` heading markers
 * counts one word more per heading there than here. It is shared with the
 * `.wbook` and EPUB derivations and their byte-parity fixtures, so it must not
 * move; in practice both structured formats produce heading-marker-free prose,
 * where the two agree exactly. Do not "fix" that by touching `countWords`.
 *
 * ## Two halves, because they cost different amounts
 *
 * The **stack half** is prefix sums over stacks that already exist — microscopic,
 * and rebuilt whenever a re-tokenization delivers new stacks (they arrive
 * asynchronously from the off-thread builder, so it must tolerate having none
 * yet).
 *
 * The **text half** is a whole-book walk. OL-1 moved that walk off the engage
 * first-paint frame and it must stay off: it is built only when a surface that
 * needs characters, Pages or paragraphs is actually shown. {@link EMPTY_TEXT_INDEX}
 * is what a deferred consumer holds until then.
 *
 * Everything here is **in memory only**. No store field, no schema change, no
 * persistence — this does not reopen OL-2 (ADR-0025), which dropped *persisting*
 * page starts to the JSON store.
 */
import type { TextRecord, WordStack } from '../types'
import { scanText, type WordPosition } from './wordHighlight'
import {
  computePageStartsFromCounts,
  pageForWordOffset,
  pageRange,
  type PageOptions,
  type PageRange
} from './textPagination'

/**
 * The string a text's words are read from: `content_display` when the import
 * kept a separate display rendition, else `content`, with form feeds turned
 * into paragraph breaks.
 *
 * The two renditions differ only in whitespace — `content_display` is the same
 * cleanup pass with soft-line-wrap conversion skipped — so they carry the
 * **same word sequence**, which is what lets an offset produced against
 * `content`'s Stacks be looked up here. `__tests__/wordIndex.test.ts` pins that.
 */
export function displayRenditionOf(
  text: Pick<TextRecord, 'content' | 'content_display'>
): string {
  return (text.content_display ?? text.content ?? '').replace(/\f/g, '\n\n')
}

/**
 * Index of the first entry in an ascending array that is `>= value`, or
 * `array.length` when none is. One binary search replaces the linear scans the
 * offset helpers used to run per lookup.
 */
function lowerBound(ascending: readonly number[], value: number): number {
  let lo = 0
  let hi = ascending.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (ascending[mid] < value) lo = mid + 1
    else hi = mid
  }
  return lo
}

// ---------------------------------------------------------------------------
// The stack half — offset ⇄ stack
// ---------------------------------------------------------------------------

export interface StackWordIndex {
  /** Words in the whole tokenization. */
  readonly totalWords: number
  readonly stackCount: number
  /**
   * Cumulative words before `stackIndex` — the durable `wordOffset` of a stack
   * boundary, and the value every persisted bookmark and reading position was
   * written from. Out-of-range indices clamp. O(1), and no array copy: the old
   * `stacks.slice(0, i).reduce(…)` allocated a fresh prefix on every call, and
   * the Reader calls this on every render.
   */
  offsetAtStack(stackIndex: number): number
  /**
   * The live stack index a durable `wordOffset` resolves to: the first stack
   * boundary at or after the offset (ADR-0024 — offsets are stable, stack
   * indices are derived at use time, because they shift with `words_per_stack`).
   * O(log n), so resolving n bookmarks costs n binary searches rather than n
   * full traversals.
   */
  stackAtOffset(wordOffset: number): number
  /**
   * Where playback resumes after a re-tokenization reset it to stack 0: the
   * first stack whose *starting* word offset is `>= offset`, clamped to the last
   * stack. Distinct from {@link stackAtOffset} — this one lands on a stack
   * start, never one past it.
   */
  restoreStackAtOffset(offset: number): number
}

/** A tokenization that has not arrived yet (or a text with no words). */
export const EMPTY_STACK_INDEX: StackWordIndex = {
  totalWords: 0,
  stackCount: 0,
  offsetAtStack: () => 0,
  stackAtOffset: () => 0,
  restoreStackAtOffset: () => 0
}

/**
 * Prefix-sums a tokenization once. `boundaries[i]` is the word offset at which
 * stack `i` begins, and `boundaries[stacks.length]` is the total — so every
 * lookup below is arithmetic or a binary search over one array.
 */
export function buildStackWordIndex(stacks: WordStack[]): StackWordIndex {
  if (stacks.length === 0) return EMPTY_STACK_INDEX

  const boundaries = new Array<number>(stacks.length + 1)
  boundaries[0] = 0
  for (let i = 0; i < stacks.length; i++) {
    boundaries[i + 1] = boundaries[i] + stacks[i].words.length
  }
  const stackCount = stacks.length
  const totalWords = boundaries[stackCount]

  return {
    totalWords,
    stackCount,

    offsetAtStack(stackIndex) {
      if (stackIndex <= 0) return 0
      return stackIndex >= stackCount ? totalWords : boundaries[stackIndex]
    },

    stackAtOffset(wordOffset) {
      if (wordOffset <= 0) return 0
      // The first boundary at or after the offset, expressed as "one past the
      // stack that reaches it" — boundaries[k] >= wordOffset ⇒ answer k.
      const k = lowerBound(boundaries, wordOffset)
      return k > stackCount ? stackCount : k
    },

    restoreStackAtOffset(offset) {
      return Math.min(lowerBound(boundaries, offset), stackCount - 1)
    }
  }
}

// ---------------------------------------------------------------------------
// The text half — offset ⇄ character ⇄ paragraph ⇄ page
// ---------------------------------------------------------------------------

/** Words a bookmark's fallback label quotes from the text. */
const SNIPPET_WORD_COUNT = 4

export interface TextWordIndex {
  /** Words in the text. Equals `wordPositions.length`. */
  readonly totalWords: number
  /** Character ranges of every word, in document order — the plain view renders these. */
  readonly wordPositions: readonly WordPosition[]
  /** Ascending Page start offsets; always begins with 0. */
  readonly pageStarts: readonly number[]
  /** Word count of each content paragraph, in document order. */
  readonly paragraphWordCounts: readonly number[]
  /** Character range of the word at `wordOffset`, or null when out of range. */
  charRangeAt(wordOffset: number): { start: number; end: number } | null
  /** 0-based paragraph containing `wordOffset`; clamped at both ends. */
  paragraphAtOffset(wordOffset: number): number
  /** 0-based Page containing `wordOffset`; clamped at both ends. */
  pageAtOffset(wordOffset: number): number
  /** Half-open word range of a Page; `pageIndex` is clamped into range. */
  pageRangeAt(pageIndex: number): PageRange
  /**
   * The next `wordCount` words from `wordOffset`, space-joined — a bookmark's
   * fallback label. Empty when the offset is out of range. Allocates only the
   * few words it quotes; the old helper rebuilt the whole position array per
   * call, and then walked the text a *second* time to check the offset.
   */
  snippetAt(wordOffset: number, wordCount?: number): string
}

/** The deferred text half: no words yet, one empty Page (OL-1). */
export const EMPTY_TEXT_INDEX: TextWordIndex = {
  totalWords: 0,
  wordPositions: [],
  pageStarts: [0],
  paragraphWordCounts: [],
  charRangeAt: () => null,
  paragraphAtOffset: () => 0,
  pageAtOffset: () => 0,
  pageRangeAt: () => ({ startWord: 0, endWord: 0 }),
  snippetAt: () => ''
}

/**
 * Walks a text **once** and caches everything derived from that walk: word
 * character ranges, paragraph boundaries and Page starts.
 *
 * Call this when a surface that needs it is shown, not when a text is engaged —
 * the RSVP path needs none of it, and paying for it on the engage frame is the
 * regression OL-1 removed.
 */
export function buildTextWordIndex(
  displayContent: string,
  options?: PageOptions
): TextWordIndex {
  const { wordPositions, paragraphWordCounts } = scanText(displayContent)
  if (wordPositions.length === 0) return EMPTY_TEXT_INDEX

  const pageStarts = computePageStartsFromCounts(paragraphWordCounts, options)

  // Paragraph start offsets, so paragraphAtOffset is a binary search rather than
  // a running sum per lookup.
  const paragraphStarts = new Array<number>(paragraphWordCounts.length)
  let running = 0
  for (let i = 0; i < paragraphWordCounts.length; i++) {
    paragraphStarts[i] = running
    running += paragraphWordCounts[i]
  }
  const totalWords = wordPositions.length

  return {
    totalWords,
    wordPositions,
    pageStarts,
    paragraphWordCounts,

    charRangeAt(wordOffset) {
      if (wordOffset < 0 || wordOffset >= totalWords) return null
      const position = wordPositions[wordOffset]
      return { start: position.start, end: position.end }
    },

    paragraphAtOffset(wordOffset) {
      if (wordOffset <= 0) return 0
      // The last paragraph whose start is <= the offset.
      const after = lowerBound(paragraphStarts, wordOffset + 1)
      return Math.max(0, Math.min(after - 1, paragraphStarts.length - 1))
    },

    pageAtOffset(wordOffset) {
      return pageForWordOffset(pageStarts, wordOffset)
    },

    pageRangeAt(pageIndex) {
      return pageRange(pageStarts, pageIndex, totalWords)
    },

    snippetAt(wordOffset, wordCount = SNIPPET_WORD_COUNT) {
      if (wordOffset < 0 || wordOffset >= totalWords) return ''
      const end = Math.min(wordOffset + wordCount, totalWords)
      let snippet = ''
      for (let i = wordOffset; i < end; i++) {
        snippet += i === wordOffset ? wordPositions[i].text : ` ${wordPositions[i].text}`
      }
      return snippet.trim()
    }
  }
}
