/**
 * Paged Text view pagination engine (ADR-0025, Library Facelift run 3).
 *
 * Pure arithmetic over a text's word sequence: it turns whole-text word offsets
 * into fixed-ish **Page** boundaries and looks them up. It never walks the text
 * itself — it takes the paragraph word counts `scanText` produced, so Page
 * indices are in the same `wordOffset` space as stacks and bookmark anchors by
 * construction. No React, no measurement; the **word index**
 * (`engine/wordIndex.ts`) is what caches these boundaries per engaged text and
 * exposes the lookups to consumers.
 */

/** Target words per Page. Whole paragraphs accumulate until this is reached. */
export const DEFAULT_TARGET_WORDS = 500

/**
 * Hard cap for a single Page. A paragraph larger than this (or a text with no
 * paragraph breaks that exceeds it) is hard-cut by word count so live DOM stays
 * bounded even on pathological input.
 */
export const DEFAULT_HARD_CAP = 800

export interface PageOptions {
  /** Words to accumulate before breaking at a paragraph end. */
  targetWords?: number
  /** Max words on a Page before a runaway paragraph is hard-cut. */
  hardCap?: number
}

/**
 * Ascending word offsets of Page start indices, from the paragraph word counts
 * `scanText` produced. Always begins with `0`, and every entry is a whole-text
 * word index in the anchored `wordOffset` space.
 *
 * Boundaries are paragraph-aware: whole paragraphs accumulate onto the current
 * Page until adding the next one would exceed `targetWords`, then the Page
 * breaks at the paragraph end — a paragraph is never split mid-sentence.
 * Runaway guard: a single paragraph longer than `hardCap` (and, equivalently, a
 * text with no paragraph breaks) is hard-cut into `hardCap`-sized slices. One
 * O(n) pass over the counts, and no walk of the text — the caller already did
 * exactly one (OL-1).
 *
 * A text shorter than one Page — including empty / word-less content — yields
 * `[0]` (a single Page).
 */
export function computePageStartsFromCounts(
  paragraphWordCounts: number[],
  options?: PageOptions
): number[] {
  const targetWords = options?.targetWords ?? DEFAULT_TARGET_WORDS
  const hardCap = options?.hardCap ?? DEFAULT_HARD_CAP

  const pageStarts = [0]
  // Word index at which the current (open) Page began.
  let pageStartWord = 0
  // Running word cursor: index of the first word of the paragraph being placed.
  let wordCursor = 0

  for (const count of paragraphWordCounts) {
    const wordsOnPage = wordCursor - pageStartWord

    // Break before this paragraph if the current Page already holds words and
    // swallowing the whole paragraph would overshoot the target. This keeps
    // paragraphs whole and lands Pages near the target.
    if (wordsOnPage > 0 && wordsOnPage + count > targetWords) {
      pageStartWord = wordCursor
      pageStarts.push(pageStartWord)
    }

    // Runaway guard: hard-cut a paragraph that alone overruns the hard cap. The
    // paragraph now sits at the front of its Page (either it was just broken to,
    // or it is the first paragraph), so cut in hardCap-sized slices.
    const paragraphEndWord = wordCursor + count
    while (paragraphEndWord - pageStartWord > hardCap) {
      pageStartWord += hardCap
      pageStarts.push(pageStartWord)
    }

    wordCursor = paragraphEndWord
  }

  return pageStarts
}

/**
 * 0-based Page index containing `wordOffset` — the last Page whose start is
 * `<= wordOffset` — via binary search over `pageStarts`. Offsets below the
 * first Page clamp to `0`; offsets at or beyond the final Page start return the
 * final Page. `pageStarts` must be non-empty and ascending (as produced by
 * `computePageStarts`).
 */
export function pageForWordOffset(pageStarts: number[], wordOffset: number): number {
  let lo = 0
  let hi = pageStarts.length - 1
  let answer = 0

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1
    if (pageStarts[mid] <= wordOffset) {
      answer = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }

  return answer
}

export interface PageRange {
  /** First word index on the Page (inclusive). */
  startWord: number
  /** One past the last word index on the Page (exclusive) — a slice bound. */
  endWord: number
}

/**
 * Half-open word range `[startWord, endWord)` for the Page at `pageIndex`. The
 * last Page ends at `totalWords`. `pageIndex` is clamped into range.
 */
export function pageRange(
  pageStarts: number[],
  pageIndex: number,
  totalWords: number
): PageRange {
  const clamped = Math.max(0, Math.min(pageIndex, pageStarts.length - 1))
  const startWord = pageStarts[clamped]
  const endWord = clamped + 1 < pageStarts.length ? pageStarts[clamped + 1] : totalWords
  return { startWord, endWord }
}
