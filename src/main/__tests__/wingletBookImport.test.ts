/**
 * WB-2a/WB-2b — the ADR-0033 §4 acceptance ladder and the commit that follows
 * it, driven through the real store.
 *
 * The parse cases assert the parse half writes nothing: the confirm card is
 * shown before anything lands, so a rejected (or merely inspected) file must
 * leave the library exactly as it was. The commit cases assert the other half of
 * the same promise — the ladder is re-run from disk, and anything short of
 * `valid` still leaves the library exactly as it was.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { Database, UNCATEGORIZED_CATEGORY_ID } from '../database'
import { commitWingletBookFile, parseWingletBookFile } from '../wingletBookImport'
import {
  WINGLET_BOOK_FORMAT,
  WINGLET_BOOK_SCHEMA_VERSION,
  type WingletBookSegment
} from '../../shared/wingletBook'

/** UTF-8 BOM, spelled by code point so the fixture's intent is visible here. */
const BOM = String.fromCharCode(0xfeff)

let db: Database
let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'wingletreader-wbook-parse-'))
  db = new Database(join(tmpDir, 'test-data.json'))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

function validDocument(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    format: WINGLET_BOOK_FORMAT,
    schemaVersion: WINGLET_BOOK_SCHEMA_VERSION,
    book: {
      seedId: 'the-lighthouse-keeper',
      title: 'The Lighthouse Keeper',
      categoryRef: 'Fiction',
      segments: [
        { title: 'The Wreck', content: 'The lamp had not been lit.' },
        { title: 'The Flare', content: 'A green flare cut the fog.' },
        { title: 'The Keeper', content: 'He counted the seconds between waves.' }
      ]
    },
    ...overrides
  }
}

/** Writes a file and returns its path; a string `contents` is written raw. */
function writeFile(name: string, contents: unknown, options: { bom?: boolean } = {}): string {
  const filePath = join(tmpDir, name)
  const body = typeof contents === 'string' ? contents : JSON.stringify(contents, null, 2)
  writeFileSync(filePath, `${options.bom ? BOM : ''}${body}`, 'utf-8')
  return filePath
}

/** The store fingerprint every case asserts is unchanged by a parse. */
function storeSnapshot(): string {
  return JSON.stringify({ texts: db.getTexts(), categories: db.getCategories() })
}

/**
 * Everything the store owns about the books in it, minus the volatile bits (ids,
 * timestamps) — the shape the v1 byte-parity comparison is made in, and the
 * fingerprint the commit refusals assert is unchanged.
 */
function insertedBooks(store: Database): unknown[] {
  return store.getTexts().map((row) => {
    const text = store.getText(row.id!)!
    return {
      title: text.title,
      content: text.content,
      word_count: text.word_count,
      seed_id: text.seed_id,
      is_manual_book: text.is_manual_book,
      categoryName: store.getCategories().find((c) => c.id === text.category_id)?.name ?? null,
      segments: store.getSegments(row.id!).map((segment) => ({
        title: segment.title,
        content: segment.content,
        order: segment.order,
        sourceType: segment.sourceType,
        word_count: segment.word_count,
        startWordOffset: segment.startWordOffset,
        endWordOffset: segment.endWordOffset
      }))
    }
  })
}

describe('parseWingletBookFile — accepted', () => {
  it('reports the confirm-card data for a valid book and writes nothing', async () => {
    const before = storeSnapshot()

    const result = await parseWingletBookFile(db, writeFile('book.wbook', validDocument()))

    expect(result).toEqual({
      status: 'accepted',
      filePath: join(tmpDir, 'book.wbook'),
      confirmation: {
        seedId: 'the-lighthouse-keeper',
        title: 'The Lighthouse Keeper',
        chapterCount: 3,
        categoryName: 'Fiction'
      }
    })
    expect(storeSnapshot()).toBe(before)
    expect(db.getTexts()).toEqual([])
    expect(db.getCategories().map((c) => c.name)).not.toContain('Fiction')
  })

  it('resolves an absent or null category to Uncategorized', async () => {
    const nulled = validDocument()
    ;(nulled.book as Record<string, unknown>).categoryRef = null
    const absent = validDocument()
    delete (absent.book as Record<string, unknown>).categoryRef

    for (const [name, doc] of [
      ['null.wbook', nulled],
      ['absent.wbook', absent]
    ] as const) {
      const result = await parseWingletBookFile(db, writeFile(name, doc))
      expect(result.status).toBe('accepted')
      if (result.status !== 'accepted') throw new Error('expected accepted')
      expect(result.confirmation.categoryName).toBe('Uncategorized')
    }
  })

  it('accepts a BOM-prefixed file (the contract says none; editors disagree)', async () => {
    const result = await parseWingletBookFile(db, writeFile('bom.wbook', validDocument(), { bom: true }))

    expect(result.status).toBe('accepted')
    if (result.status !== 'accepted') throw new Error('expected accepted')
    expect(result.confirmation.title).toBe('The Lighthouse Keeper')
  })

  it('recognizes by marker, not by extension', async () => {
    const result = await parseWingletBookFile(db, writeFile('book.json', validDocument()))

    expect(result.status).toBe('accepted')
  })
})

describe('parseWingletBookFile — refusals', () => {
  it('calls a renamed backup export foreign', async () => {
    const backup = { version: '1.0', exportedAt: '2026-08-05', texts: [], categories: [] }

    expect(await parseWingletBookFile(db, writeFile('backup.wbook', backup))).toEqual({
      status: 'foreign',
      filePath: join(tmpDir, 'backup.wbook')
    })
  })

  it('calls a v1 Library Bundle foreign — it carries no format marker', async () => {
    const bundle = { schemaVersion: 1, bundleVersion: 3, categories: [], books: [] }

    expect((await parseWingletBookFile(db, writeFile('bundle.wbook', bundle))).status).toBe('foreign')
  })

  it('calls a non-JSON file foreign rather than damaged', async () => {
    expect((await parseWingletBookFile(db, writeFile('prose.wbook', 'Once upon a time.'))).status).toBe(
      'foreign'
    )
  })

  it('refuses schemaVersion 1 as unsupported, not newer', async () => {
    const result = await parseWingletBookFile(
      db,
      writeFile('v1.wbook', validDocument({ schemaVersion: 1 }))
    )

    expect(result).toMatchObject({ status: 'unsupported-version', schemaVersion: 1, newer: false })
  })

  it('refuses a future version as newer, so the UI can say "please update"', async () => {
    const future = WINGLET_BOOK_SCHEMA_VERSION + 1
    const result = await parseWingletBookFile(
      db,
      writeFile('future.wbook', validDocument({ schemaVersion: future }))
    )

    expect(result).toMatchObject({
      status: 'unsupported-version',
      schemaVersion: future,
      newer: true
    })
  })

  it('calls structural damage malformed, with a diagnostic reason', async () => {
    const emptySegments = validDocument()
    ;(emptySegments.book as Record<string, unknown>).segments = []
    const blankTitle = validDocument()
    ;(blankTitle.book as { segments: { title: string }[] }).segments[1].title = '   '
    const noSeedId = validDocument()
    delete (noSeedId.book as Record<string, unknown>).seedId

    for (const [name, doc] of [
      ['empty.wbook', emptySegments],
      ['blank.wbook', blankTitle],
      ['noseed.wbook', noSeedId]
    ] as const) {
      const result = await parseWingletBookFile(db, writeFile(name, doc))
      expect(result.status).toBe('malformed')
      if (result.status !== 'malformed') throw new Error('expected malformed')
      expect(result.reason).not.toBe('')
    }
  })

  it('never throws on a missing file or a non-string path', async () => {
    expect(await parseWingletBookFile(db, join(tmpDir, 'nothing-here.wbook'))).toMatchObject({
      status: 'malformed',
      reason: 'file could not be read'
    })
    expect(await parseWingletBookFile(db, undefined)).toMatchObject({
      status: 'malformed',
      reason: 'no file path'
    })
    expect(await parseWingletBookFile(db, tmpDir)).toMatchObject({
      status: 'malformed',
      reason: 'not a file'
    })
  })

  it('leaves the store untouched on every refusal', async () => {
    const before = storeSnapshot()

    await parseWingletBookFile(db, writeFile('backup.wbook', { texts: [] }))
    await parseWingletBookFile(db, writeFile('v1.wbook', validDocument({ schemaVersion: 1 })))
    await parseWingletBookFile(db, writeFile('damaged.wbook', validDocument({ book: {} })))

    expect(storeSnapshot()).toBe(before)
  })
})

describe('parseWingletBookFile — duplicate identity', () => {
  it('skips a seedId already present, and accepts it again once deleted', async () => {
    const filePath = writeFile('book.wbook', validDocument())
    const existing = db.saveText({
      title: 'The Lighthouse Keeper',
      content: 'The lamp had not been lit.',
      seed_id: 'the-lighthouse-keeper'
    })

    expect(await parseWingletBookFile(db, filePath)).toEqual({
      status: 'duplicate',
      filePath,
      seedId: 'the-lighthouse-keeper',
      title: 'The Lighthouse Keeper'
    })

    // Dedupe is against present texts only — never a ledger (ADR-0033 §3.5).
    db.deleteText(existing.id!)

    expect((await parseWingletBookFile(db, filePath)).status).toBe('accepted')
  })

  it('does not treat an unrelated text with the same title as a duplicate', async () => {
    db.saveText({ title: 'The Lighthouse Keeper', content: 'A user-typed text.' })

    expect((await parseWingletBookFile(db, writeFile('book.wbook', validDocument()))).status).toBe(
      'accepted'
    )
  })
})

// ── WB-2b: the commit half ───────────────────────────────────────────────────

describe('commitWingletBookFile — the book lands complete', () => {
  it('inserts the text, its chapters, and its category from one call', async () => {
    const filePath = writeFile('book.wbook', validDocument())

    const result = await commitWingletBookFile(db, filePath)

    const rows = db.getTexts()
    expect(rows).toHaveLength(1)

    // Success is the shared book-intake envelope: it committed, and here is the
    // row — the same answer the EPUB channel gives (ADR-0033 amendment).
    expect(result).toEqual({ status: 'committed', filePath, textId: rows[0].id })

    const text = db.getText(rows[0].id!)!
    expect(text.title).toBe('The Lighthouse Keeper')
    expect(text.seed_id).toBe('the-lighthouse-keeper')
    expect(text.is_manual_book).toBeFalsy()

    // Book content is the chapters joined — derived, never carried (§3.4).
    expect(text.content).toBe(
      'The lamp had not been lit.\n\nA green flare cut the fog.\n\nHe counted the seconds between waves.'
    )
    expect(text.word_count).toBe(18)
    expect(rows[0].segment_count).toBe(3)

    // Category created by name, not Uncategorized.
    const fiction = db.getCategories().find((c) => c.name === 'Fiction')!
    expect(fiction).toBeDefined()
    expect(text.category_id).toBe(fiction.id)
  })

  it('derives order, counts, and contiguous offsets for every chapter', async () => {
    await commitWingletBookFile(db, writeFile('book.wbook', validDocument()))

    const segments = db.getSegments(db.getTexts()[0].id!)

    expect(segments.map((s) => s.title)).toEqual(['The Wreck', 'The Flare', 'The Keeper'])
    expect(segments.map((s) => s.order)).toEqual([0, 1, 2])
    expect(segments.every((s) => s.sourceType === 'detected_heading')).toBe(true)
    expect(segments.map((s) => [s.startWordOffset, s.endWordOffset])).toEqual([
      [0, 6],
      [6, 12],
      [12, 18]
    ])
    expect(segments.map((s) => s.word_count)).toEqual([6, 6, 6])
    // The last chapter's end is the book's own word count — offsets are correct
    // by construction, so chapter-nav and bookmarks can never drift.
    expect(segments[2].endWordOffset).toBe(db.getText(db.getTexts()[0].id!)!.word_count)
  })

  it('lands a null or absent categoryRef in Uncategorized', async () => {
    const nulled = validDocument()
    ;(nulled.book as Record<string, unknown>).categoryRef = null
    const absent = validDocument()
    delete (absent.book as Record<string, unknown>).categoryRef
    ;(absent.book as Record<string, unknown>).seedId = 'second-book'

    for (const [name, doc] of [
      ['null.wbook', nulled],
      ['absent.wbook', absent]
    ] as const) {
      const result = await commitWingletBookFile(db, writeFile(name, doc))
      expect(result.status).toBe('committed')
    }

    for (const row of db.getTexts()) {
      expect(db.getText(row.id!)!.category_id).toBe(UNCATEGORIZED_CATEGORY_ID)
    }
  })

  it('merges an existing category by name rather than duplicating it', async () => {
    const existing = db.saveCategory({ name: 'Fiction' })

    await commitWingletBookFile(db, writeFile('book.wbook', validDocument()))

    expect(db.getCategories().filter((c) => c.name === 'Fiction')).toHaveLength(1)
    expect(db.getText(db.getTexts()[0].id!)!.category_id).toBe(existing.id)
  })
})

describe('commitWingletBookFile — re-runs the ladder (stateless pair)', () => {
  it('refuses a duplicate that raced in after the parse, leaving the store as it was', async () => {
    const filePath = writeFile('book.wbook', validDocument())
    expect((await parseWingletBookFile(db, filePath)).status).toBe('accepted')

    // The same book arrives by another route between the two calls.
    db.saveText({
      title: 'The Lighthouse Keeper',
      content: 'The lamp had not been lit.',
      seed_id: 'the-lighthouse-keeper'
    })
    const before = insertedBooks(db)

    expect(await commitWingletBookFile(db, filePath)).toEqual({
      status: 'duplicate',
      filePath,
      seedId: 'the-lighthouse-keeper',
      title: 'The Lighthouse Keeper'
    })
    expect(insertedBooks(db)).toEqual(before)
    expect(db.getTexts()).toHaveLength(1)
  })

  it('refuses a file that went bad after the parse', async () => {
    const filePath = writeFile('book.wbook', validDocument())
    expect((await parseWingletBookFile(db, filePath)).status).toBe('accepted')

    const damaged = validDocument()
    ;(damaged.book as Record<string, unknown>).segments = []
    writeFile('book.wbook', damaged)

    const result = await commitWingletBookFile(db, filePath)

    expect(result.status).toBe('malformed')
    expect(db.getTexts()).toEqual([])
  })

  it('refuses a file that disappeared after the parse', async () => {
    const filePath = writeFile('book.wbook', validDocument())
    expect((await parseWingletBookFile(db, filePath)).status).toBe('accepted')
    unlinkSync(filePath)

    expect(await commitWingletBookFile(db, filePath)).toMatchObject({
      status: 'malformed',
      reason: 'file could not be read'
    })
    expect(db.getTexts()).toEqual([])
  })

  it('commits a book whose duplicate was deleted between parse and commit', async () => {
    const filePath = writeFile('book.wbook', validDocument())
    const existing = db.saveText({
      title: 'The Lighthouse Keeper',
      content: 'The lamp had not been lit.',
      seed_id: 'the-lighthouse-keeper'
    })
    expect((await parseWingletBookFile(db, filePath)).status).toBe('duplicate')

    db.deleteText(existing.id!)

    expect((await commitWingletBookFile(db, filePath)).status).toBe('committed')
    expect(db.getTexts()).toHaveLength(1)
  })
})

describe('commitWingletBookFile — nothing lands on a refusal', () => {
  it('writes nothing for foreign, unsupported, damaged, or unusable paths', async () => {
    const before = insertedBooks(db)
    const categoriesBefore = db.getCategories()

    const refusals = [
      await commitWingletBookFile(db, writeFile('backup.wbook', { texts: [], categories: [] })),
      await commitWingletBookFile(db, writeFile('prose.wbook', 'Once upon a time.')),
      await commitWingletBookFile(db, writeFile('v1.wbook', validDocument({ schemaVersion: 1 }))),
      await commitWingletBookFile(
        db,
        writeFile('future.wbook', validDocument({ schemaVersion: WINGLET_BOOK_SCHEMA_VERSION + 1 }))
      ),
      await commitWingletBookFile(db, writeFile('damaged.wbook', validDocument({ book: {} }))),
      await commitWingletBookFile(db, join(tmpDir, 'nothing-here.wbook')),
      await commitWingletBookFile(db, undefined)
    ]

    expect(refusals.map((r) => r.status)).toEqual([
      'foreign',
      'foreign',
      'unsupported-version',
      'unsupported-version',
      'malformed',
      'malformed',
      'malformed'
    ])
    expect(insertedBooks(db)).toEqual(before)
    // Not even a category is created on the way to a refusal.
    expect(db.getCategories()).toEqual(categoriesBefore)
  })
})

// ── v1 byte parity ───────────────────────────────────────────────────────────
//
// A hand-converted v2 file keeps the authored v1 sample fields and drops every
// derived field, exactly as the producer conversion does. The surviving case
// pins the historic sample's content, counts, and offsets explicitly.

interface V1SampleBook {
  seedId: string
  title: string
  content: string
  categoryRef: string | null
  segments: Array<WingletBookSegment & {
    order: number
    word_count: number
    startWordOffset: number
    endWordOffset: number
  }>
}

/** The first book of the shipped v1 sample bundle, verbatim. */
const V1_SAMPLE_BOOK: V1SampleBook = {
  seedId: 'the-lighthouse-keeper',
  title: 'The Lighthouse Keeper',
  content:
    'The lamp had not been lit for three nights, and old Maren felt the silence\npress against the glass like a tide. She climbed the spiral stair with the\noil can knocking at her knee, counting the steps she had counted ten thousand\ntimes before the storms took her hearing.\n\nOn the fourth night a green flare cut the fog above the reef. Maren answered\nwith two long flashes and one short, the old wartime code, and waited to see\nwhether anyone still living remembered how to read the dark.',
  categoryRef: 'Fiction',
  segments: [
    {
      title: 'The Wreck',
      order: 0,
      content:
        'The lamp had not been lit for three nights, and old Maren felt the silence\npress against the glass like a tide. She climbed the spiral stair with the\noil can knocking at her knee, counting the steps she had counted ten thousand\ntimes before the storms took her hearing.',
      word_count: 50,
      startWordOffset: 0,
      endWordOffset: 50
    },
    {
      title: 'The Signal',
      order: 1,
      content:
        'On the fourth night a green flare cut the fog above the reef. Maren answered\nwith two long flashes and one short, the old wartime code, and waited to see\nwhether anyone still living remembered how to read the dark.',
      word_count: 40,
      startWordOffset: 50,
      endWordOffset: 90
    }
  ]
}

/** The producer-side conversion: keep what was authored, drop what is derived. */
function toWingletBookDocument(book: V1SampleBook): Record<string, unknown> {
  return {
    format: WINGLET_BOOK_FORMAT,
    schemaVersion: WINGLET_BOOK_SCHEMA_VERSION,
    book: {
      seedId: book.seedId,
      title: book.title,
      categoryRef: book.categoryRef,
      segments: book.segments.map((segment) => ({
        title: segment.title,
        content: segment.content
      }))
    }
  }
}

describe('commitWingletBookFile — v1 byte parity', () => {
  it('reproduces the numbers the v1 file carried, without reading them', async () => {
    // Pinned explicitly so the reference survives WB-4 deleting the v1 loader:
    // these are the counts and offsets `default-library.json` shipped.
    await commitWingletBookFile(db, writeFile('parity.wbook', toWingletBookDocument(V1_SAMPLE_BOOK)))

    const text = db.getText(db.getTexts()[0].id!)!
    expect(text.content).toBe(V1_SAMPLE_BOOK.content)
    expect(text.word_count).toBe(90)
    expect(db.getSegments(text.id!).map((s) => [s.word_count, s.startWordOffset, s.endWordOffset]))
      .toEqual([
        [50, 0, 50],
        [40, 50, 90]
      ])
  })
})
