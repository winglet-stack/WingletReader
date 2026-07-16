import { describe, it, expect } from 'vitest'
import {
  deriveBlockPosition,
  panningBarRevealUpToSlot,
  nextRevealState,
  buildDisplayRows,
  buildGridTemplateColumns,
  deriveSlotPresentation,
} from '../stackLayout'
import type { WordStack } from '../../types'

function makeStacks(n: number): WordStack[] {
  return Array.from({ length: n }, (_, i) => ({ words: [`w${i}`], type: 'normal' as const }))
}

describe('deriveBlockPosition', () => {
  it('computes single-stack single-line (linesCount=1, stacksVisible=1)', () => {
    const pos = deriveBlockPosition(5, 1, 1)
    expect(pos.blockSize).toBe(1)
    expect(pos.blockIndex).toBe(0)
    expect(pos.blockStart).toBe(5)
    expect(pos.currentLineIdx).toBe(0)
    expect(pos.currentSlotIdx).toBe(0)
    expect(pos.lineKey).toBe(500) // 5 * 100 + 0
  })

  it('computes block position for stacksVisible=3, linesCount=1', () => {
    // blockSize=3; index=7 → blockIndex=1, blockStart=6, lineIdx=0, slotIdx=1
    const pos = deriveBlockPosition(7, 3, 1)
    expect(pos.blockSize).toBe(3)
    expect(pos.blockIndex).toBe(1)
    expect(pos.blockStart).toBe(6)
    expect(pos.currentLineIdx).toBe(0)
    expect(pos.currentSlotIdx).toBe(1)
  })

  it('computes multi-line block position (stacksVisible=2, linesCount=3)', () => {
    // blockSize=6; index=9 → blockIndex=3, blockStart=6, lineIdx=1, slotIdx=1
    const pos = deriveBlockPosition(9, 2, 3)
    expect(pos.blockSize).toBe(6)
    expect(pos.blockIndex).toBe(3)
    expect(pos.blockStart).toBe(6)
    expect(pos.currentLineIdx).toBe(1)
    expect(pos.currentSlotIdx).toBe(1)
  })

  it('produces lineKey = blockStart * 100 + currentLineIdx', () => {
    const pos1 = deriveBlockPosition(0, 2, 2)
    expect(pos1.lineKey).toBe(pos1.blockStart * 100 + pos1.currentLineIdx)
    const pos2 = deriveBlockPosition(5, 2, 2)
    expect(pos2.lineKey).toBe(pos2.blockStart * 100 + pos2.currentLineIdx)
  })

  it('is correct at index 0', () => {
    const pos = deriveBlockPosition(0, 3, 2)
    expect(pos.blockSize).toBe(6)
    expect(pos.blockIndex).toBe(0)
    expect(pos.blockStart).toBe(0)
    expect(pos.currentLineIdx).toBe(0)
    expect(pos.currentSlotIdx).toBe(0)
    expect(pos.lineKey).toBe(0)
  })

  it('advances to the second line within a block', () => {
    // stacksVisible=3, linesCount=2 → blockSize=6; index=4 → blockIndex=4, lineIdx=1, slotIdx=1
    const pos = deriveBlockPosition(4, 3, 2)
    expect(pos.blockIndex).toBe(4)
    expect(pos.blockStart).toBe(0)
    expect(pos.currentLineIdx).toBe(1)
    expect(pos.currentSlotIdx).toBe(1)
  })
})

describe('panningBarRevealUpToSlot', () => {
  it('returns currentSlotIdx unchanged in non-panning-bar modes', () => {
    expect(panningBarRevealUpToSlot(2, 4, 'default', 2)).toBe(2)
    expect(panningBarRevealUpToSlot(0, 4, 'progressive-bar', 2)).toBe(0)
  })

  it('returns currentSlotIdx unchanged when not on an opening beat', () => {
    // chunkSize=2, slot 1 is not an opening beat (1%2 !== 0)
    expect(panningBarRevealUpToSlot(1, 4, 'panning-bar', 2)).toBe(1)
    // chunkSize=3, slot 1 is not an opening beat (1%3 !== 0)
    expect(panningBarRevealUpToSlot(1, 4, 'panning-bar', 3)).toBe(1)
  })

  it('pre-reveals on opening beat with chunkSize=2', () => {
    // chunkSize=2, halfChunk=ceil(2/2)=1, reveal=min(0+1-1,3)=0
    expect(panningBarRevealUpToSlot(0, 4, 'panning-bar', 2)).toBe(0)
    // slot 2 is also an opening beat (2%2===0), reveal=min(2+1-1,3)=min(2,3)=2
    expect(panningBarRevealUpToSlot(2, 4, 'panning-bar', 2)).toBe(2)
  })

  it('pre-reveals on opening beat with chunkSize=3', () => {
    // chunkSize=3, halfChunk=ceil(3/2)=2, reveal=min(0+2-1,3)=min(1,3)=1
    expect(panningBarRevealUpToSlot(0, 4, 'panning-bar', 3)).toBe(1)
    // slot 3 is also opening beat, reveal=min(3+2-1,5)=min(4,5)=4
    expect(panningBarRevealUpToSlot(3, 6, 'panning-bar', 3)).toBe(4)
  })

  it('clamps reveal to stacksVisible - 1', () => {
    // chunkSize=4, slot 0 on 2-slot row: halfChunk=2, reveal=min(0+2-1,1)=min(1,1)=1
    expect(panningBarRevealUpToSlot(0, 2, 'panning-bar', 4)).toBe(1)
  })

  it('falls back to stacksVisible when chunkSize <= 0', () => {
    // stacksVisible=4, chunkSize=0 → chunkSizeVal=4; slot 0: halfChunk=2, reveal=min(1,3)=1
    expect(panningBarRevealUpToSlot(0, 4, 'panning-bar', 0)).toBe(1)
    expect(panningBarRevealUpToSlot(0, 4, 'panning-bar', -5)).toBe(1)
  })
})

describe('nextRevealState', () => {
  it('resets when lineKey changes', () => {
    const prev = { lineKey: 10, revealUpTo: 5 }
    expect(nextRevealState(prev, 20, 2)).toEqual({ lineKey: 20, revealUpTo: 2 })
  })

  it('applies high-water mark when revealUpToSlot is higher than prev', () => {
    const prev = { lineKey: 10, revealUpTo: 2 }
    expect(nextRevealState(prev, 10, 4)).toEqual({ lineKey: 10, revealUpTo: 4 })
  })

  it('keeps prev revealUpTo when revealUpToSlot is lower (sticky)', () => {
    const prev = { lineKey: 10, revealUpTo: 5 }
    expect(nextRevealState(prev, 10, 2)).toEqual({ lineKey: 10, revealUpTo: 5 })
  })

  it('is idempotent when revealUpToSlot equals prev revealUpTo', () => {
    const prev = { lineKey: 10, revealUpTo: 3 }
    expect(nextRevealState(prev, 10, 3)).toEqual({ lineKey: 10, revealUpTo: 3 })
  })

  it('uses the new revealUpToSlot on row reset regardless of prev.revealUpTo', () => {
    const prev = { lineKey: 10, revealUpTo: 99 }
    expect(nextRevealState(prev, 20, 0)).toEqual({ lineKey: 20, revealUpTo: 0 })
  })
})

describe('buildDisplayRows', () => {
  it('builds a single row with all slots revealed', () => {
    const s = makeStacks(3)
    const rows = buildDisplayRows(s, 0, 0, 3, 2)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveLength(3)
    expect(rows[0][0]).toEqual(s[0])
    expect(rows[0][1]).toEqual(s[1])
    expect(rows[0][2]).toEqual(s[2])
  })

  it('hides slots beyond revealUpToSlot in the current row', () => {
    const s = makeStacks(3)
    const rows = buildDisplayRows(s, 0, 0, 3, 1)
    expect(rows[0][0]).toEqual(s[0])
    expect(rows[0][1]).toEqual(s[1])
    expect(rows[0][2]).toBeNull()
  })

  it('hides all slots except the first when revealUpToSlot is 0', () => {
    const s = makeStacks(3)
    const rows = buildDisplayRows(s, 0, 0, 3, 0)
    expect(rows[0][0]).toEqual(s[0])
    expect(rows[0][1]).toBeNull()
    expect(rows[0][2]).toBeNull()
  })

  it('shows all slots in past rows regardless of revealUpToSlot', () => {
    // 6 stacks: 2 rows × 3 slots; currently on line 1 with revealUpToSlot=0
    const s = makeStacks(6)
    const rows = buildDisplayRows(s, 0, 1, 3, 0)
    expect(rows).toHaveLength(2)
    // Past row 0: all slots visible
    expect(rows[0][0]).toEqual(s[0])
    expect(rows[0][1]).toEqual(s[1])
    expect(rows[0][2]).toEqual(s[2])
    // Current row 1: only slot 0 visible
    expect(rows[1][0]).toEqual(s[3])
    expect(rows[1][1]).toBeNull()
    expect(rows[1][2]).toBeNull()
  })

  it('returns null for out-of-bounds stack positions', () => {
    const s = makeStacks(2)
    const rows = buildDisplayRows(s, 0, 0, 3, 2)
    expect(rows[0][0]).toEqual(s[0])
    expect(rows[0][1]).toEqual(s[1])
    expect(rows[0][2]).toBeNull()
  })

  it('applies blockStart to access the correct stacks', () => {
    const s = makeStacks(9)
    // blockStart=3, 2 rows of 3 stacks, current row=1 (all revealed)
    const rows = buildDisplayRows(s, 3, 1, 3, 2)
    expect(rows[0][0]).toEqual(s[3])
    expect(rows[0][1]).toEqual(s[4])
    expect(rows[0][2]).toEqual(s[5])
    expect(rows[1][0]).toEqual(s[6])
    expect(rows[1][1]).toEqual(s[7])
    expect(rows[1][2]).toEqual(s[8])
  })
})

describe('buildGridTemplateColumns', () => {
  it('returns 1fr for a single stack', () => {
    expect(buildGridTemplateColumns(1, 32)).toBe('1fr')
  })

  it('returns 1fr for zero or negative stacksVisible (edge case)', () => {
    expect(buildGridTemplateColumns(0, 32)).toBe('1fr')
  })

  it('interleaves gap columns for two stacks', () => {
    expect(buildGridTemplateColumns(2, 32)).toBe('1fr 32px 1fr')
  })

  it('interleaves gap columns for three stacks', () => {
    expect(buildGridTemplateColumns(3, 16)).toBe('1fr 16px 1fr 16px 1fr')
  })

  it('interleaves gap columns for four stacks', () => {
    expect(buildGridTemplateColumns(4, 8)).toBe('1fr 8px 1fr 8px 1fr 8px 1fr')
  })
})

describe('deriveSlotPresentation', () => {
  const stack: WordStack = { words: ['a', 'b'], type: 'normal' }

  function present(overrides: Partial<Parameters<typeof deriveSlotPresentation>[0]> = {}) {
    return deriveSlotPresentation({
      rowIdx: 0,
      colIdx: 1,
      stack,
      stacksVisible: 3,
      blockStart: 0,
      highlightActive: true,
      focalPointsView: false,
      showChunkDividers: true,
      isSlotHighlighted: () => false,
      ...overrides,
    })
  }

  it('computes globalIdx from blockStart, row, and column', () => {
    expect(present({ blockStart: 6, rowIdx: 1, colIdx: 2 }).globalIdx).toBe(11)
  })

  it('marks the slot active only when highlighting is enabled and the slot is highlighted', () => {
    const hl = (r: number, c: number) => c === 1
    expect(present({ isSlotHighlighted: hl }).slotClass).toContain('stack-slot--active')
    expect(present({ isSlotHighlighted: hl, highlightActive: false }).slotClass).not.toContain('stack-slot--active')
    expect(present({ isSlotHighlighted: () => false }).slotClass).not.toContain('stack-slot--active')
  })

  it('builds the bare slot class for an inactive slot', () => {
    expect(present().slotClass).toBe('stack-slot')
  })

  it('adds connected-left when the slot and its left neighbour are both active', () => {
    const hl = (r: number, c: number) => c <= 1
    expect(present({ isSlotHighlighted: hl }).slotClass).toBe(
      'stack-slot stack-slot--active stack-slot--connected-left'
    )
  })

  it('adds connected-right when the slot and its right neighbour are both active', () => {
    const hl = (r: number, c: number) => c >= 1
    expect(present({ isSlotHighlighted: hl }).slotClass).toBe(
      'stack-slot stack-slot--active stack-slot--connected-right'
    )
  })

  it('adds both connected classes when left and right neighbours are active', () => {
    const hl = () => true
    expect(present({ isSlotHighlighted: hl }).slotClass).toBe(
      'stack-slot stack-slot--active stack-slot--connected-left stack-slot--connected-right'
    )
  })

  it('never reports a right neighbour past the last column', () => {
    const hl = () => true
    expect(present({ colIdx: 2, isSlotHighlighted: hl }).slotClass).toBe(
      'stack-slot stack-slot--active stack-slot--connected-left'
    )
  })

  it('returns no divider for the first column', () => {
    expect(present({ colIdx: 0 }).divider).toBeNull()
  })

  it('returns a visible inactive bar divider when chunk dividers are shown', () => {
    expect(present().divider).toEqual({ kind: 'bar', active: false, visible: true })
  })

  it('hides the bar divider when chunk dividers are off and the pair is not active', () => {
    expect(present({ showChunkDividers: false }).divider).toEqual({
      kind: 'bar', active: false, visible: false,
    })
  })

  it('forces the bar divider visible and active when slot and left neighbour are both active', () => {
    const hl = () => true
    expect(present({ showChunkDividers: false, isSlotHighlighted: hl }).divider).toEqual({
      kind: 'bar', active: true, visible: true,
    })
  })

  it('uses a dot divider in focal-points view when the slot holds a stack', () => {
    expect(present({ focalPointsView: true }).divider).toEqual({
      kind: 'dot', active: false, visible: true,
    })
    expect(present({ focalPointsView: true, showChunkDividers: false }).divider).toEqual({
      kind: 'dot', active: false, visible: false,
    })
  })

  it('falls back to the bar divider in focal-points view when the slot is null (unrevealed)', () => {
    expect(present({ focalPointsView: true, stack: null }).divider).toEqual({
      kind: 'bar', active: false, visible: true,
    })
  })

  it('dot dividers never activate, even between two highlighted slots', () => {
    const hl = () => true
    expect(present({ focalPointsView: true, isSlotHighlighted: hl }).divider).toEqual({
      kind: 'dot', active: false, visible: true,
    })
  })
})
