import { Muxer, ArrayBufferTarget } from 'mp4-muxer'
import { buildStacks, pauseMs } from './tokenizer'
import { resolveHighlightTextColor } from './highlightColor'
import { createMeasureWidth, type ReaderTextMeasurer } from './readerDisplayScale'
import { solveReaderLayout, type SolveReaderLayoutResult } from './readerLayoutSolver'
import { computeHighlightedSlots } from './highlightingEngine'
import { defaultReaderBg, defaultReaderFg } from './transmuteConfig'
import type { WordStack, TransmuteConfig } from '../types'

const VIDEO_FPS = 12
const KEYFRAME_INTERVAL_FRAMES = 48 // one keyframe per 4 seconds at 12fps
const TARGET_BITRATE_BPS = 200_000 // generous upper bound for simple text video
// Maximum frames queued inside VideoEncoder before we wait. Keeps GPU memory
// bounded during long exports (a ~55-min video has ~40 k frames at 12 fps).
const MAX_ENCODE_QUEUE = 30

// Layout constants mirroring the reader's CSS so the video matches the reader view.
//   .reader-stage   { padding: 40px 48px }
//   .stack-slot     { padding: 14px 28px }
//   .stack-words    { line-height: 1.2 }
//   .stack-headline { gap: 12px }
//   .headline-rule  { width: 40px; height: 2px; opacity: 0.5 }
const STAGE_PAD_X = 48
const STAGE_PAD_Y = 40
const SLOT_PAD_X = 28
const SLOT_PAD_Y = 14
const HEADLINE_RULE_W = 40
const HEADLINE_RULE_H = 2
const HEADLINE_RULE_GAP = 12
const HEADLINE_RULE_OPACITY = 0.5
const MIN_FONT_SIZE = 12
const ABSOLUTE_MIN_FONT_SIZE = 6
const TEXT_LINE_HEIGHT = 1.2
const TRANSMUTE_MAX_WORDS_PER_STACK = 20

// Progress overlay constants (used when config.showProgressOverlay is true)
const OVERLAY_RESERVED_W = 28     // extra left padding reserved for the overlay elements
const OVERLAY_BAR_X = 10          // x of the vertical progress bar strip
const OVERLAY_BAR_W = 5           // width of the vertical bar strip (px)
const OVERLAY_CHIP_X = 8          // x of the percentage text
const OVERLAY_CHIP_Y = 8          // y of the top of the percentage chip
const OVERLAY_CHIP_H = 20         // height of the chip area
const OVERLAY_FONT_SIZE = 10      // font size for percentage text (px)
const OVERLAY_BAR_GAP = 4         // gap between chip bottom and bar start (px)
const OVERLAY_BAR_BOTTOM_PAD = 10 // clearance from canvas bottom edge (px)

// ── Settings coverage notes ──────────────────────────────────────────────────
//
// SUPPORTED — mapped from Reader settings via TransmuteConfig:
//   bgColor, bgColorOverride, transparentBackground → drawFrame (bg fill logic)
//   bgColor, textColor, fontFamily, fontSize        → drawFrame
//   stackVerticalOffset                             → drawFrame (Y shift, all modes)
//   stackHorizontalOffset                           → drawFrame (X shift, all modes, clamped)
//   highlightActive, highlightColor, highlightTextColor, highlightMode,
//   highlightPanningChunkSize                      → drawFrame
//   linesEnabled, linesCount, linesRowGap, stacksVisible, stackGap → batching + layout
//   showChunkDividers                               → grid mode column separators
//   bpm, wordsPerStack, pauseAtSentences, pauseAtHeadlines → timing calculations
//   chunkRule*                                      → buildStacksForTransmute
//
// NOT APPLICABLE / GRACEFULLY SKIPPED:
//   tap_to_read / tap_to_read_key  — interactive user input; video is pre-recorded
//   metronome_enabled              — audio output; this renderer produces no audio track
//   view_style ('focal-points')    — requires NLP preprocessing not available in the renderer
//   theme                          — app chrome; colours are already resolved into bgColor/textColor
//   segmentation_*, auto_chapter_detection, summaries_initialized — text-processing flags, not display
//   chunk_rule_headlines           — always forced true in video (headlines always detected)

export function resolutionDimensions(res: TransmuteConfig['resolution']): {
  width: number
  height: number
} {
  switch (res) {
    case '1280x720':
      return { width: 1280, height: 720 }
    case '1920x1080':
      return { width: 1920, height: 1080 }
    case '1080x1920':
      return { width: 1080, height: 1920 }
    case '720x720':
      return { width: 720, height: 720 }
  }
}

/**
 * Trim content to the configured word limit while preserving newlines so the
 * tokenizer can still detect paragraphs and headlines.
 */
export function applyContentLimit(content: string, config: TransmuteConfig): string {
  if (config.contentLimitType === 'none') return content

  const totalWords = content.trim().split(/\s+/).filter(Boolean).length
  if (totalWords === 0) return content

  let targetCount: number
  if (config.contentLimitType === 'words') {
    targetCount = Math.max(1, config.contentLimitWords)
  } else {
    targetCount = Math.max(1, Math.round(totalWords * config.contentLimitPercentage / 100))
  }

  if (targetCount >= totalWords) return content

  // Walk the string character-by-character to preserve newlines
  let wordCount = 0
  let i = 0
  while (i < content.length && wordCount < targetCount) {
    while (i < content.length && /\s/.test(content[i])) i++
    if (i >= content.length) break
    while (i < content.length && !/\s/.test(content[i])) i++
    wordCount++
  }

  return content.slice(0, i)
}

export function buildStacksForTransmute(content: string, config: TransmuteConfig): WordStack[] {
  return buildStacks(content, config.wordsPerStack, {
    longWord: config.chunkRuleLongWord,
    enumerations: config.chunkRuleEnumerations,
    bullets: config.chunkRuleBullets,
    commas: config.chunkRuleCommas,
    names: config.chunkRuleNames,
    headlines: true // always detect headlines in video; chunk_rule_headlines is ignored
  }, TRANSMUTE_MAX_WORDS_PER_STACK)
}

export function estimateDuration(stacks: WordStack[], config: TransmuteConfig): number {
  const beatMs = 60_000 / config.bpm
  return stacks.reduce(
    (total, s) =>
      total +
      pauseMs(s.type, beatMs, {
        pauseAtSentences: config.pauseAtSentences,
        pauseAtHeadlines: config.pauseAtHeadlines
      }),
    0
  )
}

export function estimateFileSize(durationMs: number): number {
  return Math.round((durationMs / 1000) * TARGET_BITRATE_BPS / 8)
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Returns the number of stacks shown per video frame.
 *
 * Matches the reader's blockSize = linesCount × stacksVisible. The reader
 * always shows stacksVisible stacks per row; linesEnabled controls whether
 * multiple rows are stacked vertically.
 */
export function frameBatchSize(config: TransmuteConfig): number {
  const cols = Math.max(1, config.stacksVisible)
  const rows = (config.linesEnabled && config.linesCount > 1)
    ? Math.max(1, config.linesCount)
    : 1
  return rows * cols
}

type DrawContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
type MeasureTextContext = Pick<DrawContext, 'font' | 'measureText'>

export interface DisplayStack {
  words: string[]
  isHeadline: boolean
}

export interface ReaderLikeFrame {
  displayStacks: DisplayStack[]
  currentLineIdx: number
  currentSlotIdx: number
}

export interface VideoReaderLayout {
  cols: number
  rows: number
  leftPad: number
  stageWidth: number
  stageHeight: number
  layout: SolveReaderLayoutResult
}

function gridShape(config: TransmuteConfig, effectiveLinesCount?: number): { cols: number; rows: number; blockSize: number } {
  const cols = Math.max(1, config.stacksVisible)
  const configuredRows = (config.linesEnabled && config.linesCount > 1)
    ? Math.max(1, config.linesCount)
    : 1
  const rows = Math.max(1, Math.min(configuredRows, Math.floor(effectiveLinesCount ?? configuredRows)))
  return { cols, rows, blockSize: cols * rows }
}

export function buildReaderLikeFrame(
  stacks: WordStack[],
  currentIndex: number,
  config: TransmuteConfig,
  effectiveLinesCount?: number
): ReaderLikeFrame {
  const { cols, rows, blockSize } = gridShape(config, effectiveLinesCount)
  const safeIndex = clamp(currentIndex, 0, Math.max(0, stacks.length - 1))
  const blockIndex = safeIndex % blockSize
  const blockStart = safeIndex - blockIndex
  const currentLineIdx = Math.floor(blockIndex / cols)
  const currentSlotIdx = blockIndex % cols

  let revealUpToSlot = currentSlotIdx
  if ((config.highlightMode ?? 'default') === 'panning-bar') {
    const chunkSize = (config.highlightPanningChunkSize ?? 0) > 0
      ? config.highlightPanningChunkSize
      : cols
    if (currentSlotIdx % chunkSize === 0) {
      const halfChunk = Math.ceil(chunkSize / 2)
      revealUpToSlot = Math.min(currentSlotIdx + halfChunk - 1, cols - 1)
    }
  }

  const displayStacks = Array.from({ length: blockSize }, (_, flatIdx) => {
    const r = Math.floor(flatIdx / cols)
    const c = flatIdx % cols
    const visible =
      r < currentLineIdx || (r === currentLineIdx && c <= revealUpToSlot)
    if (visible) {
      const stackIdx = blockStart + r * cols + c
      if (stackIdx < stacks.length) {
        const s = stacks[stackIdx]
        return { words: s.words, isHeadline: s.type === 'headline' }
      }
    }
    return { words: [] as string[], isHeadline: false }
  })

  return { displayStacks, currentLineIdx, currentSlotIdx }
}

interface TextBoxMetrics {
  width: number
  ascent: number
  descent: number
  height: number
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

function fontSpec(size: number, family: string): string {
  return `bold ${Math.max(1, Math.round(size))}px ${family}`
}

function positiveMetric(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback
}

function measureTextBox(ctx: DrawContext, text: string, size: number, family: string): TextBoxMetrics {
  ctx.font = fontSpec(size, family)
  const metrics = ctx.measureText(text)
  const ascent = positiveMetric(metrics.actualBoundingBoxAscent, size * 0.8)
  const descent = positiveMetric(metrics.actualBoundingBoxDescent, size * 0.2)

  return {
    width: metrics.width,
    ascent,
    descent,
    height: Math.max(ascent + descent, size * TEXT_LINE_HEIGHT)
  }
}

function textFits(box: TextBoxMetrics, maxW: number, maxH: number): boolean {
  return box.width <= maxW && box.height <= maxH
}

function fitFontSize(
  ctx: DrawContext,
  text: string,
  family: string,
  baseSize: number,
  maxW: number,
  maxH: number
): { size: number; box: TextBoxMetrics } {
  let size = Math.max(ABSOLUTE_MIN_FONT_SIZE, Math.round(baseSize))
  let box = measureTextBox(ctx, text, size, family)
  const readableMin = Math.min(MIN_FONT_SIZE, size)

  while (size > readableMin && !textFits(box, maxW, maxH)) {
    const widthScale = box.width > 0 ? maxW / box.width : 1
    const heightScale = box.height > 0 ? maxH / box.height : 1
    const scale = Math.min(0.9, widthScale, heightScale)
    const nextSize = Math.max(readableMin, Math.floor(size * Math.max(0.2, scale)))
    size = nextSize < size ? nextSize : size - 1
    box = measureTextBox(ctx, text, size, family)
  }

  while (size > ABSOLUTE_MIN_FONT_SIZE && !textFits(box, maxW, maxH)) {
    size -= 1
    box = measureTextBox(ctx, text, size, family)
  }

  return { size, box }
}

function baselineForCenteredText(
  centerY: number,
  box: TextBoxMetrics,
  topBound: number,
  bottomBound: number
): number {
  const naturalBaseline = centerY + (box.ascent - box.descent) / 2
  const minBaseline = topBound + box.ascent
  const maxBaseline = bottomBound - box.descent

  if (minBaseline > maxBaseline) {
    return (topBound + bottomBound + box.ascent - box.descent) / 2
  }

  return clamp(naturalBaseline, minBaseline, maxBaseline)
}

function textCenterFromBaseline(baseline: number, box: TextBoxMetrics): number {
  return baseline + (box.descent - box.ascent) / 2
}

function headlineTextMaxWidth(maxW: number): number {
  return Math.max(20, maxW - 2 * (HEADLINE_RULE_W + HEADLINE_RULE_GAP))
}

function displayText(stack: { words: string[]; isHeadline: boolean }): string {
  const rawText = stack.words.join(' ')
  return stack.isHeadline ? rawText.toUpperCase() : rawText
}

function readerTheme(config: TransmuteConfig): 'dark' | 'light' {
  return config.theme === 'light' ? 'light' : 'dark'
}

function resolvedHighlightColor(config: TransmuteConfig, fallbackFg: string): string {
  return config.highlightColor || defaultReaderFg(readerTheme(config)) || fallbackFg
}

function resolvedHighlightText(config: TransmuteConfig): string {
  return resolveHighlightTextColor(config.highlightColor, config.highlightTextColor)
    ?? defaultReaderBg(readerTheme(config))
}

function effectiveLeftPad(config: TransmuteConfig): number {
  return STAGE_PAD_X + (config.showProgressOverlay ? OVERLAY_RESERVED_W : 0)
}

function stageWidth(width: number, leftPad: number): number {
  return Math.max(40, width - leftPad - STAGE_PAD_X)
}

function stageHeight(height: number): number {
  return Math.max(40, height - 2 * STAGE_PAD_Y)
}

function createContextMeasureWidth(ctx: DrawContext): ReaderTextMeasurer {
  return createMeasureWidth(() => ctx as MeasureTextContext)
}

export function resolveVideoReaderLayout(
  ctx: DrawContext,
  displayStacks: { words: string[]; isHeadline: boolean }[],
  config: TransmuteConfig,
  width: number,
  height: number,
  measureWidth: ReaderTextMeasurer = createContextMeasureWidth(ctx)
): VideoReaderLayout {
  const { cols, rows } = gridShape(config)
  const leftPad = effectiveLeftPad(config)
  const stageContentW = stageWidth(width, leftPad)
  const stageContentH = stageHeight(height)
  const layout = solveReaderLayout({
    stageWidth: stageContentW,
    stageHeight: stageContentH,
    stackTexts: displayStacks.map(displayText).filter(Boolean),
    stacksVisible: cols,
    wordsPerStack: config.wordsPerStack,
    fontSize: config.fontSize,
    linesCount: rows,
    stackGap: Math.max(0, config.stackGap ?? 32),
    rowGap: Math.max(0, config.linesRowGap ?? 8),
    stackVerticalOffset: config.stackVerticalOffset ?? 0,
    stackHorizontalOffset: config.stackHorizontalOffset ?? 0,
    fontFamily: config.fontFamily ? `${config.fontFamily}, sans-serif` : 'sans-serif',
    fontWeight: 700,
    measureWidth,
  })

  return {
    cols: layout.stacksVisible,
    rows: layout.effectiveLinesCount,
    leftPad,
    stageWidth: stageContentW,
    stageHeight: stageContentH,
    layout,
  }
}

/**
 * Render one video frame onto the canvas context.
 *
 * Routing:
 *   • effectiveCols=1 AND effectiveRows=1 → _drawSingleStackFrame (centred, with highlight)
 *   • effectiveCols>1 OR effectiveRows>1  → _drawGridFrame (multi-column / multi-row grid)
 *
 * effectiveCols = max(1, stacksVisible)
 * effectiveRows = linesEnabled && linesCount>1 ? linesCount : 1
 */
export function drawFrame(
  ctx: DrawContext,
  displayStacks: DisplayStack[],
  config: TransmuteConfig,
  width: number,
  height: number,
  progressFraction?: number,
  frameState?: Pick<ReaderLikeFrame, 'currentLineIdx' | 'currentSlotIdx'>,
  resolvedLayout?: VideoReaderLayout,
  layoutMeasureWidth?: ReaderTextMeasurer
): void {
  const bg = config.bgColorOverride || config.bgColor || defaultReaderBg(readerTheme(config))
  const fg = config.textColor || defaultReaderFg(readerTheme(config))
  const family = config.fontFamily ? `${config.fontFamily}, sans-serif` : 'sans-serif'

  if (!config.transparentBackground) {
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, width, height)
  } else {
    ctx.clearRect(0, 0, width, height)
  }

  if (displayStacks.length === 0) return

  const videoLayout = resolvedLayout ?? resolveVideoReaderLayout(ctx, displayStacks, config, width, height, layoutMeasureWidth)
  const effectiveCols = videoLayout.cols
  const effectiveRows = videoLayout.rows
  const currentLineIdx = frameState?.currentLineIdx ?? 0
  const currentSlotIdx = frameState?.currentSlotIdx ?? 0
  const isSlotHighlighted = computeHighlightedSlots(
    config.highlightMode ?? 'default',
    currentLineIdx,
    currentSlotIdx,
    effectiveCols,
    { chunkSize: config.highlightPanningChunkSize ?? 0 }
  )

  const drawableStacks = displayStacks.slice(0, effectiveCols * effectiveRows)

  if (effectiveCols > 1 || effectiveRows > 1) {
    _drawGridFrame(ctx, drawableStacks, config, width, height, fg, family, videoLayout, isSlotHighlighted)
  } else {
    _drawSingleStackFrame(ctx, drawableStacks[0], config, width, height, fg, family, videoLayout, isSlotHighlighted(0, 0))
  }

  if (config.showProgressOverlay && progressFraction !== undefined) {
    _drawProgressOverlay(ctx, config, width, height, progressFraction)
  }
}

function layoutBox(videoLayout: VideoReaderLayout): { x: number; y: number; width: number; height: number } {
  const { layout } = videoLayout
  return {
    x: videoLayout.leftPad + (videoLayout.stageWidth - layout.width) / 2 + layout.clampedHorizontalOffset,
    y: STAGE_PAD_Y + (videoLayout.stageHeight - layout.height) / 2 + layout.clampedVerticalOffset,
    width: layout.width,
    height: layout.height,
  }
}

function _drawSingleStackFrame(
  ctx: DrawContext,
  stack: DisplayStack,
  config: TransmuteConfig,
  width: number,
  height: number,
  fg: string,
  family: string,
  videoLayout: VideoReaderLayout,
  slotHighlighted: boolean
): void {
  const isHeadline = stack.isHeadline

  // Headlines are rendered uppercase to match .stack-headline { text-transform: uppercase }
  const text = displayText(stack)
  const readerFontSize = videoLayout.layout.effectiveFontSize
  const baseSize = isHeadline ? Math.round(readerFontSize * 0.7) : readerFontSize
  const boxLayout = layoutBox(videoLayout)

  // Available text width = solved content width minus slot padding on each side.
  const maxW = Math.max(40, boxLayout.width - 2 * SLOT_PAD_X)
  const maxTextW = isHeadline ? headlineTextMaxWidth(maxW) : maxW
  const maxTextH = Math.max(8, boxLayout.height - 2 * SLOT_PAD_Y)
  const { size, box } = fitFontSize(ctx, text, family, baseSize, maxTextW, maxTextH)

  const cx = boxLayout.x + boxLayout.width / 2
  const cy = boxLayout.y + boxLayout.height / 2

  const accentColor = resolvedHighlightColor(config, fg)

  const isHighlighted = config.highlightActive && slotHighlighted && stack.words.length > 0 && !isHeadline
  const pad = isHighlighted ? Math.round(size * 0.25) : 0
  const baseline = baselineForCenteredText(
    cy,
    box,
    STAGE_PAD_Y + SLOT_PAD_Y + pad,
    height - STAGE_PAD_Y - SLOT_PAD_Y - pad
  )
  const textCenterY = textCenterFromBaseline(baseline, box)
  const textW = box.width

  if (isHighlighted) {
    // Filled highlight box — matches reader's .stack-slot--active { background: highlightColor }
    const hColor = resolvedHighlightColor(config, fg)
    ctx.fillStyle = hColor
    ctx.fillRect(
      Math.round(cx - textW / 2 - pad),
      Math.round(baseline - box.ascent - pad),
      Math.round(textW + 2 * pad),
      Math.round(box.ascent + box.descent + 2 * pad)
    )
  }

  if (isHeadline) {
    // Decorative horizontal rules flanking headline text —
    // matches .headline-rule { width: 40px; height: 2px; opacity: 0.5 }
    const gap = HEADLINE_RULE_GAP
    const ruleY = Math.round(textCenterY - HEADLINE_RULE_H / 2)
    ctx.save()
    ctx.globalAlpha = HEADLINE_RULE_OPACITY
    ctx.fillStyle = accentColor
    ctx.fillRect(Math.round(cx - textW / 2 - gap - HEADLINE_RULE_W), ruleY, HEADLINE_RULE_W, HEADLINE_RULE_H)
    ctx.fillRect(Math.round(cx + textW / 2 + gap), ruleY, HEADLINE_RULE_W, HEADLINE_RULE_H)
    ctx.restore()
    ctx.fillStyle = isHighlighted ? resolvedHighlightText(config) : accentColor
  } else {
    ctx.fillStyle = isHighlighted ? resolvedHighlightText(config) : fg
  }

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(text, cx, baseline)
}

/**
 * Draw a multi-column / multi-row grid of stacks.
 *
 * Replaces the old _drawMultiLineFrame and also handles the single-row
 * multi-column case (effectiveRows=1, effectiveCols>1) that the reader
 * shows when stacksVisible>1 regardless of linesEnabled.
 *
 * Highlighting mirrors the reader's current slot predicate, including
 * progressive and panning-bar modes.
 */
function _drawGridFrame(
  ctx: DrawContext,
  displayStacks: DisplayStack[],
  config: TransmuteConfig,
  width: number,
  height: number,
  fg: string,
  family: string,
  videoLayout: VideoReaderLayout,
  isSlotHighlighted: (rowIdx: number, colIdx: number) => boolean
): void {
  const { cols, rows, layout } = videoLayout
  const colGap = layout.effectiveStackGap
  const rowGap = layout.effectiveRowGap
  const readerFontSize = layout.effectiveFontSize
  const boxLayout = layoutBox(videoLayout)

  const cellW = (boxLayout.width - (cols - 1) * colGap) / cols
  const cellH = (boxLayout.height - (rows - 1) * rowGap) / rows

  // Text fits within the slot padding area — matches reader's slot padding (28px each side)
  const maxTextW = Math.max(40, cellW - 2 * SLOT_PAD_X)

  const accentColor = resolvedHighlightColor(config, fg)
  const hColor = resolvedHighlightColor(config, fg)
  const hTextColor = resolvedHighlightText(config)

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const idx = row * cols + col
      if (idx >= displayStacks.length) break

      const stack = displayStacks[idx]
      const { isHeadline } = stack
      const text = displayText(stack)

      const cellX = boxLayout.x + col * (cellW + colGap)
      const cellY = boxLayout.y + row * (cellH + rowGap)
      const cx = cellX + cellW / 2
      const cy = cellY + cellH / 2

      const baseSize = isHeadline ? Math.round(readerFontSize * 0.7) : readerFontSize
      const textMaxW = isHeadline ? headlineTextMaxWidth(maxTextW) : maxTextW
      const textMaxH = Math.max(8, cellH - 2 * SLOT_PAD_Y)
      const { size, box } = fitFontSize(ctx, text, family, baseSize, textMaxW, textMaxH)
      const baseline = baselineForCenteredText(
        cy,
        box,
        Math.max(STAGE_PAD_Y + SLOT_PAD_Y, cellY + SLOT_PAD_Y),
        Math.min(height - STAGE_PAD_Y - SLOT_PAD_Y, cellY + cellH - SLOT_PAD_Y)
      )
      const textCenterY = textCenterFromBaseline(baseline, box)
      const textW = box.width
      const hasText = stack.words.length > 0
      const isActive = config.highlightActive && hasText && isSlotHighlighted(row, col) && !isHeadline

      if (isActive) {
        const pad = Math.round(size * 0.25)
        ctx.fillStyle = hColor
        ctx.fillRect(
          Math.round(cx - textW / 2 - pad),
          Math.round(baseline - box.ascent - pad),
          Math.round(textW + 2 * pad),
          Math.round(box.ascent + box.descent + 2 * pad)
        )
      }

      if (isHeadline) {
        // Decorative rules for headline cells in the grid
        const gap = HEADLINE_RULE_GAP
        const ruleY = Math.round(textCenterY - HEADLINE_RULE_H / 2)
        ctx.save()
        ctx.globalAlpha = HEADLINE_RULE_OPACITY
        ctx.fillStyle = accentColor
        ctx.fillRect(Math.round(cx - textW / 2 - gap - HEADLINE_RULE_W), ruleY, HEADLINE_RULE_W, HEADLINE_RULE_H)
        ctx.fillRect(Math.round(cx + textW / 2 + gap), ruleY, HEADLINE_RULE_W, HEADLINE_RULE_H)
        ctx.restore()
        ctx.fillStyle = isActive ? hTextColor : accentColor
      } else {
        ctx.fillStyle = isActive ? hTextColor : fg
      }

      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'
      ctx.fillText(text, cx, baseline)

      // Column divider to the right of this cell.
      if (col < cols - 1 && config.showChunkDividers) {
        const divX = Math.round(cellX + cellW + colGap / 2)
        ctx.strokeStyle = fg + '55' // semi-transparent
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(divX, cellY)
        ctx.lineTo(divX, cellY + cellH)
        ctx.stroke()
      }
    }
  }
}

function _drawProgressOverlay(
  ctx: DrawContext,
  config: TransmuteConfig,
  width: number,
  height: number,
  progress: number
): void {
  const fg = config.textColor || defaultReaderFg(readerTheme(config))
  const clamped = Math.min(1, Math.max(0, progress))
  const pct = Math.round(clamped * 100)

  ctx.save()

  // Percentage chip
  ctx.globalAlpha = 0.8
  ctx.font = `bold ${OVERLAY_FONT_SIZE}px sans-serif`
  ctx.fillStyle = fg
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(`${pct}%`, OVERLAY_CHIP_X, OVERLAY_CHIP_Y + OVERLAY_CHIP_H / 2)

  // Vertical progress bar
  const barYStart = OVERLAY_CHIP_Y + OVERLAY_CHIP_H + OVERLAY_BAR_GAP
  const barTotalH = height - barYStart - OVERLAY_BAR_BOTTOM_PAD
  const fillH = Math.round(barTotalH * clamped)

  // Track (unfilled portion)
  ctx.globalAlpha = 0.2
  ctx.fillStyle = fg
  ctx.fillRect(OVERLAY_BAR_X, barYStart, OVERLAY_BAR_W, barTotalH)

  // Fill (progress portion)
  ctx.globalAlpha = 0.8
  ctx.fillRect(OVERLAY_BAR_X, barYStart, OVERLAY_BAR_W, fillH)

  ctx.restore()
}

/** One block's worth of stacks paired with the fully-resolved display config for that block. */
export interface VideoSegment {
  stacks: WordStack[]
  config: TransmuteConfig
}

/**
 * Render a scripted sequence of VideoSegments into a single MP4 ArrayBuffer.
 * Each segment uses its own TransmuteConfig, so per-block display settings
 * (colors, font size, BPM, layout) are applied independently.
 * The encoder stays open across segments producing one contiguous video file.
 * Resolution is taken from the first segment's config and must be the same for all segments.
 */
export async function renderVideo(
  segments: VideoSegment[],
  onProgress: (pct: number) => void,
  signal?: AbortSignal
): Promise<ArrayBuffer> {
  const nonEmpty = segments.filter(s => s.stacks.length > 0)
  if (nonEmpty.length === 0) throw new Error('No content to render')

  const { width, height } = resolutionDimensions(nonEmpty[0].config.resolution)

  const totalStacks = nonEmpty.reduce((sum, s) => sum + s.stacks.length, 0)

  const target = new ArrayBufferTarget()
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width, height, frameRate: VIDEO_FPS },
    fastStart: 'in-memory'
  })

  let encoderError: Error | null = null
  let encoderClosed = false
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      if (meta) {
        muxer.addVideoChunk(chunk, meta)
      } else {
        muxer.addVideoChunk(chunk)
      }
    },
    error: (e) => {
      encoderError = e
    }
  })

  function closeEncoder() {
    if (!encoderClosed) {
      encoderClosed = true
      encoder.close()
    }
  }

  encoder.configure({
    codec: 'avc1.640029', // H.264 High Profile Level 4.1 — supports up to 1920×1080 and 1080×1920
    width,
    height,
    bitrate: TARGET_BITRATE_BPS,
    framerate: VIDEO_FPS
  })

  let currentTimeMicros = 0
  let framesEncoded = 0
  let processedStacks = 0

  for (const segment of nonEmpty) {
    const { stacks, config } = segment
    const beatMs = 60_000 / config.bpm
    const { blockSize } = gridShape(config)

    // A fresh canvas per segment prevents the GPU-backed texture from becoming
    // invalid between segments: closing a bitmap from the previous segment can
    // detach the shared texture backing the reused canvas, causing all subsequent
    // draw calls to produce blank frames.
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      closeEncoder()
      throw new Error('Could not get 2D context from OffscreenCanvas')
    }
    const layoutMeasureWidth = createContextMeasureWidth(ctx)

    for (let i = 0; i < stacks.length; i++) {
      if (signal?.aborted) {
        closeEncoder()
        throw new DOMException('Render cancelled', 'AbortError')
      }
      if (encoderError) {
        closeEncoder()
        throw encoderError
      }

      const configuredFrame = buildReaderLikeFrame(stacks, i, config)
      const configuredLayout = resolveVideoReaderLayout(ctx, configuredFrame.displayStacks, config, width, height, layoutMeasureWidth)
      const configuredRows = gridShape(config).rows
      const frame = configuredLayout.rows === configuredRows
        ? configuredFrame
        : buildReaderLikeFrame(stacks, i, config, configuredLayout.rows)

      const duration = pauseMs(stacks[i].type, beatMs, {
        pauseAtSentences: config.pauseAtSentences,
        pauseAtHeadlines: config.pauseAtHeadlines
      })
      const numFrames = Math.max(1, Math.round((duration * VIDEO_FPS) / 1000))
      const perFrameDurationMicros = Math.max(1, Math.round((duration * 1000) / numFrames))

      drawFrame(
        ctx,
        frame.displayStacks,
        config,
        width,
        height,
        config.showProgressOverlay ? processedStacks / totalStacks : undefined,
        frame,
        configuredLayout,
        layoutMeasureWidth
      )

      // Backpressure: let the encoder drain before submitting more frames.
      // Without this the encoder queue grows unbounded on long exports and GPU
      // driver resources are exhausted.
      while (encoder.encodeQueueSize > MAX_ENCODE_QUEUE) {
        await new Promise<void>(resolve => setTimeout(resolve, 0))
      }

      // transferToImageBitmap() is synchronous and zero-copy: it transfers the
      // canvas's existing backing buffer directly into a new ImageBitmap without
      // allocating or reading GPU memory. The canvas gets a fresh blank buffer for
      // the next drawFrame call. This is far faster than await createImageBitmap()
      // which performs an async GPU texture snapshot for every stack.
      const bitmap = canvas.transferToImageBitmap()

      for (let f = 0; f < numFrames; f++) {
        const frame = new VideoFrame(bitmap, {
          timestamp: currentTimeMicros,
          duration: perFrameDurationMicros
        })
        // Force a keyframe at the first frame of every segment so the H.264
        // decoder can independently decode each block without referencing GOP
        // frames from a prior segment.
        const keyFrame = (i === 0 && f === 0) || framesEncoded % KEYFRAME_INTERVAL_FRAMES === 0
        encoder.encode(frame, { keyFrame })
        frame.close()
        currentTimeMicros += perFrameDurationMicros
        framesEncoded++
      }

      bitmap.close()
      processedStacks++

      if (processedStacks % (100 * blockSize) === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
        onProgress(processedStacks / totalStacks)
      }
    }
  }

  await encoder.flush()
  closeEncoder()
  muxer.finalize()
  onProgress(1)

  return target.buffer
}
