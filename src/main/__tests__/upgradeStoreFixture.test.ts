/**
 * Upgrade-path guarantee (release-0.2.1-alpha-1 D13, fixture half).
 *
 * Testers on `0.2.0-alpha.1` auto-update into this build and open a store
 * written before the `stats` collection (ADR-0035), before `source_type: 'epub'`
 * / `author` on texts (ADR-0034), and before the ADR-0032 line-box migration.
 * `normalizeLoadedStore` is *designed* to absorb that additively; this file is
 * the standing proof that it does.
 *
 * The fixture `fixtures/store-0.2.0-alpha.1.json` is a synthesized store in the
 * exact shape `v0.2.0-alpha.1` wrote (see its `_provenance` header). Every
 * assertion here is about the *survival of the old data* through the real load
 * path (`new Database(path)`), a write, and a reload — never equality against
 * today's full `StoreData`, so the test keeps holding as the shape evolves.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { Database, UNCATEGORIZED_CATEGORY_ID } from '../database'
import { flattenSettingsStore, settingsStoreFromFlat } from '../../shared/settings'
import type { Bookmark, ReadingPosition, TextRecord, TextSegment } from '../../shared/domainRecords'

const FIXTURE_PATH = join(__dirname, 'fixtures', 'store-0.2.0-alpha.1.json')

interface LegacyFixture {
  _provenance: string[]
  nextId: number
  nextCategoryId: number
  nextSegmentId: number
  nextBookmarkId: number
  nextSummaryId: number
  nextSummaryQuestionId: number
  texts: TextRecord[]
  categories: Array<{ id: number; name: string; is_system?: boolean; is_locked?: boolean }>
  segments: TextSegment[]
  bookmarks: Bookmark[]
  summaries: unknown[]
  summaryQuestions: unknown[]
  readingPositions: ReadingPosition[]
  settings: { global: Record<string, unknown>; reader: Record<string, unknown>; rww: Record<string, unknown> }
  seededIds: string[]
  seededBundleVersion: number
}

/** The fixture minus the one key 0.2.0 never wrote — exactly what sat on a tester's disk. */
function loadLegacyStore(): Omit<LegacyFixture, '_provenance'> {
  const { _provenance, ...store } = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8')) as LegacyFixture
  expect(_provenance.length).toBeGreaterThan(0)
  return store
}

let tmpDir: string
let storePath: string
let legacy: Omit<LegacyFixture, '_provenance'>
let logger: { warn: ReturnType<typeof vi.fn> }

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'fasttrack-upgrade-'))
  storePath = join(tmpDir, 'fasttrack-data.json')
  legacy = loadLegacyStore()
  writeFileSync(storePath, JSON.stringify(legacy, null, 2), 'utf-8')
  logger = { warn: vi.fn() }
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

function openLegacy(): Database {
  return new Database(storePath, { logger })
}

function persisted(): Record<string, unknown> {
  return JSON.parse(readFileSync(storePath, 'utf-8')) as Record<string, unknown>
}

function byId<T extends { id: number }>(records: T[]): T[] {
  return [...records].sort((a, b) => a.id - b.id)
}

describe('fixture shape guard', () => {
  it('is a 0.2.0-alpha.1 store: no stats, no epub source_type, no author, pre-ADR-0032 settings', () => {
    expect(legacy).not.toHaveProperty('stats')
    for (const text of legacy.texts) {
      expect(text).not.toHaveProperty('source_type')
      expect(text).not.toHaveProperty('author')
    }
    expect(legacy.settings.reader).toHaveProperty('lines_enabled')
    expect(legacy.settings.rww).toHaveProperty('lines_enabled')
    expect(legacy.settings.reader).not.toHaveProperty('lines_anchor')
    expect(legacy.settings.global).not.toHaveProperty('daily_word_quota')
    expect(legacy.settings.global).not.toHaveProperty('weekly_quota_days')
    expect(Object.keys(legacy)).toEqual([
      'nextId',
      'nextCategoryId',
      'nextSegmentId',
      'nextBookmarkId',
      'nextSummaryId',
      'nextSummaryQuestionId',
      'texts',
      'categories',
      'segments',
      'bookmarks',
      'summaries',
      'summaryQuestions',
      'readingPositions',
      'settings',
      'seededIds',
      'seededBundleVersion'
    ])
  })

  it('carries real content: several texts, segments, both bookmark kinds, positions, a user category', () => {
    expect(legacy.texts.length).toBeGreaterThanOrEqual(3)
    expect(new Set(legacy.segments.map((segment) => segment.textId)).size).toBeGreaterThanOrEqual(1)
    expect(legacy.bookmarks.some((bookmark) => bookmark.kind === 'normal')).toBe(true)
    expect(legacy.bookmarks.some((bookmark) => bookmark.kind === 'goal')).toBe(true)
    expect(legacy.readingPositions.length).toBeGreaterThanOrEqual(1)
    expect(legacy.categories.some((category) => category.id > 3)).toBe(true)
    // Every text's word_count follows the 0.2.0 saveText rule, so bookmark
    // clamping below is exercised against honest numbers.
    for (const text of legacy.texts) {
      const counted = (text.content ?? '').trim().split(/\s+/).filter((w) => w.length > 0).length
      expect(text.word_count).toBe(counted)
    }
  })
})

describe('0.2.0-alpha.1 store loads intact', () => {
  it('opens without recovery, warnings, or a corrupt backup', () => {
    const db = openLegacy()
    expect(db.getTexts()).toHaveLength(legacy.texts.length)
    expect(logger.warn).not.toHaveBeenCalled()
    expect(readdirSync(tmpDir).filter((name) => name.includes('.corrupt-'))).toEqual([])
  })

  it('keeps every text with its id, content, and optional fields byte-for-byte', () => {
    const db = openLegacy()
    for (const expected of legacy.texts) {
      expect(db.getText(expected.id!)).toEqual(expected)
    }
    const listed = byId(db.getTexts() as Array<TextRecord & { id: number }>)
    expect(listed.map((text) => [text.id, text.title, text.word_count, text.category_id])).toEqual(
      byId(legacy.texts as Array<TextRecord & { id: number }>).map((text) => [
        text.id,
        text.title,
        text.word_count,
        text.category_id
      ])
    )
    // The legacy curated book keeps its live seed_id behavior; nothing gained
    // an EPUB source_type or an author on the way in.
    const curated = listed.find((text) => text.seed_id === 'sample-curated-book')
    expect(curated).toBeDefined()
    expect(db.hasSeedId('sample-curated-book')).toBe(true)
    for (const text of listed) {
      expect(text.source_type).toBeUndefined()
      expect(db.getText(text.id)?.author).toBeUndefined()
    }
  })

  it('keeps every segment (with and without word offsets) under its text, in order', () => {
    const db = openLegacy()
    const textIds = [...new Set(legacy.segments.map((segment) => segment.textId))]
    for (const textId of textIds) {
      const expected = legacy.segments
        .filter((segment) => segment.textId === textId)
        .sort((a, b) => a.order - b.order)
      expect(db.getSegments(textId)).toEqual(expected)
    }
    for (const segment of legacy.segments) {
      expect(db.getSegment(segment.id)).toEqual(segment)
    }
    // The projection's segment_count agrees with the surviving rows.
    for (const text of db.getTexts()) {
      const count = legacy.segments.filter((segment) => segment.textId === text.id).length
      expect(text.segment_count).toBe(count > 0 ? count : undefined)
    }
  })

  it('keeps every bookmark of both kinds with id, offset, label, and timestamp', () => {
    const db = openLegacy()
    const textIds = [...new Set(legacy.bookmarks.map((bookmark) => bookmark.textId))]
    for (const textId of textIds) {
      const expected = legacy.bookmarks
        .filter((bookmark) => bookmark.textId === textId)
        .sort((a, b) => a.wordOffset - b.wordOffset || a.id - b.id)
      expect(db.getBookmarks(textId)).toEqual(expected)
    }
    const kinds = legacy.bookmarks.map((bookmark) => bookmark.kind)
    expect(kinds).toContain('normal')
    expect(kinds).toContain('goal')
  })

  it('keeps every reading position and still resolves resume targets from them', () => {
    const db = openLegacy()
    for (const position of legacy.readingPositions.filter((p) => p.source !== 'segment')) {
      expect(db.getReadingPosition(position.textId)).toEqual(position)
    }
    const latestText = [...legacy.readingPositions]
      .filter((p) => p.source !== 'segment' && p.stackIndex > 0)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
    expect(db.getLatestResumeCandidate()).toEqual({
      textId: latestText.textId,
      title: legacy.texts.find((text) => text.id === latestText.textId)!.title,
      stackIndex: latestText.stackIndex,
      updatedAt: latestText.updatedAt
    })
    const segmentPosition = legacy.readingPositions.find((p) => p.source === 'segment')!
    const bookTextId = legacy.segments.find((segment) => segment.id === segmentPosition.textId)!.textId
    expect(db.getBookResumeTarget(bookTextId)).toEqual({
      segmentId: segmentPosition.textId,
      stackIndex: segmentPosition.stackIndex,
      resume: true
    })
  })

  it('keeps the built-in and user-created categories and every text assignment', () => {
    const db = openLegacy()
    const categories = db.getCategories()
    expect(categories.map((category) => [category.id, category.name])).toEqual(
      byId(legacy.categories).map((category) => [category.id, category.name])
    )
    expect(categories.find((category) => category.id === UNCATEGORIZED_CATEGORY_ID)).toMatchObject({
      is_system: true,
      is_locked: true
    })
    const userCategory = categories.find((category) => category.id > 3)!
    expect(userCategory.is_system).toBeFalsy()
    expect(userCategory.is_locked).toBeFalsy()
    // No text was bounced to Uncategorized: each keeps the category it had.
    for (const text of legacy.texts) {
      expect(db.getText(text.id!)?.category_id).toBe(text.category_id)
    }
    expect(legacy.texts.some((text) => text.category_id === userCategory.id)).toBe(true)
  })
})

describe('settings round-trip through the ADR-0008 bridge', () => {
  it('projects every stored global, reader, and RWW value to the flat Settings without loss', () => {
    const db = openLegacy()
    const flat = db.getSettings() as unknown as Record<string, unknown>
    const { global, reader, rww } = legacy.settings

    const globalScalars = Object.entries(global).filter(([, value]) => !Array.isArray(value))
    for (const [key, value] of globalScalars) expect(flat[key], key).toEqual(value)

    const readerScalars = Object.entries(reader).filter(
      ([key, value]) => !Array.isArray(value) && key !== 'lines_enabled'
    )
    for (const [key, value] of readerScalars) expect(flat[key], key).toEqual(value)

    // RWW-only fields and the five frozen rww_* projections (ADR-0008/0017).
    for (const key of [
      'read_while_working_shortcut',
      'read_while_working_exit_shortcut',
      'read_while_working_window_width',
      'read_while_working_window_height',
      'read_while_working_restore_clipboard',
      'read_while_working_show_standby_control',
      'read_while_working_standby_x',
      'read_while_working_standby_y'
    ]) {
      expect(flat[key], key).toEqual(rww[key])
    }
    expect(flat.rww_bpm).toBe(rww.bpm)
    expect(flat.rww_words_per_stack).toBe(rww.words_per_stack)
    expect(flat.rww_stacks_visible).toBe(rww.stacks_visible)
    expect(flat.rww_font_size).toBe(rww.font_size)
  })

  it('pays the ADR-0032 line-box migration exactly as documented and drops the retired keys', () => {
    const db = openLegacy()
    const flat = db.getSettings() as unknown as Record<string, unknown>
    const { reader, rww } = legacy.settings
    // reader: lines_enabled=true keeps its count; rww: lines_enabled=false → 1.
    expect(reader.lines_enabled).toBe(true)
    expect(flat.lines_count).toBe(reader.lines_count)
    expect(rww.lines_enabled).toBe(false)
    expect(flat.rww_lines_count).toBe(1)
    expect(flat).not.toHaveProperty('lines_enabled')
    expect(flat).not.toHaveProperty('rww_lines_enabled')
    // Keys that post-date 0.2.0 arrive at their defaults rather than throwing.
    expect(flat.lines_anchor).toBe('center')
    expect(flat.daily_word_quota).toBe(1000)
    expect(flat.weekly_quota_days).toBe(5)
  })

  it('keeps every custom palette, preset, profile, and transmute preset', () => {
    const db = openLegacy()
    const flat = db.getSettings() as unknown as Record<string, unknown>
    const { global, reader } = legacy.settings
    expect(flat.custom_palettes).toEqual(reader.custom_palettes)
    expect(flat.custom_text_presets).toEqual(reader.custom_text_presets)
    expect(flat.custom_font_presets).toEqual(reader.custom_font_presets)
    expect(flat.custom_transmute_presets).toEqual(global.custom_transmute_presets)
    // Profiles and playback presets lose only the retired `lines_enabled` flag
    // (ADR-0032); every other field is intact and a disabled preset reads 1 line.
    const stripLines = (entry: Record<string, unknown>): Record<string, unknown> => {
      const { lines_enabled, ...rest } = entry
      return lines_enabled === false ? { ...rest, lines_count: 1 } : rest
    }
    expect(flat.custom_reader_configs).toEqual(
      (reader.custom_reader_configs as Record<string, unknown>[]).map(stripLines)
    )
    expect(flat.custom_playback_presets).toEqual(
      (reader.custom_playback_presets as Record<string, unknown>[]).map(stripLines)
    )
  })

  it('is a fixed point of settingsStoreFromFlat ∘ flattenSettingsStore after one load', () => {
    const db = openLegacy()
    const store = db.getSettingsStore()
    expect(settingsStoreFromFlat(flattenSettingsStore(store))).toEqual(store)
    expect(flattenSettingsStore(settingsStoreFromFlat(db.getSettings()))).toEqual(db.getSettings())
    // A no-op save re-routes through the bridge and changes nothing.
    db.saveSettings({})
    expect(db.getSettingsStore()).toEqual(store)
    expect(persisted().settings).toEqual(store)
  })
})

describe('collections that post-date 0.2.0', () => {
  it('defaults the absent stats collection to empty without throwing', () => {
    const db = openLegacy()
    expect(db.getStatsCollection()).toEqual({ days: [], sessions: [] })
    expect(db.getStatsDays()).toEqual([])
    expect(db.getTodaySessionStats()).toEqual([])
    const overview = db.getStatsOverview()
    expect(overview.streak).toBe(0)
    expect(overview.points).toBe(0)
    expect(overview.totals.wordsRead).toBe(0)
    expect(logger.warn).not.toHaveBeenCalled()
    // A stats read with nothing to fold does not write; the next ordinary
    // write persists the new collection beside the untouched legacy data.
    expect(persisted()).not.toHaveProperty('stats')
    const added = db.saveText({ title: 'Trigger a write', content: 'one two' })
    const saved = persisted()
    expect(saved.stats).toEqual({ days: [], sessions: [] })
    expect((saved.texts as TextRecord[]).filter((text) => text.id !== added.id)).toEqual(legacy.texts)
  })
})

describe('counters and dormant ledger keys', () => {
  it('preserves every nextId-family counter instead of resetting to max+1', () => {
    const db = openLegacy()
    const maxTextId = Math.max(...legacy.texts.map((text) => text.id!))
    const maxSegmentId = Math.max(...legacy.segments.map((segment) => segment.id))
    const maxBookmarkId = Math.max(...legacy.bookmarks.map((bookmark) => bookmark.id))
    const maxCategoryId = Math.max(...legacy.categories.map((category) => category.id))
    // The fixture deliberately sits above max+1 (records were deleted earlier);
    // a reset would hand out ids that collide with the ones that survive.
    expect(legacy.nextId).toBeGreaterThan(maxTextId + 1)
    expect(legacy.nextSegmentId).toBeGreaterThan(maxSegmentId + 1)
    expect(legacy.nextBookmarkId).toBeGreaterThan(maxBookmarkId + 1)
    expect(legacy.nextCategoryId).toBeGreaterThan(maxCategoryId + 1)

    expect(db.saveText({ title: 'New after upgrade', content: 'fresh words' }).id).toBe(legacy.nextId)
    expect(db.saveCategory({ name: 'New category' }).id).toBe(legacy.nextCategoryId)
    const firstText = legacy.texts[0].id!
    expect(
      db.saveBookmark(firstText, { kind: 'normal', wordOffset: 1, label: 'new' }).id
    ).toBe(legacy.nextBookmarkId)
    expect(
      db.appendSegment(legacy.nextId, {
        title: 'Appended',
        content: 'fresh words',
        order: 0,
        sourceType: 'detected_heading',
        word_count: 2
      }).id
    ).toBe(legacy.nextSegmentId)

    const saved = persisted()
    expect(saved.nextId).toBe(legacy.nextId + 1)
    expect(saved.nextCategoryId).toBe(legacy.nextCategoryId + 1)
    expect(saved.nextBookmarkId).toBe(legacy.nextBookmarkId + 1)
    expect(saved.nextSegmentId).toBe(legacy.nextSegmentId + 1)
    expect(saved.nextSummaryId).toBe(legacy.nextSummaryId)
    expect(saved.nextSummaryQuestionId).toBe(legacy.nextSummaryQuestionId)
  })

  it('round-trips the dormant ADR-0018 ledger keys untouched through a write', () => {
    const db = openLegacy()
    db.saveText({ title: 'Trigger a write', content: 'one two' })
    const saved = persisted()
    expect(saved.seededIds).toEqual(legacy.seededIds)
    expect(saved.seededBundleVersion).toBe(legacy.seededBundleVersion)
  })
})

describe('survival through write and reload', () => {
  it('re-saves every legacy record unchanged and reads them back identically', () => {
    const first = openLegacy()
    first.saveText({ title: 'Trigger a write', content: 'one two' })

    const saved = persisted()
    const legacyTexts = (saved.texts as TextRecord[]).filter((text) =>
      legacy.texts.some((entry) => entry.id === text.id)
    )
    expect(byId(legacyTexts as Array<TextRecord & { id: number }>)).toEqual(
      byId(legacy.texts as Array<TextRecord & { id: number }>)
    )
    expect(byId(saved.segments as TextSegment[])).toEqual(byId(legacy.segments))
    expect(byId(saved.bookmarks as Bookmark[])).toEqual(byId(legacy.bookmarks))
    expect(saved.readingPositions).toEqual(legacy.readingPositions)
    expect(saved.summaries).toEqual(legacy.summaries)
    expect(saved.summaryQuestions).toEqual(legacy.summaryQuestions)
    expect((saved.categories as Array<{ id: number; name: string }>).map((c) => [c.id, c.name])).toEqual(
      byId(legacy.categories).map((c) => [c.id, c.name])
    )

    const reopened = new Database(storePath, { logger })
    for (const text of legacy.texts) expect(reopened.getText(text.id!)).toEqual(text)
    for (const segment of legacy.segments) expect(reopened.getSegment(segment.id)).toEqual(segment)
    for (const textId of new Set(legacy.bookmarks.map((b) => b.textId))) {
      expect(reopened.getBookmarks(textId)).toEqual(
        legacy.bookmarks
          .filter((b) => b.textId === textId)
          .sort((a, b) => a.wordOffset - b.wordOffset || a.id - b.id)
      )
    }
    expect(reopened.getSettings()).toEqual(first.getSettings())
    expect(logger.warn).not.toHaveBeenCalled()
  })
})
