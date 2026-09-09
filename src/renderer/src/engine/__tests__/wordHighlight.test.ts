import { describe, it, expect } from 'vitest'
import { scanText } from '../wordHighlight'
import { buildTextWordIndex } from '../wordIndex'

/*
 * `buildWordPositions`, `findWordCharRange` and `splitContentAtWord` were three
 * one-shot helpers that each re-walked the whole text. `architecture-depth/08`
 * replaced them with the **word index**, which walks once and answers the same
 * questions. These are call-shape adapters over that index, kept so every
 * assertion below — the word definition this file exists to pin — stays
 * verbatim rather than being rewritten alongside the code it guards.
 */
const buildWordPositions = (content: string) => scanText(content).wordPositions

const findWordCharRange = (content: string, wordIndex: number) =>
  buildTextWordIndex(content).charRangeAt(wordIndex)

const splitContentAtWord = (content: string, wordIndex: number) => {
  const range = buildTextWordIndex(content).charRangeAt(wordIndex)
  if (!range) return null
  return {
    before: content.slice(0, range.start),
    word: content.slice(range.start, range.end),
    after: content.slice(range.end),
  }
}

// ── buildWordPositions ─────────────────────────────────────────────────────

describe('buildWordPositions — basic plain text', () => {
  it('returns positions for a single-paragraph text', () => {
    const pos = buildWordPositions('Hello world')
    expect(pos).toHaveLength(2)
    expect(pos[0]).toEqual({ start: 0, end: 5, text: 'Hello' })
    expect(pos[1]).toEqual({ start: 6, end: 11, text: 'world' })
  })

  it('returns correct positions across two paragraphs', () => {
    const content = 'Hello world\n\nSecond paragraph'
    const pos = buildWordPositions(content)
    expect(pos).toHaveLength(4)
    // "Hello" at 0
    expect(pos[0].text).toBe('Hello')
    expect(pos[0].start).toBe(0)
    // "Second" starts at offset 13 (after "Hello world\n\n")
    expect(pos[2].text).toBe('Second')
    expect(pos[2].start).toBe(13)
    expect(content.slice(pos[2].start, pos[2].end)).toBe('Second')
  })

  it('returns no positions for empty content', () => {
    expect(buildWordPositions('')).toHaveLength(0)
    expect(buildWordPositions('\n\n\n')).toHaveLength(0)
  })

  it('handles leading/trailing whitespace in paragraphs', () => {
    const content = '  Hello world  \n\n  Goodbye  '
    const pos = buildWordPositions(content)
    // 3 words total: Hello, world, Goodbye
    expect(pos).toHaveLength(3)
    // Words resolved to correct character positions despite surrounding spaces
    expect(content.slice(pos[0].start, pos[0].end)).toBe('Hello')
    expect(content.slice(pos[1].start, pos[1].end)).toBe('world')
    expect(content.slice(pos[2].start, pos[2].end)).toBe('Goodbye')
  })

  it('handles punctuation attached to words', () => {
    const content = 'Hello, world!'
    const pos = buildWordPositions(content)
    // Punctuation is part of the word token (matches /\S+/)
    expect(pos[0].text).toBe('Hello,')
    expect(pos[1].text).toBe('world!')
  })
})

describe('buildWordPositions — markdown headline stripping', () => {
  it('strips leading ## from a headline paragraph', () => {
    const content = '## Chapter 1\n\nBody text here'
    const pos = buildWordPositions(content)
    // Headline: "## Chapter 1" → words are "Chapter" and "1"
    // Body: "Body" "text" "here"
    expect(pos).toHaveLength(5)
    expect(pos[0].text).toBe('Chapter')
    expect(pos[1].text).toBe('1')
    expect(pos[2].text).toBe('Body')
    // "Chapter" should NOT start at 0 (0–2 is "## ")
    expect(pos[0].start).toBeGreaterThan(0)
    // The character at pos[0].start in the content should be 'C'
    expect(content[pos[0].start]).toBe('C')
  })

  it('strips up to 6 # characters', () => {
    const content = '###### Deep heading\n\nContent'
    const pos = buildWordPositions(content)
    expect(pos[0].text).toBe('Deep')
    expect(content[pos[0].start]).toBe('D')
  })

  it('strips a leading # with no space after it, exactly as the tokenizer does', () => {
    // Changed by `architecture-depth/08`. This walk used to keep the hash here
    // while `tokenizeParagraph` stripped it, so the reader played `notAHeadline`
    // and the plain view highlighted `#notAHeadline`. The two are one rule now;
    // `wordIndex.test.ts` pins the agreement across every paragraph shape.
    const content = '#notAHeadline word'
    const pos = buildWordPositions(content)
    expect(pos[0].text).toBe('notAHeadline')
    expect(content[pos[0].start]).toBe('n')
  })

  it('strips more than six # as well, since the tokenizer does', () => {
    // The old `#{1,6}` bound was the other half of the same divergence: seven
    // hashes made this walk count one word more than the tokenizer packed.
    const content = '####### Seven\n\nBody'
    const pos = buildWordPositions(content)
    expect(pos[0].text).toBe('Seven')
  })

  it('does NOT strip # in the middle of a paragraph', () => {
    const content = 'word #notStripped here'
    const pos = buildWordPositions(content)
    expect(pos[1].text).toBe('#notStripped')
  })
})

describe('buildWordPositions — round-trip: slice reconstructs word', () => {
  it('slicing with returned positions reproduces the exact word text', () => {
    const cases = [
      'alpha beta gamma',
      '## Title\n\nFirst paragraph.\n\nSecond paragraph.',
      'One.\n\nTwo!\n\nThree?',
    ]
    for (const content of cases) {
      const pos = buildWordPositions(content)
      for (const p of pos) {
        expect(content.slice(p.start, p.end)).toBe(p.text)
      }
    }
  })
})

// ── findWordCharRange ──────────────────────────────────────────────────────

describe('findWordCharRange', () => {
  it('returns the range of the word at a given index', () => {
    const content = 'alpha beta gamma'
    const range = findWordCharRange(content, 1)
    expect(range).not.toBeNull()
    expect(content.slice(range!.start, range!.end)).toBe('beta')
  })

  it('returns null for a negative index', () => {
    expect(findWordCharRange('alpha beta', -1)).toBeNull()
  })

  it('returns null for an index beyond the last word', () => {
    expect(findWordCharRange('alpha beta', 2)).toBeNull()
    expect(findWordCharRange('alpha beta', 99)).toBeNull()
  })

  it('resolves the correct occurrence for repeated words', () => {
    // "the" appears at positions 0, 3, and 6 (word indices)
    const content = 'the quick the brown the fox'
    const words = ['the', 'quick', 'the', 'brown', 'the', 'fox']
    for (let i = 0; i < words.length; i++) {
      const range = findWordCharRange(content, i)
      expect(content.slice(range!.start, range!.end)).toBe(words[i])
    }
    // First "the" at position 0, second at 10, third at 20
    expect(findWordCharRange(content, 0)!.start).toBe(0)
    expect(findWordCharRange(content, 2)!.start).toBe(10)
    expect(findWordCharRange(content, 4)!.start).toBe(20)
  })

  it('handles repeated words across paragraph boundaries', () => {
    const content = 'same word\n\nsame word again'
    // Words: same(0), word(1), same(2), word(3), again(4)
    const r0 = findWordCharRange(content, 0)!
    const r2 = findWordCharRange(content, 2)!
    expect(content.slice(r0.start, r0.end)).toBe('same')
    expect(content.slice(r2.start, r2.end)).toBe('same')
    // They must be at different positions
    expect(r0.start).not.toBe(r2.start)
  })
})

// ── splitContentAtWord ─────────────────────────────────────────────────────

describe('splitContentAtWord', () => {
  it('splits content into before, word, after', () => {
    const content = 'Hello beautiful world'
    const split = splitContentAtWord(content, 1)
    expect(split).not.toBeNull()
    expect(split!.word).toBe('beautiful')
    expect(split!.before).toBe('Hello ')
    expect(split!.after).toBe(' world')
    // Concatenation reproduces the original content
    expect(split!.before + split!.word + split!.after).toBe(content)
  })

  it('splits at word index 0', () => {
    const content = 'First word here'
    const split = splitContentAtWord(content, 0)!
    expect(split.word).toBe('First')
    expect(split.before).toBe('')
    expect(split.before + split.word + split.after).toBe(content)
  })

  it('splits at the last word', () => {
    const content = 'alpha beta gamma'
    const split = splitContentAtWord(content, 2)!
    expect(split.word).toBe('gamma')
    expect(split.after).toBe('')
    expect(split.before + split.word + split.after).toBe(content)
  })

  it('returns null for out-of-range index', () => {
    expect(splitContentAtWord('hello world', 5)).toBeNull()
    expect(splitContentAtWord('hello world', -1)).toBeNull()
  })

  it('concatenating before+word+after always reconstructs the original', () => {
    const content = '## Heading\n\nParagraph one.\n\nParagraph two.'
    const pos = buildWordPositions(content)
    for (let i = 0; i < pos.length; i++) {
      const split = splitContentAtWord(content, i)!
      expect(split.before + split.word + split.after).toBe(content)
      expect(split.word).toBe(pos[i].text)
    }
  })

  it('handles multi-paragraph content with headlines', () => {
    const content = '## Title\n\nThis is the body.'
    // Words: Title(0), This(1), is(2), the(3), body.(4)
    const split = splitContentAtWord(content, 1)!
    expect(split.word).toBe('This')
    expect(split.before + split.word + split.after).toBe(content)
  })
})

// ── content_display compatibility: single newlines within paragraphs ───────
//
// When content_display is used for the plain text view, structural single
// newlines are preserved instead of being converted to spaces. The word
// ORDER and COUNT must be identical to the standard-cleanup version so that
// wordOffset from RSVP stacks indexes the correct word.

describe('buildWordPositions — single newlines within paragraph (content_display)', () => {
  it('finds all words when single newlines separate lines within a paragraph', () => {
    // Simulates content_display for a table-of-contents import:
    //   standard cleanup → 'Chapter 1 To Sleep\n\nChapter 2 Caffeine'
    //   content_display  → 'Chapter 1\nTo Sleep\n\nChapter 2\nCaffeine'
    const display = 'Chapter 1\nTo Sleep\n\nChapter 2\nCaffeine'
    const pos = buildWordPositions(display)
    expect(pos.map((p) => p.text)).toEqual(['Chapter', '1', 'To', 'Sleep', 'Chapter', '2', 'Caffeine'])
  })

  it('word count matches equivalent space-separated content', () => {
    const displayNewlines = 'Chapter 1\nTo Sleep\n\nChapter 2\nCaffeine'
    const displaySpaces   = 'Chapter 1 To Sleep\n\nChapter 2 Caffeine'
    expect(buildWordPositions(displayNewlines).length).toBe(buildWordPositions(displaySpaces).length)
  })
})

describe('splitContentAtWord — single newlines within paragraph (content_display)', () => {
  it('highlights word by the same index as space-separated version', () => {
    const displayNewlines = 'Chapter 1\nTo Sleep\n\nChapter 2\nCaffeine'
    const displaySpaces   = 'Chapter 1 To Sleep\n\nChapter 2 Caffeine'

    // Word at index 2 should be 'To' in both versions.
    const splitNl  = splitContentAtWord(displayNewlines, 2)!
    const splitSp  = splitContentAtWord(displaySpaces,   2)!
    expect(splitNl.word).toBe('To')
    expect(splitSp.word).toBe('To')
  })

  it('reconstructs original content with single newlines after split', () => {
    const content = 'Chapter 1\nTo Sleep\n\nChapter 2\nCaffeine'
    const pos = buildWordPositions(content)
    for (let i = 0; i < pos.length; i++) {
      const split = splitContentAtWord(content, i)!
      expect(split.before + split.word + split.after).toBe(content)
      expect(split.word).toBe(pos[i].text)
    }
  })

  it('preserves the newline character in before/after strings', () => {
    // "To" is at index 2; "before" should end with '\n', not ' '
    const content = 'Chapter 1\nTo Sleep'
    const split = splitContentAtWord(content, 2)!
    expect(split.word).toBe('To')
    expect(split.before).toBe('Chapter 1\n')
    expect(split.after).toBe(' Sleep')
    expect(split.before + split.word + split.after).toBe(content)
  })
})

