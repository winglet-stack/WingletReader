export interface StackPackerUnit {
  wordSpan: number
  preferredBreakAfter: boolean
}

export interface PackedStack {
  startUnit: number
  endUnit: number
  wordSpan: number
}

/**
 * Penalty for crossing a caller-supplied preferred break.
 *
 * This is deliberately smaller than the quadratic under-fill penalty for a
 * tiny Stack at normal reader sizes: sentence rhythm matters, but not enough
 * to reintroduce the 1-2 word stutter ADR-0030 removes.
 */
const PREFERRED_BREAK_CROSSING_PENALTY = 4

// Essential DP: the nested start/end scan with cap, under-fill, and
// preferred-break cost is irreducible (ADR-0030).
// fallow-ignore-next-line complexity
export function packStacks(
  units: StackPackerUnit[],
  maxWordsPerStack: number,
  breakPenalty = PREFERRED_BREAK_CROSSING_PENALTY
): PackedStack[] {
  if (units.length === 0) return []

  const maxWords = Math.max(1, Math.floor(maxWordsPerStack))
  const dp = Array<number>(units.length + 1).fill(Number.POSITIVE_INFINITY)
  const prev = Array<number>(units.length + 1).fill(-1)
  const spans = Array<number>(units.length + 1).fill(0)
  dp[0] = 0

  for (let end = 1; end <= units.length; end++) {
    let span = 0

    for (let start = end - 1; start >= 0; start--) {
      const unitSpan = Math.max(1, Math.floor(units[start].wordSpan))
      span += unitSpan

      const isSingleOversizedAtomic = start === end - 1 && unitSpan > maxWords
      if (span > maxWords && !isSingleOversizedAtomic) break

      const underfillCost = Math.max(0, maxWords - span) ** 2
      const breakCost = units[end - 1].preferredBreakAfter ? 0 : breakPenalty
      const cost = dp[start] + underfillCost + breakCost

      if (cost < dp[end]) {
        dp[end] = cost
        prev[end] = start
        spans[end] = span
      }

      if (isSingleOversizedAtomic) break
    }
  }

  const packed: PackedStack[] = []
  let end = units.length
  while (end > 0) {
    const start = prev[end]
    if (start < 0) {
      throw new Error('Unable to pack stack units')
    }
    packed.push({ startUnit: start, endUnit: end, wordSpan: spans[end] })
    end = start
  }

  packed.reverse()
  return packed
}
