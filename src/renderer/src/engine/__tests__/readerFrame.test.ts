import { describe, it, expect } from 'vitest'
import {
  HEADLINE_FONT_SCALE,
  INITIAL_REVEAL_STATE,
  composeReaderFrame,
  deriveBlockStackTexts,
  deriveReaderFrame,
  solveReaderFrameLayout,
  type ReaderFrame,
  type ReaderFrameConfig,
} from '../readerFrame'
import type { ReaderTextMeasurer } from '../readerDisplayScale'
import type { WordStack } from '../../types'

/** A stage large enough that the solver never degrades — stage-1, configuration honoured. */
const ROOMY_STAGE = { width: 4000, height: 4000 }

const BASE_CONFIG: ReaderFrameConfig = {
  stacksVisible: 3,
  wordsPerStack: 2,
  linesCount: 1,
  linesAnchor: 'center',
  fontSize: 36,
  stackGap: 32,
  rowGap: 8,
  stackVerticalOffset: 0,
  stackHorizontalOffset: 0,
  fontFamily: '',
  fontWeight: 700,
  highlightActive: true,
  highlightMode: 'default',
  highlightPanningChunkSize: 0,
  focalPointsView: false,
  showChunkDividers: false,
}

function config(overrides: Partial<ReaderFrameConfig> = {}): ReaderFrameConfig {
  return { ...BASE_CONFIG, ...overrides }
}

/** Deterministic measurer: 10 reference-units per character at the 100px ref size. */
const measureWidth: ReaderTextMeasurer = (text) => text.length * 10

function makeStacks(n: number): WordStack[] {
  return Array.from({ length: n }, (_, i) => ({ words: [`w${i}`], type: 'normal' as const }))
}

function frameAt(
  currentIndex: number,
  overrides: Partial<ReaderFrameConfig> = {},
  options: { stacks?: WordStack[]; stage?: { width: number; height: number }; reveal?: ReaderFrame['reveal'] } = {}
): ReaderFrame {
  return deriveReaderFrame({
    stacks: options.stacks ?? makeStacks(24),
    currentIndex,
    config: config(overrides),
    stage: options.stage ?? ROOMY_STAGE,
    measureWidth,
    reveal: options.reveal ?? INITIAL_REVEAL_STATE,
  })
}

function slotTexts(frame: ReaderFrame): (string | null)[][] {
  return frame.rows.map((row) => row.slots.map((slot) => (slot.stack === null ? null : slot.text)))
}

describe('deriveBlockStackTexts', () => {
  it('collects every slot of the block, revealed or not, and drops out-of-range slots', () => {
    const stacks = makeStacks(5)
    expect(deriveBlockStackTexts(stacks, 3, 3)).toEqual(['w3', 'w4'])
    expect(deriveBlockStackTexts(stacks, 0, 3)).toEqual(['w0', 'w1', 'w2'])
  })
})

describe('reader frame — rows and reserved slots', () => {
  it('materializes one row per effective line with stacksVisible slots each', () => {
    const frame = frameAt(0, { linesCount: 3 })

    expect(frame.rows).toHaveLength(3)
    frame.rows.forEach((row) => expect(row.slots).toHaveLength(3))
    expect(frame.geometry.linesCount).toBe(3)
  })

  it('marks reserved-but-empty slots explicitly and fills the block top-down', () => {
    const frame = frameAt(4, { linesCount: 3 })

    expect(slotTexts(frame)).toEqual([
      ['w0', 'w1', 'w2'],
      ['w3', 'w4', null],
      [null, null, null],
    ])
    expect(frame.rows[2].isFutureRow).toBe(true)
    expect(frame.rows[1].isCurrentRow).toBe(true)
    // A reserved slot still names the stack index it holds space for.
    expect(frame.rows[2].slots[0].stackIndex).toBe(6)
    expect(frame.rows[2].slots[0].revealed).toBe(false)
    expect(frame.rows[2].slots[0].text).toBe('')
  })

  it('resets to a fresh block at the block boundary', () => {
    const frame = frameAt(9, { linesCount: 3 })

    expect(frame.block.blockStart).toBe(9)
    expect(slotTexts(frame)).toEqual([
      ['w9', null, null],
      [null, null, null],
      [null, null, null],
    ])
  })

  it('reserves slots past the end of the stack array as empty rather than dropping them', () => {
    const frame = frameAt(2, { linesCount: 1 }, { stacks: makeStacks(2) })

    expect(frame.rows[0].slots.map((slot) => slot.stack)).toEqual([
      expect.objectContaining({ words: ['w0'] }),
      expect.objectContaining({ words: ['w1'] }),
      null,
    ])
    expect(frame.rows[0].slots[2].revealed).toBe(true)
  })
})

describe('reader frame — reveal state', () => {
  it('returns the next reveal state instead of mutating the one it was given', () => {
    const reveal = { ...INITIAL_REVEAL_STATE }
    const frame = frameAt(1, {}, { reveal })

    expect(reveal).toEqual(INITIAL_REVEAL_STATE)
    expect(frame.reveal).toEqual({ lineKey: 0, revealUpTo: 1 })
  })

  it('keeps the row high-water mark when a later frame would reveal less', () => {
    const panning = { highlightMode: 'panning-bar' as const, highlightPanningChunkSize: 3 }
    const wide = frameAt(0, panning)
    expect(wide.revealUpToSlot).toBe(1)

    // Same row, mode switched to default: slot 1 must stay revealed.
    const narrowed = frameAt(0, {}, { reveal: wide.reveal })
    expect(narrowed.revealUpToSlot).toBe(1)
    expect(narrowed.rows[0].slots[1].stack).not.toBeNull()
  })

  it('starts fresh when the row changes', () => {
    const previous = { lineKey: -99, revealUpTo: 2 }
    const frame = frameAt(3, { linesCount: 2 }, { reveal: previous })

    expect(frame.reveal).toEqual({ lineKey: 1, revealUpTo: 0 })
    expect(frame.revealUpToSlot).toBe(0)
  })

  it('is idempotent in the reveal state it produces', () => {
    const first = frameAt(1)
    const second = frameAt(1, {}, { reveal: first.reveal })

    expect(second.reveal).toEqual(first.reveal)
    expect(slotTexts(second)).toEqual(slotTexts(first))
  })

  it('pre-reveals the first scan of a panning chunk larger than one', () => {
    const frame = frameAt(0, {
      stacksVisible: 4,
      highlightMode: 'panning-bar',
      highlightPanningChunkSize: 4,
    })

    expect(frame.revealUpToSlot).toBe(1)
    expect(slotTexts(frame)).toEqual([['w0', 'w1', null, null]])
  })
})

describe('reader frame — highlight and divider state', () => {
  it('highlights only the current slot in default mode', () => {
    const frame = frameAt(1)
    const highlighted = frame.rows.flatMap((row) => row.slots.filter((slot) => slot.highlighted))

    expect(highlighted).toHaveLength(1)
    expect(highlighted[0].text).toBe('w1')
    expect(highlighted[0].slotClass).toBe('stack-slot stack-slot--active')
  })

  it('highlights nothing when highlighting is off', () => {
    const frame = frameAt(1, { highlightActive: false })

    expect(frame.rows.flatMap((row) => row.slots).some((slot) => slot.highlighted)).toBe(false)
  })

  it('never highlights a reserved future row', () => {
    const frame = frameAt(0, { linesCount: 2, highlightMode: 'progressive-bar' })

    expect(frame.rows[1].slots.some((slot) => slot.highlighted)).toBe(false)
    frame.rows[1].slots.forEach((slot) => expect(slot.slotClass).toBe('stack-slot'))
  })

  it('gives every column but the first a divider, and reserved rows none', () => {
    const frame = frameAt(0, { linesCount: 2 })

    expect(frame.rows[0].slots.map((slot) => slot.divider)).toEqual([
      null,
      { kind: 'bar', active: false, visible: false },
      { kind: 'bar', active: false, visible: false },
    ])
    expect(frame.rows[1].slots.map((slot) => slot.divider)).toEqual([null, null, null])
  })

  it('activates the divider between two connected highlighted slots', () => {
    const frame = frameAt(1, { highlightMode: 'progressive-bar' })

    expect(frame.rows[0].slots[1].divider).toEqual({ kind: 'bar', active: true, visible: true })
    expect(frame.rows[0].slots[1].slotClass).toContain('stack-slot--connected-left')
  })

  it('keeps the dormant focal-points dot divider reachable', () => {
    const frame = frameAt(2, { focalPointsView: true, showChunkDividers: true })

    expect(frame.rows[0].slots[1].divider).toEqual({ kind: 'dot', active: false, visible: true })
  })
})

describe('reader frame — headline treatment', () => {
  const headlineStacks: WordStack[] = [
    { words: ['Chapter', 'One'], type: 'headline' },
    { words: ['plain', 'words'], type: 'normal' },
  ]

  it('scales the headline slot font and uppercases its painted text', () => {
    const frame = frameAt(1, { stacksVisible: 2, linesCount: 1 }, { stacks: headlineStacks })
    const [headline, normal] = frame.rows[0].slots

    expect(headline.isHeadline).toBe(true)
    expect(headline.text).toBe('Chapter One')
    expect(headline.displayText).toBe('CHAPTER ONE')
    expect(headline.fontSize).toBe(Math.round(frame.geometry.fontSize * HEADLINE_FONT_SCALE))

    expect(normal.isHeadline).toBe(false)
    expect(normal.displayText).toBe('plain words')
    expect(normal.fontSize).toBe(frame.geometry.fontSize)
  })
})

describe('reader frame — geometry', () => {
  it('passes the configuration through untouched when the stage is roomy', () => {
    const frame = frameAt(0, { linesCount: 2, stackVerticalOffset: 0 })

    expect(frame.geometry.fontSize).toBe(36)
    expect(frame.geometry.stackGap).toBe(32)
    expect(frame.geometry.rowGap).toBe(8)
    expect(frame.geometry.linesCount).toBe(2)
    expect(frame.geometry.gridTemplateColumns).toBe('1fr 32px 1fr 32px 1fr')
    expect(frame.geometry.degradation.stage).toBe('stage-1')
  })

  it('keeps stacks_visible and words_per_stack sacrosanct under height pressure', () => {
    const frame = frameAt(0, { linesCount: 4, rowGap: 60, fontSize: 48 }, {
      stage: { width: 3000, height: 120 },
    })

    expect(frame.stacksVisible).toBe(3)
    expect(frame.wordsPerStack).toBe(2)
    expect(frame.rows[0].slots).toHaveLength(3)
    expect(frame.geometry.linesCount).toBeLessThan(4)
    expect(frame.rows).toHaveLength(frame.geometry.linesCount)
  })

  it('falls back to the configured geometry before the stage has been measured', () => {
    const frame = frameAt(0, { linesCount: 2, stackVerticalOffset: 25, stackHorizontalOffset: -10 }, {
      stage: { width: 0, height: 0 },
    })

    expect(frame.geometry.fontSize).toBe(36)
    expect(frame.geometry.linesCount).toBe(2)
    expect(frame.geometry.verticalOffset).toBe(25)
    expect(frame.geometry.horizontalOffset).toBe(-10)
    expect(frame.geometry.contentWidth).toBe(0)
    expect(frame.rows).toHaveLength(2)
  })
})

describe('reader frame — two-pass configured-then-effective line count', () => {
  it('sizes against the configured block, then materializes the effective one', () => {
    const stacks = makeStacks(24)
    const twoPassConfig = config({ linesCount: 4, rowGap: 60, fontSize: 48 })
    const stage = { width: 3000, height: 120 }

    // Pass one runs at the configured line count and may reduce it…
    const layout = solveReaderFrameLayout({ stacks, currentIndex: 7, config: twoPassConfig, stage, measureWidth })
    expect(layout.effectiveLinesCount).toBeLessThan(twoPassConfig.linesCount)

    // …pass two re-derives the block at the reduced count, which moves the block.
    const configuredBlockStart = 7 - (7 % (4 * 3))
    const frame = composeReaderFrame({
      stacks,
      currentIndex: 7,
      config: twoPassConfig,
      layout,
      reveal: INITIAL_REVEAL_STATE,
    })

    expect(frame.rows).toHaveLength(layout.effectiveLinesCount)
    expect(frame.block.blockSize).toBe(layout.effectiveLinesCount * 3)
    expect(frame.block.blockStart).not.toBe(configuredBlockStart)
    expect(frame.block.blockStart).toBe(7 - (7 % frame.block.blockSize))
  })

  it('measures the whole configured block, not only the revealed slots', () => {
    const stacks: WordStack[] = [
      { words: ['tiny'], type: 'normal' },
      { words: ['a'.repeat(40)], type: 'normal' },
      { words: ['tiny'], type: 'normal' },
    ]
    const narrow = { width: 500, height: 3000 }

    // At index 0 only the first slot is revealed, but the wide hidden slot still
    // decides the font size — so it does not jump when that slot reveals.
    const first = deriveReaderFrame({
      stacks, currentIndex: 0, config: config(), stage: narrow, measureWidth,
      reveal: INITIAL_REVEAL_STATE,
    })
    const second = deriveReaderFrame({
      stacks, currentIndex: 1, config: config(), stage: narrow, measureWidth,
      reveal: first.reveal,
    })

    expect(first.geometry.fontSize).toBeLessThan(36)
    expect(second.geometry.fontSize).toBe(first.geometry.fontSize)
  })

  it('deriveReaderFrame equals running both passes by hand', () => {
    const stacks = makeStacks(24)
    const input = { stacks, currentIndex: 5, config: config({ linesCount: 2 }), stage: ROOMY_STAGE, measureWidth }
    const layout = solveReaderFrameLayout(input)

    expect(deriveReaderFrame({ ...input, reveal: INITIAL_REVEAL_STATE })).toEqual(
      composeReaderFrame({ ...input, layout, reveal: INITIAL_REVEAL_STATE })
    )
  })
})
