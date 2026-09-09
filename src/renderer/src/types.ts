import type { HighlightMode, HighlightingMode, ReaderConfig } from '../../shared/settings'

// Settings, its defaults, and the preset/config types it depends on live in the
// shared module so main and renderer share one authoritative definition.
export {
  DEFAULT_SETTINGS,
  copyReaderDefaultsToRww,
} from '../../shared/settings'
export type {
  Settings,
  HighlightMode,
  HighlightingMode,
  ReaderPalette,
  ReaderConfig,
  TransmutePreset
} from '../../shared/settings'

export type {
  Bookmark,
  BookmarkKind,
  ContentSourceType,
  CategoryRecord,
  TextRecord,
  SegmentSourceType,
  TextSegment,
  Summary,
  // fallow-ignore-next-line unused-type
  SummaryQuestion,
  ReadingPosition,
  ResumeCandidate,
  // fallow-ignore-next-line unused-type
  BookResumeTarget,
  ReadWhileWorkingStatus,
  DayStatsRecord,
  SessionStatsRecord,
  StatsHighscores,
  StatsOverview,
  TemporaryReaderSession,
} from '../../shared/domainRecords'

export type ReaderConfigFields = Omit<ReaderConfig, 'id' | 'name'>

export type PlaybackState = 'idle' | 'playing' | 'paused' | 'stopped'

/** Type of a word-stack: drives pause length and visual styling */
export type StackType = 'normal' | 'sentence-end' | 'paragraph-end' | 'headline'

export interface WordStack {
  words: string[]
  type: StackType
}

// `AppView` moved to `appShell/routeTable.tsx`, where the destinations are
// declared: the union is derived from the route table's keys so a destination
// cannot exist as a token without an entry that says what renders it.

export interface TransmuteConfig {
  textId: number | null
  segmentId: number | null

  // ── Reader-style video settings (stored separately from live Reader settings) ─
  bpm: number
  wordsPerStack: number
  pauseAtSentences: boolean
  pauseAtHeadlines: boolean
  fontSize: number
  fontFamily: string
  theme: 'dark' | 'light'
  bgColor: string
  textColor: string
  stackVerticalOffset: number
  stackHorizontalOffset: number
  highlightActive: boolean
  /** Highlight box colour. Empty string = theme default. */
  highlightColor: string
  /** Text colour inside the highlighted stack. Empty string = theme default. */
  highlightTextColor: string
  highlightMode: HighlightMode
  highlightPanningChunkSize: number
  highlightingMode: HighlightingMode
  linesCount: number
  linesRowGap: number
  /** Stacks shown per row in multi-line mode. */
  stacksVisible: number
  /** Horizontal gap between stacks in multi-line mode (px). */
  stackGap: number
  showChunkDividers: boolean
  chunkRuleLongWord: boolean
  chunkRuleEnumerations: boolean
  chunkRuleBullets: boolean
  chunkRuleCommas: boolean
  chunkRuleNames: boolean

  // ── Video-specific settings ──────────────────────────────────────────────
  resolution: '1280x720' | '1920x1080' | '1080x1920' | '720x720'
  /** Maximum render duration in minutes. null = no limit. */
  maxDurationMinutes: number | null
  /** How much source content to render. */
  contentLimitType: 'none' | 'words' | 'percentage'
  /** Used when contentLimitType === 'words'. Positive integer. */
  contentLimitWords: number
  /** Used when contentLimitType === 'percentage'. 1–100. */
  contentLimitPercentage: number
  /** When true, renders a percentage chip and vertical progress bar in the top-left corner. */
  showProgressOverlay: boolean
  /**
   * Override background colour for the video output.
   * Empty string = use bgColor (sourced from Reader settings).
   * Ignored when transparentBackground is true.
   */
  bgColorOverride: string
  /** When true, no background fill is drawn; only text and progress bar are rendered. */
  transparentBackground: boolean
}

// fallow-ignore-next-line unused-type
export type TrailerStackSection = 'heading' | 'intro' | 'bold' | 'visualAid' | 'question' | 'summary'

// fallow-ignore-next-line unused-type
export interface TrailerStack extends WordStack {
  section: TrailerStackSection
  bold: boolean
  pauseForUser: boolean
}
