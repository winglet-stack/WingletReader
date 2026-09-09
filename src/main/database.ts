/**
 * Pure JSON file store — no native compilation required.
 * Data lives in a single atomic-write JSON file in the Electron userData dir.
 */
import fs from 'fs'
import path from 'path'
import log from 'electron-log'
import {
  flattenSettingsStore,
  settingsStoreFromFlat
} from '../shared/settings'
import type {
  ReaderPalette,
  TextSizePreset,
  FontPreset,
  PlaybackPreset,
  ReaderConfig,
  TransmutePreset,
  Settings,
  SettingsStore
} from '../shared/settings'

export type {
  ReaderPalette,
  TextSizePreset,
  FontPreset,
  PlaybackPreset,
  ReaderConfig,
  TransmutePreset,
  Settings,
  SettingsStore,
} from '../shared/settings'

export type {
  Bookmark,
  BookmarkKind,
  BookResumeTarget,
  CategoryRecord,
  ContentSourceType,
  DayStatsRecord,
  ReadingPosition,
  ResumeCandidate,
  SegmentSourceType,
  SessionStatsRecord,
  StatsCollection,
  StatsHighscores,
  StatsOverview,
  StatsTodaySummary,
  StatsTotals,
  Summary,
  SummaryQuestion,
  TextRecord,
  TextSegment,
} from '../shared/domainRecords'

export const UNCATEGORIZED_CATEGORY_ID = 1
export const READING_CATEGORY_ID = 2
export const ARCHIVE_CATEGORY_ID = 3

import type {
  Bookmark,
  CategoryRecord,
  TextRecord,
  TextSegment,
  Summary,
  SummaryQuestion,
  ReadingPosition,
  ResumeCandidate,
  BookResumeTarget,
  DayStatsRecord,
  SessionStatsRecord,
  StatsCollection,
  StatsOverview,
} from '../shared/domainRecords'

import {
  DAYS_PER_WEEK,
  deriveStreak,
  emptyDaySums,
  fluencyScore,
  foldSessionsIntoDay,
  interruptionRate,
  localDateKey,
  pointsForDay,
  weekStartKey
} from '../shared/statsMath'
import type { DaySums, SessionSums } from '../shared/statsMath'

interface StoreData {
  nextId: number
  nextCategoryId: number
  nextSegmentId: number
  nextBookmarkId: number
  nextSummaryId: number
  nextSummaryQuestionId: number
  texts: TextRecord[]
  categories: CategoryRecord[]
  segments: TextSegment[]
  bookmarks: Bookmark[]
  summaries: Summary[]
  summaryQuestions: SummaryQuestion[]
  readingPositions: ReadingPosition[]
  /**
   * Mode-scoped settings store (ADR-0008). Persisted nested; legacy flat
   * `settings` objects are migrated on load via `settingsStoreFromFlat`.
   */
  settings: SettingsStore
  /**
   * Dormant ADR-0018 launch-ledger keys, retained without migration so legacy
   * stores remain parseable and round-trip losslessly (ADR-0033 D1; ADR-0019 §4
   * pattern). No runtime behavior may read these values again.
   */
  seededIds: string[]
  seededBundleVersion: number
  /**
   * Reading activity (ADR-0035 §4). Additive: `normalizeLoadedStore` defaults it
   * for stores written before it existed, so no schema version is needed.
   */
  stats: StatsCollection
}

interface DatabaseLogger {
  warn: (...args: unknown[]) => void
}

interface DatabaseOptions {
  logger?: DatabaseLogger
}

/**
 * Validates a single raw import-category entry, returning its normalized
 * `{ id, name }` or `null` when the entry is malformed. Kept module-level so the
 * per-entry guards don't inflate `importCategories`' complexity.
 */
function normalizeCategoryEntry(entry: unknown): { id: number; name: string } | null {
  if (!entry || typeof entry !== 'object') return null
  const id = Number((entry as { id?: unknown }).id)
  const nameRaw = (entry as { name?: unknown }).name
  const name = typeof nameRaw === 'string' ? nameRaw.trim() : ''
  if (!Number.isInteger(id) || id <= 0 || !name) return null
  return { id, name }
}

/** Load-compat only for the dormant ADR-0018 `seededIds` store key. */
function normalizeSeededIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
}

/** Load-compat only for the dormant ADR-0018 `seededBundleVersion` store key. */
function normalizeSeededBundleVersion(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function createBuiltInCategories(): CategoryRecord[] {
  return [
    { id: UNCATEGORIZED_CATEGORY_ID, name: 'Uncategorized', is_system: true, is_locked: true },
    { id: READING_CATEGORY_ID, name: 'Reading', is_system: true },
    { id: ARCHIVE_CATEGORY_ID, name: 'Archive', is_system: true }
  ]
}

function normalizeStoredCategory(category: CategoryRecord): CategoryRecord | null {
  if (!category || typeof category !== 'object') return null
  const id = Number(category.id)
  const name = typeof category.name === 'string' ? category.name.trim() : ''
  if (!Number.isInteger(id) || id <= 0 || !name) return null
  return {
    id,
    name,
    is_system: category.is_system === true ? true : undefined,
    is_locked: category.is_locked === true ? true : undefined
  }
}

function repairStoredCategories(value: unknown): CategoryRecord[] {
  const sourceCategories = Array.isArray(value) ? value : []
  const categoriesById = new Map<number, CategoryRecord>()

  for (const category of sourceCategories) {
    const normalized = normalizeStoredCategory(category)
    if (normalized) categoriesById.set(normalized.id, normalized)
  }

  for (const builtIn of createBuiltInCategories()) {
    const existing = categoriesById.get(builtIn.id)
    if (!existing) {
      categoriesById.set(builtIn.id, builtIn)
      continue
    }
    categoriesById.set(builtIn.id, {
      ...existing,
      is_system: true,
      is_locked: builtIn.id === UNCATEGORIZED_CATEGORY_ID ? true : existing.is_locked
    })
  }

  return [...categoriesById.values()].sort((a, b) => a.id - b.id)
}

function assignValidTextCategories(value: unknown, categories: CategoryRecord[]): TextRecord[] {
  const sourceTexts = Array.isArray(value) ? value : []
  const validCategoryIds = new Set(categories.map((category) => category.id))
  return sourceTexts.map((text) => {
    const categoryId = Number(text?.category_id)
    const resolvedCategoryId =
      Number.isInteger(categoryId) && validCategoryIds.has(categoryId)
        ? categoryId
        : UNCATEGORIZED_CATEGORY_ID
    return { ...text, category_id: resolvedCategoryId }
  })
}

function resolveLoadedNextCategoryId(value: unknown, categories: CategoryRecord[]): number {
  const maxCategoryId = categories.reduce((max, category) => Math.max(max, category.id), 0)
  const parsedNextCategoryId = Number(value)
  return Number.isInteger(parsedNextCategoryId) && parsedNextCategoryId > maxCategoryId
    ? parsedNextCategoryId
    : maxCategoryId + 1
}

function nullishOr<T>(value: T | null | undefined, fallback: T): T {
  return value ?? fallback
}

function recordArrayOrEmpty<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : []
}

// ── Stats helpers (ADR-0035 §4) ─────────────────────────────────────────────

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** The goal settings a day record is judged against and snapshots. */
interface StatsGoalSnapshot {
  quotaTargetWords: number
  weeklyTargetDays: number
}

function finiteOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function createEmptyStats(): StatsCollection {
  return { days: [], sessions: [] }
}

function normalizeSessionStatsRecord(value: unknown): SessionStatsRecord | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<SessionStatsRecord>
  const startedAt = finiteOrZero(raw.startedAt)
  // Without a start instant the record has no day to belong to.
  if (startedAt <= 0) return null
  return {
    textId: Math.trunc(finiteOrZero(raw.textId)),
    title: typeof raw.title === 'string' ? raw.title : '',
    startedAt,
    endedAt: finiteOrZero(raw.endedAt),
    activeMs: finiteOrZero(raw.activeMs),
    wordsRead: finiteOrZero(raw.wordsRead),
    pauses: finiteOrZero(raw.pauses),
    rewinds: finiteOrZero(raw.rewinds)
  }
}

function normalizeDayStatsRecord(value: unknown): DayStatsRecord | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<DayStatsRecord>
  if (typeof raw.date !== 'string' || !DATE_KEY_PATTERN.test(raw.date)) return null
  return {
    date: raw.date,
    wordsRead: finiteOrZero(raw.wordsRead),
    wallMs: finiteOrZero(raw.wallMs),
    activeMs: finiteOrZero(raw.activeMs),
    pauses: finiteOrZero(raw.pauses),
    rewinds: finiteOrZero(raw.rewinds),
    sessionCount: finiteOrZero(raw.sessionCount),
    longestSessionMs: finiteOrZero(raw.longestSessionMs),
    bestSessionFluency: finiteOrZero(raw.bestSessionFluency),
    // A zero target would make an empty day "met"; mirror the settings floor.
    quotaTargetWords: Math.max(1, finiteOrZero(raw.quotaTargetWords)),
    weeklyTargetDays: clampWeeklyTargetDays(raw.weeklyTargetDays),
    quotaMet: raw.quotaMet === true,
    points: finiteOrZero(raw.points)
  }
}

function clampWeeklyTargetDays(value: unknown): number {
  return Math.min(DAYS_PER_WEEK, Math.max(1, Math.round(finiteOrZero(value))))
}

function normalizeStats(value: unknown): StatsCollection {
  if (!value || typeof value !== 'object') return createEmptyStats()
  const raw = value as Partial<StatsCollection>
  return {
    days: recordArrayOrEmpty<unknown>(raw.days)
      .map(normalizeDayStatsRecord)
      .filter((day): day is DayStatsRecord => day !== null),
    sessions: recordArrayOrEmpty<unknown>(raw.sessions)
      .map(normalizeSessionStatsRecord)
      .filter((session): session is SessionStatsRecord => session !== null)
  }
}

/** Wall duration is derived, never stored — see `SessionStatsRecord`. */
function sessionSums(session: SessionStatsRecord): SessionSums {
  return { ...session, wallMs: session.endedAt - session.startedAt }
}

/** Sums add, maxima max — the same algebra `foldSessionsIntoDay` uses. */
function mergeDaySums(base: DaySums, added: DaySums): DaySums {
  return {
    wordsRead: base.wordsRead + added.wordsRead,
    wallMs: base.wallMs + added.wallMs,
    activeMs: base.activeMs + added.activeMs,
    pauses: base.pauses + added.pauses,
    rewinds: base.rewinds + added.rewinds,
    sessionCount: base.sessionCount + added.sessionCount,
    longestSessionMs: Math.max(base.longestSessionMs, added.longestSessionMs),
    bestSessionFluency: Math.max(base.bestSessionFluency, added.bestSessionFluency)
  }
}

/**
 * Builds one day record: the sums plus the quota verdict and the points that
 * verdict earns. `priorDays` is the rest of the history — the draft is appended
 * last so `deriveStreak` scores this day with the record being written.
 */
function buildDayRecord(
  date: string,
  sums: DaySums,
  snapshot: StatsGoalSnapshot,
  priorDays: readonly DayStatsRecord[]
): DayStatsRecord {
  const quotaMet = sums.wordsRead >= snapshot.quotaTargetWords
  const draft: DayStatsRecord = { date, ...sums, ...snapshot, quotaMet, points: 0 }
  if (!quotaMet) return draft
  return { ...draft, points: pointsForDay(deriveStreak([...priorDays, draft], date)) }
}

function dayRecordsEqual(a: DayStatsRecord, b: DayStatsRecord): boolean {
  return (Object.keys(a) as (keyof DayStatsRecord)[]).every((key) => a[key] === b[key])
}

function snapshotOf(record: DayStatsRecord): StatsGoalSnapshot {
  return {
    quotaTargetWords: record.quotaTargetWords,
    weeklyTargetDays: record.weeklyTargetDays
  }
}

function normalizeLoadedStore(parsed: Partial<StoreData>): StoreData {
  const categories = repairStoredCategories(parsed.categories)
  const texts = assignValidTextCategories(parsed.texts, categories)

  return {
    nextId: nullishOr(parsed.nextId, 1),
    nextCategoryId: resolveLoadedNextCategoryId(parsed.nextCategoryId, categories),
    nextSegmentId: nullishOr(parsed.nextSegmentId, 1),
    nextBookmarkId: nullishOr(parsed.nextBookmarkId, 1),
    nextSummaryId: nullishOr(parsed.nextSummaryId, 1),
    nextSummaryQuestionId: nullishOr(parsed.nextSummaryQuestionId, 1),
    texts,
    categories,
    segments: recordArrayOrEmpty<TextSegment>(parsed.segments),
    bookmarks: recordArrayOrEmpty<Bookmark>(parsed.bookmarks),
    summaries: recordArrayOrEmpty<Summary>(parsed.summaries),
    summaryQuestions: recordArrayOrEmpty<SummaryQuestion>(parsed.summaryQuestions),
    readingPositions: recordArrayOrEmpty<ReadingPosition>(parsed.readingPositions),
    settings: settingsStoreFromFlat(parsed.settings),
    seededIds: normalizeSeededIds(parsed.seededIds),
    seededBundleVersion: normalizeSeededBundleVersion(parsed.seededBundleVersion),
    stats: normalizeStats(parsed.stats)
  }
}

type OptionalTextFields = Pick<
  TextRecord,
  | 'author'
  | 'source_type'
  | 'page_count'
  | 'content_html'
  | 'content_display'
  | 'import_diagnostics'
  | 'import_blocks'
>

function selectOptionalTextFields(text: Partial<TextRecord>): Partial<OptionalTextFields> {
  return {
    ...(text.author !== undefined && { author: text.author }),
    ...(text.source_type !== undefined && { source_type: text.source_type }),
    ...(text.page_count !== undefined && { page_count: text.page_count }),
    ...(text.content_html !== undefined && { content_html: text.content_html }),
    ...(text.content_display !== undefined && { content_display: text.content_display }),
    ...(text.import_diagnostics !== undefined && { import_diagnostics: text.import_diagnostics }),
    ...(text.import_blocks !== undefined && { import_blocks: text.import_blocks })
  }
}

function countTextWords(content: string | undefined): number {
  return content
    ? content
        .trim()
        .split(/\s+/)
        .filter((word) => word.length > 0).length
    : 0
}

function resolveTextCategoryId(
  categoryId: number | undefined,
  categories: CategoryRecord[]
): number {
  const validCategoryIds = new Set(categories.map((category) => category.id))
  return typeof categoryId === 'number' && validCategoryIds.has(categoryId)
    ? categoryId
    : UNCATEGORIZED_CATEGORY_ID
}

function buildUpdatedTextRecord(
  current: TextRecord,
  incoming: Partial<TextRecord>,
  wordCount: number,
  resolvedCategoryId: number,
  updatedAt: string
): TextRecord {
  return {
    ...current,
    title: incoming.title ?? current.title,
    content: incoming.content ?? current.content,
    word_count: incoming.content !== undefined ? wordCount : current.word_count,
    is_manual_book: incoming.is_manual_book ?? current.is_manual_book,
    ...selectOptionalTextFields(incoming),
    ...(incoming.category_id !== undefined && { category_id: resolvedCategoryId }),
    updated_at: updatedAt
  }
}

function buildNewTextRecord(
  incoming: Partial<TextRecord>,
  id: number,
  wordCount: number,
  resolvedCategoryId: number,
  createdAt: string
): TextRecord {
  return {
    id,
    title: incoming.title ?? 'Untitled',
    content: incoming.content ?? '',
    word_count: wordCount,
    is_manual_book: incoming.is_manual_book ?? false,
    // Frozen curated-book marker (ADR-0033); undefined for ordinary user texts
    // and dropped by JSON.stringify, so they carry no seed_id on disk.
    seed_id: incoming.seed_id,
    // Publisher metadata captured by EPUB import (ADR-0034 §7); absent — and
    // so dropped by JSON.stringify — for every other ingestion channel.
    ...selectOptionalTextFields(incoming),
    category_id: resolvedCategoryId,
    created_at: createdAt,
    updated_at: createdAt
  }
}

export class Database {
  private storePath: string
  private data: StoreData
  private logger: DatabaseLogger

  constructor(storePath: string, options: DatabaseOptions = {}) {
    this.storePath = storePath
    this.logger = options.logger ?? log
    this.data = this.load()
  }

  getStorePath(): string {
    return this.storePath
  }

  private load(): StoreData {
    try {
      if (fs.existsSync(this.storePath)) {
        const raw = fs.readFileSync(this.storePath, 'utf-8')
        let parsed: Partial<StoreData>
        try {
          parsed = JSON.parse(raw) as Partial<StoreData>
        } catch (err) {
          return this.recoverCorruptStore(err)
        }
        return normalizeLoadedStore(parsed)
      }
    } catch {
      // Corrupted file — fall through to defaults
    }
    return this.createDefaultStore()
  }

  private createDefaultStore(): StoreData {
    return {
      nextId: 1,
      nextCategoryId: 4,
      nextSegmentId: 1,
      nextBookmarkId: 1,
      nextSummaryId: 1,
      nextSummaryQuestionId: 1,
      texts: [],
      categories: createBuiltInCategories(),
      segments: [],
      bookmarks: [],
      summaries: [],
      summaryQuestions: [],
      readingPositions: [],
      settings: settingsStoreFromFlat({}),
      seededIds: [],
      seededBundleVersion: 0,
      stats: createEmptyStats()
    }
  }

  private recoverCorruptStore(error: unknown): StoreData {
    const backupPath = this.moveCorruptStoreAside()
    const data = this.createDefaultStore()
    this.writeData(data)
    this.logger.warn(
      `Corrupt store recovered: moved ${this.storePath} to ${backupPath} and wrote fresh defaults.`,
      error
    )
    return data
  }

  private moveCorruptStoreAside(): string {
    const backupPath = this.nextCorruptBackupPath()
    fs.renameSync(this.storePath, backupPath)
    return backupPath
  }

  private nextCorruptBackupPath(): string {
    const stamp = new Date().toISOString().replace(/[.:]/g, '-')
    const base = `${this.storePath}.corrupt-${stamp}`
    let candidate = base
    let suffix = 1
    while (fs.existsSync(candidate)) {
      candidate = `${base}-${suffix}`
      suffix += 1
    }
    return candidate
  }

  private save(): void {
    this.writeData(this.data)
  }

  private writeData(data: StoreData): void {
    const dir = path.dirname(this.storePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    const tmp = this.storePath + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
    fs.renameSync(tmp, this.storePath)
  }

  // ── Texts ───────────────────────────────────────────────────────────────

  getTexts(): TextRecord[] {
    return this.data.texts
      .map(({ id, title, word_count, category_id, seed_id, source_type, created_at, updated_at }) => {
        const segment_count = this.data.segments.filter((s) => s.textId === id).length
        return {
          id,
          title,
          word_count,
          category_id,
          // Carried in the list projection because the Library reads curated-book
          // identity off it: `seed_id` drives the ADR-0023 "chapters" vocabulary,
          // suppresses Add Content, and is how an imported Winglet Book is found
          // again after commit. Dropping it made every curated book look like a
          // user text in the list. Content stays out of the projection.
          seed_id,
          // The second origin axis (ADR-0034 §8): `source_type: 'epub'` also says
          // "chapters", because an EPUB's chapters are the publisher's own. It is
          // deliberately NOT the same axis as `seed_id` — an EPUB book stays
          // mutable, so only `seed_id` suppresses Add Content.
          source_type,
          segment_count: segment_count > 0 ? segment_count : undefined,
          created_at,
          updated_at
        }
      })
      .sort((a, b) => ((b.updated_at ?? '') > (a.updated_at ?? '') ? 1 : -1))
  }

  getText(id: number): TextRecord | null {
    return this.data.texts.find((t) => t.id === id) ?? null
  }

  /**
   * Winglet Book identity lookup (ADR-0033 §3.5): duplicate detection is
   * `seed_id` equality among the texts CURRENTLY present — deliberately not the
   * dormant ADR-0018 ledger — so a book the user deleted can be re-imported.
   */
  hasSeedId(seedId: string): boolean {
    return this.data.texts.some((text) => text.seed_id === seedId)
  }

  saveText(text: Partial<TextRecord>): TextRecord {
    const wordCount = countTextWords(text.content)
    const now = new Date().toISOString()
    const resolvedCategoryId = resolveTextCategoryId(text.category_id, this.data.categories)

    if (text.id) {
      const idx = this.data.texts.findIndex((t) => t.id === text.id)
      if (idx !== -1) {
        this.data.texts[idx] = buildUpdatedTextRecord(
          this.data.texts[idx],
          text,
          wordCount,
          resolvedCategoryId,
          now
        )
        this.save()
        return this.getText(text.id)!
      }
    }

    const record = buildNewTextRecord(
      text,
      this.data.nextId++,
      wordCount,
      resolvedCategoryId,
      now
    )
    this.data.texts.push(record)
    this.save()
    return record
  }

  // ── Categories ─────────────────────────────────────────────────────────────

  getCategories(): CategoryRecord[] {
    return [...this.data.categories].sort((a, b) => a.id - b.id)
  }

  saveCategory(category: Partial<CategoryRecord>): CategoryRecord {
    const name = typeof category.name === 'string' ? category.name.trim() : ''
    if (!name) {
      throw new Error('Category name is required.')
    }
    if (category.id !== undefined) {
      const idx = this.data.categories.findIndex((entry) => entry.id === category.id)
      if (idx === -1) {
        throw new Error('Category not found.')
      }
      const current = this.data.categories[idx]
      this.data.categories[idx] = {
        ...current,
        name,
        is_system: current.is_system,
        is_locked: current.is_locked
      }
      this.save()
      return { ...this.data.categories[idx] }
    }

    const created: CategoryRecord = {
      id: this.data.nextCategoryId++,
      name,
      is_system: false,
      is_locked: false
    }
    this.data.categories.push(created)
    this.save()
    return { ...created }
  }

  deleteCategory(id: number): void {
    const category = this.data.categories.find((entry) => entry.id === id)
    if (!category) {
      throw new Error('Category not found.')
    }
    if (category.is_locked) {
      throw new Error('Locked categories cannot be deleted.')
    }
    this.data.categories = this.data.categories.filter((entry) => entry.id !== id)
    this.data.texts = this.data.texts.map((text) =>
      text.category_id === id ? { ...text, category_id: UNCATEGORIZED_CATEGORY_ID } : text
    )
    this.save()
  }

  assignTextCategory(textId: number, categoryId: number): TextRecord {
    const idx = this.data.texts.findIndex((entry) => entry.id === textId)
    if (idx === -1) throw new Error('Text not found.')
    const categoryExists = this.data.categories.some((category) => category.id === categoryId)
    if (!categoryExists) throw new Error('Category not found.')
    this.data.texts[idx] = {
      ...this.data.texts[idx],
      category_id: categoryId,
      updated_at: new Date().toISOString()
    }
    this.save()
    return this.getText(textId)!
  }

  importCategories(categories: unknown): Map<number, number> {
    const idMap = new Map<number, number>()
    if (!Array.isArray(categories)) return idMap
    const existingByName = new Map(this.data.categories.map((category) => [category.name, category.id]))
    for (const entry of categories) {
      const normalized = normalizeCategoryEntry(entry)
      if (!normalized) continue
      const existingId = existingByName.get(normalized.name)
      if (existingId !== undefined) {
        idMap.set(normalized.id, existingId)
        continue
      }
      const created = this.saveCategory({ name: normalized.name })
      existingByName.set(created.name, created.id)
      idMap.set(normalized.id, created.id)
    }
    return idMap
  }

  deleteText(id: number): void {
    this.data.texts = this.data.texts.filter((t) => t.id !== id)
    this.data.segments = this.data.segments.filter((s) => s.textId !== id)
    this.data.bookmarks = this.data.bookmarks.filter((bookmark) => bookmark.textId !== id)
    this.data.summaryQuestions = this.data.summaryQuestions.filter((q) => q.textId !== id)
    this.data.summaries = this.data.summaries.filter((s) => s.textId !== id)
    this.data.readingPositions = this.data.readingPositions.filter((p) => p.textId !== id)
    // Deliberately no cascade into `stats` (ADR-0035 §4): history is history —
    // the reading happened, and each session record's title snapshot keeps it
    // displayable after the text is gone.
    this.save()
  }

  // ── Segments ────────────────────────────────────────────────────────────

  getSegments(textId: number): TextSegment[] {
    return this.data.segments
      .filter((s) => s.textId === textId)
      .sort((a, b) => a.order - b.order)
  }

  getSegment(id: number): TextSegment | null {
    return this.data.segments.find((s) => s.id === id) ?? null
  }

  saveSegments(
    textId: number,
    drafts: Array<Omit<TextSegment, 'id' | 'textId'>>
  ): TextSegment[] {
    // Replace all existing segments for this text
    this.data.segments = this.data.segments.filter((s) => s.textId !== textId)
    const created: TextSegment[] = drafts.map((draft) => ({
      id: this.data.nextSegmentId++,
      textId,
      ...draft
    }))
    this.data.segments.push(...created)
    this.save()
    return created
  }

  updateSegmentTitle(id: number, title: string): void {
    const seg = this.data.segments.find((s) => s.id === id)
    if (seg) {
      seg.title = title
      this.save()
    }
  }

  deleteSegments(textId: number): void {
    this.data.segments = this.data.segments.filter((s) => s.textId !== textId)
    this.save()
  }

  deleteSegment(id: number): void {
    const linked = this.data.summaries.filter((s) => s.segmentId === id)
    for (const s of linked) {
      this.data.summaryQuestions = this.data.summaryQuestions.filter((q) => q.summaryId !== s.id)
    }
    this.data.summaries = this.data.summaries.filter((s) => s.segmentId !== id)
    this.data.segments = this.data.segments.filter((s) => s.id !== id)
    this.save()
  }

  /**
   * Creates a chapter from a passage of the parent text identified by stable word offsets.
   * The parent text content is never modified; raw text is extracted from it and stored in
   * the new segment's content field independently of any summary or formatted output.
   *
   * Overlap rule: [startWordOffset, endWordOffset) must not intersect any existing segment
   * that already carries offsets. Adjacent boundaries (end == other.start) are permitted.
   */
  createChapterFromPassage(
    textId: number,
    startWordOffset: number,
    endWordOffset: number,
    title: string
  ): { ok: true; segment: TextSegment } | { ok: false; error: string } {
    if (startWordOffset >= endWordOffset) {
      return { ok: false, error: 'Invalid passage: start must be before end.' }
    }

    const existing = this.getSegments(textId)

    // Overlap check — only against segments that carry stable offsets
    for (const seg of existing) {
      if (seg.startWordOffset === undefined || seg.endWordOffset === undefined) continue
      const sStart = seg.startWordOffset
      const sEnd = seg.endWordOffset
      // Ranges [a,b) and [c,d) overlap when a < d && b > c; touching boundaries are not overlap
      if (startWordOffset < sEnd && endWordOffset > sStart) {
        return { ok: false, error: `Overlaps with existing chapter "${seg.title}".` }
      }
    }

    const textRecord = this.getText(textId)
    if (!textRecord || !textRecord.content) {
      return { ok: false, error: 'Source text not found.' }
    }

    const words = textRecord.content.trim().split(/\s+/).filter(Boolean)
    const sliced = words.slice(startWordOffset, Math.min(endWordOffset, words.length))
    if (sliced.length === 0) {
      return { ok: false, error: 'Passage is empty.' }
    }

    const segment: TextSegment = {
      id: this.data.nextSegmentId++,
      textId,
      title,
      content: sliced.join(' '),
      order: existing.length,
      sourceType: 'detected_heading',
      word_count: sliced.length,
      startWordOffset,
      endWordOffset
    }
    this.data.segments.push(segment)
    this.save()
    return { ok: true, segment }
  }

  /** Appends a single segment without replacing existing ones — used by Build Your Book. */
  appendSegment(textId: number, draft: Omit<TextSegment, 'id' | 'textId'>): TextSegment {
    // Compute stable word offsets in the combined parent text before pushing.
    // The combined text is chapter contents joined with '\n\n'; '\n\n' adds no words,
    // so each chapter's start offset equals the sum of all previous chapters' word_count.
    const existingSegs = this.getSegments(textId)
    const startWordOffset = existingSegs.reduce((sum, s) => sum + s.word_count, 0)
    const endWordOffset = startWordOffset + draft.word_count

    const segment: TextSegment = {
      id: this.data.nextSegmentId++,
      textId,
      ...draft,
      startWordOffset,
      endWordOffset
    }
    this.data.segments.push(segment)
    // Update the parent text content to be the concatenation of all chapter bodies
    const allSegs = this.getSegments(textId)
    const combined = allSegs.map((s) => s.content).join('\n\n')
    const textIdx = this.data.texts.findIndex((t) => t.id === textId)
    if (textIdx !== -1) {
      const wc = combined.trim().split(/\s+/).filter(Boolean).length
      this.data.texts[textIdx] = {
        ...this.data.texts[textIdx],
        content: combined,
        word_count: wc,
        updated_at: new Date().toISOString()
      }
    }
    this.save()
    return segment
  }

  // ── Bookmarks ────────────────────────────────────────────────────────────

  getBookmarks(textId: number): Bookmark[] {
    const text = this.data.texts.find((entry) => entry.id === textId)
    if (!text) return []

    const wordCount = Number.isFinite(text.word_count) ? Math.trunc(text.word_count ?? 0) : 0
    const bookmarksForText = this.data.bookmarks.filter((bookmark) => bookmark.textId === textId)
    const normalized: Bookmark[] = []
    let changed = false

    for (const bookmark of bookmarksForText) {
      if (wordCount <= 0) {
        changed = true
        continue
      }

      const rawOffset = Number.isFinite(bookmark.wordOffset) ? Math.trunc(bookmark.wordOffset) : 0
      if (bookmark.kind === 'goal' && rawOffset >= wordCount) {
        changed = true
        continue
      }

      const wordOffset = Math.min(Math.max(rawOffset, 0), wordCount - 1)
      const nextBookmark =
        wordOffset === bookmark.wordOffset ? bookmark : { ...bookmark, wordOffset }
      changed ||= nextBookmark !== bookmark
      normalized.push(nextBookmark)
    }

    if (changed) {
      this.data.bookmarks = [
        ...this.data.bookmarks.filter((bookmark) => bookmark.textId !== textId),
        ...normalized
      ]
      this.save()
    }

    return [...normalized].sort((a, b) => a.wordOffset - b.wordOffset || a.id - b.id)
  }

  saveBookmark(
    textId: number,
    draft: Omit<Bookmark, 'id' | 'textId' | 'createdAt'>
  ): Bookmark {
    const text = this.data.texts.find((entry) => entry.id === textId)
    if (!text) {
      throw new Error('Text not found.')
    }
    if (draft.kind !== 'normal' && draft.kind !== 'goal') {
      throw new Error(`Invalid bookmark kind: ${draft.kind}`)
    }

    if (draft.kind === 'goal') {
      this.data.bookmarks = this.data.bookmarks.filter(
        (bookmark) => bookmark.textId !== textId || bookmark.kind !== 'goal'
      )
    }

    const rawOffset = Number.isFinite(draft.wordOffset) ? Math.trunc(draft.wordOffset) : 0
    const bookmark: Bookmark = {
      id: this.data.nextBookmarkId++,
      textId,
      kind: draft.kind,
      wordOffset: rawOffset,
      label: draft.label,
      createdAt: new Date().toISOString()
    }
    this.data.bookmarks.push(bookmark)
    this.save()
    return { ...bookmark }
  }

  updateBookmarkLabel(id: number, label: string): void {
    const bookmark = this.data.bookmarks.find((entry) => entry.id === id)
    if (bookmark) {
      bookmark.label = label
      this.save()
    }
  }

  deleteBookmark(id: number): void {
    this.data.bookmarks = this.data.bookmarks.filter((bookmark) => bookmark.id !== id)
    this.save()
  }

  // ── Settings ────────────────────────────────────────────────────────────

  /**
   * Returns the effective flat settings (Standard Reader projection of the
   * store). Kept flat so every existing reader/UI consumer is unchanged while
   * the store is the real on-disk shape (ADR-0008).
   */
  getSettings(): Settings {
    return flattenSettingsStore(this.data.settings)
  }

  /** The mode-scoped store (ADR-0008) — used by the unified Settings handler. */
  getSettingsStore(): SettingsStore {
    return settingsStoreFromFlat(this.data.settings)
  }

  saveSettings(settings: Partial<Settings>): Settings {
    if (settings.highlighting_mode !== undefined) {
      if (settings.highlighting_mode !== 'default' && settings.highlighting_mode !== 'progressive') {
        throw new Error(`Invalid highlighting_mode: ${settings.highlighting_mode}`)
      }
    }
    // Re-project the store to flat, merge the patch, then re-split. This routes
    // each field to its mode scope (e.g. rww_* → rww overrides) via one path.
    const mergedFlat = { ...flattenSettingsStore(this.data.settings), ...settings }
    this.data.settings = settingsStoreFromFlat(mergedFlat)
    this.save()
    return flattenSettingsStore(this.data.settings)
  }

  /** Replaces the entire settings store (ADR-0008 handler write path). */
  saveSettingsStore(store: SettingsStore): SettingsStore {
    this.data.settings = settingsStoreFromFlat(store)
    this.save()
    return this.getSettingsStore()
  }

  // ── Stats (ADR-0035 §4) ──────────────────────────────────────────────────
  //
  // The main process owns every day rule: date assignment, folding, pruning and
  // the points/streak verdict. Two tiers, one invariant — a day record is the
  // complete truth for a **closed** day, and `sessions[]` holds only sessions
  // whose day has not closed yet. Today's sums stay live, but its goal snapshot
  // freezes at the first session; closed days stay absolute (ADR-0036 §5).
  //
  // Reads fold before answering, so no surface can observe a stale day.

  /**
   * Records one finished standard-Reader session. Exactly **one** store write
   * per call — measurement never writes per beat (ADR-0035 §2).
   */
  recordSessionStats(record: SessionStatsRecord): void {
    const todayKey = localDateKey(Date.now())
    const session = normalizeSessionStatsRecord(record)
    // A session that advanced no words is not recorded (ADR-0035 §2) — it would
    // add a session count and a fluency sample with no reading behind it.
    if (session && session.wordsRead > 0) this.appendSessionStats(session, todayKey)
    this.refreshStats(todayKey)
    this.save()
  }

  /** Lifetime, today and highscore figures — all derived, none stored. */
  getStatsOverview(): StatsOverview {
    const todayKey = this.refreshStatsAndSave()
    const days = this.data.stats.days
    const goals = this.currentGoalStatus(todayKey)
    const today = days.find((day) => day.date === todayKey) ?? {
      date: todayKey,
      ...emptyDaySums(),
      ...this.currentGoalSnapshot(),
      weeklyTargetDays: goals.weeklyTargetDays,
      quotaMet: false,
      points: 0
    }

    const totals = days.reduce(
      (sum, day) => ({
        wordsRead: sum.wordsRead + day.wordsRead,
        wallMs: sum.wallMs + day.wallMs,
        activeMs: sum.activeMs + day.activeMs,
        pauses: sum.pauses + day.pauses,
        rewinds: sum.rewinds + day.rewinds,
        sessionCount: sum.sessionCount + day.sessionCount,
        activeDays: sum.activeDays + 1
      }),
      { wordsRead: 0, wallMs: 0, activeMs: 0, pauses: 0, rewinds: 0, sessionCount: 0, activeDays: 0 }
    )

    return {
      totals,
      today: {
        date: todayKey,
        wordsRead: today.wordsRead,
        wallMs: today.wallMs,
        activeMs: today.activeMs,
        sessionCount: today.sessionCount,
        quotaTargetWords: today.quotaTargetWords,
        quotaPercent: Math.round((today.wordsRead / today.quotaTargetWords) * 100),
        quotaMet: today.quotaMet,
        points: today.points,
        fluency: fluencyScore(
          interruptionRate({
            pauses: today.pauses,
            rewinds: today.rewinds,
            activeMs: today.activeMs
          })
        )
      },
      goals,
      streak: deriveStreak(days, todayKey),
      points: days.reduce((sum, day) => sum + day.points, 0),
      highscores: this.deriveHighscores(todayKey)
    }
  }

  /** Every day record, oldest first. */
  getStatsDays(): DayStatsRecord[] {
    this.refreshStatsAndSave()
    return this.data.stats.days.map((day) => ({ ...day }))
  }

  /** Today's session records, oldest first. */
  getTodaySessionStats(): SessionStatsRecord[] {
    const todayKey = this.refreshStatsAndSave()
    return this.data.stats.sessions
      .filter((session) => localDateKey(session.startedAt) === todayKey)
      .sort((a, b) => a.startedAt - b.startedAt)
      .map((session) => ({ ...session }))
  }

  /**
   * The whole collection as stored — what `data:exportAll` ships. Folds first,
   * like every other read, so an export never carries a stale open day.
   */
  getStatsCollection(): StatsCollection {
    this.refreshStatsAndSave()
    return {
      days: this.data.stats.days.map((day) => ({ ...day })),
      sessions: this.data.stats.sessions.map((session) => ({ ...session }))
    }
  }

  /**
   * Replaces the whole collection — the import counterpart of
   * `getStatsCollection`. Replace, not merge: two histories folded together
   * would claim words that were never read twice. Takes `unknown` because the
   * payload comes off an import file; normalization drops what it cannot read.
   */
  replaceStats(collection: unknown): void {
    this.data.stats = normalizeStats(collection)
    this.save()
  }

  /**
   * The streak peaks on a quota-met day, so scoring the history as of each of
   * those days finds the longest run without duplicating the walk `deriveStreak`
   * already owns.
   */
  private deriveHighscores(todayKey: string): StatsOverview['highscores'] {
    const days = this.data.stats.days
    return {
      bestDayWords: days.reduce((best, day) => Math.max(best, day.wordsRead), 0),
      bestSessionFluency: days.reduce((best, day) => Math.max(best, day.bestSessionFluency), 0),
      longestSessionMs: days.reduce((best, day) => Math.max(best, day.longestSessionMs), 0),
      longestStreak: days.reduce(
        (best, day) => (day.quotaMet ? Math.max(best, deriveStreak(days, day.date)) : best),
        deriveStreak(days, todayKey)
      )
    }
  }

  /** The quota/weekly-target settings in force right now (ADR-0035 §5). */
  private currentGoalSnapshot(): StatsGoalSnapshot {
    const settings = flattenSettingsStore(this.data.settings)
    return {
      quotaTargetWords: Math.max(1, Math.round(finiteOrZero(settings.daily_word_quota))),
      weeklyTargetDays: clampWeeklyTargetDays(settings.weekly_quota_days)
    }
  }

  /** First recorded day in `dateKey`'s Monday-based week, if the pin exists. */
  private firstRecordedDayInWeek(dateKey: string): DayStatsRecord | undefined {
    const monday = weekStartKey(dateKey)
    let first: DayStatsRecord | undefined
    for (const day of this.data.stats.days) {
      if (day.date > dateKey || weekStartKey(day.date) !== monday) continue
      // A later duplicate for the same date is authoritative, matching streak
      // derivation; an earlier calendar date always wins the weekly pin.
      if (!first || day.date <= first.date) first = day
    }
    return first
  }

  /** Goal effectivity carried on the existing overview read surface. */
  private currentGoalStatus(todayKey: string): StatsOverview['goals'] {
    const live = this.currentGoalSnapshot()
    const today = this.data.stats.days.find((day) => day.date === todayKey)
    const firstThisWeek = this.firstRecordedDayInWeek(todayKey)
    return {
      dailyPinned: Boolean(today && today.sessionCount > 0),
      weeklyPinned: Boolean(firstThisWeek),
      weeklyTargetDays: firstThisWeek?.weeklyTargetDays ?? live.weeklyTargetDays
    }
  }

  /** New days take a live daily quota and this week's first weekly snapshot. */
  private goalSnapshotForNewDay(dateKey: string): StatsGoalSnapshot {
    const live = this.currentGoalSnapshot()
    return {
      quotaTargetWords: live.quotaTargetWords,
      weeklyTargetDays:
        this.firstRecordedDayInWeek(dateKey)?.weeklyTargetDays ?? live.weeklyTargetDays
    }
  }

  private refreshStatsAndSave(): string {
    const todayKey = localDateKey(Date.now())
    if (this.refreshStats(todayKey)) this.save()
    return todayKey
  }

  /**
   * Closes out every day before today and re-derives today's live record.
   * Returns whether anything changed; never saves — the caller owns the write.
   */
  private refreshStats(todayKey: string): boolean {
    const folded = this.foldClosedDays(todayKey)
    return this.recomputeTodayRecord(todayKey) || folded
  }

  private appendSessionStats(session: SessionStatsRecord, todayKey: string): void {
    const dateKey = localDateKey(session.startedAt)
    const closed = this.data.stats.days.find((day) => day.date === dateKey)
    // A late arrival for an already-folded day (a run that crossed midnight
    // while a stats read closed the old day) merges straight into that frozen
    // record. Folding rebuilds a day *from its sessions*, so parking this one in
    // `sessions[]` would erase everything else that day already held.
    if (dateKey < todayKey && closed) {
      this.writeDayRecord(
        buildDayRecord(
          dateKey,
          mergeDaySums(closed, foldSessionsIntoDay([sessionSums(session)])),
          snapshotOf(closed),
          this.data.stats.days
        )
      )
      return
    }
    this.data.stats.sessions.push(session)
  }

  private foldClosedDays(todayKey: string): boolean {
    const isClosed = (session: SessionStatsRecord): boolean =>
      localDateKey(session.startedAt) < todayKey
    const closedSessions = this.data.stats.sessions.filter(isClosed)
    if (closedSessions.length === 0) return false

    const byDate = new Map<string, SessionStatsRecord[]>()
    for (const session of closedSessions) {
      const key = localDateKey(session.startedAt)
      const bucket = byDate.get(key)
      if (bucket) bucket.push(session)
      else byDate.set(key, [session])
    }

    // Oldest first, so each day's streak is scored against days already closed.
    for (const key of [...byDate.keys()].sort()) {
      const existing = this.data.stats.days.find((day) => day.date === key)
      // Existing records are absolute. A day first seen during this fold takes
      // the live daily quota but inherits the week's first target snapshot.
      const snapshot = existing ? snapshotOf(existing) : this.goalSnapshotForNewDay(key)
      const sums = foldSessionsIntoDay((byDate.get(key) ?? []).map(sessionSums))
      this.writeDayRecord(buildDayRecord(key, sums, snapshot, this.data.stats.days))
    }

    this.data.stats.sessions = this.data.stats.sessions.filter((session) => !isClosed(session))
    return true
  }

  private recomputeTodayRecord(todayKey: string): boolean {
    const todaySessions = this.data.stats.sessions.filter(
      (session) => localDateKey(session.startedAt) === todayKey
    )
    // Nothing read today — no record to derive. Any existing one (a day record
    // written under a clock that has since moved back) is left untouched rather
    // than replaced with an empty day.
    if (todaySessions.length === 0) return false

    const existing = this.data.stats.days.find((day) => day.date === todayKey)
    const next = buildDayRecord(
      todayKey,
      foldSessionsIntoDay(todaySessions.map(sessionSums)),
      existing ? snapshotOf(existing) : this.goalSnapshotForNewDay(todayKey),
      this.data.stats.days
    )
    if (existing && dayRecordsEqual(existing, next)) return false
    this.writeDayRecord(next)
    return true
  }

  /** Upserts a day record, keeping `days` sorted oldest-first. */
  private writeDayRecord(record: DayStatsRecord): void {
    const days = this.data.stats.days.filter((day) => day.date !== record.date)
    days.push(record)
    days.sort((a, b) => (a.date < b.date ? -1 : 1))
    this.data.stats.days = days
  }

  // ── Summaries ────────────────────────────────────────────────────────────

  getSummaries(textId: number): Summary[] {
    return this.data.summaries
      .filter((s) => s.textId === textId)
      .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
  }

  getAllSummaries(): Summary[] {
    return [...this.data.summaries].sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
  }

  saveSummary(
    data: Omit<Summary, 'id' | 'created_at' | 'updated_at'> & { id?: number }
  ): Summary {
    const now = new Date().toISOString()
    if (data.id) {
      const existing = this.data.summaries.find((s) => s.id === data.id)
      if (existing) {
        existing.content = data.content
        existing.chapterTitle = data.chapterTitle
        existing.updated_at = now
        this.save()
        return { ...existing }
      }
    }
    const record: Summary = {
      id: this.data.nextSummaryId++,
      textId: data.textId,
      segmentId: data.segmentId,
      textTitle: data.textTitle,
      chapterTitle: data.chapterTitle,
      content: data.content,
      startWordOffset: data.startWordOffset,
      endWordOffset: data.endWordOffset,
      created_at: now,
      updated_at: now
    }
    this.data.summaries.push(record)
    this.save()
    return { ...record }
  }

  deleteSummary(id: number): void {
    this.data.summaryQuestions = this.data.summaryQuestions.filter((q) => q.summaryId !== id)
    this.data.summaries = this.data.summaries.filter((s) => s.id !== id)
    this.save()
  }

  // ── SummaryQuestions ─────────────────────────────────────────────────────────

  getSummaryQuestions(summaryId: number): SummaryQuestion[] {
    return this.data.summaryQuestions
      .filter((q) => q.summaryId === summaryId)
      .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
  }

  getSummaryQuestionsForText(textId: number): SummaryQuestion[] {
    return this.data.summaryQuestions
      .filter((q) => q.textId === textId)
      .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
  }

  saveSummaryQuestion(
    data: Omit<SummaryQuestion, 'id' | 'created_at' | 'updated_at'> & { id?: number }
  ): SummaryQuestion {
    const now = new Date().toISOString()
    if (data.id) {
      const existing = this.data.summaryQuestions.find((q) => q.id === data.id)
      if (existing) {
        existing.answer = data.answer
        existing.status = data.answer.trim() ? 'answered' : 'unanswered'
        existing.updated_at = now
        this.save()
        return { ...existing }
      }
    }
    const record: SummaryQuestion = {
      id: this.data.nextSummaryQuestionId++,
      summaryId: data.summaryId,
      textId: data.textId,
      text: data.text,
      answer: data.answer,
      status: data.answer.trim() ? 'answered' : 'unanswered',
      created_at: now,
      updated_at: now
    }
    this.data.summaryQuestions.push(record)
    this.save()
    return { ...record }
  }

  deleteSummaryQuestion(id: number): void {
    this.data.summaryQuestions = this.data.summaryQuestions.filter((q) => q.id !== id)
    this.save()
  }

  // ── ReadingPositions ─────────────────────────────────────────────────────────

  getReadingPosition(textId: number): ReadingPosition | null {
    return this.data.readingPositions.find((p) => p.textId === textId) ?? null
  }

  getLatestResumeCandidate(): ResumeCandidate | null {
    const textById = new Map(this.data.texts.map((text) => [text.id, text]))

    const candidates = this.data.readingPositions
      .filter((position) => position.stackIndex > 0)
      .filter((position) => position.source !== 'segment')
      .map((position): ResumeCandidate | null => {
        const text = textById.get(position.textId)
        if (!text?.id) return null
        return {
          textId: text.id,
          title: text.title,
          stackIndex: position.stackIndex,
          updatedAt: position.updatedAt
        }
      })
      .filter((candidate): candidate is ResumeCandidate => candidate !== null)

    return candidates.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
  }

  getBookResumeTarget(bookTextId: number): BookResumeTarget | null {
    const segments = this.getSegments(bookTextId)
    if (segments.length === 0) return null

    const segmentIds = new Set(segments.map((segment) => segment.id))
    const latestPosition = this.data.readingPositions
      .filter((position) => position.source === 'segment')
      .filter((position) => segmentIds.has(position.textId))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]

    if (latestPosition) {
      return {
        segmentId: latestPosition.textId,
        stackIndex: latestPosition.stackIndex,
        resume: true
      }
    }

    return {
      segmentId: segments[0].id,
      stackIndex: 0,
      resume: false
    }
  }

  saveReadingPosition(
    textId: number,
    stackIndex: number,
    source: ReadingPosition['source'] = 'text'
  ): ReadingPosition {
    const now = new Date().toISOString()
    const existing = this.data.readingPositions.find((p) => p.textId === textId)
    if (existing) {
      existing.stackIndex = stackIndex
      existing.updatedAt = now
      existing.source = source
      this.save()
      return { ...existing }
    }
    const record: ReadingPosition = { textId, stackIndex, updatedAt: now, source }
    this.data.readingPositions.push(record)
    this.save()
    return { ...record }
  }

}
