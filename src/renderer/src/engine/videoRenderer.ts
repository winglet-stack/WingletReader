import { Muxer, ArrayBufferTarget } from 'mp4-muxer'
import { buildStacks, pauseMs } from './tokenizer'
import { resolveHighlightTextColor } from './highlightColor'
import { createMeasureWidth, type ReaderTextMeasurer } from './readerDisplayScale'
import {
  HEADLINE_RULE,
  INITIAL_REVEAL_STATE,
  deriveFullBlockFrame,
  deriveReaderFrame,
  readerStageContentBox,
  type ReaderFrame,
  type ReaderFrameConfig,
  type ReaderFrameSlot,
  type ReaderStageBox,
} from './readerFrame'
import type { RevealState } from './stackLayout'
import { defaultReaderBg, defaultReaderFg } from './transmuteConfig'
import type { WordStack, TransmuteConfig } from '../types'

const VIDEO_FPS = 12
const KEYFRAME_INTERVAL_FRAMES = 48 // one keyframe per 4 seconds at 12fps
const TARGET_BITRATE_BPS = 200_000 // generous upper bound for simple text video
// Maximum frames queued inside VideoEncoder before we wait. Keeps GPU memory
// bounded during long exports (a ~55-min video has ~40 k frames at 12 fps).
const MAX_ENCODE_QUEUE = 30

// Geometry is not decided here. Every size, gap, position, reveal and divider
// state comes from the reader frame (`engine/readerFrame.ts`); this module maps
// that description onto a canvas and nothing more. The numbers below are the
// canvas medium's own: how a filled shape stands in for a CSS background, and the
// progress overlay, which has no reader counterpart at all.
const HIGHLIGHT_BOX_PAD_RATIO = 0.25 // filled highlight box inset, as a fraction of the slot font size
const DIVIDER_LINE_ALPHA_HEX = '55' // ≈ .stack-divider's 0.5 opacity, as an alpha suffix
const DIVIDER_DOT_SIZE = 10 // .stack-divider--dot::after — dormant (focal-points view)
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
//   textColor                                       → drawFrame (colour resolution)
//   highlightColor, highlightTextColor              → drawFrame (colour resolution)
//   fontFamily, fontSize, stackVerticalOffset, stackHorizontalOffset,
//   linesCount, linesRowGap, stacksVisible, stackGap, showChunkDividers,
//   highlightActive, highlightMode, highlightPanningChunkSize
//                                                   → readerFrameConfigFromTransmute,
//                                                     then the reader frame decides
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
 * always shows stacksVisible stacks per row; a linesCount of 1 is single-line.
 */
export function frameBatchSize(config: TransmuteConfig): number {
  const cols = Math.max(1, config.stacksVisible)
  const rows = Math.max(1, config.linesCount)
  return rows * cols
}

type DrawContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
type MeasureTextContext = Pick<DrawContext, 'font' | 'measureText'>

/** A reader frame plus the canvas box it was solved against. */
export interface VideoReaderFrame {
  frame: ReaderFrame
  /** Content box inside the canvas — the box `frame.geometry` is positioned in. */
  stage: ReaderStageBox
  /** Canvas dimensions, so the painter needs no second source for them. */
  width: number
  height: number
}

/**
 * TransmuteConfig → ReaderFrameConfig.
 *
 * The Transmute config carries camelCase twins of the snake_case reader settings;
 * the frame module speaks reader settings, so the conversion happens here, at the
 * painter's edge, and nothing camelCase reaches the frame module.
 *
 * Two fields have no Transmute twin: video has no line-box anchor of its own (the
 * stage is always centred) and focal-points view is unavailable in the renderer
 * (see the settings-coverage notes above).
 */
function readerFrameConfigFromTransmute(config: TransmuteConfig): ReaderFrameConfig {
  return {
    stacksVisible: Math.max(1, config.stacksVisible),
    wordsPerStack: Math.max(1, config.wordsPerStack),
    linesCount: Math.max(1, config.linesCount),
    linesAnchor: 'center',
    fontSize: config.fontSize,
    stackGap: Math.max(0, config.stackGap ?? 32),
    rowGap: Math.max(0, config.linesRowGap ?? 8),
    stackVerticalOffset: config.stackVerticalOffset ?? 0,
    stackHorizontalOffset: config.stackHorizontalOffset ?? 0,
    fontFamily: videoFontFamily(config),
    fontWeight: 700,
    highlightActive: config.highlightActive,
    highlightMode: config.highlightMode ?? 'default',
    highlightPanningChunkSize: config.highlightPanningChunkSize ?? 0,
    focalPointsView: false,
    showChunkDividers: config.showChunkDividers,
  }
}

function videoFontFamily(config: TransmuteConfig): string {
  return config.fontFamily ? `${config.fontFamily}, sans-serif` : 'sans-serif'
}

function createContextMeasureWidth(ctx: DrawContext): ReaderTextMeasurer {
  return createMeasureWidth(() => ctx as MeasureTextContext)
}

/** The stage content box for a canvas of this size, overlay reservation included. */
function videoStageBox(config: TransmuteConfig, width: number, height: number): ReaderStageBox {
  return readerStageContentBox({
    width,
    height,
    extraLeftInset: config.showProgressOverlay ? OVERLAY_RESERVED_W : 0,
  })
}

export interface BuildVideoFrameInput {
  ctx: DrawContext
  stacks: WordStack[]
  currentIndex: number
  config: TransmuteConfig
  width: number
  height: number
  /** Sticky reveal carried in from the previous frame. Omit for a fresh sequence. */
  reveal?: RevealState
  /** Reuse one measurer across a sequence so its text cache survives. */
  measureWidth?: ReaderTextMeasurer
}

/**
 * The frame for one beat of the exported video.
 *
 * Every geometric decision — block position, reveal, reserved-but-empty slots,
 * font size, gaps, effective line count, headline treatment, divider state —
 * belongs to the frame module. This function only supplies the stage box the
 * canvas provides in place of a measured DOM element.
 */
export function buildVideoFrame(input: BuildVideoFrameInput): VideoReaderFrame {
  const { ctx, stacks, currentIndex, config, width, height } = input
  const stage = videoStageBox(config, width, height)
  const frame = deriveReaderFrame({
    stacks,
    currentIndex,
    config: readerFrameConfigFromTransmute(config),
    stage,
    measureWidth: input.measureWidth ?? createContextMeasureWidth(ctx),
    reveal: input.reveal ?? INITIAL_REVEAL_STATE,
  })

  return { frame, stage, width, height }
}

/**
 * The frame a still preview shows: one complete block, at the beat where the
 * line box is full (see `fullBlockFrameInputs`).
 */
export function buildVideoPreviewFrame(input: Omit<BuildVideoFrameInput, 'currentIndex' | 'reveal'>): VideoReaderFrame {
  const { ctx, stacks, config, width, height } = input
  const stage = videoStageBox(config, width, height)
  const frame = deriveFullBlockFrame({
    stacks,
    config: readerFrameConfigFromTransmute(config),
    stage,
    measureWidth: input.measureWidth ?? createContextMeasureWidth(ctx),
  })

  return { frame, stage, width, height }
}

interface TextBoxMetrics {
  width: number
  ascent: number
  descent: number
}

/**
 * Canvas font at a size the frame already decided. A fractional solved size (the
 * solver's stage-4 release valve produces them) is floored rather than rounded, so
 * a whole-pixel canvas never paints wider than the size that was solved to fit.
 */
function fontSpec(size: number, family: string): string {
  return `bold ${Math.max(1, Math.floor(size))}px ${family}`
}

function positiveMetric(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback
}

/**
 * Canvas text metrics at an already-decided size. This measures where the glyphs
 * sit on their baseline; it never chooses the size.
 */
function measureTextBox(ctx: DrawContext, text: string, size: number, family: string): TextBoxMetrics {
  ctx.font = fontSpec(size, family)
  const metrics = ctx.measureText(text)

  return {
    width: metrics.width,
    ascent: positiveMetric(metrics.actualBoundingBoxAscent, size * 0.8),
    descent: positiveMetric(metrics.actualBoundingBoxDescent, size * 0.2),
  }
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

function frameHasContent(frame: ReaderFrame): boolean {
  return frame.rows.some((row) => row.slots.some((slot) => slot.stack !== null))
}

/**
 * Render one video frame onto the canvas context.
 *
 * This is a painter: it maps the reader frame onto canvas primitives and decides
 * nothing about geometry. Colours are the one thing it resolves itself — the DOM
 * painter gets them from CSS variables, which a canvas does not have.
 */
export function drawFrame(
  ctx: DrawContext,
  videoFrame: VideoReaderFrame,
  config: TransmuteConfig,
  progressFraction?: number
): void {
  const { frame, width, height } = videoFrame
  const bg = config.bgColorOverride || config.bgColor || defaultReaderBg(readerTheme(config))

  if (!config.transparentBackground) {
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, width, height)
  } else {
    ctx.clearRect(0, 0, width, height)
  }

  if (!frameHasContent(frame)) return

  _drawStackGrid(ctx, videoFrame, config)

  if (config.showProgressOverlay && progressFraction !== undefined) {
    _drawProgressOverlay(ctx, config, width, height, progressFraction)
  }
}

/** Where the solved content box sits inside the stage box. */
function contentOrigin(videoFrame: VideoReaderFrame): { x: number; y: number } {
  const { stage, frame } = videoFrame
  const { geometry } = frame

  return {
    x: stage.x + (stage.width - geometry.contentWidth) / 2 + geometry.horizontalOffset,
    y: geometry.anchor === 'top'
      ? stage.y + geometry.verticalOffset
      : stage.y + (stage.height - geometry.contentHeight) / 2 + geometry.verticalOffset,
  }
}

/** Paint every row and slot of the frame. Reserved-but-empty slots hold their space. */
function _drawStackGrid(ctx: DrawContext, videoFrame: VideoReaderFrame, config: TransmuteConfig): void {
  const { frame } = videoFrame
  const { geometry } = frame
  const cols = frame.stacksVisible
  const origin = contentOrigin(videoFrame)
  const cellWidth = (geometry.contentWidth - Math.max(0, cols - 1) * geometry.stackGap) / cols
  const cellHeight = geometry.rowHeight
  const family = videoFontFamily(config)
  const fg = config.textColor || defaultReaderFg(readerTheme(config))
  // Headline text uses var(--accent) in the reader; the video has no accent of its
  // own and has always drawn headlines in the highlight colour.
  const accent = resolvedHighlightColor(config, fg)
  const colors: FrameColors = {
    fg,
    accent,
    highlight: accent,
    highlightText: resolvedHighlightText(config),
  }

  for (const row of frame.rows) {
    const cellY = origin.y + row.rowIndex * (cellHeight + geometry.rowGap)
    // Adjacent highlighted slots read as one bar, so the divider between them needs
    // the box its left neighbour painted (.stack-slot--connected-left/right).
    let leftHighlight: CellBox | null = null

    for (const slot of row.slots) {
      const cellX = origin.x + slot.colIndex * (cellWidth + geometry.stackGap)
      const highlight = slot.stack === null
        ? null
        : _drawSlotText(ctx, slot, {
          x: cellX,
          y: cellY,
          width: cellWidth,
          height: cellHeight,
        }, family, colors)

      if (slot.divider) {
        _drawDivider(
          ctx,
          slot.divider,
          { x: cellX - geometry.stackGap, y: cellY, width: geometry.stackGap, height: cellHeight },
          colors,
          leftHighlight,
          highlight
        )
      }

      leftHighlight = highlight
    }
  }
}

interface FrameColors {
  fg: string
  accent: string
  highlight: string
  highlightText: string
}

interface CellBox {
  x: number
  y: number
  width: number
  height: number
}

/** Paints one slot; returns the highlight box it filled, if any. */
function _drawSlotText(
  ctx: DrawContext,
  slot: ReaderFrameSlot,
  cell: CellBox,
  family: string,
  colors: FrameColors
): CellBox | null {
  // `displayText` is already uppercased for headlines and `fontSize` already
  // carries the headline scale — the frame decided both.
  const text = slot.displayText
  const box = measureTextBox(ctx, text, slot.fontSize, family)
  const cx = cell.x + cell.width / 2
  const cy = cell.y + cell.height / 2
  const baseline = cy + (box.ascent - box.descent) / 2
  const textCenterY = baseline + (box.descent - box.ascent) / 2

  // A headline keeps its own treatment instead of the filled highlight box, as
  // it does in the exported video today.
  const highlighted = slot.highlighted && !slot.isHeadline
  let highlightBox: CellBox | null = null

  if (highlighted) {
    // Filled box behind the words — the canvas form of .stack-slot--active.
    const pad = Math.round(slot.fontSize * HIGHLIGHT_BOX_PAD_RATIO)
    highlightBox = {
      x: Math.round(cx - box.width / 2 - pad),
      y: Math.round(baseline - box.ascent - pad),
      width: Math.round(box.width + 2 * pad),
      height: Math.round(box.ascent + box.descent + 2 * pad),
    }
    ctx.fillStyle = colors.highlight
    ctx.fillRect(highlightBox.x, highlightBox.y, highlightBox.width, highlightBox.height)
  }

  if (slot.isHeadline) {
    const ruleY = Math.round(textCenterY - HEADLINE_RULE.height / 2)
    ctx.save()
    ctx.globalAlpha = HEADLINE_RULE.opacity
    ctx.fillStyle = colors.accent
    ctx.fillRect(
      Math.round(cx - box.width / 2 - HEADLINE_RULE.gap - HEADLINE_RULE.width),
      ruleY,
      HEADLINE_RULE.width,
      HEADLINE_RULE.height
    )
    ctx.fillRect(Math.round(cx + box.width / 2 + HEADLINE_RULE.gap), ruleY, HEADLINE_RULE.width, HEADLINE_RULE.height)
    ctx.restore()
    ctx.fillStyle = highlighted ? colors.highlightText : colors.accent
  } else {
    ctx.fillStyle = highlighted ? colors.highlightText : colors.fg
  }

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(text, cx, baseline)

  return highlightBox
}

/**
 * The divider in the gap to a slot's left, in whichever state the frame reports.
 *
 * An **active** divider is the reader's connected highlight (.stack-divider--active
 * plus .stack-slot--connected-left/right): the two adjacent highlight boxes are
 * joined into one continuous bar. An inactive visible divider is the hairline rule,
 * and a dot belongs to the dormant focal-points view.
 */
function _drawDivider(
  ctx: DrawContext,
  divider: NonNullable<ReaderFrameSlot['divider']>,
  gap: CellBox,
  colors: FrameColors,
  leftHighlight: CellBox | null,
  rightHighlight: CellBox | null
): void {
  if (!divider.visible || gap.width <= 0) return

  if (divider.kind === 'dot') {
    ctx.fillStyle = colors.fg
    ctx.beginPath()
    ctx.arc(gap.x + gap.width / 2, gap.y + gap.height / 2, DIVIDER_DOT_SIZE / 2, 0, Math.PI * 2)
    ctx.fill()
    return
  }

  if (divider.active && leftHighlight && rightHighlight) {
    const from = leftHighlight.x + leftHighlight.width
    const top = Math.min(leftHighlight.y, rightHighlight.y)
    const bottom = Math.max(
      leftHighlight.y + leftHighlight.height,
      rightHighlight.y + rightHighlight.height
    )
    ctx.fillStyle = colors.highlight
    ctx.fillRect(Math.round(from), Math.round(top), Math.round(rightHighlight.x - from), Math.round(bottom - top))
    return
  }

  const lineX = Math.round(gap.x + gap.width / 2)
  ctx.strokeStyle = colors.fg + DIVIDER_LINE_ALPHA_HEX
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(lineX, gap.y)
  ctx.lineTo(lineX, gap.y + gap.height)
  ctx.stroke()
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
    const blockSize = frameBatchSize(config)

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
    const measureWidth = createContextMeasureWidth(ctx)
    // Sticky reveal is frame state threaded through the sequence, exactly as the
    // live reader carries it — a segment starts from rest.
    let reveal: RevealState = INITIAL_REVEAL_STATE

    for (let i = 0; i < stacks.length; i++) {
      if (signal?.aborted) {
        closeEncoder()
        throw new DOMException('Render cancelled', 'AbortError')
      }
      if (encoderError) {
        closeEncoder()
        throw encoderError
      }

      const videoFrame = buildVideoFrame({
        ctx,
        stacks,
        currentIndex: i,
        config,
        width,
        height,
        reveal,
        measureWidth,
      })
      reveal = videoFrame.frame.reveal

      const duration = pauseMs(stacks[i].type, beatMs, {
        pauseAtSentences: config.pauseAtSentences,
        pauseAtHeadlines: config.pauseAtHeadlines
      })
      const numFrames = Math.max(1, Math.round((duration * VIDEO_FPS) / 1000))
      const perFrameDurationMicros = Math.max(1, Math.round((duration * 1000) / numFrames))

      drawFrame(
        ctx,
        videoFrame,
        config,
        config.showProgressOverlay ? processedStacks / totalStacks : undefined
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
