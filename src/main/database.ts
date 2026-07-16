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
  ReadingPosition,
  ResumeCandidate,
  SegmentSourceType,
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
} from '../shared/domainRecords'

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
   * Seed loader ledger (ADR-0018). `seededIds` is the permanent record of every
   * `seedId` ever inserted — dedupe is against this, never against currently
   * present texts, so a user-deleted seeded book never resurrects.
   * `seededBundleVersion` is the highest bundle version already applied; a launch
   * whose bundle is not greater early-outs without scanning.
   */
  seededIds: string[]
  seededBundleVersion: number
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

/** Coerces a persisted seed ledger to a clean string array (ADR-0018). */
function normalizeSeededIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
}

/** Coerces a persisted applied bundle version to a finite number, defaulting to 0. */
function normalizeSeededBundleVersion(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
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
        const builtInCategories: CategoryRecord[] = [
          { id: UNCATEGORIZED_CATEGORY_ID, name: 'Uncategorized', is_system: true, is_locked: true },
          { id: READING_CATEGORY_ID, name: 'Reading', is_system: true },
          { id: ARCHIVE_CATEGORY_ID, name: 'Archive', is_system: true }
        ]
        const sourceCategories = Array.isArray(parsed.categories) ? parsed.categories : []
        const parsedCategories = sourceCategories
          .map((category): CategoryRecord | null => {
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
          })
          .filter((category): category is CategoryRecord => category !== null)
        const categoriesById = new Map<number, CategoryRecord>()
        for (const category of parsedCategories) categoriesById.set(category.id, category)
        for (const builtIn of builtInCategories) {
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
        const normalizedCategories = [...categoriesById.values()].sort((a, b) => a.id - b.id)
        const validCategoryIds = new Set(normalizedCategories.map((c) => c.id))
        const normalizedTexts = (Array.isArray(parsed.texts) ? parsed.texts : []).map((text) => {
          const categoryId = Number(text?.category_id)
          const resolvedCategoryId =
            Number.isInteger(categoryId) && validCategoryIds.has(categoryId)
              ? categoryId
              : UNCATEGORIZED_CATEGORY_ID
          return { ...text, category_id: resolvedCategoryId }
        })
        const maxCategoryId = normalizedCategories.reduce((max, category) => Math.max(max, category.id), 0)
        const parsedNextCategoryId = Number(parsed.nextCategoryId)
        const nextCategoryId =
          Number.isInteger(parsedNextCategoryId) && parsedNextCategoryId > maxCategoryId
            ? parsedNextCategoryId
            : maxCategoryId + 1
        return {
          nextId: parsed.nextId ?? 1,
          nextCategoryId,
          nextSegmentId: parsed.nextSegmentId ?? 1,
          nextBookmarkId: parsed.nextBookmarkId ?? 1,
          nextSummaryId: parsed.nextSummaryId ?? 1,
          nextSummaryQuestionId: parsed.nextSummaryQuestionId ?? 1,
          texts: normalizedTexts,
          categories: normalizedCategories,
          segments: Array.isArray(parsed.segments) ? parsed.segments : [],
          bookmarks: Array.isArray(parsed.bookmarks) ? parsed.bookmarks : [],
          summaries: Array.isArray(parsed.summaries) ? parsed.summaries : [],
          summaryQuestions: Array.isArray(parsed.summaryQuestions) ? parsed.summaryQuestions : [],
          readingPositions: Array.isArray(parsed.readingPositions) ? parsed.readingPositions : [],
          settings: settingsStoreFromFlat(parsed.settings),
          seededIds: normalizeSeededIds(parsed.seededIds),
          seededBundleVersion: normalizeSeededBundleVersion(parsed.seededBundleVersion)
        }
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
      categories: [
        { id: UNCATEGORIZED_CATEGORY_ID, name: 'Uncategorized', is_system: true, is_locked: true },
        { id: READING_CATEGORY_ID, name: 'Reading', is_system: true },
        { id: ARCHIVE_CATEGORY_ID, name: 'Archive', is_system: true }
      ],
      segments: [],
      bookmarks: [],
      summaries: [],
      summaryQuestions: [],
      readingPositions: [],
      settings: settingsStoreFromFlat({}),
      seededIds: [],
      seededBundleVersion: 0
    }
  }

  private recoverCorruptStore(error: unknown): StoreData {
    const backupPath = this.moveCorruptStoreAside()
    const data = this.createDefaultStore()
    this.writeData(data)
    this.logger.warn(
      `Corrupt store recovered: moved ${this.storePath} to ${backupPath} and reseeded defaults.`,
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
      .map(({ id, title, word_count, category_id, created_at, updated_at }) => {
        const segment_count = this.data.segments.filter((s) => s.textId === id).length
        return {
          id,
          title,
          word_count,
          category_id,
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

  saveText(text: Partial<TextRecord>): TextRecord {
    const wordCount = text.content
      ? text.content
          .trim()
          .split(/\s+/)
          .filter((w) => w.length > 0).length
      : 0
    const now = new Date().toISOString()
    const validCategoryIds = new Set(this.data.categories.map((category) => category.id))
    const resolvedCategoryId =
      typeof text.category_id === 'number' && validCategoryIds.has(text.category_id)
        ? text.category_id
        : UNCATEGORIZED_CATEGORY_ID

    if (text.id) {
      const idx = this.data.texts.findIndex((t) => t.id === text.id)
      if (idx !== -1) {
        this.data.texts[idx] = {
          ...this.data.texts[idx],
          title: text.title ?? this.data.texts[idx].title,
          content: text.content ?? this.data.texts[idx].content,
          word_count: text.content !== undefined ? wordCount : this.data.texts[idx].word_count,
          is_manual_book: text.is_manual_book ?? this.data.texts[idx].is_manual_book,
          ...(text.source_type !== undefined && { source_type: text.source_type }),
          ...(text.page_count !== undefined && { page_count: text.page_count }),
          ...(text.content_html !== undefined && { content_html: text.content_html }),
          ...(text.content_display !== undefined && { content_display: text.content_display }),
          ...(text.import_diagnostics !== undefined && { import_diagnostics: text.import_diagnostics }),
          ...(text.import_blocks !== undefined && { import_blocks: text.import_blocks }),
          ...(text.category_id !== undefined && { category_id: resolvedCategoryId }),
          updated_at: now
        }
        this.save()
        return this.getText(text.id)!
      }
    }

    const record: TextRecord = {
      id: this.data.nextId++,
      title: text.title ?? 'Untitled',
      content: text.content ?? '',
      word_count: wordCount,
      is_manual_book: text.is_manual_book ?? false,
      // Seed loader stamp (ADR-0018); undefined for all other inserts and dropped
      // by JSON.stringify on save, so non-seeded records carry no seed_id on disk.
      seed_id: text.seed_id,
      ...(text.source_type !== undefined && { source_type: text.source_type }),
      ...(text.page_count !== undefined && { page_count: text.page_count }),
      ...(text.content_html !== undefined && { content_html: text.content_html }),
      ...(text.content_display !== undefined && { content_display: text.content_display }),
      ...(text.import_diagnostics !== undefined && { import_diagnostics: text.import_diagnostics }),
      ...(text.import_blocks !== undefined && { import_blocks: text.import_blocks }),
      category_id: resolvedCategoryId,
      created_at: now,
      updated_at: now
    }
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

  // ── Seed loader ledger (ADR-0018) ─────────────────────────────────────────

  /** Highest bundle version already applied; 0 on a never-seeded store. */
  getSeededBundleVersion(): number {
    return this.data.seededBundleVersion
  }

  /** A copy of the permanent ledger of every `seedId` ever inserted. */
  getSeededIds(): string[] {
    return [...this.data.seededIds]
  }

  /** Records a freshly inserted seedId; ignores ids already in the ledger. */
  addSeededId(seedId: string): void {
    if (this.data.seededIds.includes(seedId)) return
    this.data.seededIds.push(seedId)
    this.save()
  }

  /** Advances the applied bundle version (the seed-scan early-out gate). */
  setSeededBundleVersion(version: number): void {
    this.data.seededBundleVersion = version
    this.save()
  }
}
