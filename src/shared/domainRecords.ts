import type { ImportedBlock, ImportDiagnostics } from './importTypes'
import type { DayStats, SessionSums } from './statsMath'

/** `'epub'` marks a publisher e-book imported whole (ADR-0034); see `TextRecord`. */
export type ContentSourceType = 'text' | 'pdf' | 'docx' | 'epub'

export interface CategoryRecord {
  id: number
  name: string
  is_system?: boolean
  is_locked?: boolean
}

export interface TextRecord {
  id?: number
  title: string
  /** Frozen curated-book identity written by `.wbook` import (ADR-0033).
   *  Ordinary user texts lack it; legacy ADR-0018 books retain it unchanged. */
  seed_id?: string
  /** Publisher `dc:creator`, captured by EPUB import (ADR-0034 §7).
   *  Stored now, displayed nowhere yet — capturing at import is free, while
   *  re-deriving it later would mean re-parsing the original file. */
  author?: string
  content?: string
  /** HTML rendition of the document — populated for .docx imports only. */
  content_html?: string
  /** Pre-soft-wrap-converted content for display in the reader's plain text view.
   *  Single structural newlines are preserved here; the RSVP engine still uses content. */
  content_display?: string
  word_count?: number
  segment_count?: number
  is_manual_book?: boolean
  source_type?: ContentSourceType
  page_count?: number
  import_diagnostics?: ImportDiagnostics
  import_blocks?: ImportedBlock[]
  category_id?: number
  created_at?: string
  updated_at?: string
}

export type SegmentSourceType = 'detected_heading' | 'generated_chunk'

export interface TextSegment {
  id: number
  textId: number
  title: string
  content: string
  order: number
  sourceType: SegmentSourceType
  word_count: number
  /** Stable word index in the parent text where this chapter begins (set when created from a reading stop point). */
  startWordOffset?: number
  /** Stable word index in the parent text where this chapter ends (exclusive). */
  endWordOffset?: number
}

export type BookmarkKind = 'normal' | 'goal'

export interface Bookmark {
  id: number
  textId: number
  kind: BookmarkKind
  wordOffset: number
  label: string
  createdAt: string
}

export interface Summary {
  id: number
  textId: number
  segmentId?: number
  textTitle: string
  chapterTitle?: string
  content: string
  startWordOffset?: number
  endWordOffset?: number
  created_at: string
  updated_at: string
}

export interface SummaryQuestion {
  id: number
  summaryId: number
  textId: number
  text: string
  answer: string
  status: 'unanswered' | 'answered'
  created_at: string
  updated_at: string
}

export interface ReadingPosition {
  textId: number
  stackIndex: number
  updatedAt: string
  source?: 'text' | 'segment'
}

export interface ResumeCandidate {
  textId: number
  title: string
  stackIndex: number
  updatedAt: string
}

export interface BookResumeTarget {
  segmentId: number
  stackIndex: number
  resume: boolean
}

export interface ReadWhileWorkingStatus {
  enabled: boolean
  supported: boolean
  registered: boolean
  shortcut: string
  exitShortcut: string
  exitRegistered: boolean
  error: string | null
  exitError: string | null
}

export interface TemporaryReaderSession {
  id: string
  title: string
  content: string
  createdAt: string
}

// ── Stats (ADR-0035 §4) ──────────────────────────────────────────────────────
//
// `statsMath.ts` owns the shapes; the records below layer store identity on top
// of them rather than restating their fields, so the math module stays the one
// place a sum is defined.

/**
 * One recorded standard-Reader Reading session. Kept for **today only** — the
 * main process folds it into its day record and prunes it once the day closes.
 *
 * `wallMs` is deliberately absent: it is `endedAt − startedAt`, derived at fold
 * time (ADR-0035 §4 stores nothing derivable) and descriptive only — the two
 * instants stay on the record, exported and shown as session detail, and score
 * nothing (ADR-0036 §4). `title` is a snapshot, which is why deleting a text
 * does not cascade into stats.
 */
export interface SessionStatsRecord extends Omit<SessionSums, 'wallMs'> {
  textId: number
  title: string
  /** Epoch ms; also the field the record's local date key is derived from. */
  startedAt: number
  endedAt: number
}

/**
 * One stored day record: folded raw sums, the per-day maxima the highscores
 * feed on, the goal snapshots in force, and the quota/points verdict. Kept
 * forever. `DayStats` is the authority for the shape.
 */
export type DayStatsRecord = DayStats

/** The `stats` store collection (ADR-0035 §4). */
export interface StatsCollection {
  days: DayStatsRecord[]
  /** Today's un-folded sessions only. */
  sessions: SessionStatsRecord[]
}

/**
 * Today's live figures, as shown by the banner and the Dashboard.
 *
 * Both durations ride along, but only one is scored: the banner and the
 * Dashboard read `activeMs` (ADR-0036 §4), and `wallMs` is descriptive
 * session-span data kept for export and debugging.
 */
export interface StatsTodaySummary {
  date: string
  wordsRead: number
  /** Descriptive session-span sum; no surface scores or displays it (§4). */
  wallMs: number
  activeMs: number
  sessionCount: number
  quotaTargetWords: number
  /** `wordsRead / quotaTargetWords` as whole percent; **not** clamped at 100. */
  quotaPercent: number
  quotaMet: boolean
  points: number
  /** Reading Fluency over today's folded sums. */
  fluency: number
}

/** Lifetime sums across every day record. */
export interface StatsTotals {
  wordsRead: number
  /** Descriptive session-span sum; no surface scores or displays it (§4). */
  wallMs: number
  activeMs: number
  pauses: number
  rewinds: number
  sessionCount: number
  /** Days with a record — days on which reading actually happened. */
  activeDays: number
}

/** All-time bests, derived on read (ADR-0035 §5). */
export interface StatsHighscores {
  bestDayWords: number
  bestSessionFluency: number
  /**
   * Longest single session by active reading time (ADR-0036 §4). Day records
   * folded before the guards contribute their old wall-duration value —
   * closed days are never recomputed (§8), so this max can mix the two.
   */
  longestSessionMs: number
  longestStreak: number
}

/** Current scoring-period effectivity for the two editable reading goals. */
export interface StatsGoalStatus {
  /** Today's quota froze when its first session was recorded. */
  dailyPinned: boolean
  /** This Monday-based week froze when its first day was recorded. */
  weeklyPinned: boolean
  /** Weekly target governing the current week, pinned or still live. */
  weeklyTargetDays: number
}

/** Everything the stats surfaces need in one read. Nothing here is stored. */
export interface StatsOverview {
  totals: StatsTotals
  today: StatsTodaySummary
  goals: StatsGoalStatus
  streak: number
  /** Lifetime points — the sum of every day record's points. */
  points: number
  highscores: StatsHighscores
}
