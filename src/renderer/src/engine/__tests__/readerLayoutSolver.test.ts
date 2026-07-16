import { describe, expect, it, vi } from 'vitest'
import { READER_MIN_VISIBLE_FONT_SIZE } from '../readerDisplayScale'
import {
  solveReaderLayout,
  measureReaderLayoutContent,
  type SolveReaderLayoutInput,
} from '../readerLayoutSolver'

function measureByWords(widthPerWordAt100: number) {
  return vi.fn((text: string, _font?: unknown) => {
    const words = text.trim() ? text.trim().split(/\s+/).length : 1
    return words * widthPerWordAt100
  })
}

function measureFixed(widthAt100: number) {
  return vi.fn((_text?: string, _font?: unknown) => widthAt100)
}

function solve(overrides: Partial<SolveReaderLayoutInput> = {}) {
  return solveReaderLayout({
    stageWidth: 1000,
    stageHeight: 500,
    stackTexts: ['alpha beta gamma'],
    stacksVisible: 3,
    wordsPerStack: 3,
    fontSize: 80,
    linesCount: 2,
    stackGap: 32,
    rowGap: 8,
    stackVerticalOffset: 0,
    stackHorizontalOffset: 0,
    measureWidth: measureFixed(500),
    ...overrides,
  })
}

describe('solveReaderLayout', () => {
  it('settles in stage 1 with a comfortable shrink-to-fit font and unchanged settings', () => {
    const result = solve()

    expect(result.degradation.stage).toBe('stage-1')
    expect(result.effectiveFontSize).toBeGreaterThanOrEqual(READER_MIN_VISIBLE_FONT_SIZE)
    expect(result.effectiveFontSize).toBeLessThanOrEqual(80)
    expect(result.effectiveStackGap).toBe(32)
    expect(result.effectiveRowGap).toBe(8)
    expect(result.effectiveLinesCount).toBe(2)
    expect(result.clampedVerticalOffset).toBe(0)
    expect(result.clampedHorizontalOffset).toBe(0)
  })

  it('settles in stage 2 by reducing only stack_gap for a width-bound layout', () => {
    const result = solve({
      stageWidth: 560,
      stageHeight: 800,
      stackGap: 100,
      rowGap: 22,
      linesCount: 3,
      measureWidth: measureFixed(600),
    })

    expect(result.degradation.stage).toBe('stage-2')
    expect(result.degradation.axis).toBe('width')
    expect(result.effectiveFontSize).toBe(READER_MIN_VISIBLE_FONT_SIZE)
    expect(result.effectiveStackGap).toBeLessThan(100)
    expect(result.effectiveStackGap).toBe(34)
    expect(result.effectiveRowGap).toBe(22)
    expect(result.effectiveLinesCount).toBe(3)
    expect(result.width).toBeLessThanOrEqual(560)
    expect(result.height).toBeLessThanOrEqual(800)
  })

  it('settles in stage 3 by reducing lines only for height-bound pressure', () => {
    const result = solve({
      stageWidth: 1000,
      stageHeight: 150,
      stacksVisible: 2,
      linesCount: 4,
      stackGap: 32,
      rowGap: 80,
      measureWidth: measureFixed(100),
    })

    expect(result.degradation.stage).toBe('stage-3')
    expect(result.degradation.axis).toBe('height')
    expect(result.effectiveFontSize).toBe(READER_MIN_VISIBLE_FONT_SIZE)
    expect(result.effectiveStackGap).toBe(32)
    expect(result.effectiveRowGap).toBe(0)
    expect(result.effectiveLinesCount).toBe(3)
    expect(result.width).toBeLessThanOrEqual(1000)
    expect(result.height).toBeLessThanOrEqual(150)
  })

  it('leaves lines untouched when the pressure is width-bound', () => {
    const result = solve({
      stageWidth: 500,
      stageHeight: 800,
      stacksVisible: 2,
      linesCount: 4,
      stackGap: 100,
      rowGap: 80,
      measureWidth: measureFixed(1200),
    })

    expect(result.degradation.axis).toBe('width')
    expect(result.effectiveLinesCount).toBe(4)
    expect(result.effectiveRowGap).toBe(80)
    expect(result.effectiveStackGap).toBe(0)
  })

  it('settles in stage 4 with a below-comfort font instead of overflowing', () => {
    const result = solve({
      stageWidth: 300,
      stageHeight: 80,
      stacksVisible: 2,
      linesCount: 4,
      stackGap: 100,
      rowGap: 40,
      measureWidth: measureFixed(1200),
    })

    expect(result.degradation.stage).toBe('stage-4')
    expect(result.effectiveFontSize).toBeLessThan(READER_MIN_VISIBLE_FONT_SIZE)
    expect(result.width).toBeLessThanOrEqual(300)
    expect(result.height).toBeLessThanOrEqual(80)
  })

  it('clamps offsets to the remaining slack and preserves offsets already within slack', () => {
    const clamped = solve({
      stageWidth: 500,
      stageHeight: 240,
      stacksVisible: 1,
      linesCount: 1,
      fontSize: 40,
      stackVerticalOffset: -200,
      stackHorizontalOffset: 300,
      measureWidth: measureFixed(100),
    })
    const horizontalSlack = (clamped.degradation.stage === 'stage-1'
      ? (500 - clamped.width) / 2
      : 0)
    const verticalSlack = (clamped.degradation.stage === 'stage-1'
      ? (240 - clamped.height) / 2
      : 0)

    expect(clamped.clampedHorizontalOffset).toBeCloseTo(horizontalSlack)
    expect(clamped.clampedVerticalOffset).toBeCloseTo(-verticalSlack)

    const withinSlack = solve({
      stageWidth: 500,
      stageHeight: 240,
      stacksVisible: 1,
      linesCount: 1,
      fontSize: 40,
      stackVerticalOffset: -10,
      stackHorizontalOffset: 20,
      measureWidth: measureFixed(100),
    })

    expect(withinSlack.clampedHorizontalOffset).toBe(20)
    expect(withinSlack.clampedVerticalOffset).toBe(-10)
  })

  it('passes stacksVisible and wordsPerStack through without mutation', () => {
    const result = solve({
      stageWidth: 360,
      stacksVisible: 5,
      wordsPerStack: 7,
      measureWidth: measureFixed(700),
    })

    expect(result.stacksVisible).toBe(5)
    expect(result.wordsPerStack).toBe(7)
  })

  it('never returns solved content dimensions that exceed the stage across a spread of inputs', () => {
    const stageSizes = [
      { width: 320, height: 160 },
      { width: 640, height: 360 },
      { width: 1000, height: 720 },
    ]
    const stacksVisibleValues = [1, 2, 4]
    const wordsPerStackValues = [1, 3, 6]
    const lineCounts = [1, 2, 4]

    for (const stage of stageSizes) {
      for (const stacksVisible of stacksVisibleValues) {
        for (const wordsPerStack of wordsPerStackValues) {
          for (const linesCount of lineCounts) {
            const text = Array.from({ length: wordsPerStack }, (_, index) => `word${index}`).join(' ')
            const measureWidth = measureByWords(120)
            const result = solveReaderLayout({
              stageWidth: stage.width,
              stageHeight: stage.height,
              stackTexts: [text, `${text} tail`],
              stacksVisible,
              wordsPerStack,
              fontSize: 64,
              linesCount,
              stackGap: 32,
              rowGap: 8,
              stackVerticalOffset: 100,
              stackHorizontalOffset: -100,
              measureWidth,
            })
            const widestRefWidth = measureWidth(`${text} tail`, { refSize: 100 })
            const content = measureReaderLayoutContent({
              widestRefWidth,
              fontSize: result.effectiveFontSize,
              stacksVisible: result.stacksVisible,
              stackGap: result.effectiveStackGap,
              linesCount: result.effectiveLinesCount,
              rowGap: result.effectiveRowGap,
            })

            expect(content.width).toBeLessThanOrEqual(stage.width + 0.000001)
            expect(content.height).toBeLessThanOrEqual(stage.height + 0.000001)
            expect(result.width).toBeLessThanOrEqual(stage.width + 0.000001)
            expect(result.height).toBeLessThanOrEqual(stage.height + 0.000001)
            expect(result.stacksVisible).toBe(stacksVisible)
            expect(result.wordsPerStack).toBe(wordsPerStack)
          }
        }
      }
    }
  })
})
