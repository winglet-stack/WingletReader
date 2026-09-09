import { describe, expect, it } from 'vitest'
import {
  EPUB_CONTAINER_BYTE_CAP,
  EPUB_FRONT_MATTER_TITLE,
  EPUB_TEXT_BYTE_CAP,
  deriveEpubBook,
  type DerivedEpubBook,
  type EpubParseInput,
  type EpubVerdict
} from '../epubBook'

/** Fixtures-as-code: plain object literals only — no zips, no binary fixtures (ADR-0034 §9). */
function input(overrides: Partial<EpubParseInput> = {}): EpubParseInput {
  return {
    title: 'A Publisher Book',
    author: 'A. Writer',
    identifier: 'urn:uuid:1234',
    spine: [],
    toc: [],
    ...overrides
  }
}

function spine(...items: (string | { text: string; firstHeading: string | null })[]) {
  return items.map((item) =>
    typeof item === 'string' ? { text: item, firstHeading: null } : item
  )
}

function titles(book: DerivedEpubBook): string[] {
  return book.segments.map((s) => s.title)
}

describe('constants', () => {
  it('pins the front-matter title and the ADR §6 hostile-input caps', () => {
    expect(EPUB_FRONT_MATTER_TITLE).toBe('Front Matter')
    expect(EPUB_CONTAINER_BYTE_CAP).toBe(100 * 1024 * 1024)
    expect(EPUB_TEXT_BYTE_CAP).toBe(50 * 1024 * 1024)
  })
})

describe('EpubVerdict', () => {
  // The union is what EP-2b/EP-3 report and the renderer mirrors, so the four
  // arms must stay constructible and discriminable by `kind` alone.
  it('discriminates the four verdict arms', () => {
    const verdicts: EpubVerdict[] = [
      { kind: 'drm-protected' },
      { kind: 'oversized', cap: 'container', limitBytes: EPUB_CONTAINER_BYTE_CAP },
      { kind: 'oversized', cap: 'text', limitBytes: EPUB_TEXT_BYTE_CAP, observedBytes: 99 },
      { kind: 'malformed', reason: 'container.xml missing' },
      {
        kind: 'valid',
        book: deriveEpubBook(input({ spine: spine('One two three.') }))
      }
    ]

    expect(verdicts.map((v) => v.kind)).toEqual([
      'drm-protected',
      'oversized',
      'oversized',
      'malformed',
      'valid'
    ])
    const oversized = verdicts[1]
    expect(oversized.kind === 'oversized' && oversized.cap).toBe('container')
  })
})

describe('deriveEpubBook — metadata pass-through', () => {
  it('carries title, author, and identifier verbatim', () => {
    const book = deriveEpubBook(
      input({ title: 'Moby-Dick', author: 'Herman Melville', spine: spine('Call me Ishmael.') })
    )
    expect(book.title).toBe('Moby-Dick')
    expect(book.author).toBe('Herman Melville')
    expect(book.identifier).toBe('urn:uuid:1234')
  })

  it('keeps a null author and identifier null', () => {
    const book = deriveEpubBook(
      input({ author: null, identifier: null, spine: spine('Some words here.') })
    )
    expect(book.author).toBeNull()
    expect(book.identifier).toBeNull()
  })
})

describe('deriveEpubBook — TOC boundaries', () => {
  it('makes one segment per boundary, titled by its TOC label', () => {
    const book = deriveEpubBook(
      input({
        spine: spine('Chapter one text.', 'Chapter two text.', 'Chapter three text.'),
        toc: [
          { label: 'One', spineIndex: 0 },
          { label: 'Two', spineIndex: 1 },
          { label: 'Three', spineIndex: 2 }
        ]
      })
    )
    expect(titles(book)).toEqual(['One', 'Two', 'Three'])
    expect(book.segments.map((s) => s.content)).toEqual([
      'Chapter one text.',
      'Chapter two text.',
      'Chapter three text.'
    ])
    expect(book.segment_count).toBe(3)
  })

  it('joins several spine files under one boundary with a blank line', () => {
    const book = deriveEpubBook(
      input({
        spine: spine('Part one.', 'Still part one.', 'Part two.'),
        toc: [
          { label: 'One', spineIndex: 0 },
          { label: 'Two', spineIndex: 2 }
        ]
      })
    )
    expect(book.segments.map((s) => s.content)).toEqual(['Part one.\n\nStill part one.', 'Part two.'])
  })

  it('sorts out-of-order boundaries ascending', () => {
    const book = deriveEpubBook(
      input({
        spine: spine('A text.', 'B text.', 'C text.'),
        toc: [
          { label: 'C', spineIndex: 2 },
          { label: 'A', spineIndex: 0 },
          { label: 'B', spineIndex: 1 }
        ]
      })
    )
    expect(titles(book)).toEqual(['A', 'B', 'C'])
    expect(book.segments.map((s) => s.content)).toEqual(['A text.', 'B text.', 'C text.'])
  })

  it('flattened nesting is just more boundaries — a short "Part" segment is fine', () => {
    const book = deriveEpubBook(
      input({
        spine: spine('PART I', 'Chapter one text.', 'Chapter two text.'),
        toc: [
          { label: 'Part I', spineIndex: 0 },
          { label: 'Chapter One', spineIndex: 1 },
          { label: 'Chapter Two', spineIndex: 2 }
        ]
      })
    )
    expect(titles(book)).toEqual(['Part I', 'Chapter One', 'Chapter Two'])
    expect(book.segments[0].content).toBe('PART I')
  })
})

describe('deriveEpubBook — front matter', () => {
  it('collects spine text before the first boundary into a leading Front Matter segment', () => {
    const book = deriveEpubBook(
      input({
        spine: spine('Cover page.', 'Copyright notice.', 'Chapter one text.'),
        toc: [{ label: 'Chapter One', spineIndex: 2 }]
      })
    )
    expect(titles(book)).toEqual([EPUB_FRONT_MATTER_TITLE, 'Chapter One'])
    expect(book.segments[0].content).toBe('Cover page.\n\nCopyright notice.')
  })

  it('creates no Front Matter when a boundary sits at spine index 0', () => {
    const book = deriveEpubBook(
      input({
        spine: spine('Chapter one text.', 'Chapter two text.'),
        toc: [
          { label: 'One', spineIndex: 0 },
          { label: 'Two', spineIndex: 1 }
        ]
      })
    )
    expect(titles(book)).toEqual(['One', 'Two'])
  })

  it('creates no Front Matter when the text before the first boundary is blank', () => {
    const book = deriveEpubBook(
      input({
        spine: spine('   \n  ', 'Chapter one text.', 'Chapter two text.'),
        toc: [
          { label: 'One', spineIndex: 1 },
          { label: 'Two', spineIndex: 2 }
        ]
      })
    )
    expect(titles(book)).toEqual(['One', 'Two'])
  })
})

describe('deriveEpubBook — boundary hygiene', () => {
  it('collapses duplicate boundaries to the first entry, merging chapters without dropping text', () => {
    const book = deriveEpubBook(
      input({
        spine: spine('Shared file text.', 'Later chapter text.'),
        toc: [
          { label: 'Chapter One', spineIndex: 0 },
          { label: 'Chapter Two', spineIndex: 0 },
          { label: 'Chapter Three', spineIndex: 1 }
        ]
      })
    )
    expect(titles(book)).toEqual(['Chapter One', 'Chapter Three'])
    expect(book.content).toBe('Shared file text.\n\nLater chapter text.')
  })

  it('drops out-of-range boundaries and keeps the usable ones', () => {
    const book = deriveEpubBook(
      input({
        spine: spine('First file text.', 'Second file text.'),
        toc: [
          { label: 'Negative', spineIndex: -1 },
          { label: 'One', spineIndex: 0 },
          { label: 'Past the end', spineIndex: 9 },
          { label: 'Two', spineIndex: 1 },
          { label: 'Fractional', spineIndex: 1.5 },
          { label: 'Not a number', spineIndex: Number.NaN }
        ]
      })
    )
    expect(titles(book)).toEqual(['One', 'Two'])
  })

  it('falls through to the per-file rung when every boundary is out of range', () => {
    const book = deriveEpubBook(
      input({
        spine: spine(
          { text: 'First file text.', firstHeading: 'Opening' },
          { text: 'Second file text.', firstHeading: null }
        ),
        toc: [
          { label: 'Ghost', spineIndex: 7 },
          { label: 'Phantom', spineIndex: -3 }
        ]
      })
    )
    expect(titles(book)).toEqual(['Opening', 'Section 2'])
  })

  it('titles a blank-labelled boundary from the file heading, else positionally', () => {
    const book = deriveEpubBook(
      input({
        spine: spine(
          { text: 'First file text.', firstHeading: 'Real Heading' },
          { text: 'Second file text.', firstHeading: null }
        ),
        toc: [
          { label: '   ', spineIndex: 0 },
          { label: '', spineIndex: 1 }
        ]
      })
    )
    expect(titles(book)).toEqual(['Real Heading', 'Section 2'])
  })

  it('trims TOC labels', () => {
    const book = deriveEpubBook(
      input({
        spine: spine('A text.', 'B text.'),
        toc: [
          { label: '  Chapter One  ', spineIndex: 0 },
          { label: '\nChapter Two\n', spineIndex: 1 }
        ]
      })
    )
    expect(titles(book)).toEqual(['Chapter One', 'Chapter Two'])
  })
})

describe('deriveEpubBook — empty segments', () => {
  it('skips a boundary whose files are all blank rather than storing an empty row', () => {
    const book = deriveEpubBook(
      input({
        spine: spine('Chapter one text.', '   \n\n  ', 'Chapter three text.'),
        toc: [
          { label: 'One', spineIndex: 0 },
          { label: 'Two (empty)', spineIndex: 1 },
          { label: 'Three', spineIndex: 2 }
        ]
      })
    )
    expect(titles(book)).toEqual(['One', 'Three'])
    expect(book.segments.every((s) => s.content.trim() !== '')).toBe(true)
  })

  it('skips blank spine files inside a segment without leaving blank-line runs', () => {
    const book = deriveEpubBook(
      input({
        spine: spine('First half.', '  ', 'Second half.', 'Next chapter.'),
        toc: [
          { label: 'One', spineIndex: 0 },
          { label: 'Two', spineIndex: 3 }
        ]
      })
    )
    expect(book.segments[0].content).toBe('First half.\n\nSecond half.')
  })
})

describe('deriveEpubBook — fallback ladder', () => {
  it('falls back to one segment per spine file when there is no TOC', () => {
    const book = deriveEpubBook(
      input({
        spine: spine(
          { text: 'Chapter one text.', firstHeading: 'The Beginning' },
          { text: 'Chapter two text.', firstHeading: 'The Middle' },
          { text: 'Chapter three text.', firstHeading: null }
        )
      })
    )
    expect(titles(book)).toEqual(['The Beginning', 'The Middle', 'Section 3'])
    expect(book.segment_count).toBe(3)
  })

  it('numbers "Section N" by segment position, skipping blank files', () => {
    const book = deriveEpubBook(
      input({ spine: spine('First file text.', '   ', 'Third file text.') })
    )
    expect(titles(book)).toEqual(['Section 1', 'Section 2'])
  })

  it('trims a first heading used as a fallback title', () => {
    const book = deriveEpubBook(
      input({
        spine: spine(
          { text: 'A text.', firstHeading: '  Padded Heading  ' },
          { text: 'B text.', firstHeading: '   ' }
        )
      })
    )
    expect(titles(book)).toEqual(['Padded Heading', 'Section 2'])
  })

  it('returns the unsegmented shape when the per-file rung yields a single segment', () => {
    const book = deriveEpubBook(
      input({ spine: spine({ text: 'The whole book in one file.', firstHeading: 'Title Page' }) })
    )
    expect(book.segments).toEqual([])
    expect(book.segment_count).toBe(0)
    expect(book.content).toBe('The whole book in one file.')
    expect(book.word_count).toBe(6)
  })

  it('returns the unsegmented shape when only one spine file has text', () => {
    const book = deriveEpubBook(
      input({ spine: spine('  ', 'All of the words live here.', '\n') })
    )
    expect(book.segments).toEqual([])
    expect(book.segment_count).toBe(0)
    expect(book.content).toBe('All of the words live here.')
  })

  it('returns an empty unsegmented book for an empty spine', () => {
    const book = deriveEpubBook(input({ spine: [], toc: [{ label: 'Ghost', spineIndex: 0 }] }))
    expect(book.segments).toEqual([])
    expect(book.segment_count).toBe(0)
    expect(book.content).toBe('')
    expect(book.word_count).toBe(0)
  })

  it('keeps a single TOC-derived segment rather than dropping to unsegmented', () => {
    const book = deriveEpubBook(
      input({
        spine: spine('Only chapter text.'),
        toc: [{ label: 'The Only Chapter', spineIndex: 0 }]
      })
    )
    expect(titles(book)).toEqual(['The Only Chapter'])
    expect(book.segment_count).toBe(1)
  })
})

describe('deriveEpubBook — offsets and counts', () => {
  const threeChapters = (): EpubParseInput =>
    input({
      spine: spine('one two', 'three', 'four five six'),
      toc: [
        { label: 'A', spineIndex: 0 },
        { label: 'B', spineIndex: 1 },
        { label: 'C', spineIndex: 2 }
      ]
    })

  it('derives order from array position and contiguous cumulative offsets (end exclusive)', () => {
    const book = deriveEpubBook(threeChapters())
    expect(book.segments.map((s) => s.order)).toEqual([0, 1, 2])
    expect(book.segments.map((s) => [s.startWordOffset, s.endWordOffset])).toEqual([
      [0, 2],
      [2, 3],
      [3, 6]
    ])
    for (let i = 1; i < book.segments.length; i++) {
      expect(book.segments[i].startWordOffset).toBe(book.segments[i - 1].endWordOffset)
    }
  })

  it('book word_count equals the sum of segment word counts', () => {
    const book = deriveEpubBook(threeChapters())
    expect(book.word_count).toBe(book.segments.reduce((sum, s) => sum + s.word_count, 0))
    expect(book.word_count).toBe(6)
  })

  it('offsets stay contiguous across Front Matter and skipped empty segments', () => {
    const book = deriveEpubBook(
      input({
        spine: spine('front matter words', 'one two three', '   ', 'four five'),
        toc: [
          { label: 'One', spineIndex: 1 },
          { label: 'Empty', spineIndex: 2 },
          { label: 'Two', spineIndex: 3 }
        ]
      })
    )
    expect(titles(book)).toEqual([EPUB_FRONT_MATTER_TITLE, 'One', 'Two'])
    expect(book.segments.map((s) => [s.startWordOffset, s.endWordOffset])).toEqual([
      [0, 3],
      [3, 6],
      [6, 8]
    ])
    expect(book.segments[book.segments.length - 1].endWordOffset).toBe(book.word_count)
  })

  it('counts words with the frozen \\s+ tokenization', () => {
    const book = deriveEpubBook(
      input({
        spine: spine('one   two\tthree', 'four\nfive\n\nsix'),
        toc: [
          { label: 'Spaces', spineIndex: 0 },
          { label: 'Newlines', spineIndex: 1 }
        ]
      })
    )
    expect(book.segments.map((s) => s.word_count)).toEqual([3, 3])
  })
})

describe('deriveEpubBook — preservation invariant', () => {
  it('content is exactly the segment contents joined with "\\n\\n"', () => {
    const book = deriveEpubBook(
      input({
        spine: spine('First paragraph.\n\nSecond paragraph.', 'Line one\nline two.', 'Last file.'),
        toc: [
          { label: 'A', spineIndex: 0 },
          { label: 'B', spineIndex: 1 }
        ]
      })
    )
    expect(book.content).toBe(book.segments.map((s) => s.content).join('\n\n'))
    expect(book.content).toBe(
      'First paragraph.\n\nSecond paragraph.\n\nLine one\nline two.\n\nLast file.'
    )
  })

  it('keeps publisher punctuation verbatim — no dash normalization, no wrap flattening', () => {
    const raw = 'She paused -- then ---- went on.\nA hard-wrapped\nline stays wrapped.'
    const book = deriveEpubBook(
      input({ spine: spine(raw, 'Second chapter text.'), toc: [] })
    )
    expect(book.segments[0].content).toBe(raw)
    expect(book.content).toContain('--')
    expect(book.content).toContain('----')
  })

  it('every word of every spine file survives into the book content', () => {
    const spineTexts = ['front words here', 'chapter one words', 'chapter two words']
    const book = deriveEpubBook(
      input({ spine: spine(...spineTexts), toc: [{ label: 'One', spineIndex: 1 }] })
    )
    for (const text of spineTexts) {
      for (const word of text.split(' ')) expect(book.content).toContain(word)
    }
    expect(book.word_count).toBe(9)
  })
})
