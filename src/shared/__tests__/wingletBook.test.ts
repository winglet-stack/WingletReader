import { describe, expect, it } from 'vitest'
import {
  WINGLET_BOOK_FORMAT,
  WINGLET_BOOK_SCHEMA_VERSION,
  deriveWingletBook,
  validateWingletBook,
  type WingletBookDocument,
  type WingletBookPayload
} from '../wingletBook'

function validDocument(): Record<string, unknown> {
  return {
    format: 'winglet-book',
    schemaVersion: 2,
    book: {
      seedId: 'test-book',
      title: 'Test Book',
      categoryRef: 'Fiction',
      segments: [
        { title: 'Chapter 1', content: 'One two three.' },
        { title: 'Chapter 2', content: 'Four five.' }
      ]
    }
  }
}

function expectValid(input: unknown): WingletBookPayload {
  const verdict = validateWingletBook(input)
  expect(verdict.kind).toBe('valid')
  if (verdict.kind !== 'valid') throw new Error('unreachable')
  return verdict.book
}

describe('constants', () => {
  it('pins the frozen marker and current schema version', () => {
    expect(WINGLET_BOOK_FORMAT).toBe('winglet-book')
    expect(WINGLET_BOOK_SCHEMA_VERSION).toBe(2)
  })
})

describe('WingletBookDocument', () => {
  // The envelope type is what WingletBooks builds against once it vendors this
  // module, so the two halves of the contract must agree: anything the exported
  // type admits has to be something the validator accepts.
  it('describes a document the validator accepts', () => {
    const document: WingletBookDocument = {
      format: WINGLET_BOOK_FORMAT,
      schemaVersion: WINGLET_BOOK_SCHEMA_VERSION,
      book: {
        seedId: 'typed-book',
        title: 'Typed Book',
        categoryRef: null,
        segments: [{ title: 'Chapter 1', content: 'One two three.' }]
      }
    }

    expect(expectValid(document)).toEqual(document.book)
  })
})

describe('validateWingletBook — foreign', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
    ['a string', 'winglet-book'],
    ['an array', []],
    ['an object without a marker', { schemaVersion: 2, book: {} }],
    ['a v1 Library Bundle shape', { schemaVersion: 1, bundleVersion: 3, categories: [], books: [] }],
    ['a wrong marker', { format: 'library-bundle', schemaVersion: 2 }],
    ['a wrong-case marker (exact match required)', { format: 'Winglet-Book', schemaVersion: 2 }],
    ['a non-string marker', { format: 2, schemaVersion: 2 }]
  ])('rejects %s as foreign', (_name, input) => {
    expect(validateWingletBook(input)).toEqual({ kind: 'foreign' })
  })

  it('marker wins over everything else: broken structure with no marker is foreign, not malformed', () => {
    expect(validateWingletBook({ book: null, segments: 'garbage' })).toEqual({ kind: 'foreign' })
  })
})

describe('validateWingletBook — unsupported version', () => {
  it('refuses schemaVersion 1 (the retired Library Bundle) as unsupported, not newer', () => {
    const doc = { ...validDocument(), schemaVersion: 1 }
    expect(validateWingletBook(doc)).toEqual({
      kind: 'unsupported-version',
      schemaVersion: 1,
      newer: false
    })
  })

  it.each([3, 99])('flags schemaVersion %i as newer (update-WingletReader wording)', (version) => {
    const doc = { ...validDocument(), schemaVersion: version }
    expect(validateWingletBook(doc)).toEqual({
      kind: 'unsupported-version',
      schemaVersion: version,
      newer: true
    })
  })

  it.each([0, -1])('refuses schemaVersion %i as other-unsupported, not newer', (version) => {
    const doc = { ...validDocument(), schemaVersion: version }
    expect(validateWingletBook(doc)).toEqual({
      kind: 'unsupported-version',
      schemaVersion: version,
      newer: false
    })
  })

  it('version outranks structure: an unsupported version with a broken book is unsupported, not malformed', () => {
    const verdict = validateWingletBook({ format: 'winglet-book', schemaVersion: 99, book: null })
    expect(verdict.kind).toBe('unsupported-version')
  })
})

describe('validateWingletBook — malformed', () => {
  it.each([
    ['schemaVersion absent', (d: Record<string, unknown>) => delete d.schemaVersion],
    ['schemaVersion a string', (d: Record<string, unknown>) => (d.schemaVersion = '2')],
    ['book absent', (d: Record<string, unknown>) => delete d.book],
    ['book null', (d: Record<string, unknown>) => (d.book = null)],
    ['book an array', (d: Record<string, unknown>) => (d.book = [])],
    ['seedId absent', (d: any) => delete d.book.seedId],
    ['seedId empty', (d: any) => (d.book.seedId = '')],
    ['seedId blank', (d: any) => (d.book.seedId = '   ')],
    ['seedId a number', (d: any) => (d.book.seedId = 7)],
    ['title absent', (d: any) => delete d.book.title],
    ['title blank', (d: any) => (d.book.title = ' \n ')],
    ['categoryRef a number', (d: any) => (d.book.categoryRef = 3)],
    ['segments absent', (d: any) => delete d.book.segments],
    ['segments not an array', (d: any) => (d.book.segments = 'Chapter 1')],
    ['segments empty', (d: any) => (d.book.segments = [])],
    ['a segment null', (d: any) => (d.book.segments[1] = null)],
    ['a segment title absent', (d: any) => delete d.book.segments[0].title],
    ['a segment title blank', (d: any) => (d.book.segments[0].title = '  ')],
    ['a segment content absent', (d: any) => delete d.book.segments[1].content],
    ['a segment content blank', (d: any) => (d.book.segments[1].content = '\n\n')],
    ['a segment content a number', (d: any) => (d.book.segments[1].content = 42)]
  ])('rejects %s as malformed', (_name, mutate) => {
    const doc = validDocument()
    mutate(doc as any)
    const verdict = validateWingletBook(doc)
    expect(verdict.kind).toBe('malformed')
  })
})

describe('validateWingletBook — valid', () => {
  it('accepts a well-formed document and returns the typed payload', () => {
    const book = expectValid(validDocument())
    expect(book).toEqual({
      seedId: 'test-book',
      title: 'Test Book',
      categoryRef: 'Fiction',
      segments: [
        { title: 'Chapter 1', content: 'One two three.' },
        { title: 'Chapter 2', content: 'Four five.' }
      ]
    })
  })

  it('accepts a single-segment book', () => {
    const doc = validDocument()
    ;(doc as any).book.segments = [{ title: 'Only', content: 'Alone.' }]
    expect(expectValid(doc).segments).toHaveLength(1)
  })

  it('normalizes an absent categoryRef to null (Uncategorized)', () => {
    const doc = validDocument()
    delete (doc as any).book.categoryRef
    expect(expectValid(doc).categoryRef).toBeNull()
  })

  it('normalizes an explicit null categoryRef to null', () => {
    const doc = validDocument()
    ;(doc as any).book.categoryRef = null
    expect(expectValid(doc).categoryRef).toBeNull()
  })
})

describe('validateWingletBook — tolerant reader', () => {
  it('ignores unknown fields at the root, book, and segment levels and strips them from the payload', () => {
    const doc = validDocument() as any
    doc.generator = 'winglet-books/3.1'
    doc.exportedAt = '2026-08-05'
    doc.book.author = 'A. Writer'
    doc.book.coverImage = { data: 'xxx' }
    doc.book.segments[0].subtitle = 'unused'
    doc.book.segments[1].word_count = 999999

    const book = expectValid(doc)
    expect(book).toEqual({
      seedId: 'test-book',
      title: 'Test Book',
      categoryRef: 'Fiction',
      segments: [
        { title: 'Chapter 1', content: 'One two three.' },
        { title: 'Chapter 2', content: 'Four five.' }
      ]
    })
    expect('author' in book).toBe(false)
    expect('word_count' in book.segments[1]).toBe(false)
  })

  it('ignores stale carried derived fields rather than validating against them', () => {
    // The v1 fields-disagree corruption class must be unrepresentable: carried
    // numbers are dropped, never compared.
    const doc = validDocument() as any
    doc.book.segments[0].startWordOffset = 12345
    doc.book.content = 'completely disagreeing carried content'
    const book = expectValid(doc)
    expect(deriveWingletBook(book).content).toBe('One two three.\n\nFour five.')
  })
})

describe('deriveWingletBook', () => {
  const payload = (segments: { title: string; content: string }[]): WingletBookPayload => ({
    seedId: 'derive-me',
    title: 'Derive Me',
    categoryRef: null,
    segments
  })

  it('derives a single-segment book', () => {
    const derived = deriveWingletBook(payload([{ title: 'Only', content: 'One two three.' }]))
    expect(derived.segments).toEqual([
      {
        title: 'Only',
        content: 'One two three.',
        order: 0,
        word_count: 3,
        startWordOffset: 0,
        endWordOffset: 3
      }
    ])
    expect(derived.content).toBe('One two three.')
    expect(derived.word_count).toBe(3)
    expect(derived.segment_count).toBe(1)
  })

  it('derives order from array position and contiguous cumulative offsets (end exclusive)', () => {
    const derived = deriveWingletBook(
      payload([
        { title: 'A', content: 'one two' },
        { title: 'B', content: 'three' },
        { title: 'C', content: 'four five six' }
      ])
    )
    expect(derived.segments.map((s) => s.order)).toEqual([0, 1, 2])
    expect(derived.segments.map((s) => [s.startWordOffset, s.endWordOffset])).toEqual([
      [0, 2],
      [2, 3],
      [3, 6]
    ])
    for (let i = 1; i < derived.segments.length; i++) {
      expect(derived.segments[i].startWordOffset).toBe(derived.segments[i - 1].endWordOffset)
    }
    expect(derived.word_count).toBe(6)
    expect(derived.segment_count).toBe(3)
  })

  it('counts words with the frozen \\s+ tokenization', () => {
    const derived = deriveWingletBook(
      payload([
        { title: 'Spaces', content: 'one   two\tthree' },
        { title: 'Newlines', content: 'four\nfive\n\nsix' },
        { title: 'Padded', content: '  seven eight  ' }
      ])
    )
    expect(derived.segments.map((s) => s.word_count)).toEqual([3, 3, 2])
  })

  it('joins book content byte-equal to segment contents joined with "\\n\\n"', () => {
    const segments = [
      { title: 'A', content: 'First paragraph.\n\nSecond paragraph.' },
      { title: 'B', content: 'Line one\nline two.' }
    ]
    const derived = deriveWingletBook(payload(segments))
    expect(derived.content).toBe(segments.map((s) => s.content).join('\n\n'))
  })

  it('book word_count equals the sum of segment word counts', () => {
    const derived = deriveWingletBook(
      payload([
        { title: 'A', content: 'one two three' },
        { title: 'B', content: 'four five' }
      ])
    )
    expect(derived.word_count).toBe(
      derived.segments.reduce((sum, s) => sum + s.word_count, 0)
    )
  })

  it('preserves identity fields verbatim', () => {
    const derived = deriveWingletBook({
      seedId: 'id-1',
      title: 'A Title',
      categoryRef: 'Essays',
      segments: [{ title: 'S', content: 'word' }]
    })
    expect(derived.seedId).toBe('id-1')
    expect(derived.title).toBe('A Title')
    expect(derived.categoryRef).toBe('Essays')
  })
})

describe('v1 parity fixture', () => {
  // Copied VERBATIM from `resources/default-library.json` (bundleVersion 1,
  // book "on-reading-fast") — real v1 producer output, embedded so this
  // cross-check survives WB-4's deletion of the seed resource. The v1 bundle
  // carried every derived field; v2 carries none, so deriving the v2
  // conversion must reproduce the carried values byte-for-byte.
  const v1Book = {
    seedId: 'on-reading-fast',
    title: 'On Reading Fast',
    content:
      'Most people read at the pace they learned to speak, sounding each word in the\nthroat even when the page is silent. This book is about letting that habit go.\n\nThe inner voice is a comfortable bottleneck. It caps you near speaking speed,\na few hundred words a minute, long after your eyes could move faster.\n\nWiden the span. Let groups of words land at once, trust the periphery, and\nresist the pull back to the safe, slow line you already understood.',
    categoryRef: 'Essays',
    segments: [
      {
        title: 'Introduction',
        order: 0,
        content:
          'Most people read at the pace they learned to speak, sounding each word in the\nthroat even when the page is silent. This book is about letting that habit go.',
        word_count: 30,
        startWordOffset: 0,
        endWordOffset: 30
      },
      {
        title: 'Why Subvocalization Slows You',
        order: 1,
        content:
          'The inner voice is a comfortable bottleneck. It caps you near speaking speed,\na few hundred words a minute, long after your eyes could move faster.',
        word_count: 26,
        startWordOffset: 30,
        endWordOffset: 56
      },
      {
        title: 'Training the Eye',
        order: 2,
        content:
          'Widen the span. Let groups of words land at once, trust the periphery, and\nresist the pull back to the safe, slow line you already understood.',
        word_count: 26,
        startWordOffset: 56,
        endWordOffset: 82
      }
    ]
  }

  /** The v1 book hand-converted to v2: only the fields the v2 contract carries. */
  const v2Document = {
    format: 'winglet-book',
    schemaVersion: 2,
    book: {
      seedId: v1Book.seedId,
      title: v1Book.title,
      categoryRef: v1Book.categoryRef,
      segments: v1Book.segments.map(({ title, content }) => ({ title, content }))
    }
  }

  it('validates as a well-formed v2 document', () => {
    expect(validateWingletBook(v2Document).kind).toBe('valid')
  })

  it('derives records byte-identical to what the v1 seed path carried', () => {
    const derived = deriveWingletBook(expectValid(v2Document))

    expect(derived.seedId).toBe(v1Book.seedId)
    expect(derived.title).toBe(v1Book.title)
    expect(derived.categoryRef).toBe(v1Book.categoryRef)
    expect(derived.content).toBe(v1Book.content)
    expect(derived.segment_count).toBe(v1Book.segments.length)

    expect(derived.segments).toEqual(
      v1Book.segments.map(({ title, content, order, word_count, startWordOffset, endWordOffset }) => ({
        title,
        content,
        order,
        word_count,
        startWordOffset,
        endWordOffset
      }))
    )
  })
})
