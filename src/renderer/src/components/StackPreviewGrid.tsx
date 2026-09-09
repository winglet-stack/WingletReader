import React from 'react'
import { resolveHighlightTextColor } from '../engine/highlightColor'
import { buildReaderCssVars } from '../engine/readerCssVars'
import { createMeasureWidth } from '../engine/readerDisplayScale'
import {
  deriveFullBlockFrame,
  type ReaderFrameConfig,
  type ReaderFrameRow,
  type ReaderFrameSlot,
  type ReaderFrameStage,
} from '../engine/readerFrame'
import type { WordStack } from '../types'
import type { ReaderLinesAnchor } from '../../../shared/settings'

const WORDS = [
  ['the', 'quick'], ['brown', 'fox'], ['jumps', 'over'], ['the', 'lazy'],
  ['dog', 'runs'], ['fast', 'and'], ['leaps', 'high'], ['into', 'view'],
]

/**
 * The preview has no measured stage, so the frame is solved against an unmeasured
 * one: the configured font, gaps, line count and offsets come back unchanged. The
 * preview shows settings as configured — it is not a fit test.
 */
const UNMEASURED_STAGE: ReaderFrameStage = { width: 0, height: 0 }

const measureWidth = createMeasureWidth()

export interface StackPreviewGridProps {
  fontSize: number
  fontFamily: string
  textColor: string
  highlightColor: string
  highlightTextColor: string
  highlightActive: boolean
  bgColor: string
  showChunkDividers: boolean
  stacksVisible: number
  stackGap: number
  stackVerticalOffset: number
  stackHorizontalOffset: number
  /** Effective reserved row count; derive from settings with `effectiveLinesCount`. */
  linesCount: number
  /** Resolved line-box anchor; derive from settings with `resolvedLinesAnchor`. */
  linesAnchor: ReaderLinesAnchor
  linesRowGap: number
  wordsPerStack: number
  /** Scale applied to offset transforms. 1.0 for full-size, 0.25 for mini preview. Default: 1. */
  offsetScale?: number
  /** Cap on rendered stack columns; shows overflow indicator when truncated. Omit for no cap. */
  maxStacks?: number
  /** Cap on rendered rows. Omit for no cap. */
  maxRows?: number
  /** CSS class applied to the outer stage element. Default: 'spg-stage'. */
  stageClassName?: string
}

/** Canned sample text, one stack per slot of the previewed block. */
function sampleStacks(colCount: number, rowCount: number, wordsPerStack: number): WordStack[] {
  return Array.from({ length: colCount * rowCount }, (_, index) => ({
    words: WORDS[index % WORDS.length].slice(0, Math.min(wordsPerStack, 2)),
    type: 'normal' as const,
  }))
}

/** The divider the frame describes, or an empty grid cell holding its column. */
function PreviewDivider({ divider }: { divider: ReaderFrameSlot['divider'] }) {
  if (!divider) return null
  if (!divider.visible) return <div aria-hidden="true" />
  return (
    <div
      className={`stack-divider${divider.active ? ' stack-divider--active' : ''}`}
      aria-hidden="true"
    />
  )
}

function PreviewSlot({ slot }: { slot: ReaderFrameSlot }) {
  return (
    <div className={slot.slotClass} style={{ padding: '6px 12px' }}>
      <span className="stack-words" style={{ fontSize: `${slot.fontSize}px`, whiteSpace: 'nowrap' }}>
        {slot.displayText}
      </span>
    </div>
  )
}

function PreviewRow({ row, gridTemplateColumns }: { row: ReaderFrameRow; gridTemplateColumns: string }) {
  return (
    <div className="reader-stack-row" style={{ gridTemplateColumns }}>
      {row.slots.map((slot) => (
        <React.Fragment key={slot.colIndex}>
          <PreviewDivider divider={slot.divider} />
          <PreviewSlot slot={slot} />
        </React.Fragment>
      ))}
    </div>
  )
}

/** The reader-settings config the preview describes, caps already applied. */
function previewFrameConfig(props: StackPreviewGridProps, colCount: number, rowCount: number): ReaderFrameConfig {
  return {
    stacksVisible: Math.max(1, colCount),
    wordsPerStack: props.wordsPerStack,
    linesCount: Math.max(1, rowCount),
    linesAnchor: props.linesAnchor,
    fontSize: props.fontSize,
    stackGap: props.stackGap,
    rowGap: props.linesRowGap,
    stackVerticalOffset: props.stackVerticalOffset,
    stackHorizontalOffset: props.stackHorizontalOffset,
    fontFamily: props.fontFamily,
    fontWeight: 700,
    highlightActive: props.highlightActive,
    highlightMode: 'default',
    highlightPanningChunkSize: 0,
    focalPointsView: false,
    showChunkDividers: props.showChunkDividers,
  }
}

function previewCssVars(props: StackPreviewGridProps): React.CSSProperties {
  return buildReaderCssVars({
    highlightColor: props.highlightActive ? props.highlightColor : '',
    stageBgColor: props.bgColor,
    textColor: props.textColor,
    fontFamily: props.fontFamily,
    highlightTextColor: props.highlightActive
      ? resolveHighlightTextColor(props.highlightColor, props.highlightTextColor)
      : null,
  }) as React.CSSProperties
}

function cappedCount(configured: number, cap: number | undefined): number {
  return cap === undefined ? configured : Math.min(configured, cap)
}

/**
 * DOM painter for a still reader frame.
 *
 * Like the live grid and the video exporter, it makes no geometric decision of its
 * own: font size, gaps, columns, offsets, highlight and divider state all come from
 * `engine/readerFrame.ts`. What it does own is how much of the frame to show — the
 * `maxStacks` / `maxRows` caps keep a compact preview compact, and the frame is
 * built at that reduced size with a "+ N more" note rather than being cropped.
 */
export default function StackPreviewGrid(props: StackPreviewGridProps) {
  const { stacksVisible, maxStacks, offsetScale = 1, stageClassName = 'spg-stage' } = props
  const colCount = cappedCount(stacksVisible, maxStacks)
  const rowCount = cappedCount(props.linesCount, props.maxRows)

  const config = previewFrameConfig(props, colCount, rowCount)
  const frame = deriveFullBlockFrame({
    stacks: sampleStacks(config.stacksVisible, config.linesCount, props.wordsPerStack),
    config,
    stage: UNMEASURED_STAGE,
    measureWidth,
  })
  const { geometry } = frame

  return (
    <div
      className={stageClassName}
      data-lines-anchor={geometry.anchor}
      style={{ ...previewCssVars(props), alignItems: geometry.anchor === 'top' ? 'flex-start' : 'center' }}
    >
      <div
        className="spg-inner"
        style={{
          transform: `translateY(${Math.round(geometry.verticalOffset * offsetScale)}px) translateX(${Math.round(geometry.horizontalOffset * offsetScale)}px)`,
          gap: geometry.linesCount > 1 ? `${geometry.rowGap}px` : undefined,
        }}
      >
        {frame.rows.map((row) => (
          <PreviewRow key={row.rowIndex} row={row} gridTemplateColumns={geometry.gridTemplateColumns} />
        ))}
        {stacksVisible > colCount && (
          <div className="spg-more">+ {stacksVisible - colCount} more</div>
        )}
      </div>
    </div>
  )
}
