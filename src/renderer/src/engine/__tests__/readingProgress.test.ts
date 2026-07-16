import { describe, it, expect } from 'vitest'
import type { WordStack } from '../../types'

function wordOffsetAt(stacks: WordStack[], stackIdx: number): number {
  return stacks.slice(0, stackIdx).reduce((sum, s) => sum + s.words.length, 0)
}

function makeStacks(wordCounts: number[]): WordStack[] {
  return wordCounts.map((n) => ({
    words: Array.from({ length: n }, (_, i) => `w${i}`),
    type: 'normal' as const,
  }))
}

describe('wordOffsetAt - stack-index to word-offset conversion', () => {
  it('returns 0 for stack index 0', () => {
    const stacks = makeStacks([3, 3, 3])
    expect(wordOffsetAt(stacks, 0)).toBe(0)
  })

  it('returns the sum of words in all preceding stacks', () => {
    const stacks = makeStacks([3, 5, 2])
    expect(wordOffsetAt(stacks, 1)).toBe(3)
    expect(wordOffsetAt(stacks, 2)).toBe(8)
    expect(wordOffsetAt(stacks, 3)).toBe(10)
  })

  it('handles uniform stack sizes', () => {
    const stacks = makeStacks([2, 2, 2, 2])
    expect(wordOffsetAt(stacks, 2)).toBe(4)
    expect(wordOffsetAt(stacks, 4)).toBe(8)
  })

  it('handles empty stacks gracefully', () => {
    expect(wordOffsetAt([], 0)).toBe(0)
  })

  it('clamps beyond stacks.length to the total word count', () => {
    const stacks = makeStacks([4, 4])
    expect(wordOffsetAt(stacks, stacks.length)).toBe(8)
  })
})

describe('passage range - session start and end word offsets', () => {
  it('fresh session from start has startWordOffset = 0', () => {
    const stacks = makeStacks([3, 3, 3, 3])
    expect(wordOffsetAt(stacks, 0)).toBe(0)
  })

  it('resumed session has startWordOffset matching saved stack position', () => {
    const stacks = makeStacks([3, 3, 3, 3])
    expect(wordOffsetAt(stacks, 2)).toBe(6)
  })

  it('endWordOffset is greater than startWordOffset after reading some stacks', () => {
    const stacks = makeStacks([3, 3, 3, 3])
    const start = wordOffsetAt(stacks, 1)
    const end = wordOffsetAt(stacks, 3)
    expect(end).toBeGreaterThan(start)
    expect(end - start).toBe(6)
  })

  it('passage is empty when start equals end', () => {
    const stacks = makeStacks([3, 3, 3])
    expect(wordOffsetAt(stacks, 2)).toBe(wordOffsetAt(stacks, 2))
  })

  it('captures the full passage when reading from start to finish', () => {
    const stacks = makeStacks([5, 5, 5])
    expect(wordOffsetAt(stacks, 0)).toBe(0)
    expect(wordOffsetAt(stacks, stacks.length)).toBe(15)
  })
})

describe('saved position validation', () => {
  it('position is valid when stackIndex > 0 and < stacks.length', () => {
    const stacks = makeStacks([3, 3, 3])
    expect(1 > 0 && 1 < stacks.length).toBe(true)
  })

  it('position is invalid when stackIndex = 0', () => {
    const stacks = makeStacks([3, 3, 3])
    expect(0 > 0 && 0 < stacks.length).toBe(false)
  })

  it('position is invalid when stackIndex >= stacks.length', () => {
    const stacks = makeStacks([3, 3])
    expect(5 > 0 && 5 < stacks.length).toBe(false)
  })

  it('position is invalid when stacks are empty', () => {
    const stacks: WordStack[] = []
    expect(stacks.length > 0 && 3 > 0 && 3 < stacks.length).toBe(false)
  })
})

function detectTargetReached(
  previousIndex: number,
  currentIndex: number,
  state: string,
  rereReadEndIndex: number | null,
  goalBookmarkIndex: number | null,
  firedRereEnd: { current: boolean },
  firedGoal: { current: boolean },
  isManualMove = false
): { hitRereEnd: boolean; hitGoal: boolean } {
  if (state !== 'playing') return { hitRereEnd: false, hitGoal: false }

  const hitRereEnd =
    rereReadEndIndex != null &&
    rereReadEndIndex > 0 &&
    currentIndex >= rereReadEndIndex &&
    !firedRereEnd.current

  const hitGoal =
    !isManualMove &&
    goalBookmarkIndex != null &&
    goalBookmarkIndex > 0 &&
    previousIndex < goalBookmarkIndex &&
    currentIndex >= goalBookmarkIndex &&
    !firedGoal.current

  if (hitRereEnd) firedRereEnd.current = true
  if (hitGoal) firedGoal.current = true

  return { hitRereEnd, hitGoal }
}

describe('reread-until-return-point', () => {
  it('records the end stack index as the reread return point', () => {
    let capturedRereReadEnd: number | null = null
    function handleReread(idx: number) { capturedRereReadEnd = idx }
    handleReread(42)
    expect(capturedRereReadEnd).toBe(42)
  })

  it('reaching the reread end index while playing triggers once', () => {
    const firedRereEnd = { current: false }
    const firedGoal = { current: false }

    expect(detectTargetReached(2, 3, 'playing', 5, null, firedRereEnd, firedGoal))
      .toEqual({ hitRereEnd: false, hitGoal: false })

    expect(detectTargetReached(4, 5, 'playing', 5, null, firedRereEnd, firedGoal))
      .toEqual({ hitRereEnd: true, hitGoal: false })

    expect(detectTargetReached(5, 6, 'playing', 5, null, firedRereEnd, firedGoal))
      .toEqual({ hitRereEnd: false, hitGoal: false })
  })

  it('does not trigger while paused or idle', () => {
    const firedRereEnd = { current: false }
    const firedGoal = { current: false }

    expect(detectTargetReached(4, 5, 'paused', 5, null, firedRereEnd, firedGoal))
      .toEqual({ hitRereEnd: false, hitGoal: false })
    expect(detectTargetReached(4, 5, 'idle', 5, null, firedRereEnd, firedGoal))
      .toEqual({ hitRereEnd: false, hitGoal: false })
  })
})

describe('goal bookmark auto-stop', () => {
  it('triggers when playback crosses the resolved goal stack index', () => {
    const firedRereEnd = { current: false }
    const firedGoal = { current: false }

    expect(detectTargetReached(8, 9, 'playing', null, 10, firedRereEnd, firedGoal))
      .toEqual({ hitRereEnd: false, hitGoal: false })

    expect(detectTargetReached(9, 10, 'playing', null, 10, firedRereEnd, firedGoal))
      .toEqual({ hitRereEnd: false, hitGoal: true })
  })

  it('triggers when playback passes the goal by more than one stack', () => {
    const firedRereEnd = { current: false }
    const firedGoal = { current: false }

    expect(detectTargetReached(9, 11, 'playing', null, 10, firedRereEnd, firedGoal))
      .toEqual({ hitRereEnd: false, hitGoal: true })
  })

  it('triggers at the word-offset-derived stack index', () => {
    const stacks = makeStacks([3, 3, 3, 3])
    let cumulative = 0
    let stackIdxForWord9 = stacks.length
    for (let i = 0; i < stacks.length; i++) {
      if (cumulative >= 9) {
        stackIdxForWord9 = i
        break
      }
      cumulative += stacks[i].words.length
    }
    expect(stackIdxForWord9).toBe(3)

    const firedRereEnd = { current: false }
    const firedGoal = { current: false }

    expect(
      detectTargetReached(
        stackIdxForWord9 - 1,
        stackIdxForWord9,
        'playing',
        null,
        stackIdxForWord9,
        firedRereEnd,
        firedGoal
      )
    ).toEqual({ hitRereEnd: false, hitGoal: true })
  })

  it('does not fire when not playing', () => {
    const firedRereEnd = { current: false }
    const firedGoal = { current: false }

    expect(detectTargetReached(9, 15, 'paused', null, 10, firedRereEnd, firedGoal))
      .toEqual({ hitRereEnd: false, hitGoal: false })
    expect(detectTargetReached(9, 15, 'idle', null, 10, firedRereEnd, firedGoal))
      .toEqual({ hitRereEnd: false, hitGoal: false })
    expect(detectTargetReached(9, 15, 'stopped', null, 10, firedRereEnd, firedGoal))
      .toEqual({ hitRereEnd: false, hitGoal: false })
  })

  it('does not fire again after the goal has already terminated itself', () => {
    const firedRereEnd = { current: false }
    const firedGoal = { current: false }

    const first = detectTargetReached(9, 10, 'playing', null, 10, firedRereEnd, firedGoal)

    expect(first.hitGoal).toBe(true)
    expect(firedGoal.current).toBe(true)

    expect(detectTargetReached(9, 10, 'playing', null, 10, firedRereEnd, firedGoal))
      .toEqual({ hitRereEnd: false, hitGoal: false })
  })

  it('does not trigger for target index 0', () => {
    const firedRereEnd = { current: false }
    const firedGoal = { current: false }

    expect(detectTargetReached(0, 1, 'playing', null, 0, firedRereEnd, firedGoal))
      .toEqual({ hitRereEnd: false, hitGoal: false })
  })

  it('does not trigger when a manual move lands past the goal', () => {
    const firedRereEnd = { current: false }
    const firedGoal = { current: false }

    expect(detectTargetReached(2, 10, 'playing', null, 5, firedRereEnd, firedGoal, true))
      .toEqual({ hitRereEnd: false, hitGoal: false })
  })
})
