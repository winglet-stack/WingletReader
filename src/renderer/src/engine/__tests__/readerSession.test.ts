import { describe, it, expect } from 'vitest'
import {
  nextCountdownTick,
  isCountdownComplete,
  resolveValidSavedIndex,
  selectSessionBaseline,
  shouldFireOnce,
  shouldFireOnCrossing,
  shouldSavePosition,
  shouldFireComplete,
  shouldStartReadingSession,
  wordOffsetAtIndex,
  resolveWordsToStackIndex,
  resolveRestoreIndex,
  computeResumePct,
  computeMinutesLeft,
} from '../readerSession'
import type { WordStack } from '../../types'

function makeStacks(wordCounts: number[]): WordStack[] {
  return wordCounts.map((n) => ({
    words: Array.from({ length: n }, (_, i) => `w${i}`),
    type: 'normal' as const,
  }))
}

describe('nextCountdownTick', () => {
  it('decrements an active countdown', () => {
    expect(nextCountdownTick(3)).toBe(2)
    expect(nextCountdownTick(2)).toBe(1)
    expect(nextCountdownTick(1)).toBe(0)
  })

  it('keeps an inactive countdown inactive', () => {
    expect(nextCountdownTick(null)).toBeNull()
  })
})

describe('isCountdownComplete', () => {
  it('is complete at 0', () => {
    expect(isCountdownComplete(0)).toBe(true)
  })

  it('is not complete while counting', () => {
    expect(isCountdownComplete(3)).toBe(false)
    expect(isCountdownComplete(1)).toBe(false)
  })
})

describe('resolveValidSavedIndex', () => {
  it('returns null when there is no saved position', () => {
    expect(resolveValidSavedIndex(null, 6)).toBeNull()
  })

  it('returns null for a start-of-text or negative saved index', () => {
    expect(resolveValidSavedIndex(0, 6)).toBeNull()
    expect(resolveValidSavedIndex(-1, 6)).toBeNull()
  })

  it('returns null when there are no stacks', () => {
    expect(resolveValidSavedIndex(3, 0)).toBeNull()
  })

  it('returns null when the saved index is at or beyond the stacks length', () => {
    expect(resolveValidSavedIndex(6, 6)).toBeNull()
    expect(resolveValidSavedIndex(100, 6)).toBeNull()
  })

  it('returns the saved index when it is in bounds', () => {
    expect(resolveValidSavedIndex(1, 6)).toBe(1)
    expect(resolveValidSavedIndex(3, 6)).toBe(3)
    expect(resolveValidSavedIndex(5, 6)).toBe(5)
  })
})

describe('shouldStartReadingSession', () => {
  it('starts a session from rest into playback', () => {
    expect(shouldStartReadingSession('idle', 'playing')).toBe(true)
    expect(shouldStartReadingSession('stopped', 'playing')).toBe(true)
  })

  it('does not start a new session for pause/resume or terminal transitions', () => {
    expect(shouldStartReadingSession('paused', 'playing')).toBe(false)
    expect(shouldStartReadingSession('playing', 'paused')).toBe(false)
    expect(shouldStartReadingSession('playing', 'stopped')).toBe(false)
    expect(shouldStartReadingSession('idle', 'stopped')).toBe(false)
  })
})

describe('selectSessionBaseline', () => {
  it('uses the saved reading position when one exists', () => {
    expect(selectSessionBaseline({ stackIndex: 4, source: 'text' }, 'segment')).toEqual({
      stackIndex: 4,
      source: 'text',
    })
  })

  it('falls back to the start of the current source when no saved position exists', () => {
    expect(selectSessionBaseline(null, 'segment')).toEqual({
      stackIndex: 0,
      source: 'segment',
    })
  })

  it('keeps the baseline non-negative', () => {
    expect(selectSessionBaseline({ stackIndex: -3, source: 'text' }, 'text')).toEqual({
      stackIndex: 0,
      source: 'text',
    })
  })
})

describe('shouldFireOnce', () => {
  it('never fires for an absent or zero target', () => {
    expect(shouldFireOnce(5, null, false)).toBe(false)
    expect(shouldFireOnce(5, 0, false)).toBe(false)
    expect(shouldFireOnce(5, -1, false)).toBe(false)
  })

  it('does not fire before the target is reached', () => {
    expect(shouldFireOnce(0, 3, false)).toBe(false)
    expect(shouldFireOnce(2, 3, false)).toBe(false)
  })

  it('fires at the target (inclusive threshold) and beyond', () => {
    expect(shouldFireOnce(3, 3, false)).toBe(true)
    expect(shouldFireOnce(4, 3, false)).toBe(true)
    expect(shouldFireOnce(100, 3, false)).toBe(true)
  })

  it('does not fire again once it has already fired', () => {
    expect(shouldFireOnce(3, 3, true)).toBe(false)
    expect(shouldFireOnce(4, 3, true)).toBe(false)
  })
})

describe('shouldFireOnCrossing', () => {
  it('fires when playback crosses from before the goal to at or beyond it', () => {
    expect(shouldFireOnCrossing(2, 3, 3, false, false)).toBe(true)
    expect(shouldFireOnCrossing(2, 4, 3, false, false)).toBe(true)
  })

  it('does not fire before the goal or when already beyond it', () => {
    expect(shouldFireOnCrossing(1, 2, 3, false, false)).toBe(false)
    expect(shouldFireOnCrossing(3, 4, 3, false, false)).toBe(false)
  })

  it('does not fire for absent targets, repeated hits, or manual moves', () => {
    expect(shouldFireOnCrossing(0, 3, null, false, false)).toBe(false)
    expect(shouldFireOnCrossing(0, 3, 0, false, false)).toBe(false)
    expect(shouldFireOnCrossing(2, 3, 3, true, false)).toBe(false)
    expect(shouldFireOnCrossing(2, 3, 3, false, true)).toBe(false)
  })
})

describe('shouldSavePosition', () => {
  it('saves on pause and on stop after playing', () => {
    expect(shouldSavePosition('playing', 'paused', 3)).toBe(true)
    expect(shouldSavePosition('playing', 'stopped', 3)).toBe(true)
  })

  it('does not save when the next state is not paused or stopped', () => {
    expect(shouldSavePosition('idle', 'playing', 3)).toBe(false)
    expect(shouldSavePosition('stopped', 'idle', 3)).toBe(false)
    expect(shouldSavePosition('paused', 'playing', 3)).toBe(false)
  })

  it('does not save off a transition not preceded by playing', () => {
    expect(shouldSavePosition('idle', 'stopped', 3)).toBe(false)
    expect(shouldSavePosition('paused', 'stopped', 3)).toBe(false)
    expect(shouldSavePosition('stopped', 'paused', 3)).toBe(false)
  })

  it('does not save a start-of-text end position', () => {
    expect(shouldSavePosition('playing', 'paused', 0)).toBe(false)
    expect(shouldSavePosition('playing', 'stopped', 0)).toBe(false)
  })
})

describe('shouldFireComplete', () => {
  it('fires when arriving at stopped from an active session', () => {
    expect(shouldFireComplete('playing', 'stopped')).toBe(true)
    expect(shouldFireComplete('paused', 'stopped')).toBe(true)
    expect(shouldFireComplete('stopped', 'stopped')).toBe(true)
  })

  it('does not fire on a stop from idle (reset, not a session end)', () => {
    expect(shouldFireComplete('idle', 'stopped')).toBe(false)
  })

  it('does not fire when the next state is not stopped', () => {
    expect(shouldFireComplete('playing', 'paused')).toBe(false)
    expect(shouldFireComplete('idle', 'playing')).toBe(false)
    expect(shouldFireComplete('stopped', 'idle')).toBe(false)
  })
})

describe('wordOffsetAtIndex', () => {
  const stacks: WordStack[] = [
    { words: ['one', 'two'], type: 'normal' },
    { words: ['three'], type: 'normal' },
    { words: ['four', 'five', 'six'], type: 'normal' },
  ]

  it('is zero at the start of the text', () => {
    expect(wordOffsetAtIndex(stacks, 0)).toBe(0)
  })

  it('sums the words of the stacks before the index', () => {
    expect(wordOffsetAtIndex(stacks, 1)).toBe(2)
    expect(wordOffsetAtIndex(stacks, 2)).toBe(3)
    expect(wordOffsetAtIndex(stacks, 3)).toBe(6)
  })

  it('clamps an index beyond the stacks to the total word count', () => {
    expect(wordOffsetAtIndex(stacks, 100)).toBe(6)
  })

  it('is zero for empty stacks', () => {
    expect(wordOffsetAtIndex([], 5)).toBe(0)
  })
})

describe('resolveWordsToStackIndex', () => {
  it('returns zero for a start-of-text word offset', () => {
    const stacks = makeStacks([3, 3, 3])
    expect(resolveWordsToStackIndex(0, stacks)).toBe(0)
  })

  it('returns the stack boundary at or after the word offset', () => {
    const stacks = makeStacks([3, 3, 3])
    expect(resolveWordsToStackIndex(3, stacks)).toBe(1)
    expect(resolveWordsToStackIndex(4, stacks)).toBe(2)
  })

  it('clamps offsets beyond the text to the end', () => {
    const stacks = makeStacks([3, 3])
    expect(resolveWordsToStackIndex(100, stacks)).toBe(2)
  })

  it('returns zero for empty stacks', () => {
    expect(resolveWordsToStackIndex(5, [])).toBe(0)
  })
})

describe('resolveRestoreIndex', () => {
  // Word counts per stack: [2, 1, 3] → stack start offsets 0, 2, 3; total 6.
  const stacks: WordStack[] = [
    { words: ['one', 'two'], type: 'normal' },
    { words: ['three'], type: 'normal' },
    { words: ['four', 'five', 'six'], type: 'normal' },
  ]

  it('restores offset 0 to the first stack', () => {
    expect(resolveRestoreIndex(0, stacks)).toBe(0)
  })

  it('restores an offset on a stack boundary to that stack', () => {
    expect(resolveRestoreIndex(2, stacks)).toBe(1)
    expect(resolveRestoreIndex(3, stacks)).toBe(2)
  })

  it('restores a mid-stack offset forward to the next stack start', () => {
    expect(resolveRestoreIndex(1, stacks)).toBe(1)
    expect(resolveRestoreIndex(4, stacks)).toBe(2)
  })

  it('clamps an offset at or past the end to the last stack', () => {
    expect(resolveRestoreIndex(6, stacks)).toBe(2)
    expect(resolveRestoreIndex(100, stacks)).toBe(2)
  })

  it('returns 0 for empty stacks', () => {
    expect(resolveRestoreIndex(0, [])).toBe(0)
    expect(resolveRestoreIndex(5, [])).toBe(0)
  })
})

describe('computeResumePct', () => {
  it('returns the rounded percentage of the saved index', () => {
    expect(computeResumePct(3, 6)).toBe(50)
    expect(computeResumePct(1, 3)).toBe(33)
  })

  it('returns null when there is no valid saved index', () => {
    expect(computeResumePct(null, 6)).toBeNull()
  })

  it('returns null when the tokenization is empty', () => {
    expect(computeResumePct(3, 0)).toBeNull()
  })
})

describe('computeMinutesLeft', () => {
  it('rounds the remaining time up to whole minutes', () => {
    expect(computeMinutesLeft(100, 0, 60)).toBe(2)
    expect(computeMinutesLeft(120, 60, 60)).toBe(1)
  })

  it('never goes negative when the reader is past the end', () => {
    expect(computeMinutesLeft(100, 120, 60)).toBe(0)
  })

  it('returns 0 when the pace is unknown', () => {
    expect(computeMinutesLeft(100, 0, 0)).toBe(0)
  })
})
