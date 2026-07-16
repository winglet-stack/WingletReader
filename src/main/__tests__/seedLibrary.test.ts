import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { Database, UNCATEGORIZED_CATEGORY_ID } from '../database'
import { seedLibraryFromBundle, loadLibraryBundle, SEED_RESOURCE_FILENAME } from '../seedLibrary'
import type { LibraryBundle } from '../../shared/libraryBundle'

// ── Helpers ────────────────────────────────────────────────────────────────

let db: Database
let tmpDir: string
let storePath: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'fasttrack-seed-test-'))
  storePath = join(tmpDir, 'test-data.json')
  db = new Database(storePath)
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

function sampleBundle(overrides: Partial<LibraryBundle> = {}): LibraryBundle {
  return {
    schemaVersion: 1,
    bundleVersion: 1,
    categories: [{ name: 'Fiction' }],
    books: [
      {
        seedId: 'the-lighthouse-keeper',
        title: 'The Lighthouse Keeper',
        content: 'The lamp had not been lit.\n\nA green flare cut the fog.',
        categoryRef: 'Fiction',
        segments: [
          {
            title: 'The Wreck',
            order: 0,
            content: 'The lamp had not been lit.',
            word_count: 6,
            startWordOffset: 0,
            endWordOffset: 6
          },
          {
            title: 'The Signal',
            order: 1,
            content: 'A green flare cut the fog.',
            word_count: 6,
            startWordOffset: 6,
            endWordOffset: 12
          }
        ]
      }
    ],
    ...overrides
  }
}

// ── Tracer bullet: first-launch seeding ─────────────────────────────────────

describe('seedLibraryFromBundle — first launch', () => {
  it('inserts each book with its category, segments, and seed_id', () => {
    const result = seedLibraryFromBundle(db, sampleBundle())

    expect(result.seeded).toEqual(['the-lighthouse-keeper'])

    const texts = db.getTexts()
    expect(texts).toHaveLength(1)
    const text = db.getText(texts[0].id!)!
    expect(text.title).toBe('The Lighthouse Keeper')
    expect(text.seed_id).toBe('the-lighthouse-keeper')
    expect(text.is_manual_book).toBeFalsy()

    // Category created by name (not Uncategorized).
    const fiction = db.getCategories().find((c) => c.name === 'Fiction')
    expect(fiction).toBeDefined()
    expect(text.category_id).toBe(fiction!.id)
    expect(text.category_id).not.toBe(UNCATEGORIZED_CATEGORY_ID)

    // Segments inserted verbatim, stamped detected_heading, offsets preserved.
    const segments = db.getSegments(text.id!)
    expect(segments).toHaveLength(2)
    expect(segments.map((s) => s.title)).toEqual(['The Wreck', 'The Signal'])
    expect(segments.every((s) => s.sourceType === 'detected_heading')).toBe(true)
    expect(segments[0].startWordOffset).toBe(0)
    expect(segments[1].endWordOffset).toBe(12)
  })
})

// ── Idempotency: re-seeding the same version ─────────────────────────────────

describe('seedLibraryFromBundle — idempotency', () => {
  it('re-running the same bundle version is a no-op (version early-out)', () => {
    seedLibraryFromBundle(db, sampleBundle())
    const second = seedLibraryFromBundle(db, sampleBundle())

    expect(second.ranScan).toBe(false)
    expect(second.seeded).toEqual([])
    expect(db.getTexts()).toHaveLength(1)
  })

  it('survives a store reload between launches (ledger persists)', () => {
    seedLibraryFromBundle(db, sampleBundle())

    const reopened = new Database(storePath)
    const result = seedLibraryFromBundle(reopened, sampleBundle())

    expect(result.ranScan).toBe(false)
    expect(reopened.getTexts()).toHaveLength(1)
  })
})

// ── Version bump: only new seedIds ───────────────────────────────────────────

describe('seedLibraryFromBundle — version bump', () => {
  it('seeds only seedIds new to the ledger; skips already-seeded ones', () => {
    seedLibraryFromBundle(db, sampleBundle())

    const v2 = sampleBundle({
      bundleVersion: 2,
      books: [
        ...sampleBundle().books,
        {
          seedId: 'on-reading-fast',
          title: 'On Reading Fast',
          content: 'Most people read at the pace they learned to speak.',
          categoryRef: null,
          segments: [
            {
              title: 'Introduction',
              order: 0,
              content: 'Most people read at the pace they learned to speak.',
              word_count: 9,
              startWordOffset: 0,
              endWordOffset: 9
            }
          ]
        }
      ]
    })

    const result = seedLibraryFromBundle(db, v2)

    expect(result.seeded).toEqual(['on-reading-fast'])
    expect(result.skipped).toEqual(['the-lighthouse-keeper'])
    expect(db.getTexts()).toHaveLength(2)
    expect(db.getSeededBundleVersion()).toBe(2)
  })

  it('does not update an already-seeded book in place (insert-only)', () => {
    seedLibraryFromBundle(db, sampleBundle())
    const original = db.getTexts()[0]

    // Same seedId, different title/content — must be ignored, not applied.
    const corrected = sampleBundle({
      bundleVersion: 2,
      books: [{ ...sampleBundle().books[0], title: 'CORRECTED TITLE' }]
    })
    seedLibraryFromBundle(db, corrected)

    const after = db.getText(original.id!)!
    expect(after.title).toBe('The Lighthouse Keeper')
    expect(db.getTexts()).toHaveLength(1)
  })
})

// ── Respecting user deletions ────────────────────────────────────────────────

describe('seedLibraryFromBundle — user deletions', () => {
  it('does not resurrect a user-deleted seeded book on a version bump', () => {
    seedLibraryFromBundle(db, sampleBundle())
    const seededText = db.getTexts()[0]
    db.deleteText(seededText.id!)
    expect(db.getTexts()).toHaveLength(0)

    // A later bundle that still contains the deleted book must leave it gone.
    const result = seedLibraryFromBundle(db, sampleBundle({ bundleVersion: 2 }))

    expect(result.seeded).toEqual([])
    expect(result.skipped).toEqual(['the-lighthouse-keeper'])
    expect(db.getTexts()).toHaveLength(0)
  })
})

// ── Category resolution by name ──────────────────────────────────────────────

describe('seedLibraryFromBundle — categories', () => {
  it('places a null categoryRef in Uncategorized', () => {
    seedLibraryFromBundle(
      db,
      sampleBundle({
        categories: [],
        books: [{ ...sampleBundle().books[0], categoryRef: null }]
      })
    )

    const text = db.getText(db.getTexts()[0].id!)!
    expect(text.category_id).toBe(UNCATEGORIZED_CATEGORY_ID)
  })

  it('merges by name — two books in one category share its id, no duplicate', () => {
    seedLibraryFromBundle(
      db,
      sampleBundle({
        books: [
          { ...sampleBundle().books[0], seedId: 'a', categoryRef: 'Fiction' },
          { ...sampleBundle().books[0], seedId: 'b', categoryRef: 'Fiction' }
        ]
      })
    )

    const fictionCategories = db.getCategories().filter((c) => c.name === 'Fiction')
    expect(fictionCategories).toHaveLength(1)
    const ids = db.getTexts().map((t) => db.getText(t.id!)!.category_id)
    expect(new Set(ids)).toEqual(new Set([fictionCategories[0].id]))
  })

  it('reuses a built-in category by name rather than duplicating it', () => {
    seedLibraryFromBundle(
      db,
      sampleBundle({
        categories: [{ name: 'Reading' }],
        books: [{ ...sampleBundle().books[0], categoryRef: 'Reading' }]
      })
    )

    const reading = db.getCategories().filter((c) => c.name === 'Reading')
    expect(reading).toHaveLength(1)
    expect(reading[0].is_system).toBe(true)
    expect(db.getText(db.getTexts()[0].id!)!.category_id).toBe(reading[0].id)
  })
})

// ── Schema gate ──────────────────────────────────────────────────────────────

describe('seedLibraryFromBundle — schema gate', () => {
  it('treats an unrecognized schemaVersion as a no-op', () => {
    const result = seedLibraryFromBundle(db, sampleBundle({ schemaVersion: 999 }))

    expect(result.ranScan).toBe(false)
    expect(db.getTexts()).toHaveLength(0)
    expect(db.getSeededBundleVersion()).toBe(0)
  })
})

// ── User content is never clobbered ──────────────────────────────────────────

describe('seedLibraryFromBundle — additive only', () => {
  it('leaves pre-existing user texts and settings untouched', () => {
    const userText = db.saveText({ title: 'My Notes', content: 'hello world' })
    db.saveSettings({ highlighting_mode: 'progressive' })

    seedLibraryFromBundle(db, sampleBundle())

    expect(db.getText(userText.id!)!.title).toBe('My Notes')
    expect(db.getSettings().highlighting_mode).toBe('progressive')
    expect(db.getTexts()).toHaveLength(2)
  })
})

// ── File loader ──────────────────────────────────────────────────────────────

describe('loadLibraryBundle', () => {
  it('returns null when the resource file is absent', () => {
    expect(loadLibraryBundle(tmpDir)).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    writeFileSync(join(tmpDir, SEED_RESOURCE_FILENAME), '{ not json', 'utf-8')
    expect(loadLibraryBundle(tmpDir)).toBeNull()
  })

  it('returns null for JSON that is not a bundle', () => {
    writeFileSync(join(tmpDir, SEED_RESOURCE_FILENAME), JSON.stringify({ foo: 1 }), 'utf-8')
    expect(loadLibraryBundle(tmpDir)).toBeNull()
  })

  it('parses a well-formed bundle file', () => {
    writeFileSync(join(tmpDir, SEED_RESOURCE_FILENAME), JSON.stringify(sampleBundle()), 'utf-8')
    const bundle = loadLibraryBundle(tmpDir)
    expect(bundle?.bundleVersion).toBe(1)
    expect(bundle?.books[0].seedId).toBe('the-lighthouse-keeper')
  })
})
