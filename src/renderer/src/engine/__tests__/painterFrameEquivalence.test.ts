import { describe, it, expect } from 'vitest'
import {
  INITIAL_REVEAL_STATE,
  deriveFullBlockFrame,
  deriveReaderFrame,
  type ReaderFrame,
  type ReaderFrameConfig,
} from '../readerFrame'
import { createMeasureWidth, type ReaderTextMeasurer } from '../readerDisplayScale'
import { buildStacks } from '../tokenizer'
import { buildVideoFrame, buildVideoPreviewFrame } from '../videoRenderer'
import type { RevealState } from '../stackLayout'
import type { TransmuteConfig, WordStack } from '../../types'

// Environment: node (default). Modelled on `stackBuilder.test.ts`, which asserts the
// worker and synchronous stack builders produce byte-identical output. The same
// question, one layer up: the DOM painter, the canvas exporter and the preview all
// claim to render *one* frame description, so for the same stacks, index and
// configuration the frame each of them receives must be identical — not merely
// similar. Before issue 07 there was no shared interface to compare against.
//
// Both sides are handed the same text measurer, because a measurer is an input to
// the frame, not part of it: the live reader measures with a DOM canvas and the
// exporter with its offscreen context.

interface FillTextMetrics {
  width: number
  actualBoundingBoxAscent: number
  actualBoundingBoxDescent: number
}

/** A deterministic measuring context: width proportional to length × font size. */
function makeMeasureContext(): { font: string; measureText(text: string): FillTextMetrics } {
  let font = ''
  return {
    get font() { return font },
    set font(value: string) { font = value },
    measureText(text: string): FillTextMetrics {
      const size = Number(font.match(/(\d+)px/)?.[1] ?? 16)
      return {
        width: text.length * size * 0.6,
        actualBoundingBoxAscent: size * 0.8,
        actualBoundingBoxDescent: size * 0.2,
      }
    },
  }
}

function sharedMeasurer(): ReaderTextMeasurer {
  const context = makeMeasureContext()
  return createMeasureWidth(() => context as never)
}

/** Stand-in for a canvas context: the exporter only measures text on it here. */
function measuringCtx(): never {
  return makeMeasureContext() as never
}

// ── The twin configurations ────────────────────────────────────────────────
//
// Reader settings on one side, their camelCase Transmute twins on the other,
// written out by hand rather than derived from one another — that is the part of
// the conversion the equivalence has to prove.

function readerConfig(overrides: Partial<ReaderFrameConfig> = {}): ReaderFrameConfig {
  return {
    stacksVisible: 3,
    wordsPerStack: 3,
    linesCount: 3,
    linesAnchor: 'center',
    fontSize: 42,
    stackGap: 32,
    rowGap: 8,
    stackVerticalOffset: 0,
    stackHorizontalOffset: 0,
    fontFamily: 'sans-serif',
    fontWeight: 700,
    highlightActive: true,
    highlightMode: 'default',
    highlightPanningChunkSize: 0,
    focalPointsView: false,
    showChunkDividers: false,
    ...overrides,
  }
}

function transmuteTwin(reader: ReaderFrameConfig, overrides: Partial<TransmuteConfig> = {}): TransmuteConfig {
  return {
    textId: null,
    segmentId: null,
    bpm: 120,
    wordsPerStack: reader.wordsPerStack,
    pauseAtSentences: false,
    pauseAtHeadlines: false,
    fontSize: reader.fontSize,
    // The adapter appends the sans-serif fallback, so the reader twin above spells
    // out the family the frame actually measures with.
    fontFamily: reader.fontFamily === 'sans-serif' ? '' : reader.fontFamily!.replace(/, sans-serif$/, ''),
    theme: 'dark',
    bgColor: '#1a1a1a',
    textColor: '#f0f0f0',
    stackVerticalOffset: reader.stackVerticalOffset,
    stackHorizontalOffset: reader.stackHorizontalOffset,
    highlightActive: reader.highlightActive,
    highlightColor: '',
    highlightTextColor: '',
    highlightMode: reader.highlightMode,
    highlightPanningChunkSize: reader.highlightPanningChunkSize,
    highlightingMode: 'default',
    linesCount: reader.linesCount,
    linesRowGap: reader.rowGap,
    stacksVisible: reader.stacksVisible,
    stackGap: reader.stackGap,
    showChunkDividers: reader.showChunkDividers,
    chunkRuleLongWord: false,
    chunkRuleEnumerations: false,
    chunkRuleBullets: false,
    chunkRuleCommas: false,
    chunkRuleNames: false,
    resolution: '1280x720',
    maxDurationMinutes: null,
    contentLimitType: 'none',
    contentLimitWords: 1000,
    contentLimitPercentage: 100,
    showProgressOverlay: false,
    bgColorOverride: '',
    transparentBackground: false,
    ...overrides,
  }
}

const SAMPLE = [
  '# The Meeting',
  '',
  'Alice walked into the room, quietly. Bob followed her a moment later.',
  'They discussed the plan at length, then agreed on the next steps to take.',
  '',
  'A supercalifragilisticexpialidocious word ends the chunk early.',
].join('\n')

function sampleStacks(wordsPerStack: number): WordStack[] {
  return buildStacks(SAMPLE, wordsPerStack, {
    longWord: false,
    enumerations: false,
    bullets: false,
    commas: false,
    names: false,
    headlines: true,
  })
}

interface PainterCase {
  name: string
  config: ReaderFrameConfig
  /** Canvas size; the stage box both painters solve against is derived from it. */
  canvas: { width: number; height: number }
  transmuteOverrides?: Partial<TransmuteConfig>
}

const CASES: PainterCase[] = [
  {
    name: 'single stack, single line',
    config: readerConfig({ stacksVisible: 1, linesCount: 1, wordsPerStack: 4 }),
    canvas: { width: 1280, height: 720 },
  },
  {
    name: 'multi-column single row',
    config: readerConfig({ stacksVisible: 4, linesCount: 1 }),
    canvas: { width: 1280, height: 720 },
  },
  {
    name: 'multi-line grid with offsets',
    config: readerConfig({
      stacksVisible: 3,
      linesCount: 4,
      stackVerticalOffset: 40,
      stackHorizontalOffset: -30,
    }),
    canvas: { width: 1920, height: 1080 },
  },
  {
    name: 'panning-bar highlight above chunk size 1',
    config: readerConfig({
      stacksVisible: 4,
      linesCount: 2,
      highlightMode: 'panning-bar',
      highlightPanningChunkSize: 2,
    }),
    canvas: { width: 1280, height: 720 },
  },
  {
    name: 'progressive highlight with dividers on',
    config: readerConfig({ stacksVisible: 3, linesCount: 2, highlightMode: 'progressive-bar', showChunkDividers: true }),
    canvas: { width: 1080, height: 1920 },
  },
  {
    name: 'dense grid the solver has to degrade',
    config: readerConfig({ stacksVisible: 6, linesCount: 6, wordsPerStack: 8, fontSize: 180, stackGap: 120, rowGap: 80 }),
    canvas: { width: 720, height: 720 },
  },
  {
    name: 'named font family, non-default weight path',
    config: readerConfig({ fontFamily: 'Georgia, sans-serif' }),
    canvas: { width: 1280, height: 720 },
  },
]

/** The frame the live DOM painter would receive for the same inputs. */
function domFrame(
  test: PainterCase,
  stacks: WordStack[],
  currentIndex: number,
  reveal: RevealState,
  stage: { width: number; height: number },
  measureWidth: ReaderTextMeasurer
): ReaderFrame {
  return deriveReaderFrame({
    stacks,
    currentIndex,
    config: test.config,
    stage,
    measureWidth,
    reveal,
  })
}

describe('painter frames — DOM and canvas receive the identical frame', () => {
  for (const test of CASES) {
    it(`matches for ${test.name}`, () => {
      const stacks = sampleStacks(test.config.wordsPerStack)
      const transmute = transmuteTwin(test.config, test.transmuteOverrides)

      // The exporter's stage box replaces the DOM's measured element; everything
      // downstream of it must agree beat for beat.
      const canvas = buildVideoFrame({
        ctx: measuringCtx(),
        stacks,
        currentIndex: 5,
        config: transmute,
        width: test.canvas.width,
        height: test.canvas.height,
        reveal: INITIAL_REVEAL_STATE,
        measureWidth: sharedMeasurer(),
      })

      const dom = domFrame(test, stacks, 5, INITIAL_REVEAL_STATE, canvas.stage, sharedMeasurer())

      expect(canvas.frame).toEqual(dom)
    })
  }

  it('stays identical across a whole sticky-reveal sequence', () => {
    const config = readerConfig({
      stacksVisible: 4,
      linesCount: 2,
      highlightMode: 'panning-bar',
      highlightPanningChunkSize: 4,
    })
    const stacks = sampleStacks(config.wordsPerStack)
    const transmute = transmuteTwin(config)
    const canvasMeasure = sharedMeasurer()
    const domMeasure = sharedMeasurer()

    let canvasReveal: RevealState = INITIAL_REVEAL_STATE
    let domReveal: RevealState = INITIAL_REVEAL_STATE
    let stage = { width: 0, height: 0 }

    // Every beat of two full blocks, so row resets and block resets are both crossed.
    for (let index = 0; index < 16; index += 1) {
      const canvas = buildVideoFrame({
        ctx: measuringCtx(),
        stacks,
        currentIndex: index,
        config: transmute,
        width: 1280,
        height: 720,
        reveal: canvasReveal,
        measureWidth: canvasMeasure,
      })
      stage = canvas.stage
      const dom = deriveReaderFrame({
        stacks,
        currentIndex: index,
        config,
        stage,
        measureWidth: domMeasure,
        reveal: domReveal,
      })

      expect(canvas.frame).toEqual(dom)

      canvasReveal = canvas.frame.reveal
      domReveal = dom.reveal
    }

    // And the sequence actually exercised the sticky mark rather than trivially
    // agreeing on a fresh one every beat.
    expect(domReveal.revealUpTo).toBeGreaterThan(0)
  })

  it('diverges the moment a painter re-derives anything itself', () => {
    // Guard on the guard: the comparison above is only meaningful if a frame built
    // from different inputs is actually unequal.
    const config = readerConfig({ stacksVisible: 3, linesCount: 2 })
    const stacks = sampleStacks(config.wordsPerStack)
    const canvas = buildVideoFrame({
      ctx: measuringCtx(),
      stacks,
      currentIndex: 4,
      config: transmuteTwin(config),
      width: 1280,
      height: 720,
      measureWidth: sharedMeasurer(),
    })
    const shifted = deriveReaderFrame({
      stacks,
      currentIndex: 5,
      config,
      stage: canvas.stage,
      measureWidth: sharedMeasurer(),
      reveal: INITIAL_REVEAL_STATE,
    })

    expect(canvas.frame).not.toEqual(shifted)
  })
})

describe('painter frames — the still previews share the same description', () => {
  it('gives the settings preview and the video preview the identical frame', () => {
    const config = readerConfig({ stacksVisible: 4, linesCount: 3 })
    const stacks = sampleStacks(config.wordsPerStack)
    const canvas = buildVideoPreviewFrame({
      ctx: measuringCtx(),
      stacks,
      config: transmuteTwin(config),
      width: 1280,
      height: 720,
      measureWidth: sharedMeasurer(),
    })

    const dom = deriveFullBlockFrame({
      stacks,
      config,
      stage: canvas.stage,
      measureWidth: sharedMeasurer(),
    })

    expect(canvas.frame).toEqual(dom)
  })

  it('shows a complete block — no reserved-but-empty slot in a still preview', () => {
    const config = readerConfig({ stacksVisible: 4, linesCount: 3 })
    const stacks = sampleStacks(config.wordsPerStack)
    const frame = deriveFullBlockFrame({
      stacks,
      config,
      stage: { width: 1184, height: 640 },
      measureWidth: sharedMeasurer(),
    })

    expect(frame.rows).toHaveLength(3)
    for (const row of frame.rows) {
      for (const slot of row.slots) {
        expect(slot.stack).not.toBeNull()
      }
    }
  })

  it('leaves the configured geometry untouched when the preview stage is unmeasured', () => {
    const config = readerConfig({ stacksVisible: 2, linesCount: 2, fontSize: 36, stackGap: 24, rowGap: 10 })
    const frame = deriveFullBlockFrame({
      stacks: sampleStacks(config.wordsPerStack),
      config,
      stage: { width: 0, height: 0 },
      measureWidth: sharedMeasurer(),
    })

    expect(frame.geometry.fontSize).toBe(36)
    expect(frame.geometry.stackGap).toBe(24)
    expect(frame.geometry.rowGap).toBe(10)
    expect(frame.geometry.linesCount).toBe(2)
  })
})
