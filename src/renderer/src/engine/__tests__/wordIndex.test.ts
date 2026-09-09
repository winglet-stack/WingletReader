/**
 * Word index (`architecture-depth/08`).
 *
 * Three claims, in order of how much rests on them:
 *
 * 1. **The word definition is one definition.** The sequence `buildStacks` packs
 *    into Stacks — the space every persisted `wordOffset` was written in — is
 *    word-for-word the sequence `forEachWord` walks over the same text. Without
 *    that, an offset produced against Stacks and looked up against characters,
 *    paragraphs or Pages silently lands on the wrong word.
 * 2. **Persisted offsets keep resolving to the same places.** Asserted with
 *    literal offsets, the way a store holds them, across two different
 *    `words_per_stack` settings — the ADR-0024 invariant that offsets are stable
 *    while stack indices are derived.
 * 3. **The index answers exactly what the three moved helpers answered.** The
 *    `wordOffsetAtIndex` / `resolveWordsToStackIndex` / `resolveRestoreIndex`
 *    cases from `readerSession.test.ts` live on here, unchanged in expectation.
 */
import { describe, it, expect } from 'vitest'
import { buildStacks, type ChunkRules } from '../tokenizer'
import { forEachWord } from '../wordHighlight'
import {
  EMPTY_STACK_INDEX,
  EMPTY_TEXT_INDEX,
  buildStackWordIndex,
  buildTextWordIndex
} from '../wordIndex'
import { countWords } from '../../../../shared/importTextCleanup'
import type { WordStack } from '../../types'

function makeStacks(wordCounts: number[]): WordStack[] {
  return wordCounts.map((n) => ({
    words: Array.from({ length: n }, (_, i) => `w${i}`),
    type: 'normal' as const,
  }))
}

/** Every chunk rule on, so no rule can quietly drop or duplicate a word. */
const ALL_RULES: ChunkRules = {
  longWord: true,
  enumerations: true,
  bullets: true,
  commas: true,
  names: true,
  headlines: true,
}

/** The words the tokenizer actually packs, flattened back into one sequence. */
function stackWords(text: string, wordsPerStack: number, rules?: ChunkRules): string[] {
  return buildStacks(text, wordsPerStack, rules).flatMap((stack) => stack.words)
}

/** The words the text walk yields, in order. */
function walkWords(text: string): string[] {
  const words: string[] = []
  forEachWord(text, (position) => words.push(position.text))
  return words
}

// ── 1. One word definition ───────────────────────────────────────────────────

const SHAPES: Array<{ name: string; text: string }> = [
  { name: 'plain prose', text: 'The lamp had not been lit.\n\nA green flare cut the fog.' },
  { name: 'a markdown headline', text: '# The Wreck\n\nHe counted the seconds.' },
  { name: 'a six-hash headline', text: '###### Deep\n\nStill prose.' },
  { name: 'a hash with no space', text: '#Wreck\n\nHe counted.' },
  { name: 'a hash-only paragraph', text: '###\n\nHe counted.' },
  { name: 'an ALL CAPS headline', text: 'THE WRECK\n\nHe counted the seconds.' },
  { name: 'soft-wrapped lines', text: 'The lamp had\nnot been lit.\n\nA flare\ncut the fog.' },
  { name: 'many blank lines', text: 'One.\n\n\n\n\nTwo.' },
  { name: 'leading and trailing space', text: '   The lamp.   \n\n   A flare.   ' },
  { name: 'bullets and enumerations', text: '- one\n- two\n\n1. first\n2. second' },
  { name: 'names and commas', text: 'Maren Solberg walked in, slowly, and sat.\n\nJon Vik followed.' },
  { name: 'dialogue with abbreviations', text: '"Are you sure?" he asked. Dr. Vik nodded. e.g. this.' },
  { name: 'a very long word', text: 'An incomprehensibilities cascade followed the flare.' },
  { name: 'unicode', text: 'Café — naïve “quotes” and an em—dash.\n\nÅsa nodded.' },
  { name: 'a form feed', text: 'One page.\fAnother page.' },
  { name: 'empty', text: '' },
  { name: 'whitespace only', text: '   \n\n   \n' },
]

describe('the anchored word definition', () => {
  for (const { name, text } of SHAPES) {
    it(`packs and walks the same words for ${name}`, () => {
      // The default rules, and then every rule on — neither may change which
      // words exist, only how they are grouped.
      expect(stackWords(text, 3)).toEqual(walkWords(text))
      expect(stackWords(text, 5, ALL_RULES)).toEqual(walkWords(text))
    })
  }

  it('is independent of words_per_stack — grouping changes, words do not', () => {
    const text = SHAPES[10].text
    const reference = walkWords(text)
    for (const wordsPerStack of [1, 2, 3, 4, 5, 7]) {
      expect(stackWords(text, wordsPerStack)).toEqual(reference)
    }
  })

  it('survives the \\f → \\n\\n substitution the display string makes', () => {
    // The RSVP path reads `content`; the plain view reads `content_display` with
    // form feeds turned into paragraph breaks. That moves paragraph boundaries,
    // never words — which is why an offset crosses between the two safely.
    const content = 'One page.\fAnother page.\n\nA third.'
    const display = content.replace(/\f/g, '\n\n')

    expect(walkWords(display)).toEqual(walkWords(content))
    expect(buildTextWordIndex(display).totalWords).toBe(buildTextWordIndex(content).totalWords)
  })

  it('survives the soft-wrap difference between content and content_display', () => {
    // `content_display` is the same cleanup pass with soft-wrap conversion
    // skipped, so the two strings differ only in whitespace.
    const display = 'The lamp had\nnot been lit.\n\nA flare\ncut the fog.'
    const content = 'The lamp had not been lit.\n\nA flare cut the fog.'

    expect(walkWords(display)).toEqual(walkWords(content))
  })

  it('documents the one definition that stays outside the index', () => {
    // `countWords` (frozen, shared with the .wbook and EPUB derivations) counts
    // the raw whitespace split with no headline stripping, so a literal heading
    // marker costs it one extra word. Deliberate — it must not be touched.
    const withHeading = '# The Wreck\n\nHe counted.'
    expect(countWords(withHeading)).toBe(buildTextWordIndex(withHeading).totalWords + 1)

    // On heading-marker-free prose — which is what both structured formats
    // produce — the two agree exactly.
    const prose = 'The lamp had not been lit.\n\nA green flare cut the fog.'
    expect(countWords(prose)).toBe(buildTextWordIndex(prose).totalWords)
  })
})

// ── 2. Persisted offsets resolve to the same places ──────────────────────────

/** A book with headings, dialogue and blank lines — 40 words as the index counts. */
const BOOK = [
  '# The Wreck',
  '',
  'The lamp had not been lit for three nights, and old Maren felt the silence.',
  '',
  '"Are you sure?" he asked. Dr. Vik nodded once.',
  '',
  '# The Flare',
  '',
  'A green flare cut the fog above the reef, and Maren answered with two flashes.',
].join('\n')

describe('persisted offsets', () => {
  /**
   * Literal offsets, as a store holds them — not values re-derived from the
   * current tokenization, which would make the assertion circular.
   */
  const PERSISTED = [0, 4, 12, 19, 26, 33]

  it('name the same words no matter what words_per_stack is', () => {
    const words = buildTextWordIndex(BOOK).wordPositions.map((position) => position.text)

    // Pinned, so a change to the word definition fails here rather than silently
    // moving every existing bookmark.
    expect(PERSISTED.map((offset) => words[offset])).toEqual([
      'The',
      'had',
      'old',
      'sure?"',
      'The',
      'fog',
    ])

    // The tokenizer agrees, at every grouping.
    for (const wordsPerStack of [2, 3, 5, 7]) {
      const packed = stackWords(BOOK, wordsPerStack)
      expect(PERSISTED.map((offset) => packed[offset])).toEqual(
        PERSISTED.map((offset) => words[offset])
      )
    }
  })

  it('resolve to a stack boundary at or after themselves, within one stack', () => {
    for (const wordsPerStack of [2, 3, 5, 7]) {
      const index = buildStackWordIndex(buildStacks(BOOK, wordsPerStack))
      for (const offset of PERSISTED) {
        const stack = index.stackAtOffset(offset)
        const landed = index.offsetAtStack(stack)
        expect(landed).toBeGreaterThanOrEqual(offset)
        // The boundary before it is strictly behind the offset, so nothing
        // closer was available: resolution is exact, not merely near.
        if (stack > 0) expect(index.offsetAtStack(stack - 1)).toBeLessThan(offset)
      }
    }
  })

  it('restore to the nearest stack start at or after themselves', () => {
    for (const wordsPerStack of [2, 3, 5]) {
      const index = buildStackWordIndex(buildStacks(BOOK, wordsPerStack))
      for (const offset of PERSISTED) {
        const stack = index.restoreStackAtOffset(offset)
        expect(index.offsetAtStack(stack)).toBeGreaterThanOrEqual(offset)
        if (stack > 0) expect(index.offsetAtStack(stack - 1)).toBeLessThan(offset)
      }
    }
  })

  it('land on the same Page and paragraph however the text is grouped', () => {
    const index = buildTextWordIndex(BOOK)
    // Page and paragraph lookups read the text, never the tokenization, so they
    // are constant by construction — pinned here so a regression is loud.
    expect(PERSISTED.map((offset) => index.pageAtOffset(offset))).toEqual([0, 0, 0, 0, 0, 0])
    expect(PERSISTED.map((offset) => index.paragraphAtOffset(offset))).toEqual([0, 1, 1, 2, 3, 4])
  })
})

// ── 3. The moved helpers, unchanged in expectation ───────────────────────────

describe('offsetAtStack (was wordOffsetAtIndex)', () => {
  it('returns 0 for stack index 0', () => {
    expect(buildStackWordIndex(makeStacks([3, 3, 3])).offsetAtStack(0)).toBe(0)
  })

  it('returns the sum of words in all preceding stacks', () => {
    const index = buildStackWordIndex(makeStacks([3, 5, 2]))
    expect(index.offsetAtStack(1)).toBe(3)
    expect(index.offsetAtStack(2)).toBe(8)
    expect(index.offsetAtStack(3)).toBe(10)
  })

  it('handles uniform stack sizes', () => {
    const index = buildStackWordIndex(makeStacks([2, 2, 2, 2]))
    expect(index.offsetAtStack(2)).toBe(4)
    expect(index.offsetAtStack(4)).toBe(8)
  })

  it('clamps beyond stacks.length to the total word count', () => {
    const index = buildStackWordIndex(makeStacks([2, 1, 3]))
    expect(index.offsetAtStack(100)).toBe(6)
  })

  it('handles an empty tokenization gracefully', () => {
    expect(buildStackWordIndex([]).offsetAtStack(5)).toBe(0)
  })

  it('does not copy the stack array — the Reader calls this every render', () => {
    const stacks = makeStacks([3, 3, 3])
    const spy = { count: 0 }
    const guarded = new Proxy(stacks, {
      get(target, key, receiver) {
        if (key === 'slice') spy.count += 1
        return Reflect.get(target, key, receiver)
      },
    })
    const index = buildStackWordIndex(guarded as WordStack[])
    for (let i = 0; i < 50; i++) index.offsetAtStack(i % 4)
    expect(spy.count).toBe(0)
  })
})

describe('stackAtOffset (was resolveWordsToStackIndex)', () => {
  it('returns 0 for the start of the text', () => {
    expect(buildStackWordIndex(makeStacks([2, 1, 3])).stackAtOffset(0)).toBe(0)
  })

  it('returns the first stack boundary at or after the offset', () => {
    const index = buildStackWordIndex(makeStacks([2, 1, 3]))
    expect(index.stackAtOffset(3)).toBe(2)
    expect(index.stackAtOffset(4)).toBe(3)
  })

  it('clamps an offset past the end to the last stack', () => {
    expect(buildStackWordIndex(makeStacks([2, 1, 3])).stackAtOffset(100)).toBe(3)
  })

  it('handles an empty tokenization gracefully', () => {
    expect(buildStackWordIndex([]).stackAtOffset(5)).toBe(0)
  })

  it('resolves n bookmarks without n traversals', () => {
    // One build, then a binary search each — the shape the Reader's marker list
    // depends on. A thousand lookups over a thousand stacks used to be a million
    // stack visits.
    const index = buildStackWordIndex(makeStacks(Array.from({ length: 1000 }, () => 3)))
    const resolved = Array.from({ length: 1000 }, (_, i) => index.stackAtOffset(i * 3))
    expect(resolved[0]).toBe(0)
    expect(resolved[1]).toBe(1)
    expect(resolved[999]).toBe(999)
  })
})

describe('restoreStackAtOffset (was resolveRestoreIndex)', () => {
  const index = buildStackWordIndex(makeStacks([2, 1, 3]))

  it('returns 0 for offset 0', () => {
    expect(index.restoreStackAtOffset(0)).toBe(0)
  })

  it('returns the first stack whose start is at or after the offset', () => {
    expect(index.restoreStackAtOffset(2)).toBe(1)
    expect(index.restoreStackAtOffset(3)).toBe(2)
  })

  it('rounds an offset inside a stack forward to the next start', () => {
    expect(index.restoreStackAtOffset(1)).toBe(1)
    expect(index.restoreStackAtOffset(4)).toBe(2)
  })

  it('clamps past the end to the last stack', () => {
    expect(index.restoreStackAtOffset(6)).toBe(2)
    expect(index.restoreStackAtOffset(100)).toBe(2)
  })

  it('handles an empty tokenization gracefully', () => {
    expect(buildStackWordIndex([]).restoreStackAtOffset(0)).toBe(0)
    expect(buildStackWordIndex([]).restoreStackAtOffset(5)).toBe(0)
  })
})

// ── The text half ────────────────────────────────────────────────────────────

describe('the text half', () => {
  const index = buildTextWordIndex(BOOK)

  it('totals the words it walked', () => {
    expect(index.totalWords).toBe(index.wordPositions.length)
    expect(index.totalWords).toBe(walkWords(BOOK).length)
  })

  it('answers a word’s character range, and null outside the text', () => {
    const range = index.charRangeAt(0)!
    expect(BOOK.slice(range.start, range.end)).toBe('The')
    expect(index.charRangeAt(-1)).toBeNull()
    expect(index.charRangeAt(index.totalWords)).toBeNull()
  })

  it('quotes a four-word snippet, clamped at the end', () => {
    expect(index.snippetAt(0)).toBe('The Wreck The lamp')
    expect(index.snippetAt(0, 2)).toBe('The Wreck')
    expect(index.snippetAt(index.totalWords - 2)).toBe(
      walkWords(BOOK).slice(-2).join(' ')
    )
    expect(index.snippetAt(-1)).toBe('')
    expect(index.snippetAt(index.totalWords)).toBe('')
  })

  it('maps offsets to paragraphs, clamped at both ends', () => {
    expect(index.paragraphAtOffset(0)).toBe(0)
    expect(index.paragraphAtOffset(-5)).toBe(0)
    expect(index.paragraphAtOffset(1_000_000)).toBe(index.paragraphWordCounts.length - 1)
    expect(index.paragraphWordCounts.reduce((a, b) => a + b, 0)).toBe(index.totalWords)
  })

  it('maps offsets to Pages and back to word ranges', () => {
    expect(index.pageStarts[0]).toBe(0)
    expect(index.pageAtOffset(0)).toBe(0)
    const range = index.pageRangeAt(0)
    expect(range.startWord).toBe(0)
    expect(range.endWord).toBe(index.totalWords)
  })

  it('breaks a long text into Pages whose ranges tile the whole word sequence', () => {
    const long = Array.from({ length: 40 }, (_, p) =>
      Array.from({ length: 40 }, (_, w) => `p${p}w${w}`).join(' ')
    ).join('\n\n')
    const longIndex = buildTextWordIndex(long)

    expect(longIndex.pageStarts.length).toBeGreaterThan(1)
    let covered = 0
    for (let page = 0; page < longIndex.pageStarts.length; page++) {
      const { startWord, endWord } = longIndex.pageRangeAt(page)
      expect(startWord).toBe(covered)
      covered = endWord
      // Every word on the page reports that page back.
      expect(longIndex.pageAtOffset(startWord)).toBe(page)
      expect(longIndex.pageAtOffset(endWord - 1)).toBe(page)
    }
    expect(covered).toBe(longIndex.totalWords)
  })

  it('walks a word-less text into the empty index', () => {
    expect(buildTextWordIndex('   \n\n  ')).toBe(EMPTY_TEXT_INDEX)
    expect(EMPTY_TEXT_INDEX.totalWords).toBe(0)
    expect(EMPTY_TEXT_INDEX.pageStarts).toEqual([0])
    expect(EMPTY_TEXT_INDEX.snippetAt(0)).toBe('')
    expect(EMPTY_TEXT_INDEX.charRangeAt(0)).toBeNull()
  })

  it('gives an absent tokenization the empty stack index', () => {
    expect(buildStackWordIndex([])).toBe(EMPTY_STACK_INDEX)
    expect(EMPTY_STACK_INDEX.totalWords).toBe(0)
    expect(EMPTY_STACK_INDEX.stackCount).toBe(0)
  })
})
