/**
 * Reading-progress assertions, driven against the production session helpers in
 * `engine/readerSession.ts`. This file previously asserted against local copies
 * of `wordOffsetAtIndex` and an inlined target-detection function, so it could
 * not fail when the production code regressed; architecture-depth issue 01
 * repointed every assertion at the real exports.
 *
 * The `playState !== 'playing'` gate that fronts target detection is not part of
 * this module's interface — it lives in the session module,
 * `hooks/useReadingSession.ts` — so the two "not while paused/idle" cases are
 * not expressible here. See issue 01's Comments; `architecture-depth/11` left
 * the gate where it is and recorded it again for 12.
 */
import { describe, it, expect } from 'vitest'
import {
  resolveValidSavedIndex,
  shouldFireOnce,
  shouldFireOnCrossing,
} from '../readerSession'
import { buildStackWordIndex } from '../wordIndex'
import type { WordStack } from '../../types'

/*
 * Offset ⇄ stack conversion moved onto the word index (`architecture-depth/08`).
 * These two are call-shape adapters over the production index — not local
 * reimplementations, which is what issue 01 repointed this file away from.
 */
const wordOffsetAtIndex = (stacks: WordStack[], index: number): number =>
  buildStackWordIndex(stacks).offsetAtStack(index)
const resolveWordsToStackIndex = (wordOffset: number, stacks: WordStack[]): number =>
  buildStackWordIndex(stacks).stackAtOffset(wordOffset)

function makeStacks(wordCounts: number[]): WordStack[] {
  return wordCounts.map((n) => ({
    words: Array.from({ length: n }, (_, i) => `w${i}`),
    type: 'normal' as const,
  }))
}

describe('wordOffsetAtIndex - stack-index to word-offset conversion', () => {
  it('returns 0 for stack index 0', () => {
    const stacks = makeStacks([3, 3, 3])
    expect(wordOffsetAtIndex(stacks, 0)).toBe(0)
  })

  it('returns the sum of words in all preceding stacks', () => {
    const stacks = makeStacks([3, 5, 2])
    expect(wordOffsetAtIndex(stacks, 1)).toBe(3)
    expect(wordOffsetAtIndex(stacks, 2)).toBe(8)
    expect(wordOffsetAtIndex(stacks, 3)).toBe(10)
  })

  it('handles uniform stack sizes', () => {
    const stacks = makeStacks([2, 2, 2, 2])
    expect(wordOffsetAtIndex(stacks, 2)).toBe(4)
    expect(wordOffsetAtIndex(stacks, 4)).toBe(8)
  })

  it('handles empty stacks gracefully', () => {
    expect(wordOffsetAtIndex([], 0)).toBe(0)
  })

  it('clamps beyond stacks.length to the total word count', () => {
    const stacks = makeStacks([4, 4])
    expect(wordOffsetAtIndex(stacks, stacks.length)).toBe(8)
  })
})

describe('passage range - session start and end word offsets', () => {
  it('fresh session from start has startWordOffset = 0', () => {
    const stacks = makeStacks([3, 3, 3, 3])
    expect(wordOffsetAtIndex(stacks, 0)).toBe(0)
  })

  it('resumed session has startWordOffset matching saved stack position', () => {
    const stacks = makeStacks([3, 3, 3, 3])
    expect(wordOffsetAtIndex(stacks, 2)).toBe(6)
  })

  it('endWordOffset is greater than startWordOffset after reading some stacks', () => {
    const stacks = makeStacks([3, 3, 3, 3])
    const start = wordOffsetAtIndex(stacks, 1)
    const end = wordOffsetAtIndex(stacks, 3)
    expect(end).toBeGreaterThan(start)
    expect(end - start).toBe(6)
  })

  it('passage is empty when start equals end', () => {
    const stacks = makeStacks([3, 3, 3])
    const start = wordOffsetAtIndex(stacks, 2)
    const end = wordOffsetAtIndex(stacks, 2)
    expect(end - start).toBe(0)
  })

  it('captures the full passage when reading from start to finish', () => {
    const stacks = makeStacks([5, 5, 5])
    expect(wordOffsetAtIndex(stacks, 0)).toBe(0)
    expect(wordOffsetAtIndex(stacks, stacks.length)).toBe(15)
  })
})

describe('saved position validation', () => {
  it('position is valid when stackIndex > 0 and < stacks.length', () => {
    const stacks = makeStacks([3, 3, 3])
    expect(resolveValidSavedIndex(1, stacks.length)).toBe(1)
  })

  it('position is invalid when stackIndex = 0', () => {
    const stacks = makeStacks([3, 3, 3])
    expect(resolveValidSavedIndex(0, stacks.length)).toBeNull()
  })

  it('position is invalid when stackIndex >= stacks.length', () => {
    const stacks = makeStacks([3, 3])
    expect(resolveValidSavedIndex(5, stacks.length)).toBeNull()
  })

  it('position is invalid when stacks are empty', () => {
    const stacks: WordStack[] = []
    expect(resolveValidSavedIndex(3, stacks.length)).toBeNull()
  })
})

describe('reread-until-return-point', () => {
  it('reaching the reread end index triggers once', () => {
    // The caller owns the fired flag (a ref in useReadingSessionLifecycle);
    // shouldFireOnce is the pure predicate behind it.
    let fired = false

    expect(shouldFireOnce(3, 5, fired)).toBe(false)

    expect(shouldFireOnce(5, 5, fired)).toBe(true)
    fired = true

    expect(shouldFireOnce(6, 5, fired)).toBe(false)
  })
})

describe('goal bookmark auto-stop', () => {
  it('triggers when playback crosses the resolved goal stack index', () => {
    expect(shouldFireOnCrossing(8, 9, 10, false, false)).toBe(false)
    expect(shouldFireOnCrossing(9, 10, 10, false, false)).toBe(true)
  })

  it('triggers when playback passes the goal by more than one stack', () => {
    expect(shouldFireOnCrossing(9, 11, 10, false, false)).toBe(true)
  })

  it('triggers at the word-offset-derived stack index', () => {
    const stacks = makeStacks([3, 3, 3, 3])
    const stackIdxForWord9 = resolveWordsToStackIndex(9, stacks)
    expect(stackIdxForWord9).toBe(3)

    expect(
      shouldFireOnCrossing(stackIdxForWord9 - 1, stackIdxForWord9, stackIdxForWord9, false, false)
    ).toBe(true)
  })

  it('does not fire again after the goal has already terminated itself', () => {
    let fired = false

    expect(shouldFireOnCrossing(9, 10, 10, fired, false)).toBe(true)
    fired = true

    expect(shouldFireOnCrossing(9, 10, 10, fired, false)).toBe(false)
  })

  it('does not trigger for target index 0', () => {
    expect(shouldFireOnCrossing(0, 1, 0, false, false)).toBe(false)
  })

  it('does not trigger when a manual move lands past the goal', () => {
    expect(shouldFireOnCrossing(2, 10, 5, false, true)).toBe(false)
  })
})
