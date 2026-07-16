import type { WordStack } from '../../types'

/**
 * Per-project configuration for a Script Builder project.
 * Covers timing, chunk rules, and display settings that are project-wide defaults.
 * Visual settings (text color, bg color, highlight colors) are optional overrides;
 * empty string means inherit from global Settings via CSS variables.
 */
export interface ScriptTokenConfig {
  // Timing
  bpm: number
  pauseAtSentences: boolean
  pauseAtHeadlines: boolean
  // Primary per-token display settings (inline controls)
  wordsPerStack: number        // words_per_stack
  stacksVisible: number        // stacks_visible
  // Additional options (secondary panel)
  stackGap: number             // stack_gap — horizontal gap between stacks (px)
  linesEnabled: boolean        // lines_enabled — show multiple rows simultaneously
  linesCount: number           // lines_count — number of rows when linesEnabled
  linesRowGap: number          // lines_row_gap — vertical gap between rows (px)
  stackVerticalOffset: number   // stack_vertical_offset — Y-shift of display area (px)
  stackHorizontalOffset: number // stack_horizontal_offset — X-shift of display area (px)
  fontSize: number
  /** Smallest font size (px) the dynamic fitter will produce. User-configurable via Project Options. */
  minFontSize: number
  /** When true, BPM is derived from targetWpm and wordsPerStack instead of being set manually. */
  lockAtWpm?: boolean
  /** Target words-per-minute used when lockAtWpm is true. */
  targetWpm?: number
  // Per-project color overrides — empty string means use the hardcoded neutral default
  textColor?: string
  bgColor?: string
  highlightColor?: string
  highlightTextColor?: string
  // These three were previously read from global Settings at render time.
  // Now stored in the script so it is self-contained and unaffected by reader config.
  fontFamily?: string
  highlightActive?: boolean
  showChunkDividers?: boolean
}

/**
 * The settings that define a ScriptBlock's playback behaviour, word capacity, and
 * optional per-block display overrides. All display fields are optional (`?:`);
 * when undefined the project-level defaultConfig value is used instead.
 * Required fields (bpm/wordsPerStack/stacksVisible) always come from the block.
 */
export interface ScriptBlockConfig {
  /** Beats per minute for this block's auto-advance timing. */
  bpm: number
  /** Words grouped per stack (playback chunk size). */
  wordsPerStack: number
  /** Number of stacks shown simultaneously in the reader (playback chunk count). */
  stacksVisible: number
  /**
   * Maximum number of words this block will accept when text is injected from the tray.
   * Undefined on legacy blocks (created before the empty-block workflow); those blocks
   * are treated as full (no capacity) during distribution.
   */
  targetWordCount?: number
  /** When true, BPM is derived from targetWpm and wordsPerStack at edit time. */
  lockAtWpm?: boolean
  /** Target words-per-minute used when lockAtWpm is true. */
  targetWpm?: number

  // ── Per-block display overrides (undefined = inherit from project defaultConfig) ──
  pauseAtSentences?: boolean
  pauseAtHeadlines?: boolean
  fontSize?: number
  minFontSize?: number
  fontFamily?: string
  textColor?: string
  bgColor?: string
  highlightColor?: string
  highlightTextColor?: string
  highlightActive?: boolean
  showChunkDividers?: boolean
  stackGap?: number
  linesEnabled?: boolean
  linesCount?: number
  linesRowGap?: number
  stackVerticalOffset?: number
  stackHorizontalOffset?: number
}

/**
 * One child token inside a ScriptBlock.
 * Each token holds one WordStack derived from the block's source text.
 */
export interface ScriptToken {
  /** Globally unique index — equals position in the flat token array produced by flattenBlocks(). */
  id: number
  /** Id of the parent ScriptBlock this token belongs to. */
  blockId: number
  stack: WordStack
  /**
   * Wall-clock elapsed milliseconds from playback start when the user
   * advanced past this token in click-to-read mode.
   * null = not yet played or project is in BPM mode.
   */
  timestampMs: number | null
  /**
   * Optional per-token override of the parent block's config.
   * null = inherit all settings from the parent block.
   * Only bpm, wordsPerStack, and stacksVisible can be overridden here;
   * wordsPerStack overrides affect display only (the token's words are fixed at injection time).
   */
  configOverride: Partial<ScriptBlockConfig> | null
}

/**
 * A parent / master token — one injection unit.
 * Groups the child tokens produced by tokenizing sourceText with config.
 * Acts as the source of truth for BPM, chunk size, and chunk count.
 * Changing config here propagates to all children (unless they have individual overrides).
 */
export interface ScriptBlock {
  /** Stable id assigned at creation; never re-indexed even when other blocks are deleted. */
  id: number
  /** The original injected text before tokenization. */
  sourceText: string
  /** BPM, wordsPerStack, and stacksVisible for this block. */
  config: ScriptBlockConfig
  /** Child tokens derived from sourceText + config. */
  tokens: ScriptToken[]
}

/** The full serializable Script Builder project — round-trips to/from JSON. */
export interface ScriptProject {
  version: 3
  name: string
  createdAt: string
  updatedAt: string
  /** Original pasted source text, preserved so the user can inject more passages. */
  sourceText: string
  /** Project-wide defaults (timing, display, chunk rules). Used as base for new blocks and additional options. */
  defaultConfig: ScriptTokenConfig
  /** Ordered list of blocks (parent / master tokens). Source of truth for all playback content. */
  blocks: ScriptBlock[]
  /** Whether playback advances automatically by BPM or on user click. */
  displayStyle: 'bpm' | 'click-to-read'
  /** False until the user completes the setup modal on first open. */
  setupDone: boolean
}
