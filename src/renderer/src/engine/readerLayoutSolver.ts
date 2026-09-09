import {
  READER_MIN_VISIBLE_FONT_SIZE,
  type MeasureWidthFont,
  type ReaderTextMeasurer,
} from './readerDisplayScale'
import type { ReaderLinesAnchor } from '../../../shared/settings'

const WIDTH_MEASURE_REF_SIZE = 100
const DEFAULT_FONT_FAMILY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
const DEFAULT_FONT_WEIGHT = 700
const STACK_SLOT_PAD_X = 56
const HEIGHT_FIT_RATIO = 0.4
const MIN_STACK_GAP = 0
const MIN_ROW_GAP = 0

export type ReaderLayoutDegradationStage = 'stage-1' | 'stage-2' | 'stage-3' | 'stage-4'
export type ReaderLayoutOverflowAxis = 'none' | 'width' | 'height' | 'both'

export interface SolveReaderLayoutInput {
  stageWidth: number
  stageHeight: number
  stackTexts: string[]
  stacksVisible: number
  wordsPerStack: number
  fontSize: number
  linesCount: number
  anchor: ReaderLinesAnchor
  stackGap: number
  rowGap: number
  stackVerticalOffset: number
  stackHorizontalOffset: number
  comfortFontSize?: number
  fontFamily?: string
  fontWeight?: string | number
  measureWidth: ReaderTextMeasurer
}

export interface ReaderLayoutContentSize {
  width: number
  height: number
}

export interface ReaderLayoutDegradationDescriptor {
  stage: ReaderLayoutDegradationStage
  axis: ReaderLayoutOverflowAxis
  comfortFontSize: number
}

export interface SolveReaderLayoutResult extends ReaderLayoutContentSize {
  effectiveFontSize: number
  effectiveRowHeight: number
  effectiveStackGap: number
  effectiveRowGap: number
  effectiveLinesCount: number
  anchor: ReaderLinesAnchor
  clampedVerticalOffset: number
  clampedHorizontalOffset: number
  stacksVisible: number
  wordsPerStack: number
  degradation: ReaderLayoutDegradationDescriptor
}

interface NormalizedInput extends SolveReaderLayoutInput {
  stageWidth: number
  stageHeight: number
  stacksVisible: number
  wordsPerStack: number
  fontSize: number
  linesCount: number
  stackGap: number
  rowGap: number
  comfortFontSize: number
}

interface FitState {
  fontSize: number
  stackGap: number
  rowGap: number
  linesCount: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function safeFinite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}

function normalize(input: SolveReaderLayoutInput): NormalizedInput {
  return {
    ...input,
    anchor: input.anchor ?? 'center',
    stageWidth: Math.max(0, safeFinite(input.stageWidth, 0)),
    stageHeight: Math.max(0, safeFinite(input.stageHeight, 0)),
    stacksVisible: Math.max(1, Math.floor(safeFinite(input.stacksVisible, 1))),
    wordsPerStack: Math.max(1, Math.floor(safeFinite(input.wordsPerStack, 1))),
    fontSize: Math.max(0, safeFinite(input.fontSize, READER_MIN_VISIBLE_FONT_SIZE)),
    linesCount: Math.max(1, Math.floor(safeFinite(input.linesCount, 1))),
    stackGap: Math.max(0, safeFinite(input.stackGap, 0)),
    rowGap: Math.max(0, safeFinite(input.rowGap, 0)),
    comfortFontSize: Math.max(
      0,
      safeFinite(input.comfortFontSize ?? READER_MIN_VISIBLE_FONT_SIZE, READER_MIN_VISIBLE_FONT_SIZE)
    ),
  }
}

function measureFont(input: NormalizedInput): MeasureWidthFont {
  return {
    fontFamily: input.fontFamily?.trim() || DEFAULT_FONT_FAMILY,
    fontWeight: input.fontWeight ?? DEFAULT_FONT_WEIGHT,
    refSize: WIDTH_MEASURE_REF_SIZE,
  }
}

function measureWidestRefWidth(input: NormalizedInput): number {
  if (input.stackTexts.length === 0) return 0

  const font = measureFont(input)
  return input.stackTexts.reduce((widest, text) => {
    try {
      const measured = input.measureWidth(text, font)
      if (Number.isFinite(measured) && measured > widest) return measured
    } catch {
      return widest
    }
    return widest
  }, 0)
}

function textWidthAtFont(widestRefWidth: number, fontSize: number): number {
  return (Math.max(0, widestRefWidth) * Math.max(0, fontSize)) / WIDTH_MEASURE_REF_SIZE
}

export function rowHeightAtFont(fontSize: number): number {
  return Math.max(0, fontSize) / HEIGHT_FIT_RATIO
}

export function measureReaderLayoutContent(params: {
  widestRefWidth: number
  fontSize: number
  stacksVisible: number
  stackGap: number
  linesCount: number
  rowGap: number
}): ReaderLayoutContentSize {
  const stacksVisible = Math.max(1, Math.floor(safeFinite(params.stacksVisible, 1)))
  const linesCount = Math.max(1, Math.floor(safeFinite(params.linesCount, 1)))
  const stackGap = Math.max(0, safeFinite(params.stackGap, 0))
  const rowGap = Math.max(0, safeFinite(params.rowGap, 0))
  const slotWidth = textWidthAtFont(params.widestRefWidth, params.fontSize) + STACK_SLOT_PAD_X
  const rowHeight = rowHeightAtFont(params.fontSize)

  return {
    width: stacksVisible * slotWidth + Math.max(0, stacksVisible - 1) * stackGap,
    height: linesCount * rowHeight + Math.max(0, linesCount - 1) * rowGap,
  }
}

function measureState(input: NormalizedInput, widestRefWidth: number, state: FitState): ReaderLayoutContentSize {
  return measureReaderLayoutContent({
    widestRefWidth,
    fontSize: state.fontSize,
    stacksVisible: input.stacksVisible,
    stackGap: state.stackGap,
    linesCount: state.linesCount,
    rowGap: state.rowGap,
  })
}

function overflowAxis(content: ReaderLayoutContentSize, stageWidth: number, stageHeight: number): ReaderLayoutOverflowAxis {
  const width = content.width > stageWidth
  const height = content.height > stageHeight
  if (width && height) return 'both'
  if (width) return 'width'
  if (height) return 'height'
  return 'none'
}

function fits(content: ReaderLayoutContentSize, stageWidth: number, stageHeight: number): boolean {
  return content.width <= stageWidth + Number.EPSILON && content.height <= stageHeight + Number.EPSILON
}

function fitFontForWidth(input: NormalizedInput, widestRefWidth: number, stackGap: number): number {
  if (widestRefWidth <= 0) return Number.POSITIVE_INFINITY
  const totalGaps = Math.max(0, input.stacksVisible - 1) * stackGap
  const availableTextWidth = (input.stageWidth - totalGaps) / input.stacksVisible - STACK_SLOT_PAD_X
  return (Math.max(0, availableTextWidth) * WIDTH_MEASURE_REF_SIZE) / widestRefWidth
}

function fitFontForHeight(input: NormalizedInput, linesCount: number, rowGap: number): number {
  const totalGaps = Math.max(0, linesCount - 1) * rowGap
  const availableRowHeight = (input.stageHeight - totalGaps) / linesCount
  return Math.max(0, availableRowHeight) * HEIGHT_FIT_RATIO
}

function fitFont(input: NormalizedInput, widestRefWidth: number, stackGap: number, rowGap: number, linesCount: number): number {
  return Math.min(
    input.fontSize,
    fitFontForWidth(input, widestRefWidth, stackGap),
    fitFontForHeight(input, linesCount, rowGap)
  )
}

function floorFitFont(fontSize: number): number {
  if (!Number.isFinite(fontSize)) return Number.MAX_SAFE_INTEGER
  return Math.max(0, Math.floor(fontSize))
}

function fitStackGapAtFont(input: NormalizedInput, widestRefWidth: number, fontSize: number): number {
  if (input.stacksVisible <= 1) return input.stackGap
  const slotWidth = textWidthAtFont(widestRefWidth, fontSize) + STACK_SLOT_PAD_X
  const maxGap = (input.stageWidth - input.stacksVisible * slotWidth) / (input.stacksVisible - 1)
  return clamp(Math.floor(maxGap), MIN_STACK_GAP, input.stackGap)
}

function fitRowGapAtFont(input: NormalizedInput, fontSize: number): number {
  if (input.linesCount <= 1) return input.rowGap
  const rowHeight = rowHeightAtFont(fontSize)
  const maxGap = (input.stageHeight - input.linesCount * rowHeight) / (input.linesCount - 1)
  return clamp(Math.floor(maxGap), MIN_ROW_GAP, input.rowGap)
}

function fitLinesAtFont(input: NormalizedInput, fontSize: number, rowGap: number): number {
  for (let lines = input.linesCount; lines >= 1; lines -= 1) {
    const content = measureReaderLayoutContent({
      widestRefWidth: 0,
      fontSize,
      stacksVisible: 1,
      stackGap: 0,
      linesCount: lines,
      rowGap,
    })
    if (content.height <= input.stageHeight + Number.EPSILON) return lines
  }

  return 1
}

function clampOffsets(params: {
  stageWidth: number
  stageHeight: number
  content: ReaderLayoutContentSize
  anchor: ReaderLinesAnchor
  stackVerticalOffset: number
  stackHorizontalOffset: number
}): Pick<SolveReaderLayoutResult, 'clampedVerticalOffset' | 'clampedHorizontalOffset'> {
  const horizontalSlack = Math.max(0, (params.stageWidth - params.content.width) / 2)
  const verticalSlack = Math.max(0, params.stageHeight - params.content.height)
  const minVerticalOffset = params.anchor === 'top' ? 0 : -verticalSlack / 2
  const maxVerticalOffset = params.anchor === 'top' ? verticalSlack : verticalSlack / 2

  return {
    clampedHorizontalOffset: clamp(params.stackHorizontalOffset, -horizontalSlack, horizontalSlack),
    clampedVerticalOffset: clamp(params.stackVerticalOffset, minVerticalOffset, maxVerticalOffset),
  }
}

function result(
  input: NormalizedInput,
  widestRefWidth: number,
  state: FitState,
  stage: ReaderLayoutDegradationStage,
  axis: ReaderLayoutOverflowAxis
): SolveReaderLayoutResult {
  const content = measureState(input, widestRefWidth, state)
  const offsets = clampOffsets({
    stageWidth: input.stageWidth,
    stageHeight: input.stageHeight,
    content,
    anchor: input.anchor,
    stackVerticalOffset: input.stackVerticalOffset,
    stackHorizontalOffset: input.stackHorizontalOffset,
  })

  return {
    ...content,
    ...offsets,
    effectiveFontSize: state.fontSize,
    effectiveRowHeight: rowHeightAtFont(state.fontSize),
    effectiveStackGap: state.stackGap,
    effectiveRowGap: state.rowGap,
    effectiveLinesCount: state.linesCount,
    anchor: input.anchor,
    stacksVisible: input.stacksVisible,
    wordsPerStack: input.wordsPerStack,
    degradation: {
      stage,
      axis,
      comfortFontSize: input.comfortFontSize,
    },
  }
}

export function solveReaderLayout(input: SolveReaderLayoutInput): SolveReaderLayoutResult {
  const normalized = normalize(input)
  const widestRefWidth = measureWidestRefWidth(normalized)

  const stage1Font = floorFitFont(
    fitFont(normalized, widestRefWidth, normalized.stackGap, normalized.rowGap, normalized.linesCount)
  )
  if (stage1Font >= normalized.comfortFontSize) {
    return result(
      normalized,
      widestRefWidth,
      {
        fontSize: stage1Font,
        stackGap: normalized.stackGap,
        rowGap: normalized.rowGap,
        linesCount: normalized.linesCount,
      },
      'stage-1',
      'none'
    )
  }

  const floorState: FitState = {
    fontSize: normalized.comfortFontSize,
    stackGap: normalized.stackGap,
    rowGap: normalized.rowGap,
    linesCount: normalized.linesCount,
  }
  const floorContent = measureState(normalized, widestRefWidth, floorState)
  const floorAxis = overflowAxis(floorContent, normalized.stageWidth, normalized.stageHeight)

  const stage2State: FitState = { ...floorState }
  if (floorAxis === 'width' || floorAxis === 'both') {
    stage2State.stackGap = fitStackGapAtFont(normalized, widestRefWidth, normalized.comfortFontSize)
  }
  if (floorAxis === 'height' || floorAxis === 'both') {
    stage2State.rowGap = fitRowGapAtFont(normalized, normalized.comfortFontSize)
  }

  const stage2Content = measureState(normalized, widestRefWidth, stage2State)
  if (fits(stage2Content, normalized.stageWidth, normalized.stageHeight)) {
    return result(normalized, widestRefWidth, stage2State, 'stage-2', floorAxis)
  }

  const stage2Axis = overflowAxis(stage2Content, normalized.stageWidth, normalized.stageHeight)
  const stage3State: FitState = { ...stage2State }
  if (stage2Axis === 'height' || stage2Axis === 'both') {
    stage3State.linesCount = fitLinesAtFont(normalized, normalized.comfortFontSize, stage2State.rowGap)
  }

  const stage3Content = measureState(normalized, widestRefWidth, stage3State)
  if (fits(stage3Content, normalized.stageWidth, normalized.stageHeight)) {
    return result(normalized, widestRefWidth, stage3State, 'stage-3', stage2Axis)
  }

  const stage4Font = fitFont(
    normalized,
    widestRefWidth,
    stage3State.stackGap,
    stage3State.rowGap,
    stage3State.linesCount
  )
  return result(
    normalized,
    widestRefWidth,
    { ...stage3State, fontSize: Math.max(0, stage4Font) },
    'stage-4',
    overflowAxis(stage3Content, normalized.stageWidth, normalized.stageHeight)
  )
}
