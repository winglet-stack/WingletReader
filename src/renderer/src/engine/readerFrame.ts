/**
 * Reader frame — one complete description of what belongs on the reading stage.
 *
 * Given stacks, the current index, the reader configuration and the measured stage
 * box, `deriveReaderFrame` returns every decision a painter needs: rows and slots
 * (including the reserved-but-empty ones the Line box holds open — ADR-0032), which
 * slots are revealed, which are highlighted, the solved font/gaps/line count, the
 * headline treatment per slot, and each divider's state.
 *
 * Painters (DOM, canvas, preview) map this description to their medium and make no
 * geometric decision of their own.
 *
 * Two sequencing details live here rather than in any painter:
 *
 *  1. **The two-pass configured-then-effective line count.** The block is first
 *     derived at the *configured* line count so the solver measures the strings that
 *     configuration would show; the solver may then reduce the line count, and the
 *     block is derived a second time at the *effective* count. `solveReaderFrameLayout`
 *     is pass one, `composeReaderFrame` is pass two, and `deriveReaderFrame` runs both.
 *  2. **Sticky reveal.** The reveal high-water mark is an explicit input (`reveal`) and
 *     an explicit output (`frame.reveal`) — never ambient state mutated while painting.
 *     Callers store the returned value and hand it back on the next frame.
 */

import { computeHighlightedSlots } from './highlightingEngine'
import { READER_MIN_VISIBLE_FONT_SIZE, type ReaderTextMeasurer } from './readerDisplayScale'
import {
  rowHeightAtFont,
  solveReaderLayout,
  type ReaderLayoutDegradationDescriptor,
  type SolveReaderLayoutResult,
} from './readerLayoutSolver'
import {
  buildDisplayRows,
  buildGridTemplateColumns,
  deriveBlockPosition,
  deriveSlotPresentation,
  nextRevealState,
  panningBarRevealUpToSlot,
  type BlockPosition,
  type RevealState,
} from './stackLayout'
import type { WordStack } from '../types'
import type { HighlightMode, ReaderLinesAnchor } from '../../../shared/settings'

/** Headline stacks render at this fraction of the frame's effective font size. */
export const HEADLINE_FONT_SCALE = 0.7

/**
 * The decorative rules flanking a headline stack, in px.
 *
 * The DOM painter gets these from the stylesheet (`.headline-rule` and
 * `.stack-headline`'s gap, which mirror these values); a canvas painter has no
 * stylesheet, so it reads them here rather than transcribing the CSS itself.
 */
export const HEADLINE_RULE = { width: 40, height: 2, gap: 12, opacity: 0.5 } as const

/**
 * Inset from the stage element's own edge to the box the frame is solved against
 * (`.reader-stage { padding: 40px 48px }`).
 *
 * The DOM painter never needs this — it measures the padded content box directly.
 * A painter without a layout engine (canvas) subtracts it with
 * `readerStageContentBox` instead of carrying its own copy of the number.
 */
const READER_STAGE_INSET = { x: 48, y: 40 } as const

/** Smallest content box the stage will report, however small the surface is. */
const MIN_STAGE_EXTENT = 40

/** Reveal state before any row has been painted. */
export const INITIAL_REVEAL_STATE: RevealState = { lineKey: -1, revealUpTo: 0 }

/**
 * Everything the frame needs from reader configuration, already resolved.
 * `linesCount` is the *configured* count — the solver decides the effective one.
 */
export interface ReaderFrameConfig {
  stacksVisible: number
  wordsPerStack: number
  linesCount: number
  linesAnchor: ReaderLinesAnchor
  fontSize: number
  stackGap: number
  rowGap: number
  stackVerticalOffset: number
  stackHorizontalOffset: number
  fontFamily?: string
  fontWeight?: string | number
  comfortFontSize?: number
  highlightActive: boolean
  highlightMode: HighlightMode
  highlightPanningChunkSize: number
  /** Dormant since ADR-0019 §4; the description keeps the capability. */
  focalPointsView: boolean
  /** Dormant since ADR-0019 §4; the description keeps the capability. */
  showChunkDividers: boolean
}

/** Measured stage box the frame is solved against. */
export interface ReaderFrameStage {
  width: number
  height: number
}

/** A stage content box that also knows where it sits inside its surface. */
export interface ReaderStageBox extends ReaderFrameStage {
  x: number
  y: number
}

/**
 * The content box inside a stage surface of the given size — the box
 * `deriveReaderFrame` is solved against, and the origin a painter positions
 * the solved content in.
 *
 * `extraLeftInset` reserves surface-specific room along the left edge (the video
 * exporter's progress overlay uses it); it narrows the box exactly as extra
 * padding would.
 */
export function readerStageContentBox(params: {
  width: number
  height: number
  extraLeftInset?: number
}): ReaderStageBox {
  const left = READER_STAGE_INSET.x + Math.max(0, params.extraLeftInset ?? 0)
  return {
    x: left,
    y: READER_STAGE_INSET.y,
    width: Math.max(MIN_STAGE_EXTENT, params.width - left - READER_STAGE_INSET.x),
    height: Math.max(MIN_STAGE_EXTENT, params.height - 2 * READER_STAGE_INSET.y),
  }
}

export interface ReaderFrameLayoutInput {
  stacks: WordStack[]
  currentIndex: number
  config: ReaderFrameConfig
  stage: ReaderFrameStage
  measureWidth: ReaderTextMeasurer
}

export interface ReaderFrameInput extends ReaderFrameLayoutInput {
  /** Sticky reveal state carried in from the previous frame. */
  reveal: RevealState
}

export interface ReaderFrameDivider {
  kind: 'dot' | 'bar'
  active: boolean
  visible: boolean
}

export interface ReaderFrameSlot {
  rowIndex: number
  colIndex: number
  /** Index into `stacks` this slot addresses — set even when the slot is reserved-but-empty. */
  stackIndex: number
  /** null ⇒ reserved-but-empty: the slot holds its space but shows nothing. */
  stack: WordStack | null
  /** Words as written; empty for a reserved-but-empty slot. */
  text: string
  /** Text as painted — uppercased for headlines, matching `.stack-headline`. */
  displayText: string
  isHeadline: boolean
  /** Font size for this slot, headline scaling already applied. */
  fontSize: number
  /** True when playback has reached this slot in the current block. */
  revealed: boolean
  highlighted: boolean
  /** Full DOM class string for the slot cell, including connected-highlight modifiers. */
  slotClass: string
  /** null for column 0 and for every reserved future row. */
  divider: ReaderFrameDivider | null
}

export interface ReaderFrameRow {
  rowIndex: number
  isCurrentRow: boolean
  /** Reserved but not yet reached — holds height, paints no content and no dividers. */
  isFutureRow: boolean
  slots: ReaderFrameSlot[]
}

/** The solved geometry every painter shares. */
export interface ReaderFrameGeometry {
  fontSize: number
  rowHeight: number
  stackGap: number
  rowGap: number
  linesCount: number
  anchor: ReaderLinesAnchor
  verticalOffset: number
  horizontalOffset: number
  gridTemplateColumns: string
  contentWidth: number
  contentHeight: number
  degradation: ReaderLayoutDegradationDescriptor
}

export interface ReaderFrame {
  rows: ReaderFrameRow[]
  block: BlockPosition
  stacksVisible: number
  wordsPerStack: number
  /** Highest slot index revealed in the current row, after the sticky high-water mark. */
  revealUpToSlot: number
  /** Sticky reveal state to carry into the next frame. */
  reveal: RevealState
  geometry: ReaderFrameGeometry
  /** The raw solver result, for callers that need the degradation advisory. */
  layout: SolveReaderLayoutResult
}

function stackText(stack: WordStack): string {
  return stack.words.join(' ')
}

/**
 * The strings the solver sizes against: every slot of the *configured* block,
 * revealed or not, so the font size stays stable as slots fill in.
 */
export function deriveBlockStackTexts(
  stacks: WordStack[],
  blockStart: number,
  blockSize: number
): string[] {
  return Array.from({ length: blockSize }, (_, index) => {
    const stack = stacks[blockStart + index]
    return stack ? stackText(stack) : ''
  }).filter(Boolean)
}

/** Layout as configured, used before the stage has been measured. */
function unsolvedLayout(config: ReaderFrameConfig): SolveReaderLayoutResult {
  return {
    width: 0,
    height: 0,
    effectiveFontSize: config.fontSize,
    effectiveRowHeight: rowHeightAtFont(config.fontSize),
    effectiveStackGap: config.stackGap,
    effectiveRowGap: config.rowGap,
    effectiveLinesCount: config.linesCount,
    anchor: config.linesAnchor,
    clampedVerticalOffset: config.stackVerticalOffset,
    clampedHorizontalOffset: config.stackHorizontalOffset,
    stacksVisible: config.stacksVisible,
    wordsPerStack: config.wordsPerStack,
    degradation: {
      stage: 'stage-1',
      axis: 'none',
      comfortFontSize: config.comfortFontSize ?? READER_MIN_VISIBLE_FONT_SIZE,
    },
  }
}

/**
 * Pass one of the two-pass dance: derive the block at the **configured** line count,
 * collect its stack texts, and solve the layout against the measured stage.
 * An unmeasured stage yields the configured values unchanged.
 */
export function solveReaderFrameLayout(input: ReaderFrameLayoutInput): SolveReaderLayoutResult {
  const { stacks, currentIndex, config, stage, measureWidth } = input
  const configuredBlock = deriveBlockPosition(currentIndex, config.stacksVisible, config.linesCount)
  const stackTexts = deriveBlockStackTexts(
    stacks,
    configuredBlock.blockStart,
    config.linesCount * config.stacksVisible
  )

  if (stage.width <= 0 || stage.height <= 0) return unsolvedLayout(config)

  return solveReaderLayout({
    stageWidth: stage.width,
    stageHeight: stage.height,
    stackTexts,
    stacksVisible: config.stacksVisible,
    wordsPerStack: config.wordsPerStack,
    fontSize: config.fontSize,
    linesCount: config.linesCount,
    anchor: config.linesAnchor,
    stackGap: config.stackGap,
    rowGap: config.rowGap,
    stackVerticalOffset: config.stackVerticalOffset,
    stackHorizontalOffset: config.stackHorizontalOffset,
    comfortFontSize: config.comfortFontSize,
    fontFamily: config.fontFamily,
    fontWeight: config.fontWeight ?? 700,
    measureWidth,
  })
}

/**
 * Pass two of the two-pass dance: re-derive the block at the solver's **effective**
 * line count, apply the sticky reveal, and materialize every row and slot.
 */
export function composeReaderFrame(input: {
  stacks: WordStack[]
  currentIndex: number
  config: ReaderFrameConfig
  layout: SolveReaderLayoutResult
  reveal: RevealState
}): ReaderFrame {
  const { stacks, currentIndex, config, layout, reveal } = input
  const stacksVisible = config.stacksVisible
  const effectiveLinesCount = layout.effectiveLinesCount
  const block = deriveBlockPosition(currentIndex, stacksVisible, effectiveLinesCount)

  const revealCandidate = panningBarRevealUpToSlot(
    block.currentSlotIdx,
    stacksVisible,
    config.highlightMode,
    config.highlightPanningChunkSize
  )
  const nextReveal = nextRevealState(reveal, block.lineKey, revealCandidate)
  const revealUpToSlot = nextReveal.revealUpTo

  const displayRows = buildDisplayRows(
    stacks,
    block.blockStart,
    block.currentLineIdx,
    stacksVisible,
    revealUpToSlot,
    effectiveLinesCount
  )

  const isSlotHighlighted = computeHighlightedSlots(
    config.highlightMode,
    block.currentLineIdx,
    block.currentSlotIdx,
    stacksVisible,
    { chunkSize: config.highlightPanningChunkSize }
  )

  const rows = displayRows.map<ReaderFrameRow>((slots, rowIndex) => {
    const isFutureRow = rowIndex > block.currentLineIdx
    const rowHighlightActive = config.highlightActive && !isFutureRow

    return {
      rowIndex,
      isCurrentRow: rowIndex === block.currentLineIdx,
      isFutureRow,
      slots: slots.map<ReaderFrameSlot>((stack, colIndex) => {
        const presentation = deriveSlotPresentation({
          rowIdx: rowIndex,
          colIdx: colIndex,
          stack,
          stacksVisible,
          blockStart: block.blockStart,
          highlightActive: rowHighlightActive,
          focalPointsView: config.focalPointsView,
          showChunkDividers: config.showChunkDividers,
          isSlotHighlighted,
        })
        const isHeadline = stack?.type === 'headline'
        const text = stack ? stackText(stack) : ''

        return {
          rowIndex,
          colIndex,
          stackIndex: presentation.globalIdx,
          stack,
          text,
          displayText: isHeadline ? text.toUpperCase() : text,
          isHeadline,
          fontSize: isHeadline
            ? Math.round(layout.effectiveFontSize * HEADLINE_FONT_SCALE)
            : layout.effectiveFontSize,
          revealed:
            rowIndex < block.currentLineIdx ||
            (rowIndex === block.currentLineIdx && colIndex <= revealUpToSlot),
          highlighted: rowHighlightActive && isSlotHighlighted(rowIndex, colIndex),
          slotClass: presentation.slotClass,
          divider: isFutureRow ? null : presentation.divider,
        }
      }),
    }
  })

  return {
    rows,
    block,
    stacksVisible: layout.stacksVisible,
    wordsPerStack: layout.wordsPerStack,
    revealUpToSlot,
    reveal: nextReveal,
    geometry: {
      fontSize: layout.effectiveFontSize,
      rowHeight: layout.effectiveRowHeight,
      stackGap: layout.effectiveStackGap,
      rowGap: layout.effectiveRowGap,
      linesCount: effectiveLinesCount,
      anchor: layout.anchor,
      verticalOffset: layout.clampedVerticalOffset,
      horizontalOffset: layout.clampedHorizontalOffset,
      gridTemplateColumns: buildGridTemplateColumns(stacksVisible, layout.effectiveStackGap),
      contentWidth: layout.width,
      contentHeight: layout.height,
      degradation: layout.degradation,
    },
    layout,
  }
}

/** Both passes: solve the layout, then materialize the frame it implies. */
export function deriveReaderFrame(input: ReaderFrameInput): ReaderFrame {
  const layout = solveReaderFrameLayout(input)
  return composeReaderFrame({
    stacks: input.stacks,
    currentIndex: input.currentIndex,
    config: input.config,
    layout,
    reveal: input.reveal,
  })
}

/**
 * The one beat at which every reserved slot of a block holds a stack.
 *
 * The Line box fills top-down, so the block is only complete once the playhead
 * has reached the last row (ADR-0032); the reveal state is the sticky high-water
 * mark that row carries once it has been scanned to its end. Static painters — a
 * settings preview, the Make Video preview — show that beat instead of inventing
 * a state the reader never reaches.
 */
function fullBlockFrameInputs(
  stacksVisible: number,
  linesCount: number
): { currentIndex: number; reveal: RevealState } {
  const cols = Math.max(1, Math.floor(stacksVisible))
  const rows = Math.max(1, Math.floor(linesCount))
  const currentIndex = (rows - 1) * cols
  const block = deriveBlockPosition(currentIndex, cols, rows)
  return { currentIndex, reveal: { lineKey: block.lineKey, revealUpTo: cols - 1 } }
}

/**
 * A frame showing one complete block: both passes, at the beat
 * `fullBlockFrameInputs` names, against the line count the solver actually
 * returned. An unmeasured stage yields the configured geometry unchanged.
 */
export function deriveFullBlockFrame(input: {
  stacks: WordStack[]
  config: ReaderFrameConfig
  stage: ReaderFrameStage
  measureWidth: ReaderTextMeasurer
}): ReaderFrame {
  const layout = solveReaderFrameLayout({ ...input, currentIndex: 0 })
  const { currentIndex, reveal } = fullBlockFrameInputs(
    input.config.stacksVisible,
    layout.effectiveLinesCount
  )
  return composeReaderFrame({
    stacks: input.stacks,
    currentIndex,
    config: input.config,
    layout,
    reveal,
  })
}
