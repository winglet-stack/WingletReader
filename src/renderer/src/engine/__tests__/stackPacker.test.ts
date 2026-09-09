import { describe, expect, it } from 'vitest'
import { packStacks, type StackPackerUnit } from '../stackPacker'

function units(count: number, preferredBreaks: number[] = []): StackPackerUnit[] {
  const preferred = new Set(preferredBreaks)
  return Array.from({ length: count }, (_, i) => ({
    wordSpan: 1,
    preferredBreakAfter: preferred.has(i + 1),
  }))
}

function spans(packed: ReturnType<typeof packStacks>): number[] {
  return packed.map((s) => s.wordSpan)
}

describe('packStacks', () => {
  it('balances N=8 paragraphs toward uniform near-full stacks', () => {
    expect(spans(packStacks(units(18), 8))).toEqual([6, 6, 6])
    expect(spans(packStacks(units(20), 8))).toEqual([7, 7, 6])
    expect(spans(packStacks(units(24), 8))).toEqual([8, 8, 8])
    expect(spans(packStacks(units(10), 8))).toEqual([5, 5])
    expect(spans(packStacks(units(16), 8))).toEqual([8, 8])
  })

  it('never exceeds N for normal units', () => {
    for (let count = 1; count <= 64; count++) {
      const packed = packStacks(units(count), 8)
      packed.forEach((stack) => expect(stack.wordSpan).toBeLessThanOrEqual(8))
    }
  })

  it('takes a preferred break when it is in the N-2 band', () => {
    expect(packStacks(units(12, [6]), 8).map((s) => s.endUnit)).toEqual([6, 12])
  })

  it('crosses a preferred break when stopping there would be below the band', () => {
    expect(packStacks(units(8, [2]), 8).map((s) => s.endUnit)).toEqual([8])
  })

  it('keeps atomic units together', () => {
    const packed = packStacks(
      [
        { wordSpan: 2, preferredBreakAfter: false },
        { wordSpan: 3, preferredBreakAfter: false },
        { wordSpan: 2, preferredBreakAfter: false },
      ],
      4
    )

    expect(packed).toEqual([
      { startUnit: 0, endUnit: 1, wordSpan: 2 },
      { startUnit: 1, endUnit: 2, wordSpan: 3 },
      { startUnit: 2, endUnit: 3, wordSpan: 2 },
    ])
  })

  it('emits a lone oversized atomic unit as the cap exception', () => {
    expect(
      packStacks([{ wordSpan: 9, preferredBreakAfter: false }], 8)
    ).toEqual([{ startUnit: 0, endUnit: 1, wordSpan: 9 }])
  })

  it('handles long paragraphs without pathological blowup', () => {
    const start = performance.now()
    const packed = packStacks(units(5000), 8)
    const elapsedMs = performance.now() - start

    expect(packed.flatMap((s) => Array(s.wordSpan).fill(0))).toHaveLength(5000)
    expect(elapsedMs).toBeLessThan(500)
  })
})
