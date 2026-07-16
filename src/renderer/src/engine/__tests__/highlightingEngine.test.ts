import { describe, it, expect } from 'vitest'
import { computeHighlightedSlots } from '../highlightingEngine'

// ── helper ────────────────────────────────────────────────────────────────

/** Collects all (rowIdx, colIdx) pairs that are highlighted into a sorted string array for easy assertions. */
function highlighted(
  mode: Parameters<typeof computeHighlightedSlots>[0],
  currentLineIdx: number,
  currentSlotIdx: number,
  stacksVisible: number,
  totalRows = 3,
  panningChunkSize = 0,
): string[] {
  const fn = computeHighlightedSlots(mode, currentLineIdx, currentSlotIdx, stacksVisible, { chunkSize: panningChunkSize })
  const results: string[] = []
  for (let r = 0; r < totalRows; r++) {
    for (let c = 0; c < stacksVisible; c++) {
      if (fn(r, c)) results.push(`${r}:${c}`)
    }
  }
  return results
}

// ── default mode ──────────────────────────────────────────────────────────

describe('default mode', () => {
  it('highlights only the exact active slot', () => {
    expect(highlighted('default', 1, 1, 3)).toEqual(['1:1'])
    expect(highlighted('default', 0, 0, 3)).toEqual(['0:0'])
    expect(highlighted('default', 2, 2, 3)).toEqual(['2:2'])
  })

  it('does not highlight other rows', () => {
    const result = highlighted('default', 1, 0, 3)
    expect(result).not.toContain('0:0')
    expect(result).not.toContain('2:0')
    expect(result).toEqual(['1:0'])
  })

  it('works with stacks_visible = 1', () => {
    expect(highlighted('default', 0, 0, 1)).toEqual(['0:0'])
  })
})

// ── progressive-bar mode ──────────────────────────────────────────────────

describe('progressive-bar mode', () => {
  it('highlights only slot 0 on the first beat of a 3-stack row', () => {
    expect(highlighted('progressive-bar', 0, 0, 3)).toEqual(['0:0'])
  })

  it('highlights slots 0–1 on the second beat of a 3-stack row', () => {
    expect(highlighted('progressive-bar', 0, 1, 3)).toEqual(['0:0', '0:1'])
  })

  it('highlights all 3 slots on the third beat of a 3-stack row', () => {
    expect(highlighted('progressive-bar', 0, 2, 3)).toEqual(['0:0', '0:1', '0:2'])
  })

  it('only highlights the active row, not other rows', () => {
    const result = highlighted('progressive-bar', 1, 2, 3)
    expect(result).not.toContain('0:0')
    expect(result).not.toContain('2:0')
    expect(result).toContain('1:0')
    expect(result).toContain('1:2')
  })

  it('works with stacks_visible = 1', () => {
    expect(highlighted('progressive-bar', 0, 0, 1)).toEqual(['0:0'])
  })

  it('works with stacks_visible = 2', () => {
    expect(highlighted('progressive-bar', 0, 0, 2)).toEqual(['0:0'])
    expect(highlighted('progressive-bar', 0, 1, 2)).toEqual(['0:0', '0:1'])
  })
})

// ── panning-bar mode ──────────────────────────────────────────────────────

describe('panning-bar mode — stacks_visible = 3, chunkSize = 3 (auto)', () => {
  const N = 3

  it('beat 1 (slotIdx=0): highlights first 2 stacks', () => {
    expect(highlighted('panning-bar', 0, 0, N)).toEqual(['0:0', '0:1'])
  })

  it('beat 2 (slotIdx=1): gap — nothing highlighted', () => {
    expect(highlighted('panning-bar', 0, 1, N)).toEqual([])
  })

  it('beat 3 (slotIdx=2): highlights last 2 stacks', () => {
    expect(highlighted('panning-bar', 0, 2, N)).toEqual(['0:1', '0:2'])
  })

  it('only highlights the active row', () => {
    const result = highlighted('panning-bar', 1, 0, N)
    expect(result).not.toContain('0:0')
    expect(result).not.toContain('2:0')
    expect(result).toContain('1:0')
  })
})

describe('panning-bar mode — stacks_visible = 4, chunkSize = 4 (auto)', () => {
  const N = 4

  it('beat 1 (slotIdx=0): highlights first 2 stacks', () => {
    expect(highlighted('panning-bar', 0, 0, N)).toEqual(['0:0', '0:1'])
  })

  it('beat 2 (slotIdx=1): gap', () => {
    expect(highlighted('panning-bar', 0, 1, N)).toEqual([])
  })

  it('beat 3 (slotIdx=2): gap', () => {
    expect(highlighted('panning-bar', 0, 2, N)).toEqual([])
  })

  it('beat 4 (slotIdx=3): highlights last 2 stacks with midpoint overlap', () => {
    expect(highlighted('panning-bar', 0, 3, N)).toEqual(['0:1', '0:2', '0:3'])
  })
})

describe('panning-bar mode — stacks_visible = 1', () => {
  it('always highlights the single slot on the first beat', () => {
    expect(highlighted('panning-bar', 0, 0, 1)).toEqual(['0:0'])
  })
})

describe('panning-bar mode — stacks_visible = 2', () => {
  it('beat 1 (slotIdx=0): highlights slot 0', () => {
    expect(highlighted('panning-bar', 0, 0, 2)).toEqual(['0:0'])
  })

  it('beat 2 (slotIdx=1): highlights both slots (with overlap)', () => {
    expect(highlighted('panning-bar', 0, 1, 2)).toEqual(['0:0', '0:1'])
  })
})

describe('panning-bar mode — custom chunkSize', () => {
  it('uses the provided chunkSize instead of stacksVisible', () => {
    // stacksVisible=6, chunkSize=3: first chunk covers slots 0-2, second chunk covers 3-5
    // On slot 0 (first beat of chunk 0): highlight slots 0-1
    expect(highlighted('panning-bar', 0, 0, 6, 1, 3)).toEqual(['0:0', '0:1'])
    // On slot 2 (last beat of chunk 0): highlight slots 1-2
    expect(highlighted('panning-bar', 0, 2, 6, 1, 3)).toEqual(['0:1', '0:2'])
    // On slot 3 (first beat of chunk 1): highlight slots 3-4
    expect(highlighted('panning-bar', 0, 3, 6, 1, 3)).toEqual(['0:3', '0:4'])
    // On slot 4 (gap in chunk 1): nothing
    expect(highlighted('panning-bar', 0, 4, 6, 1, 3)).toEqual([])
    // On slot 5 (last beat of chunk 1): highlight slots 4-5
    expect(highlighted('panning-bar', 0, 5, 6, 1, 3)).toEqual(['0:4', '0:5'])
  })

  it('treats chunkSize=0 as auto (equals stacksVisible)', () => {
    // Same result as not providing a chunkSize
    const r1 = highlighted('panning-bar', 0, 0, 3, 3, 0)
    const r2 = highlighted('panning-bar', 0, 0, 3, 3)
    expect(r1).toEqual(r2)
  })
})

// ── fallback for unknown / missing mode ────────────────────────────────────

describe('fallback behavior', () => {
  it('defaults to single-slot behavior for an unrecognised mode string', () => {
    // Casting to bypass type-checker intentionally to test runtime fallback
    const fn = computeHighlightedSlots('unknown' as any, 0, 1, 3, { chunkSize: 0 })
    expect(fn(0, 1)).toBe(true)
    expect(fn(0, 0)).toBe(false)
    expect(fn(0, 2)).toBe(false)
  })
})
