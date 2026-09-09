import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { Database, UNCATEGORIZED_CATEGORY_ID } from '../database'

// ── Helpers ────────────────────────────────────────────────────────────────

let db: Database
let tmpDir: string
let storePath: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'fasttrack-test-'))
  storePath = join(tmpDir, 'test-data.json')
  db = new Database(storePath)
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('corrupt store recovery', () => {
  it('backs up unreadable JSON as corrupt and writes a fresh default store', () => {
    const logger = { warn: vi.fn() }
    writeFileSync(storePath, '{"nextId":', 'utf-8')

    const recovered = new Database(storePath, { logger })

    expect(recovered.getTexts()).toEqual([])
    expect(recovered.getCategories().map((category) => category.name)).toEqual([
      'Uncategorized',
      'Reading',
      'Archive'
    ])
    const backups = readdirSync(tmpDir).filter((name) =>
      name.startsWith('test-data.json.corrupt-')
    )
    expect(backups).toHaveLength(1)
    expect(readFileSync(join(tmpDir, backups[0]), 'utf-8')).toBe('{"nextId":')
    expect(existsSync(storePath)).toBe(true)
    expect(() => JSON.parse(readFileSync(storePath, 'utf-8'))).not.toThrow()
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Corrupt store recovered'),
      expect.any(SyntaxError)
    )
  })
})

// ── Reflection removal verification ───────────────────────────────────────

describe('reflection feature removal', () => {
  it('Database has no getReflection method', () => {
    expect((db as unknown as Record<string, unknown>).getReflection).toBeUndefined()
  })

  it('Database has no saveReflection method', () => {
    expect((db as unknown as Record<string, unknown>).saveReflection).toBeUndefined()
  })

  it('Database has no deleteReflection method', () => {
    expect((db as unknown as Record<string, unknown>).deleteReflection).toBeUndefined()
  })

  it('stored JSON has no reflections array', () => {
    // Trigger a save by writing a text
    db.saveText({ title: 'Test', content: 'hello world' })
    const raw = require('fs').readFileSync(storePath, 'utf-8')
    const parsed = JSON.parse(raw)
    expect(parsed.reflections).toBeUndefined()
    expect(parsed.nextReflectionId).toBeUndefined()
  })
})

describe('categories — migration and fallback', () => {
  it('adds built-in categories and assigns legacy texts to Uncategorized on load', () => {
    const { writeFileSync } = require('fs')
    writeFileSync(
      storePath,
      JSON.stringify(
        {
          nextId: 3,
          nextSegmentId: 1,
          nextSummaryId: 1,
          nextSummaryQuestionId: 1,
          texts: [
            { id: 1, title: 'Legacy A', content: 'alpha beta' },
            { id: 2, title: 'Legacy B', content: 'gamma delta', category_id: 999 }
          ],
          segments: [],
          summaries: [],
          summaryQuestions: [],
          readingPositions: [],
          settings: {}
        },
        null,
        2
      ),
      'utf-8'
    )

    const migrated = new Database(storePath)
    const categories = migrated.getCategories()
    expect(categories.map((category) => category.name)).toEqual([
      'Uncategorized',
      'Reading',
      'Archive'
    ])
    expect(categories[0].is_locked).toBe(true)
    expect(migrated.getTexts().every((text) => text.category_id === UNCATEGORIZED_CATEGORY_ID)).toBe(
      true
    )
  })

  it('deleting a category reassigns its texts to Uncategorized', () => {
    const custom = db.saveCategory({ name: 'Research' })
    const first = db.saveText({ title: 'One', content: 'a b c', category_id: custom.id })
    const second = db.saveText({ title: 'Two', content: 'd e f', category_id: custom.id })

    db.deleteCategory(custom.id)

    expect(db.getText(first.id!)!.category_id).toBe(UNCATEGORIZED_CATEGORY_ID)
    expect(db.getText(second.id!)!.category_id).toBe(UNCATEGORIZED_CATEGORY_ID)
  })
})

describe('load migration ladder', () => {
  function writeStore(overrides: Record<string, unknown>): void {
    writeFileSync(
      storePath,
      JSON.stringify(
        {
          nextId: 1,
          nextCategoryId: 4,
          nextSegmentId: 1,
          nextBookmarkId: 1,
          nextSummaryId: 1,
          nextSummaryQuestionId: 1,
          texts: [],
          categories: [],
          segments: [],
          bookmarks: [],
          summaries: [],
          summaryQuestions: [],
          readingPositions: [],
          settings: {},
          seededIds: [],
          seededBundleVersion: 0,
          ...overrides
        },
        null,
        2
      ),
      'utf-8'
    )
  }

  it('normalizes category records, restores built-ins, and repairs text assignments', () => {
    writeStore({
      nextCategoryId: 2,
      categories: [
        null,
        { id: 'bad', name: 'Discard me' },
        { id: 1, name: ' Inbox ', is_system: false, is_locked: false },
        { id: 7, name: ' First name ', is_system: true, is_locked: true },
        { id: 7, name: ' Research ' }
      ],
      texts: [
        { id: 1, title: 'Valid category', content: 'alpha', category_id: 7 },
        { id: 2, title: 'Missing category', content: 'beta', category_id: 99 }
      ]
    })

    const migrated = new Database(storePath)

    expect(migrated.getCategories()).toEqual([
      { id: 1, name: 'Inbox', is_system: true, is_locked: true },
      { id: 2, name: 'Reading', is_system: true },
      { id: 3, name: 'Archive', is_system: true },
      { id: 7, name: 'Research' }
    ])
    expect(migrated.getText(1)?.category_id).toBe(7)
    expect(migrated.getText(2)?.category_id).toBe(UNCATEGORIZED_CATEGORY_ID)
    expect(migrated.saveCategory({ name: 'Next category' }).id).toBe(8)
  })

  it('preserves a future next-category counter above the repaired maximum', () => {
    writeStore({
      nextCategoryId: 20,
      categories: [{ id: 7, name: 'Research' }]
    })

    const migrated = new Database(storePath)

    expect(migrated.saveCategory({ name: 'Future category' }).id).toBe(20)
  })

  it('defaults null counters and malformed record collections before the next write', () => {
    writeStore({
      nextId: null,
      nextSegmentId: null,
      nextBookmarkId: null,
      nextSummaryId: null,
      nextSummaryQuestionId: null,
      segments: {},
      bookmarks: 'invalid',
      summaries: null,
      summaryQuestions: 42,
      readingPositions: false,
      seededIds: ['kept', 42, null],
      seededBundleVersion: 'invalid'
    })

    const migrated = new Database(storePath)
    expect(migrated.saveText({ title: 'First', content: 'one' }).id).toBe(1)

    const persisted = JSON.parse(readFileSync(storePath, 'utf-8'))
    expect(persisted).toMatchObject({
      nextId: 2,
      nextSegmentId: 1,
      nextBookmarkId: 1,
      nextSummaryId: 1,
      nextSummaryQuestionId: 1,
      segments: [],
      bookmarks: [],
      summaries: [],
      summaryQuestions: [],
      readingPositions: [],
      seededIds: ['kept'],
      seededBundleVersion: 0
    })
  })
})

describe('saveText record decisions', () => {
  const diagnostics = {
    parser: 'mammoth' as const,
    sourceExtension: 'docx' as const,
    charCount: 13,
    wordCount: 3,
    paragraphCount: 1,
    cleanupActions: [],
    suspiciousSignals: []
  }
  const blocks = [{ type: 'paragraph' as const, text: 'one two three', order: 0 }]

  it('builds a new record from normalized content, category, and optional fields', () => {
    const category = db.saveCategory({ name: 'Research' })

    const saved = db.saveText({
      title: 'Structured',
      content: '  one\n\ttwo   three  ',
      seed_id: 'curated-id',
      author: 'Ada Author',
      source_type: 'docx',
      page_count: 4,
      content_html: '<p>one two three</p>',
      content_display: 'one\ntwo three',
      import_diagnostics: diagnostics,
      import_blocks: blocks,
      category_id: category.id
    })

    expect(saved).toMatchObject({
      id: 1,
      title: 'Structured',
      word_count: 3,
      seed_id: 'curated-id',
      author: 'Ada Author',
      source_type: 'docx',
      page_count: 4,
      content_html: '<p>one two three</p>',
      content_display: 'one\ntwo three',
      import_diagnostics: diagnostics,
      import_blocks: blocks,
      category_id: category.id
    })
    expect(Object.keys(JSON.parse(readFileSync(storePath, 'utf-8')).texts[0])).toEqual([
      'id',
      'title',
      'content',
      'word_count',
      'is_manual_book',
      'seed_id',
      'author',
      'source_type',
      'page_count',
      'content_html',
      'content_display',
      'import_diagnostics',
      'import_blocks',
      'category_id',
      'created_at',
      'updated_at'
    ])
  })

  it('uses record defaults and omits unsupplied optional fields from disk', () => {
    const saved = db.saveText({})

    expect(saved).toMatchObject({
      id: 1,
      title: 'Untitled',
      content: '',
      word_count: 0,
      is_manual_book: false,
      category_id: UNCATEGORIZED_CATEGORY_ID
    })
    const persisted = JSON.parse(readFileSync(storePath, 'utf-8')).texts[0]
    expect(persisted).not.toHaveProperty('seed_id')
    expect(persisted).not.toHaveProperty('author')
    expect(persisted).not.toHaveProperty('source_type')
    expect(persisted).not.toHaveProperty('page_count')
    expect(persisted).not.toHaveProperty('content_html')
    expect(persisted).not.toHaveProperty('content_display')
    expect(persisted).not.toHaveProperty('import_diagnostics')
    expect(persisted).not.toHaveProperty('import_blocks')
  })

  it('patches supplied fields without erasing omitted content metadata', () => {
    const category = db.saveCategory({ name: 'Research' })
    const original = db.saveText({
      title: 'Original',
      content: 'one two three',
      author: 'Ada Author',
      source_type: 'docx',
      page_count: 4,
      content_html: '<p>one two three</p>',
      content_display: 'one\ntwo three',
      import_diagnostics: diagnostics,
      import_blocks: blocks,
      category_id: category.id
    })

    const renamed = db.saveText({ id: original.id, title: 'Renamed' })
    expect(renamed).toMatchObject({
      title: 'Renamed',
      content: 'one two three',
      word_count: 3,
      author: 'Ada Author',
      source_type: 'docx',
      page_count: 4,
      content_html: '<p>one two three</p>',
      content_display: 'one\ntwo three',
      import_diagnostics: diagnostics,
      import_blocks: blocks,
      category_id: category.id
    })

    const cleared = db.saveText({
      id: original.id,
      content: ' \n\t ',
      author: '',
      category_id: 999
    })
    expect(cleared.word_count).toBe(0)
    expect(cleared.author).toBe('')
    expect(cleared.category_id).toBe(UNCATEGORIZED_CATEGORY_ID)
    expect(cleared.source_type).toBe('docx')
  })

  it('treats an unknown incoming id as a new record with the store id', () => {
    const saved = db.saveText({ id: 999, title: 'New', content: 'one two' })

    expect(saved.id).toBe(1)
    expect(saved.word_count).toBe(2)
    expect(db.getText(999)).toBeNull()
  })

  it('round-trips a pre-existing canonical store byte for byte', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-08-11T12:34:56.000Z'))
      db.saveText({
        title: 'Compatibility fixture',
        content: 'one two three',
        author: 'Ada Author',
        source_type: 'docx',
        page_count: 4,
        content_html: '<p>one two three</p>',
        content_display: 'one\ntwo three',
        import_diagnostics: diagnostics,
        import_blocks: blocks
      })
      const before = readFileSync(storePath, 'utf-8')

      const reopened = new Database(storePath)
      reopened.saveSettings({})

      expect(readFileSync(storePath, 'utf-8')).toBe(before)
    } finally {
      vi.useRealTimers()
    }
  })
})

// ── Library list projection ───────────────────────────────────────────────

describe('getTexts — list projection', () => {
  it('carries seed_id so the Library can tell a curated book from a user text', () => {
    // ADR-0023 keys the "chapters" vocabulary, the suppressed Add Content
    // affordance, and (ADR-0033) post-import lookup off seed_id — all of which
    // read the list projection, not the full record.
    db.saveText({ title: 'A Winglet Book', content: 'a b c', seed_id: 'the-lighthouse-keeper' })
    db.saveText({ title: 'A User Text', content: 'd e f' })

    const listed = db.getTexts()

    expect(listed.find((t) => t.title === 'A Winglet Book')!.seed_id).toBe('the-lighthouse-keeper')
    expect(listed.find((t) => t.title === 'A User Text')!.seed_id).toBeUndefined()
    // Still a list projection: content stays out of it.
    expect(listed.every((t) => t.content === undefined)).toBe(true)
  })

  it('carries source_type so an EPUB book reads as publisher-chaptered in the list', () => {
    // ADR-0034 §8 extends the ADR-0023 vocabulary to `source_type: 'epub'`.
    // The Library card count line and SegmentPanel header both read the list
    // projection, so a dropped source_type made an imported novel say
    // "contents".
    db.saveText({ title: 'An EPUB Book', content: 'a b c', source_type: 'epub' })
    db.saveText({ title: 'A Pasted Text', content: 'd e f', source_type: 'text' })

    const listed = db.getTexts()

    expect(listed.find((t) => t.title === 'An EPUB Book')!.source_type).toBe('epub')
    expect(listed.find((t) => t.title === 'A Pasted Text')!.source_type).toBe('text')
    // Distinct axes: an EPUB book carries no seed_id, so Add Content stays.
    expect(listed.find((t) => t.title === 'An EPUB Book')!.seed_id).toBeUndefined()
  })
})

describe('retired launch-ledger compatibility', () => {
  it('round-trips dormant ledger keys while legacy curated books remain ordinary deletable texts', () => {
    const book = db.saveText({
      title: 'Legacy Curated Book',
      content: 'chapter words remain readable',
      seed_id: 'legacy-curated-book'
    })
    db.saveSegments(book.id!, [
      {
        title: 'Chapter 1',
        content: 'chapter words remain readable',
        order: 0,
        sourceType: 'detected_heading',
        word_count: 4,
        startWordOffset: 0,
        endWordOffset: 4
      }
    ])
    const legacyStore = JSON.parse(readFileSync(storePath, 'utf-8'))
    legacyStore.seededIds = ['legacy-curated-book', 'previously-deleted-book']
    legacyStore.seededBundleVersion = 7
    writeFileSync(storePath, JSON.stringify(legacyStore, null, 2), 'utf-8')

    const reopened = new Database(storePath)
    expect(reopened.getText(book.id!)).toMatchObject({
      title: 'Legacy Curated Book',
      content: 'chapter words remain readable',
      seed_id: 'legacy-curated-book'
    })
    expect(reopened.getTexts()[0].seed_id).toBe('legacy-curated-book')
    expect(reopened.getSegments(book.id!)).toMatchObject([
      {
        title: 'Chapter 1',
        sourceType: 'detected_heading',
        startWordOffset: 0,
        endWordOffset: 4
      }
    ])

    reopened.deleteText(book.id!)
    expect(reopened.getText(book.id!)).toBeNull()
    expect(reopened.getSegments(book.id!)).toEqual([])

    const roundTripped = JSON.parse(readFileSync(storePath, 'utf-8'))
    expect(roundTripped.seededIds).toEqual([
      'legacy-curated-book',
      'previously-deleted-book'
    ])
    expect(roundTripped.seededBundleVersion).toBe(7)
  })
})

// ── Reading position save / restore ───────────────────────────────────────

describe('reading position — save and retrieve', () => {
  it('returns null when no position has been saved', () => {
    const pos = db.getReadingPosition(99)
    expect(pos).toBeNull()
  })

  it('saves a reading position and retrieves it', () => {
    const saved = db.saveReadingPosition(1, 42)
    expect(saved.textId).toBe(1)
    expect(saved.stackIndex).toBe(42)
    expect(saved.source).toBe('text')
    expect(saved.updatedAt).toBeTruthy()

    const retrieved = db.getReadingPosition(1)
    expect(retrieved).not.toBeNull()
    expect(retrieved!.stackIndex).toBe(42)
  })

  it('updates an existing position rather than creating a duplicate', () => {
    db.saveReadingPosition(1, 10)
    db.saveReadingPosition(1, 50)

    const pos = db.getReadingPosition(1)
    expect(pos!.stackIndex).toBe(50)

    // Reload from disk to confirm persistence
    const db2 = new Database(storePath)
    const pos2 = db2.getReadingPosition(1)
    expect(pos2!.stackIndex).toBe(50)
  })

  it('supports separate positions for different texts', () => {
    db.saveReadingPosition(1, 10)
    db.saveReadingPosition(2, 200)

    expect(db.getReadingPosition(1)!.stackIndex).toBe(10)
    expect(db.getReadingPosition(2)!.stackIndex).toBe(200)
  })

  it('persists position across database instances (survives app restart)', () => {
    db.saveReadingPosition(5, 123)

    const db2 = new Database(storePath)
    const pos = db2.getReadingPosition(5)
    expect(pos).not.toBeNull()
    expect(pos!.stackIndex).toBe(123)
  })
})

// ── Reading position cascade delete ───────────────────────────────────────

describe('resume candidate - latest parent Library text position', () => {
  function writeStore(data: object): void {
    writeFileSync(storePath, JSON.stringify(data, null, 2), 'utf-8')
  }

  it('returns the latest eligible saved reading position with text details', () => {
    const older = db.saveText({ title: 'Older Book', content: 'one two three' })
    const newer = db.saveText({ title: 'Newer Book', content: 'four five six' })
    writeStore({
      nextId: 3,
      nextCategoryId: 4,
      nextSegmentId: 1,
      nextSummaryId: 1,
      nextSummaryQuestionId: 1,
      texts: [older, newer],
      categories: [],
      segments: [],
      summaries: [],
      summaryQuestions: [],
      readingPositions: [
        { textId: older.id, stackIndex: 4, updatedAt: '2026-06-17T09:00:00.000Z' },
        { textId: newer.id, stackIndex: 8, updatedAt: '2026-06-17T10:00:00.000Z' }
      ],
      settings: {}
    })

    expect(new Database(storePath).getLatestResumeCandidate()).toEqual({
      textId: newer.id,
      title: 'Newer Book',
      stackIndex: 8,
      updatedAt: '2026-06-17T10:00:00.000Z'
    })
  })

  it('ignores stack 0 positions', () => {
    const started = db.saveText({ title: 'Started', content: 'one two three' })
    const atStart = db.saveText({ title: 'At Start', content: 'four five six' })
    writeStore({
      nextId: 3,
      nextCategoryId: 4,
      nextSegmentId: 1,
      nextSummaryId: 1,
      nextSummaryQuestionId: 1,
      texts: [started, atStart],
      categories: [],
      segments: [],
      summaries: [],
      summaryQuestions: [],
      readingPositions: [
        { textId: started.id, stackIndex: 3, updatedAt: '2026-06-17T09:00:00.000Z' },
        { textId: atStart.id, stackIndex: 0, updatedAt: '2026-06-17T10:00:00.000Z' }
      ],
      settings: {}
    })

    expect(new Database(storePath).getLatestResumeCandidate()?.title).toBe('Started')
  })

  it('ignores positions for missing texts', () => {
    const existing = db.saveText({ title: 'Existing', content: 'one two three' })
    writeStore({
      nextId: 2,
      nextCategoryId: 4,
      nextSegmentId: 1,
      nextSummaryId: 1,
      nextSummaryQuestionId: 1,
      texts: [existing],
      categories: [],
      segments: [],
      summaries: [],
      summaryQuestions: [],
      readingPositions: [
        { textId: existing.id, stackIndex: 3, updatedAt: '2026-06-17T09:00:00.000Z' },
        { textId: 999, stackIndex: 9, updatedAt: '2026-06-17T10:00:00.000Z' }
      ],
      settings: {}
    })

    expect(new Database(storePath).getLatestResumeCandidate()?.title).toBe('Existing')
  })

  it('ignores positions explicitly saved for segment pseudo-texts', () => {
    const text = db.saveText({ title: 'Text Id One', content: 'one two three' })
    writeStore({
      nextId: 2,
      nextCategoryId: 4,
      nextSegmentId: 2,
      nextSummaryId: 1,
      nextSummaryQuestionId: 1,
      texts: [text],
      categories: [],
      segments: [
        {
          id: text.id,
          textId: text.id,
          title: 'Chapter One',
          content: 'one two',
          order: 0,
          sourceType: 'detected_heading',
          word_count: 2
        }
      ],
      summaries: [],
      summaryQuestions: [],
      readingPositions: [
        {
          textId: text.id,
          stackIndex: 5,
          updatedAt: '2026-06-17T10:00:00.000Z',
          source: 'segment'
        }
      ],
      settings: {}
    })

    expect(new Database(storePath).getLatestResumeCandidate()).toBeNull()
  })

  it('does not suppress parent text candidates just because a segment id collides', () => {
    const text = db.saveText({ title: 'Parent Text', content: 'one two three' })
    writeStore({
      nextId: 2,
      nextCategoryId: 4,
      nextSegmentId: 2,
      nextSummaryId: 1,
      nextSummaryQuestionId: 1,
      texts: [text],
      categories: [],
      segments: [
        {
          id: text.id,
          textId: text.id,
          title: 'Chapter One',
          content: 'one two',
          order: 0,
          sourceType: 'detected_heading',
          word_count: 2
        }
      ],
      summaries: [],
      summaryQuestions: [],
      readingPositions: [
        {
          textId: text.id,
          stackIndex: 5,
          updatedAt: '2026-06-17T10:00:00.000Z',
          source: 'text'
        }
      ],
      settings: {}
    })

    expect(new Database(storePath).getLatestResumeCandidate()?.title).toBe('Parent Text')
  })
})

describe('reading position — cascade delete', () => {
  it('deletes the saved position when the associated text is deleted', () => {
    const text = db.saveText({ title: 'My Book', content: 'some content here' })
    db.saveReadingPosition(text.id!, 30)

    expect(db.getReadingPosition(text.id!)).not.toBeNull()

    db.deleteText(text.id!)
    expect(db.getReadingPosition(text.id!)).toBeNull()
  })
})

describe('bookmarks — store CRUD and invariants', () => {
  it('creates, reads, renames, deletes, and persists bookmarks', () => {
    const text = db.saveText({ title: 'My Book', content: 'one two three four five' })
    const bookmark = db.saveBookmark(text.id!, {
      kind: 'normal',
      wordOffset: 2,
      label: 'Middle'
    })

    expect(bookmark).toMatchObject({
      id: 1,
      textId: text.id,
      kind: 'normal',
      wordOffset: 2,
      label: 'Middle'
    })
    expect(bookmark.createdAt).toBeTruthy()

    expect(new Database(storePath).getBookmarks(text.id!)).toHaveLength(1)

    db.updateBookmarkLabel(bookmark.id, 'Renamed')
    expect(db.getBookmarks(text.id!)[0].label).toBe('Renamed')

    db.deleteBookmark(bookmark.id)
    expect(new Database(storePath).getBookmarks(text.id!)).toEqual([])
  })

  it('replaces the prior goal bookmark for the same text while preserving normals and other texts', () => {
    const firstText = db.saveText({ title: 'First', content: 'one two three four five six' })
    const secondText = db.saveText({ title: 'Second', content: 'alpha beta gamma delta' })
    const normal = db.saveBookmark(firstText.id!, {
      kind: 'normal',
      wordOffset: 1,
      label: 'Normal'
    })
    db.saveBookmark(firstText.id!, {
      kind: 'goal',
      wordOffset: 3,
      label: 'Old goal'
    })
    const replacement = db.saveBookmark(firstText.id!, {
      kind: 'goal',
      wordOffset: 5,
      label: 'New goal'
    })
    const otherGoal = db.saveBookmark(secondText.id!, {
      kind: 'goal',
      wordOffset: 2,
      label: 'Other text goal'
    })

    expect(db.getBookmarks(firstText.id!).map((bookmark) => bookmark.id)).toEqual([
      normal.id,
      replacement.id
    ])
    expect(db.getBookmarks(firstText.id!).filter((bookmark) => bookmark.kind === 'goal')).toEqual([
      replacement
    ])
    expect(db.getBookmarks(secondText.id!)).toEqual([otherGoal])
  })

  it('deletes bookmarks when the associated text is deleted', () => {
    const deletedText = db.saveText({ title: 'Delete me', content: 'one two three' })
    const keptText = db.saveText({ title: 'Keep me', content: 'alpha beta gamma' })
    db.saveBookmark(deletedText.id!, { kind: 'normal', wordOffset: 1, label: 'Gone' })
    const kept = db.saveBookmark(keptText.id!, { kind: 'normal', wordOffset: 1, label: 'Kept' })

    db.deleteText(deletedText.id!)

    const reloaded = new Database(storePath)
    expect(reloaded.getBookmarks(deletedText.id!)).toEqual([])
    expect(reloaded.getBookmarks(keptText.id!)).toEqual([kept])
  })

  it('clamps normal bookmark offsets on read and drops goals past the text end', () => {
    const text = db.saveText({ title: 'Short', content: 'one two three four five' })
    const raw = JSON.parse(readFileSync(storePath, 'utf-8'))
    raw.bookmarks = [
      {
        id: 1,
        textId: text.id,
        kind: 'normal',
        wordOffset: -10,
        label: 'Before start',
        createdAt: '2026-07-12T00:00:00.000Z'
      },
      {
        id: 2,
        textId: text.id,
        kind: 'normal',
        wordOffset: 99,
        label: 'After end',
        createdAt: '2026-07-12T00:00:01.000Z'
      },
      {
        id: 3,
        textId: text.id,
        kind: 'goal',
        wordOffset: 99,
        label: 'Past-end goal',
        createdAt: '2026-07-12T00:00:02.000Z'
      },
      {
        id: 4,
        textId: text.id,
        kind: 'goal',
        wordOffset: 3,
        label: 'Valid goal',
        createdAt: '2026-07-12T00:00:03.000Z'
      }
    ]
    raw.nextBookmarkId = 5
    writeFileSync(storePath, JSON.stringify(raw, null, 2), 'utf-8')

    const bookmarks = new Database(storePath).getBookmarks(text.id!)

    expect(bookmarks.map(({ id, wordOffset }) => ({ id, wordOffset }))).toEqual([
      { id: 1, wordOffset: 0 },
      { id: 4, wordOffset: 3 },
      { id: 2, wordOffset: 4 }
    ])

    const persisted = JSON.parse(readFileSync(storePath, 'utf-8'))
    expect(persisted.bookmarks.map((bookmark: { id: number }) => bookmark.id)).toEqual([1, 2, 4])
    expect(persisted.bookmarks.find((bookmark: { id: number }) => bookmark.id === 2).wordOffset).toBe(4)
  })
})

// ── Summary passage range ─────────────────────────────────────────────────

describe('summary — passage range (startWordOffset / endWordOffset)', () => {
  it('saves a summary with passage range and retrieves it', () => {
    const text = db.saveText({ title: 'Novel', content: 'word '.repeat(1000) })
    const summary = db.saveSummary({
      textId: text.id!,
      textTitle: text.title,
      content: 'Great chapter about the hero.',
      startWordOffset: 100,
      endWordOffset: 450
    })

    expect(summary.startWordOffset).toBe(100)
    expect(summary.endWordOffset).toBe(450)

    const [retrieved] = db.getSummaries(text.id!)
    expect(retrieved.startWordOffset).toBe(100)
    expect(retrieved.endWordOffset).toBe(450)
  })

  it('saves a summary without passage range (undefined fields remain absent)', () => {
    const text = db.saveText({ title: 'Article', content: 'hello world' })
    const summary = db.saveSummary({
      textId: text.id!,
      textTitle: text.title,
      content: 'A short article.'
    })
    expect(summary.startWordOffset).toBeUndefined()
    expect(summary.endWordOffset).toBeUndefined()
  })

  it('stores different passage ranges for multiple summaries of the same text', () => {
    const text = db.saveText({ title: 'Long Book', content: 'word '.repeat(2000) })

    db.saveSummary({
      textId: text.id!, textTitle: text.title, content: 'Session 1',
      startWordOffset: 0, endWordOffset: 500
    })
    db.saveSummary({
      textId: text.id!, textTitle: text.title, content: 'Session 2',
      startWordOffset: 500, endWordOffset: 1200
    })

    const summaries = db.getSummaries(text.id!)
    expect(summaries).toHaveLength(2)
    expect(summaries[0].startWordOffset).toBe(0)
    expect(summaries[0].endWordOffset).toBe(500)
    expect(summaries[1].startWordOffset).toBe(500)
    expect(summaries[1].endWordOffset).toBe(1200)
  })

  it('passage range does not change when editing summary content', () => {
    const text = db.saveText({ title: 'Book', content: 'hello world' })
    const original = db.saveSummary({
      textId: text.id!, textTitle: text.title, content: 'Original text.',
      startWordOffset: 10, endWordOffset: 80
    })

    // Edit the content
    db.saveSummary({
      id: original.id,
      textId: original.textId, textTitle: original.textTitle,
      content: 'Updated text.'
    })

    const [updated] = db.getSummaries(text.id!)
    expect(updated.content).toBe('Updated text.')
    // Range is preserved from the original record (edit only updates content/chapterTitle)
    expect(updated.startWordOffset).toBe(10)
    expect(updated.endWordOffset).toBe(80)
  })
})

// ── source_type and page_count ─────────────────────────────────────────────

describe('source_type and page_count — persistence', () => {
  it('saves and retrieves source_type for a PDF text', () => {
    const text = db.saveText({ title: 'Report', content: 'word '.repeat(100), source_type: 'pdf', page_count: 5 })
    const loaded = db.getText(text.id!)
    expect(loaded!.source_type).toBe('pdf')
    expect(loaded!.page_count).toBe(5)
  })

  it('saves and retrieves source_type for a Word document', () => {
    const text = db.saveText({ title: 'Doc', content: 'word '.repeat(50), source_type: 'docx', page_count: 3 })
    const loaded = db.getText(text.id!)
    expect(loaded!.source_type).toBe('docx')
    expect(loaded!.page_count).toBe(3)
  })

  it('saves and retrieves source_type for plain text', () => {
    const text = db.saveText({ title: 'Notes', content: 'some text here', source_type: 'text' })
    const loaded = db.getText(text.id!)
    expect(loaded!.source_type).toBe('text')
    expect(loaded!.page_count).toBeUndefined()
  })

  it('existing records without source_type remain backward compatible (undefined)', () => {
    const text = db.saveText({ title: 'Legacy', content: 'old content' })
    const loaded = db.getText(text.id!)
    expect(loaded!.source_type).toBeUndefined()
    expect(loaded!.page_count).toBeUndefined()
  })

  it('persists source_type and page_count across database instances', () => {
    const text = db.saveText({ title: 'Big PDF', content: 'text', source_type: 'pdf', page_count: 42 })
    const db2 = new Database(storePath)
    const loaded = db2.getText(text.id!)
    expect(loaded!.source_type).toBe('pdf')
    expect(loaded!.page_count).toBe(42)
  })

  it('can update page_count on an existing record', () => {
    const text = db.saveText({ title: 'Draft', content: 'text', source_type: 'pdf', page_count: 10 })
    db.saveText({ id: text.id, title: 'Draft', content: 'text', source_type: 'pdf', page_count: 12 })
    const loaded = db.getText(text.id!)
    expect(loaded!.page_count).toBe(12)
  })

  it('persists import diagnostics and structured blocks', () => {
    const text = db.saveText({
      title: 'Structured',
      content: 'Chapter text here',
      source_type: 'docx',
      import_diagnostics: {
        parser: 'mammoth',
        sourceExtension: 'docx',
        charCount: 17,
        wordCount: 3,
        paragraphCount: 1,
        cleanupActions: [],
        suspiciousSignals: [],
      },
      import_blocks: [
        { type: 'heading', text: 'Chapter One', level: 1, order: 0 },
        { type: 'paragraph', text: 'Chapter text here', order: 1 },
      ],
    })
    const loaded = new Database(storePath).getText(text.id!)

    expect(loaded!.import_diagnostics?.parser).toBe('mammoth')
    expect(loaded!.import_blocks?.[0].type).toBe('heading')
  })
})

// ── Edge cases ──────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('handles empty passage (startWordOffset === endWordOffset) gracefully', () => {
    const text = db.saveText({ title: 'Short', content: 'hello' })
    const summary = db.saveSummary({
      textId: text.id!, textTitle: text.title, content: 'Nothing read.',
      startWordOffset: 0, endWordOffset: 0
    })
    expect(summary.startWordOffset).toBe(0)
    expect(summary.endWordOffset).toBe(0)
  })

  it('getReadingPosition returns null after text is deleted', () => {
    const text = db.saveText({ title: 'Gone', content: 'test' })
    db.saveReadingPosition(text.id!, 5)
    db.deleteText(text.id!)
    expect(db.getReadingPosition(text.id!)).toBeNull()
  })
})

// ── appendSegment (Add Chapter from Library) ───────────────────────────────

describe('appendSegment — adding chapters from Library', () => {
  it('creates a segment and updates the parent text content', () => {
    const book = db.saveText({ title: 'My Book', content: '', is_manual_book: true })

    const seg = db.appendSegment(book.id!, {
      title: 'Chapter 1',
      content: 'once upon a time in a land far away',
      order: 0,
      sourceType: 'detected_heading',
      word_count: 9
    })

    expect(seg.id).toBeGreaterThan(0)
    expect(seg.textId).toBe(book.id)
    expect(seg.title).toBe('Chapter 1')

    const updated = db.getText(book.id!)
    expect(updated!.content).toBe('once upon a time in a land far away')
    expect(updated!.word_count).toBe(9)
  })

  it('appends multiple chapters and concatenates content', () => {
    const book = db.saveText({ title: 'Two-Chapter Book', content: '', is_manual_book: true })

    db.appendSegment(book.id!, {
      title: 'Intro',
      content: 'chapter one text',
      order: 0,
      sourceType: 'detected_heading',
      word_count: 3
    })
    db.appendSegment(book.id!, {
      title: 'Part Two',
      content: 'chapter two text',
      order: 1,
      sourceType: 'detected_heading',
      word_count: 3
    })

    const segs = db.getSegments(book.id!)
    expect(segs).toHaveLength(2)
    expect(segs[0].title).toBe('Intro')
    expect(segs[1].title).toBe('Part Two')

    const updated = db.getText(book.id!)
    expect(updated!.content).toBe('chapter one text\n\nchapter two text')
  })

  it('chapters from different text inputs (file and paste) are stored identically', () => {
    const book = db.saveText({ title: 'Multi-Source Book', content: '', is_manual_book: true })

    // Simulate "pasted" chapter
    const fromPaste = db.appendSegment(book.id!, {
      title: 'Pasted Chapter',
      content: 'pasted content here',
      order: 0,
      sourceType: 'detected_heading',
      word_count: 3
    })

    // Simulate "file-imported" chapter (same DB path, different content)
    const fromFile = db.appendSegment(book.id!, {
      title: 'File Chapter',
      content: 'file content here',
      order: 1,
      sourceType: 'detected_heading',
      word_count: 3
    })

    expect(fromPaste.textId).toBe(book.id)
    expect(fromFile.textId).toBe(book.id)
    expect(db.getSegments(book.id!)).toHaveLength(2)
  })

  it('maintains correct order across multiple appendSegment calls', () => {
    const book = db.saveText({ title: 'Ordered Book', content: '', is_manual_book: true })

    for (let i = 0; i < 4; i++) {
      db.appendSegment(book.id!, {
        title: `Chapter ${i + 1}`,
        content: `content of chapter ${i + 1}`,
        order: i,
        sourceType: 'detected_heading',
        word_count: 4
      })
    }

    const segs = db.getSegments(book.id!)
    expect(segs.map((s) => s.order)).toEqual([0, 1, 2, 3])
    expect(segs.map((s) => s.title)).toEqual(['Chapter 1', 'Chapter 2', 'Chapter 3', 'Chapter 4'])
  })

  it('persists chapters across database instances (survives app restart)', () => {
    const book = db.saveText({ title: 'Persistent Book', content: '', is_manual_book: true })
    db.appendSegment(book.id!, {
      title: 'Persisted Chapter',
      content: 'content that should survive restart',
      order: 0,
      sourceType: 'detected_heading',
      word_count: 5
    })

    const db2 = new Database(storePath)
    const segs = db2.getSegments(book.id!)
    expect(segs).toHaveLength(1)
    expect(segs[0].title).toBe('Persisted Chapter')
    expect(segs[0].content).toBe('content that should survive restart')
  })

  it('deleteText removes all chapters belonging to the book', () => {
    const book = db.saveText({ title: 'To Delete', content: '', is_manual_book: true })
    db.appendSegment(book.id!, {
      title: 'Ch 1', content: 'one', order: 0, sourceType: 'detected_heading', word_count: 1
    })
    db.appendSegment(book.id!, {
      title: 'Ch 2', content: 'two', order: 1, sourceType: 'detected_heading', word_count: 1
    })

    expect(db.getSegments(book.id!)).toHaveLength(2)

    db.deleteText(book.id!)
    expect(db.getSegments(book.id!)).toHaveLength(0)
    expect(db.getText(book.id!)).toBeNull()
  })

  it('chapter with an associated summary stores the summary correctly', () => {
    const book = db.saveText({ title: 'With Summary', content: '', is_manual_book: true })
    const seg = db.appendSegment(book.id!, {
      title: 'Chapter With Notes',
      content: 'interesting content here',
      order: 0,
      sourceType: 'detected_heading',
      word_count: 3
    })
    const summary = db.saveSummary({
      textId: book.id!,
      segmentId: seg.id,
      textTitle: book.title,
      chapterTitle: seg.title,
      content: 'This chapter was about something interesting.'
    })

    expect(summary.segmentId).toBe(seg.id)
    const summaries = db.getSummaries(book.id!)
    expect(summaries).toHaveLength(1)
    expect(summaries[0].chapterTitle).toBe('Chapter With Notes')
  })
})

// ── createChapterFromPassage ───────────────────────────────────────────────

describe('createChapterFromPassage — basic creation', () => {
  it('creates a chapter whose content is the raw passage slice from the parent text', () => {
    const text = db.saveText({
      title: 'Novel',
      content: 'one two three four five six seven eight nine ten'
    })

    const result = db.createChapterFromPassage(text.id!, 0, 5, 'Part One')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.segment.content).toBe('one two three four five')
    expect(result.segment.startWordOffset).toBe(0)
    expect(result.segment.endWordOffset).toBe(5)
    expect(result.segment.word_count).toBe(5)
    expect(result.segment.title).toBe('Part One')
    expect(result.segment.textId).toBe(text.id)
  })

  it('stores the raw text slice independently — parent text content is unchanged', () => {
    const original = 'word '.repeat(100).trim()
    const text = db.saveText({ title: 'Source', content: original })

    db.createChapterFromPassage(text.id!, 10, 30, 'Middle')

    const reloaded = db.getText(text.id!)
    expect(reloaded!.content).toBe(original)
  })

  it('persists the chapter across database instances', () => {
    const text = db.saveText({ title: 'Book', content: 'alpha beta gamma delta epsilon' })
    db.createChapterFromPassage(text.id!, 2, 5, 'Tail')

    const db2 = new Database(storePath)
    const segs = db2.getSegments(text.id!)
    expect(segs).toHaveLength(1)
    expect(segs[0].content).toBe('gamma delta epsilon')
    expect(segs[0].startWordOffset).toBe(2)
    expect(segs[0].endWordOffset).toBe(5)
  })
})

describe('createChapterFromPassage — reading position is unaffected', () => {
  it('a saved reading position is unchanged after a chapter is created from a passage', () => {
    const text = db.saveText({ title: 'Long Read', content: 'word '.repeat(500).trim() })
    db.saveReadingPosition(text.id!, 120)

    db.createChapterFromPassage(text.id!, 0, 200, 'Chapter One')

    const pos = db.getReadingPosition(text.id!)
    expect(pos!.stackIndex).toBe(120)
  })
})

describe('createChapterFromPassage — raw text stored separately from summaries', () => {
  it('editing the summary content does not alter the segment raw text', () => {
    const text = db.saveText({ title: 'Article', content: 'the quick brown fox jumps over the lazy dog' })
    const result = db.createChapterFromPassage(text.id!, 0, 4, 'Opening')
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const summary = db.saveSummary({
      textId: text.id!,
      segmentId: result.segment.id,
      textTitle: text.title,
      chapterTitle: 'Opening',
      content: 'Fox story.',
      startWordOffset: 0,
      endWordOffset: 4
    })

    // Edit the summary
    db.saveSummary({ id: summary.id, textId: text.id!, textTitle: text.title, content: 'Edited summary.' })

    const seg = db.getSegment(result.segment.id)
    expect(seg!.content).toBe('the quick brown fox')
  })
})

describe('createChapterFromPassage — overlap rejection', () => {
  it('rejects a chapter that fully overlaps an existing chapter', () => {
    const text = db.saveText({ title: 'T', content: 'a b c d e f g h i j' })
    db.createChapterFromPassage(text.id!, 0, 5, 'First')

    const result = db.createChapterFromPassage(text.id!, 2, 7, 'Overlap')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/Overlaps with existing chapter "First"/)
  })

  it('rejects a chapter whose range is entirely inside an existing chapter', () => {
    const text = db.saveText({ title: 'T', content: 'a b c d e f g h i j' })
    db.createChapterFromPassage(text.id!, 0, 10, 'Whole')

    const result = db.createChapterFromPassage(text.id!, 3, 6, 'Inside')
    expect(result.ok).toBe(false)
  })

  it('rejects a chapter that partially overlaps at the end boundary', () => {
    const text = db.saveText({ title: 'T', content: 'a b c d e f g h i j' })
    db.createChapterFromPassage(text.id!, 5, 10, 'Second')

    const result = db.createChapterFromPassage(text.id!, 3, 7, 'OverlapEnd')
    expect(result.ok).toBe(false)
  })

  it('rejects a second chapter identical in range to the first', () => {
    const text = db.saveText({ title: 'T', content: 'a b c d e f g h i j' })
    db.createChapterFromPassage(text.id!, 0, 5, 'Ch1')

    const dup = db.createChapterFromPassage(text.id!, 0, 5, 'Ch1-dup')
    expect(dup.ok).toBe(false)
  })

  it('rejects invalid range where start >= end', () => {
    const text = db.saveText({ title: 'T', content: 'a b c d e' })
    const result = db.createChapterFromPassage(text.id!, 3, 3, 'Empty')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/start must be before end/)
  })
})

describe('createChapterFromPassage — adjacent chapters are allowed', () => {
  it('allows two chapters whose ranges are exactly adjacent (end == next start)', () => {
    const text = db.saveText({ title: 'T', content: 'a b c d e f g h i j' })

    const r1 = db.createChapterFromPassage(text.id!, 0, 5, 'Part 1')
    const r2 = db.createChapterFromPassage(text.id!, 5, 10, 'Part 2')

    expect(r1.ok).toBe(true)
    expect(r2.ok).toBe(true)
    if (!r1.ok || !r2.ok) return

    expect(r1.segment.content).toBe('a b c d e')
    expect(r2.segment.content).toBe('f g h i j')
  })

  it('allows a third chapter adjacent to two existing ones', () => {
    const text = db.saveText({ title: 'T', content: 'a b c d e f g h i j k l' })
    db.createChapterFromPassage(text.id!, 0, 4, 'Ch1')
    db.createChapterFromPassage(text.id!, 4, 8, 'Ch2')
    const r3 = db.createChapterFromPassage(text.id!, 8, 12, 'Ch3')
    expect(r3.ok).toBe(true)
    if (!r3.ok) return
    expect(r3.segment.content).toBe('i j k l')
  })

  it('rejects a chapter that overlaps even by one word', () => {
    const text = db.saveText({ title: 'T', content: 'a b c d e f g h i j' })
    db.createChapterFromPassage(text.id!, 0, 5, 'First')

    // start=4 overlaps First which ends at 5 (word at index 4 is shared)
    const result = db.createChapterFromPassage(text.id!, 4, 8, 'OneWordOverlap')
    expect(result.ok).toBe(false)
  })
})

// ── Empty summaries ────────────────────────────────────────────────────────
//
// Requirement: empty content is a valid placeholder; user edits it later.

describe('saveSummary — empty content (placeholder)', () => {
  it('saves a summary with empty content when stopping mid-read', () => {
    const text = db.saveText({ title: 'Novel', content: 'word '.repeat(200).trim() })
    const summary = db.saveSummary({
      textId: text.id!,
      textTitle: text.title,
      content: '',
      startWordOffset: 0,
      endWordOffset: 50
    })
    expect(summary.content).toBe('')
    expect(summary.id).toBeGreaterThan(0)
  })

  it('retrieves the empty-content summary and its passage range is preserved', () => {
    const text = db.saveText({ title: 'Article', content: 'word '.repeat(100).trim() })
    db.saveSummary({
      textId: text.id!,
      textTitle: text.title,
      content: '',
      startWordOffset: 10,
      endWordOffset: 60
    })
    const [saved] = db.getSummaries(text.id!)
    expect(saved.content).toBe('')
    expect(saved.startWordOffset).toBe(10)
    expect(saved.endWordOffset).toBe(60)
  })

  it('persists empty-content summary across database instances', () => {
    const text = db.saveText({ title: 'Book', content: 'hello world foo bar' })
    db.saveSummary({ textId: text.id!, textTitle: text.title, content: '' })
    const db2 = new Database(storePath)
    const [reloaded] = db2.getSummaries(text.id!)
    expect(reloaded.content).toBe('')
  })

  it('saves empty summary when creating a chapter (segmentId present)', () => {
    const text = db.saveText({ title: 'My Book', content: '', is_manual_book: true })
    const seg = db.appendSegment(text.id!, {
      title: 'Chapter 1',
      content: 'some chapter content here',
      order: 0,
      sourceType: 'detected_heading',
      word_count: 4
    })
    // Simulate AddChapterPanel always saving summary (even empty)
    const summary = db.saveSummary({
      textId: text.id!,
      segmentId: seg.id,
      textTitle: text.title,
      chapterTitle: seg.title,
      content: ''
    })
    expect(summary.content).toBe('')
    expect(summary.segmentId).toBe(seg.id)
  })

  it('empty summary can be edited to non-empty content later', () => {
    const text = db.saveText({ title: 'Draft', content: 'some text here' })
    const empty = db.saveSummary({ textId: text.id!, textTitle: text.title, content: '' })
    db.saveSummary({ id: empty.id, textId: empty.textId, textTitle: empty.textTitle, content: 'Now written.' })
    const [updated] = db.getSummaries(text.id!)
    expect(updated.content).toBe('Now written.')
  })

  it('existing non-empty summaries are unaffected by empty-summary feature', () => {
    const text = db.saveText({ title: 'Classic', content: 'content here' })
    db.saveSummary({ textId: text.id!, textTitle: text.title, content: 'A proper summary.' })
    const [s] = db.getSummaries(text.id!)
    expect(s.content).toBe('A proper summary.')
  })
})

// ── appendSegment — word offset tracking ──────────────────────────────────
//
// Requirement: each appended chapter records its position in the combined
// parent text so chapters from pasted/appended text keep their relative order.

describe('appendSegment — startWordOffset and endWordOffset', () => {
  it('first chapter gets startWordOffset=0, endWordOffset=word_count', () => {
    const book = db.saveText({ title: 'Book', content: '', is_manual_book: true })
    const seg = db.appendSegment(book.id!, {
      title: 'Ch 1', content: 'alpha beta gamma', order: 0,
      sourceType: 'detected_heading', word_count: 3
    })
    expect(seg.startWordOffset).toBe(0)
    expect(seg.endWordOffset).toBe(3)
  })

  it('second chapter starts where first chapter ends', () => {
    const book = db.saveText({ title: 'Book', content: '', is_manual_book: true })
    db.appendSegment(book.id!, {
      title: 'Ch 1', content: 'alpha beta gamma', order: 0,
      sourceType: 'detected_heading', word_count: 3
    })
    const seg2 = db.appendSegment(book.id!, {
      title: 'Ch 2', content: 'delta epsilon', order: 1,
      sourceType: 'detected_heading', word_count: 2
    })
    expect(seg2.startWordOffset).toBe(3)
    expect(seg2.endWordOffset).toBe(5)
  })

  it('three chapters have sequential non-overlapping offsets', () => {
    const book = db.saveText({ title: 'Triple', content: '', is_manual_book: true })
    const s1 = db.appendSegment(book.id!, { title: 'A', content: 'one two', order: 0, sourceType: 'detected_heading', word_count: 2 })
    const s2 = db.appendSegment(book.id!, { title: 'B', content: 'three four five', order: 1, sourceType: 'detected_heading', word_count: 3 })
    const s3 = db.appendSegment(book.id!, { title: 'C', content: 'six', order: 2, sourceType: 'detected_heading', word_count: 1 })
    expect(s1.startWordOffset).toBe(0)
    expect(s1.endWordOffset).toBe(2)
    expect(s2.startWordOffset).toBe(2)
    expect(s2.endWordOffset).toBe(5)
    expect(s3.startWordOffset).toBe(5)
    expect(s3.endWordOffset).toBe(6)
  })

  it('word offsets match actual word positions in the combined parent text', () => {
    const book = db.saveText({ title: 'Positioned', content: '', is_manual_book: true })
    db.appendSegment(book.id!, { title: 'Part A', content: 'the quick brown fox', order: 0, sourceType: 'detected_heading', word_count: 4 })
    const seg2 = db.appendSegment(book.id!, { title: 'Part B', content: 'jumps over lazy', order: 1, sourceType: 'detected_heading', word_count: 3 })

    const combined = db.getText(book.id!)!.content!
    const words = combined.trim().split(/\s+/).filter(Boolean)
    // Part B should start at word index 4 in the combined text
    expect(words.slice(seg2.startWordOffset!, seg2.endWordOffset!)).toEqual(['jumps', 'over', 'lazy'])
  })

  it('offsets survive a database reload', () => {
    const book = db.saveText({ title: 'Persistent', content: '', is_manual_book: true })
    db.appendSegment(book.id!, { title: 'X', content: 'foo bar', order: 0, sourceType: 'detected_heading', word_count: 2 })
    db.appendSegment(book.id!, { title: 'Y', content: 'baz qux quux', order: 1, sourceType: 'detected_heading', word_count: 3 })
    const db2 = new Database(storePath)
    const segs = db2.getSegments(book.id!)
    expect(segs[0].startWordOffset).toBe(0)
    expect(segs[0].endWordOffset).toBe(2)
    expect(segs[1].startWordOffset).toBe(2)
    expect(segs[1].endWordOffset).toBe(5)
  })

  it('existing chapters do not shift when a new chapter is appended', () => {
    const book = db.saveText({ title: 'Stable', content: '', is_manual_book: true })
    const s1 = db.appendSegment(book.id!, { title: 'First', content: 'hello world', order: 0, sourceType: 'detected_heading', word_count: 2 })
    // Capture offsets before appending
    const before = { start: s1.startWordOffset, end: s1.endWordOffset }
    db.appendSegment(book.id!, { title: 'Second', content: 'foo bar baz', order: 1, sourceType: 'detected_heading', word_count: 3 })
    const afterSegs = db.getSegments(book.id!)
    const firstAfter = afterSegs.find((s) => s.id === s1.id)!
    expect(firstAfter.startWordOffset).toBe(before.start)
    expect(firstAfter.endWordOffset).toBe(before.end)
  })

  it('chapters from pasted text (paste tab path) and file tab are positioned identically', () => {
    const book = db.saveText({ title: 'Mixed', content: '', is_manual_book: true })
    const fromPaste = db.appendSegment(book.id!, {
      title: 'Pasted', content: 'paste content here', order: 0,
      sourceType: 'detected_heading', word_count: 3
    })
    const fromFile = db.appendSegment(book.id!, {
      title: 'File', content: 'file content there', order: 1,
      sourceType: 'detected_heading', word_count: 3
    })
    // Both get contiguous, non-overlapping offsets
    expect(fromPaste.endWordOffset).toBe(fromFile.startWordOffset)
    expect(fromFile.endWordOffset).toBe(6)
  })
})

// ── deleteSegment — chapter deletion with summary cascade ─────────────────

describe('deleteSegment — chapter deletion with summary cascade', () => {
  it('removes the segment from the book', () => {
    const book = db.saveText({ title: 'Book', content: '', is_manual_book: true })
    const seg = db.appendSegment(book.id!, {
      title: 'Chapter 1', content: 'content here', order: 0,
      sourceType: 'detected_heading', word_count: 2
    })
    expect(db.getSegments(book.id!)).toHaveLength(1)
    db.deleteSegment(seg.id)
    expect(db.getSegments(book.id!)).toHaveLength(0)
    expect(db.getSegment(seg.id)).toBeNull()
  })

  it('automatically deletes a linked summary when the chapter is deleted', () => {
    const book = db.saveText({ title: 'Book', content: '', is_manual_book: true })
    const seg = db.appendSegment(book.id!, {
      title: 'Chapter 1', content: 'content', order: 0,
      sourceType: 'detected_heading', word_count: 1
    })
    db.saveSummary({
      textId: book.id!, segmentId: seg.id,
      textTitle: book.title, chapterTitle: seg.title,
      content: 'A chapter summary.'
    })
    expect(db.getSummaries(book.id!)).toHaveLength(1)
    db.deleteSegment(seg.id)
    expect(db.getSummaries(book.id!)).toHaveLength(0)
  })

  it('automatically deletes summary questions when the chapter is deleted', () => {
    const book = db.saveText({ title: 'Book', content: '', is_manual_book: true })
    const seg = db.appendSegment(book.id!, {
      title: 'Chapter 1', content: 'content', order: 0,
      sourceType: 'detected_heading', word_count: 1
    })
    const summary = db.saveSummary({
      textId: book.id!, segmentId: seg.id,
      textTitle: book.title, chapterTitle: seg.title,
      content: 'Summary.'
    })
    db.saveSummaryQuestion({
      summaryId: summary.id,
      textId: book.id!,
      text: 'What happened?',
      answer: '',
      status: 'unanswered'
    })
    expect(db.getSummaryQuestions(summary.id)).toHaveLength(1)
    db.deleteSegment(seg.id)
    expect(db.getSummaryQuestions(summary.id)).toHaveLength(0)
  })

  it('does not delete summaries belonging to other segments of the same book', () => {
    const book = db.saveText({ title: 'Book', content: '', is_manual_book: true })
    const seg1 = db.appendSegment(book.id!, {
      title: 'Ch 1', content: 'one', order: 0, sourceType: 'detected_heading', word_count: 1
    })
    const seg2 = db.appendSegment(book.id!, {
      title: 'Ch 2', content: 'two', order: 1, sourceType: 'detected_heading', word_count: 1
    })
    db.saveSummary({
      textId: book.id!, segmentId: seg1.id,
      textTitle: book.title, chapterTitle: seg1.title, content: 'Summary for ch1.'
    })
    db.saveSummary({
      textId: book.id!, segmentId: seg2.id,
      textTitle: book.title, chapterTitle: seg2.title, content: 'Summary for ch2.'
    })
    db.deleteSegment(seg1.id)
    const remaining = db.getSummaries(book.id!)
    expect(remaining).toHaveLength(1)
    expect(remaining[0].segmentId).toBe(seg2.id)
  })

  it('works without error when the chapter has no linked summary', () => {
    const book = db.saveText({ title: 'Book', content: '', is_manual_book: true })
    const seg = db.appendSegment(book.id!, {
      title: 'Ch 1', content: 'content', order: 0, sourceType: 'detected_heading', word_count: 1
    })
    expect(() => db.deleteSegment(seg.id)).not.toThrow()
    expect(db.getSegments(book.id!)).toHaveLength(0)
  })
})

// ── deleteSummary — does not delete the associated chapter ─────────────────

describe('deleteSummary — chapter is not affected', () => {
  it('deleting a summary leaves the associated chapter intact', () => {
    const book = db.saveText({ title: 'Book', content: '', is_manual_book: true })
    const seg = db.appendSegment(book.id!, {
      title: 'Chapter 1', content: 'content', order: 0,
      sourceType: 'detected_heading', word_count: 1
    })
    const summary = db.saveSummary({
      textId: book.id!, segmentId: seg.id,
      textTitle: book.title, chapterTitle: seg.title, content: 'A summary.'
    })
    db.deleteSummary(summary.id)
    expect(db.getSummaries(book.id!)).toHaveLength(0)
    expect(db.getSegment(seg.id)).not.toBeNull()
    expect(db.getSegments(book.id!)).toHaveLength(1)
  })
})

// ── getSummaries — finding summaries by segmentId ─────────────────────────

describe('getSummaries — segmentId association for chapter summary display', () => {
  it('returns a summary with the correct segmentId when one exists for a chapter', () => {
    const book = db.saveText({ title: 'Book', content: '', is_manual_book: true })
    const seg = db.appendSegment(book.id!, {
      title: 'Chapter 1', content: 'content', order: 0,
      sourceType: 'detected_heading', word_count: 1
    })
    db.saveSummary({
      textId: book.id!, segmentId: seg.id,
      textTitle: book.title, chapterTitle: seg.title, content: 'Chapter summary text.'
    })
    const summaries = db.getSummaries(book.id!)
    const chapterSummary = summaries.find((s) => s.segmentId === seg.id)
    expect(chapterSummary).toBeDefined()
    expect(chapterSummary!.content).toBe('Chapter summary text.')
  })

  it('returns no summary for a chapter that has never had one (empty state)', () => {
    const book = db.saveText({ title: 'Book', content: '', is_manual_book: true })
    const seg = db.appendSegment(book.id!, {
      title: 'Chapter 1', content: 'content', order: 0,
      sourceType: 'detected_heading', word_count: 1
    })
    const summaries = db.getSummaries(book.id!)
    const chapterSummary = summaries.find((s) => s.segmentId === seg.id)
    expect(chapterSummary).toBeUndefined()
  })

  it('correctly associates summaries to their respective chapters when multiple chapters exist', () => {
    const book = db.saveText({ title: 'Book', content: '', is_manual_book: true })
    const seg1 = db.appendSegment(book.id!, {
      title: 'Ch 1', content: 'one', order: 0, sourceType: 'detected_heading', word_count: 1
    })
    const seg2 = db.appendSegment(book.id!, {
      title: 'Ch 2', content: 'two', order: 1, sourceType: 'detected_heading', word_count: 1
    })
    db.saveSummary({ textId: book.id!, segmentId: seg1.id, textTitle: book.title, content: 'Notes on ch1.' })
    // seg2 has no summary
    const summaries = db.getSummaries(book.id!)
    expect(summaries.find((s) => s.segmentId === seg1.id)?.content).toBe('Notes on ch1.')
    expect(summaries.find((s) => s.segmentId === seg2.id)).toBeUndefined()
  })
})

// ── Reading position — continue-reading precondition ──────────────────────
//
// The DB saves the stop position so Reader can later resume from it.
// These tests verify the underlying state that enables "Continue Reading".

describe('reading position — precondition for continue-reading', () => {
  it('stop position saved mid-text is retrievable as a resume point', () => {
    const text = db.saveText({ title: 'Long Book', content: 'word '.repeat(500).trim() })
    // Simulate Reader saving position when user stops at stack 120 out of 300
    db.saveReadingPosition(text.id!, 120)
    const pos = db.getReadingPosition(text.id!)
    expect(pos).not.toBeNull()
    expect(pos!.stackIndex).toBe(120)
  })

  it('after a reread that auto-stops at the original position, that same position is still valid to resume from', () => {
    const text = db.saveText({ title: 'Reread Book', content: 'word '.repeat(300).trim() })
    // First session stops at 80
    db.saveReadingPosition(text.id!, 80)
    // Reread: reading reruns and stops at 80 again — position updated to same value
    db.saveReadingPosition(text.id!, 80)
    const pos = db.getReadingPosition(text.id!)
    expect(pos!.stackIndex).toBe(80)
  })
})

// ── Chapter summary display lifecycle ─────────────────────────────────────
//
// These tests cover the data-layer behavior that SegmentPanel relies on:
// - a saved chapter summary is immediately visible via getSummaries
// - clicking a different chapter shows its own summary (no cross-contamination)
// - chapters without summaries return nothing (no stale display)
// - saving a summary AFTER initial state load is reflected in subsequent fetches

describe('chapter summary display — saved summary appears when chapter is selected', () => {
  it('a summary saved for a chapter is retrievable by segmentId immediately after save', () => {
    const book = db.saveText({ title: 'Book', content: '', is_manual_book: true })
    const seg = db.appendSegment(book.id!, {
      title: 'Chapter 1', content: 'once upon a time', order: 0,
      sourceType: 'detected_heading', word_count: 4
    })

    db.saveSummary({
      textId: book.id!, segmentId: seg.id,
      textTitle: book.title, chapterTitle: seg.title,
      content: 'The hero is introduced.'
    })

    const summaries = db.getSummaries(book.id!)
    const found = summaries.find((s) => s.segmentId === seg.id)
    expect(found).toBeDefined()
    expect(found!.content).toBe('The hero is introduced.')
  })

  it('a summary saved after an earlier getSummaries call is visible in the next call', () => {
    const book = db.saveText({ title: 'Late Save Book', content: '', is_manual_book: true })
    const seg = db.appendSegment(book.id!, {
      title: 'Chapter 1', content: 'content here', order: 0,
      sourceType: 'detected_heading', word_count: 2
    })

    // Simulate SegmentPanel mounting and loading summaries (none yet)
    const initialSummaries = db.getSummaries(book.id!)
    expect(initialSummaries.find((s) => s.segmentId === seg.id)).toBeUndefined()

    // Summary saved later (e.g. user saves from SummaryPromptModal while on segments view)
    db.saveSummary({
      textId: book.id!, segmentId: seg.id,
      textTitle: book.title, chapterTitle: seg.title,
      content: 'Written after the panel loaded.'
    })

    // Next fetch (triggered by summaryVersion increment) must include the new summary
    const refreshedSummaries = db.getSummaries(book.id!)
    const found = refreshedSummaries.find((s) => s.segmentId === seg.id)
    expect(found).toBeDefined()
    expect(found!.content).toBe('Written after the panel loaded.')
  })
})

describe('chapter summary display — correct summary shown when switching between chapters', () => {
  it('each chapter returns only its own summary, not another chapter\'s', () => {
    const book = db.saveText({ title: 'Two-Chapter Book', content: '', is_manual_book: true })
    const seg1 = db.appendSegment(book.id!, {
      title: 'Ch 1', content: 'alpha beta gamma', order: 0,
      sourceType: 'detected_heading', word_count: 3
    })
    const seg2 = db.appendSegment(book.id!, {
      title: 'Ch 2', content: 'delta epsilon zeta', order: 1,
      sourceType: 'detected_heading', word_count: 3
    })

    db.saveSummary({ textId: book.id!, segmentId: seg1.id, textTitle: book.title, content: 'Notes on chapter one.' })
    db.saveSummary({ textId: book.id!, segmentId: seg2.id, textTitle: book.title, content: 'Notes on chapter two.' })

    const summaries = db.getSummaries(book.id!)

    // Simulates SegmentPanel's find for each chapter when clicked
    const forSeg1 = summaries.find((s) => s.segmentId === seg1.id)
    const forSeg2 = summaries.find((s) => s.segmentId === seg2.id)

    expect(forSeg1?.content).toBe('Notes on chapter one.')
    expect(forSeg2?.content).toBe('Notes on chapter two.')
    expect(forSeg1?.segmentId).not.toBe(forSeg2?.segmentId)
  })

  it('switching from a chapter with a summary to one without shows no summary', () => {
    const book = db.saveText({ title: 'Mixed Book', content: '', is_manual_book: true })
    const seg1 = db.appendSegment(book.id!, {
      title: 'Has Summary', content: 'content', order: 0,
      sourceType: 'detected_heading', word_count: 1
    })
    const seg2 = db.appendSegment(book.id!, {
      title: 'No Summary', content: 'content', order: 1,
      sourceType: 'detected_heading', word_count: 1
    })

    db.saveSummary({ textId: book.id!, segmentId: seg1.id, textTitle: book.title, content: 'Exists.' })

    const summaries = db.getSummaries(book.id!)
    expect(summaries.find((s) => s.segmentId === seg1.id)).toBeDefined()
    // seg2 has no summary — simulates "No summary available." display
    expect(summaries.find((s) => s.segmentId === seg2.id)).toBeUndefined()
  })

  it('three chapters with summaries all independently resolved by segmentId', () => {
    const book = db.saveText({ title: 'Triple Book', content: '', is_manual_book: true })
    const segs = [0, 1, 2].map((i) =>
      db.appendSegment(book.id!, {
        title: `Ch ${i + 1}`, content: `words for chapter ${i + 1}`, order: i,
        sourceType: 'detected_heading', word_count: 4
      })
    )

    segs.forEach((seg, i) =>
      db.saveSummary({ textId: book.id!, segmentId: seg.id, textTitle: book.title, content: `Summary ${i + 1}` })
    )

    const summaries = db.getSummaries(book.id!)
    segs.forEach((seg, i) => {
      const found = summaries.find((s) => s.segmentId === seg.id)
      expect(found?.content).toBe(`Summary ${i + 1}`)
    })
  })
})

describe('chapter summary display — no stale summary for chapters without one', () => {
  it('a chapter that never had a summary returns undefined from segmentId lookup', () => {
    const book = db.saveText({ title: 'Fresh Book', content: '', is_manual_book: true })
    const seg = db.appendSegment(book.id!, {
      title: 'Empty Chapter', content: 'text', order: 0,
      sourceType: 'detected_heading', word_count: 1
    })

    const summaries = db.getSummaries(book.id!)
    expect(summaries.find((s) => s.segmentId === seg.id)).toBeUndefined()
  })

  it('deleting a chapter summary leaves other chapters unaffected', () => {
    const book = db.saveText({ title: 'Delete Test', content: '', is_manual_book: true })
    const seg1 = db.appendSegment(book.id!, {
      title: 'Ch 1', content: 'text', order: 0, sourceType: 'detected_heading', word_count: 1
    })
    const seg2 = db.appendSegment(book.id!, {
      title: 'Ch 2', content: 'text', order: 1, sourceType: 'detected_heading', word_count: 1
    })

    const sum1 = db.saveSummary({ textId: book.id!, segmentId: seg1.id, textTitle: book.title, content: 'Keep me.' })
    db.saveSummary({ textId: book.id!, segmentId: seg2.id, textTitle: book.title, content: 'Delete me.' })

    db.deleteSummary(
      db.getSummaries(book.id!).find((s) => s.segmentId === seg2.id)!.id
    )

    const after = db.getSummaries(book.id!)
    expect(after.find((s) => s.segmentId === seg1.id)?.content).toBe('Keep me.')
    expect(after.find((s) => s.segmentId === seg2.id)).toBeUndefined()
    void sum1 // referenced to satisfy linter
  })

  it('full-text summary (no segmentId) does not appear as a chapter summary', () => {
    const book = db.saveText({ title: 'Hybrid Book', content: '', is_manual_book: true })
    const seg = db.appendSegment(book.id!, {
      title: 'Ch 1', content: 'text', order: 0, sourceType: 'detected_heading', word_count: 1
    })

    // Save a full-text summary (no segmentId)
    db.saveSummary({ textId: book.id!, textTitle: book.title, content: 'Overall book summary.' })

    const summaries = db.getSummaries(book.id!)
    // The full-text summary should not match any chapter's segmentId lookup
    expect(summaries.find((s) => s.segmentId === seg.id)).toBeUndefined()
    // But it IS in the list (for the SummaryView)
    expect(summaries.find((s) => s.segmentId === undefined)).toBeDefined()
  })
})

describe('chapter summary display — existing chapter-selection behavior', () => {
  it('getSummaries returns summaries sorted by creation date', () => {
    const book = db.saveText({ title: 'Sorted Book', content: '', is_manual_book: true })
    const seg1 = db.appendSegment(book.id!, {
      title: 'Ch 1', content: 'a', order: 0, sourceType: 'detected_heading', word_count: 1
    })
    const seg2 = db.appendSegment(book.id!, {
      title: 'Ch 2', content: 'b', order: 1, sourceType: 'detected_heading', word_count: 1
    })

    db.saveSummary({ textId: book.id!, segmentId: seg1.id, textTitle: book.title, content: 'First saved.' })
    db.saveSummary({ textId: book.id!, segmentId: seg2.id, textTitle: book.title, content: 'Second saved.' })

    const summaries = db.getSummaries(book.id!)
    expect(summaries[0].content).toBe('First saved.')
    expect(summaries[1].content).toBe('Second saved.')
  })

  it('getSummaries for book returns only that book\'s chapter summaries', () => {
    const bookA = db.saveText({ title: 'Book A', content: '', is_manual_book: true })
    const bookB = db.saveText({ title: 'Book B', content: '', is_manual_book: true })
    const segA = db.appendSegment(bookA.id!, {
      title: 'Ch A', content: 'a', order: 0, sourceType: 'detected_heading', word_count: 1
    })
    const segB = db.appendSegment(bookB.id!, {
      title: 'Ch B', content: 'b', order: 0, sourceType: 'detected_heading', word_count: 1
    })

    db.saveSummary({ textId: bookA.id!, segmentId: segA.id, textTitle: bookA.title, content: 'A summary.' })
    db.saveSummary({ textId: bookB.id!, segmentId: segB.id, textTitle: bookB.title, content: 'B summary.' })

    const summariesA = db.getSummaries(bookA.id!)
    const summariesB = db.getSummaries(bookB.id!)

    expect(summariesA).toHaveLength(1)
    expect(summariesA[0].segmentId).toBe(segA.id)
    expect(summariesB).toHaveLength(1)
    expect(summariesB[0].segmentId).toBe(segB.id)
  })

  it('adding a chapter after a summary was saved does not corrupt existing summaries', () => {
    const book = db.saveText({ title: 'Growing Book', content: '', is_manual_book: true })
    const seg1 = db.appendSegment(book.id!, {
      title: 'Ch 1', content: 'first', order: 0, sourceType: 'detected_heading', word_count: 1
    })

    db.saveSummary({ textId: book.id!, segmentId: seg1.id, textTitle: book.title, content: 'Ch1 notes.' })

    // Simulate user adding another chapter later (AddChapterPanel flow)
    const seg2 = db.appendSegment(book.id!, {
      title: 'Ch 2', content: 'second', order: 1, sourceType: 'detected_heading', word_count: 1
    })
    db.saveSummary({ textId: book.id!, segmentId: seg2.id, textTitle: book.title, content: 'Ch2 notes.' })

    const summaries = db.getSummaries(book.id!)
    expect(summaries.find((s) => s.segmentId === seg1.id)?.content).toBe('Ch1 notes.')
    expect(summaries.find((s) => s.segmentId === seg2.id)?.content).toBe('Ch2 notes.')
  })
})

// ── Build Your Book removal verification ──────────────────────────────────

describe('build-book removal', () => {
  it('is_manual_book flag is stored and retrievable (data model intact)', () => {
    const book = db.saveText({ title: 'Manual Book', content: '', is_manual_book: true })
    const loaded = db.getText(book.id!)
    expect(loaded!.is_manual_book).toBe(true)
  })

  it('non-manual texts have is_manual_book false or undefined', () => {
    const text = db.saveText({ title: 'Imported Text', content: 'some content' })
    const loaded = db.getText(text.id!)
    expect(loaded!.is_manual_book).toBeFalsy()
  })
})

// ── Tap to Read settings ──────────────────────────────────────────────────

describe('tap to read — default values', () => {
  it('tap_to_read defaults to false', () => {
    const settings = db.getSettings()
    expect(settings.tap_to_read).toBe(false)
  })

  it('tap_to_read_key defaults to Space', () => {
    const settings = db.getSettings()
    expect(settings.tap_to_read_key).toBe('Space')
  })
})

describe('tap to read — persistence', () => {
  it('saves tap_to_read=true and retrieves it', () => {
    db.saveSettings({ tap_to_read: true })
    const settings = db.getSettings()
    expect(settings.tap_to_read).toBe(true)
  })

  it('saves tap_to_read=false and retrieves it', () => {
    db.saveSettings({ tap_to_read: true })
    db.saveSettings({ tap_to_read: false })
    expect(db.getSettings().tap_to_read).toBe(false)
  })

  it('saves a custom advance key and retrieves it', () => {
    db.saveSettings({ tap_to_read_key: 'KeyJ' })
    expect(db.getSettings().tap_to_read_key).toBe('KeyJ')
  })

  it('persists tap_to_read across database instances', () => {
    db.saveSettings({ tap_to_read: true, tap_to_read_key: 'KeyN' })
    const db2 = new Database(storePath)
    const s = db2.getSettings()
    expect(s.tap_to_read).toBe(true)
    expect(s.tap_to_read_key).toBe('KeyN')
  })

  it('other settings are unaffected when only tap_to_read is changed', () => {
    const before = db.getSettings()
    db.saveSettings({ tap_to_read: true })
    const after = db.getSettings()
    expect(after.bpm).toBe(before.bpm)
    expect(after.words_per_stack).toBe(before.words_per_stack)
    expect(after.tap_to_read_key).toBe(before.tap_to_read_key)
  })

  it('pre-existing JSON without tap_to_read gets defaults on load', () => {
    // Trigger a write so the file exists on disk first
    db.saveSettings({})
    // Simulate a database file written before tap_to_read was added (no tap fields)
    const { readFileSync, writeFileSync } = require('fs')
    const raw = JSON.parse(readFileSync(storePath, 'utf-8'))
    const strippedSettings = { ...raw.settings }
    delete strippedSettings.tap_to_read
    delete strippedSettings.tap_to_read_key
    writeFileSync(storePath, JSON.stringify({ ...raw, settings: strippedSettings }, null, 2), 'utf-8')

    const db2 = new Database(storePath)
    expect(db2.getSettings().tap_to_read).toBe(false)
    expect(db2.getSettings().tap_to_read_key).toBe('Space')
  })
})

// ── Lock at WPM settings ──────────────────────────────────────────────────

describe('read while working settings', () => {
  it('loads default values for new stores', () => {
    const settings = db.getSettings()
    expect(settings.read_while_working_enabled).toBe(false)
    expect(settings.read_while_working_shortcut).toBe('Control+Space')
    expect(settings.read_while_working_exit_shortcut).toBe('Control+Space')
    expect(settings.read_while_working_window_width).toBe(640)
    expect(settings.read_while_working_window_height).toBe(360)
    expect(settings.read_while_working_restore_clipboard).toBe(true)
  })

  it('persists read while working settings across database instances', () => {
    db.saveSettings({
      read_while_working_enabled: true,
      read_while_working_shortcut: 'Control+Alt+R',
      read_while_working_exit_shortcut: 'Control+Alt+Q',
      read_while_working_window_width: 720,
      read_while_working_window_height: 420,
      read_while_working_restore_clipboard: false
    })

    const db2 = new Database(storePath)
    const settings = db2.getSettings()
    expect(settings.read_while_working_enabled).toBe(true)
    expect(settings.read_while_working_shortcut).toBe('Control+Alt+R')
    expect(settings.read_while_working_exit_shortcut).toBe('Control+Alt+Q')
    expect(settings.read_while_working_window_width).toBe(720)
    expect(settings.read_while_working_window_height).toBe(420)
    expect(settings.read_while_working_restore_clipboard).toBe(false)
  })

  it('pre-existing JSON without read while working settings gets defaults on load', () => {
    db.saveSettings({})
    const { readFileSync, writeFileSync } = require('fs')
    const raw = JSON.parse(readFileSync(storePath, 'utf-8'))
    const strippedSettings = { ...raw.settings }
    delete strippedSettings.read_while_working_enabled
    delete strippedSettings.read_while_working_shortcut
    delete strippedSettings.read_while_working_exit_shortcut
    delete strippedSettings.read_while_working_window_width
    delete strippedSettings.read_while_working_window_height
    delete strippedSettings.read_while_working_restore_clipboard
    writeFileSync(storePath, JSON.stringify({ ...raw, settings: strippedSettings }, null, 2), 'utf-8')

    const db2 = new Database(storePath)
    const settings = db2.getSettings()
    expect(settings.read_while_working_enabled).toBe(false)
    expect(settings.read_while_working_shortcut).toBe('Control+Space')
    expect(settings.read_while_working_exit_shortcut).toBe('Control+Space')
    expect(settings.read_while_working_window_width).toBe(640)
    expect(settings.read_while_working_window_height).toBe(360)
    expect(settings.read_while_working_restore_clipboard).toBe(true)
  })
})

// ── Mode-scoped settings store migration (ADR-0008) ───────────────────────

describe('settings store — legacy flat migration (ADR-0008)', () => {
  function writeLegacyStore(settings: Record<string, unknown>): void {
    writeFileSync(
      storePath,
      JSON.stringify(
        {
          nextId: 1,
          nextSegmentId: 1,
          nextSummaryId: 1,
          nextSummaryQuestionId: 1,
          texts: [],
          segments: [],
          summaries: [],
          summaryQuestions: [],
          readingPositions: [],
          settings
        },
        null,
        2
      ),
      'utf-8'
    )
  }

  it('loads a legacy flat settings object without loss', () => {
    writeLegacyStore({
      bpm: 123,
      font_size: 50,
      lock_at_wpm: true,
      target_wpm: 333,
      read_while_working_enabled: true,
      read_while_working_shortcut: 'Control+Alt+R',
      rww_bpm: 400
    })

    const db2 = new Database(storePath)
    const settings = db2.getSettings()
    expect(settings.bpm).toBe(123)
    expect(settings.font_size).toBe(50)
    expect(settings.lock_at_wpm).toBe(true)
    expect(settings.target_wpm).toBe(333)
    expect(settings.read_while_working_enabled).toBe(true)
    expect(settings.read_while_working_shortcut).toBe('Control+Alt+R')
    expect(settings.rww_bpm).toBe(400)
  })

  it('migrates flat fields into the correct store scopes', () => {
    writeLegacyStore({ bpm: 88, read_while_working_enabled: true, rww_words_per_stack: 6 })
    const db2 = new Database(storePath)
    const store = db2.getSettingsStore()
    expect(store.reader.bpm).toBe(88)
    expect(store.global.read_while_working_enabled).toBe(true)
    expect(store.rww.words_per_stack).toBe(6)
  })

  it('persists the store nested on disk after a save', () => {
    writeLegacyStore({ bpm: 70 })
    const db2 = new Database(storePath)
    db2.saveSettings({ font_size: 44 })

    const raw = JSON.parse(readFileSync(storePath, 'utf-8'))
    expect(raw.settings.reader).toBeDefined()
    expect(raw.settings.global).toBeDefined()
    expect(raw.settings.rww).toBeDefined()
    expect(raw.settings.reader.font_size).toBe(44)
    expect(raw.settings.reader.bpm).toBe(70)
  })

  it('routes a saved rww_* patch into the rww override scope and back to flat', () => {
    const db2 = new Database(storePath)
    db2.saveSettings({ rww_bpm: 410 })
    const store = db2.getSettingsStore()
    expect(store.rww.bpm).toBe(410)
    expect(db2.getSettings().rww_bpm).toBe(410)
    // reader bpm is untouched by the override
    expect(store.reader.bpm).toBe(db2.getSettings().bpm)
  })
})

describe('lock at WPM — default values', () => {
  it('lock_at_wpm defaults to false', () => {
    expect(db.getSettings().lock_at_wpm).toBe(false)
  })

  it('target_wpm defaults to 200', () => {
    expect(db.getSettings().target_wpm).toBe(200)
  })
})

describe('lock at WPM — persistence', () => {
  it('saves lock_at_wpm=true and retrieves it', () => {
    db.saveSettings({ lock_at_wpm: true })
    expect(db.getSettings().lock_at_wpm).toBe(true)
  })

  it('saves a custom target_wpm and retrieves it', () => {
    db.saveSettings({ target_wpm: 350 })
    expect(db.getSettings().target_wpm).toBe(350)
  })

  it('persists lock_at_wpm and target_wpm across database instances', () => {
    db.saveSettings({ lock_at_wpm: true, target_wpm: 450 })
    const db2 = new Database(storePath)
    expect(db2.getSettings().lock_at_wpm).toBe(true)
    expect(db2.getSettings().target_wpm).toBe(450)
  })

  it('other settings are unaffected when only lock_at_wpm is changed', () => {
    const before = db.getSettings()
    db.saveSettings({ lock_at_wpm: true })
    const after = db.getSettings()
    expect(after.bpm).toBe(before.bpm)
    expect(after.words_per_stack).toBe(before.words_per_stack)
  })

  it('pre-existing JSON without lock_at_wpm gets defaults on load (backward compat)', () => {
    db.saveSettings({})
    const { readFileSync, writeFileSync } = require('fs')
    const raw = JSON.parse(readFileSync(storePath, 'utf-8'))
    const strippedSettings = { ...raw.settings }
    delete strippedSettings.lock_at_wpm
    delete strippedSettings.target_wpm
    writeFileSync(storePath, JSON.stringify({ ...raw, settings: strippedSettings }, null, 2), 'utf-8')

    const db2 = new Database(storePath)
    expect(db2.getSettings().lock_at_wpm).toBe(false)
    expect(db2.getSettings().target_wpm).toBe(200)
  })
})

describe('book resume target - segmented Library text position', () => {
  function writeStore(data: object): void {
    writeFileSync(storePath, JSON.stringify(data, null, 2), 'utf-8')
  }

  function baseStore(book: ReturnType<Database['saveText']>, overrides: object = {}): object {
    return {
      nextId: (book.id ?? 1) + 1,
      nextCategoryId: 4,
      nextSegmentId: 20,
      nextSummaryId: 1,
      nextSummaryQuestionId: 1,
      texts: [book],
      categories: [],
      segments: [],
      summaries: [],
      summaryQuestions: [],
      readingPositions: [],
      settings: {},
      ...overrides
    }
  }

  it('selects the most-recent segment reading position by updatedAt', () => {
    const book = db.saveText({ title: 'Chaptered Book', content: 'one two three four five six' })
    writeStore(baseStore(book, {
      segments: [
        {
          id: 10,
          textId: book.id,
          title: 'Chapter One',
          content: 'one two',
          order: 0,
          sourceType: 'detected_heading',
          word_count: 2
        },
        {
          id: 11,
          textId: book.id,
          title: 'Chapter Two',
          content: 'three four',
          order: 1,
          sourceType: 'detected_heading',
          word_count: 2
        },
        {
          id: 12,
          textId: book.id,
          title: 'Chapter Three',
          content: 'five six',
          order: 2,
          sourceType: 'detected_heading',
          word_count: 2
        }
      ],
      readingPositions: [
        {
          textId: 10,
          stackIndex: 4,
          updatedAt: '2026-07-13T09:00:00.000Z',
          source: 'segment'
        },
        {
          textId: 11,
          stackIndex: 8,
          updatedAt: '2026-07-13T10:00:00.000Z',
          source: 'segment'
        },
        {
          textId: 12,
          stackIndex: 12,
          updatedAt: '2026-07-13T11:00:00.000Z',
          source: 'text'
        }
      ]
    }))

    expect(new Database(storePath).getBookResumeTarget(book.id!)).toEqual({
      segmentId: 11,
      stackIndex: 8,
      resume: true
    })
  })

  it('falls back to the first segment at index 0 for a never-read segmented book', () => {
    const book = db.saveText({ title: 'Fresh Book', content: 'one two three four' })
    writeStore(baseStore(book, {
      segments: [
        {
          id: 15,
          textId: book.id,
          title: 'Chapter Two',
          content: 'three four',
          order: 1,
          sourceType: 'detected_heading',
          word_count: 2
        },
        {
          id: 14,
          textId: book.id,
          title: 'Chapter One',
          content: 'one two',
          order: 0,
          sourceType: 'detected_heading',
          word_count: 2
        }
      ]
    }))

    expect(new Database(storePath).getBookResumeTarget(book.id!)).toEqual({
      segmentId: 14,
      stackIndex: 0,
      resume: false
    })
  })

  it('handles a single-chapter segmented book', () => {
    const book = db.saveText({ title: 'Single Chapter', content: 'one two three' })
    writeStore(baseStore(book, {
      segments: [
        {
          id: 18,
          textId: book.id,
          title: 'Only Chapter',
          content: 'one two three',
          order: 0,
          sourceType: 'detected_heading',
          word_count: 3
        }
      ],
      readingPositions: [
        {
          textId: 18,
          stackIndex: 3,
          updatedAt: '2026-07-13T10:00:00.000Z',
          source: 'segment'
        }
      ]
    }))

    expect(new Database(storePath).getBookResumeTarget(book.id!)).toEqual({
      segmentId: 18,
      stackIndex: 3,
      resume: true
    })
  })

  it('returns null when the book has no stored segments', () => {
    const book = db.saveText({ title: 'Unsegmented Book', content: 'one two three' })
    writeStore(baseStore(book))

    expect(new Database(storePath).getBookResumeTarget(book.id!)).toBeNull()
  })

  it('keeps getLatestResumeCandidate excluding segment positions for the hub Read tile', () => {
    const book = db.saveText({ title: 'Parent Book', content: 'one two three four' })
    writeStore(baseStore(book, {
      segments: [
        {
          id: 16,
          textId: book.id,
          title: 'Chapter One',
          content: 'one two',
          order: 0,
          sourceType: 'detected_heading',
          word_count: 2
        }
      ],
      readingPositions: [
        {
          textId: book.id,
          stackIndex: 2,
          updatedAt: '2026-07-13T09:00:00.000Z',
          source: 'text'
        },
        {
          textId: 16,
          stackIndex: 6,
          updatedAt: '2026-07-13T10:00:00.000Z',
          source: 'segment'
        }
      ]
    }))

    const reopened = new Database(storePath)
    expect(reopened.getBookResumeTarget(book.id!)).toEqual({
      segmentId: 16,
      stackIndex: 6,
      resume: true
    })
    expect(reopened.getLatestResumeCandidate()).toEqual({
      textId: book.id,
      title: 'Parent Book',
      stackIndex: 2,
      updatedAt: '2026-07-13T09:00:00.000Z'
    })
  })
})
