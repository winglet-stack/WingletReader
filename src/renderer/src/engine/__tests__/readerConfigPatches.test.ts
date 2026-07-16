import { describe, it, expect } from 'vitest'
import type { Settings } from '../../types'
import {
  deriveTargetWpm,
  targetWpmPatch,
  lockAtWpmTogglePatch,
} from '../readerConfigPatches'
import {
  solveForTargetWpm,
  clampReaderTargetWpm,
  READER_WPM_CONSTRAINTS,
} from '../wpmSolver'

const BASE_SETTINGS = {
  bpm: 60,
  words_per_stack: 3,
  lock_at_wpm: false,
  tap_to_read: false,
  target_wpm: 240,
} as unknown as Settings

describe('deriveTargetWpm', () => {
  it('matches the underlying solveForTargetWpm for a clamped target', () => {
    const sol = solveForTargetWpm(clampReaderTargetWpm(240), READER_WPM_CONSTRAINTS)
    expect(deriveTargetWpm(240)).toEqual({
      bpm: sol.bpm,
      wordsPerStack: sol.wordsPerStack,
      effectiveWpm: sol.effectiveWpm,
    })
  })

  it('clamps out-of-range targets before solving', () => {
    const tooHigh = deriveTargetWpm(999_999)
    const clamped = deriveTargetWpm(clampReaderTargetWpm(999_999))
    expect(tooHigh).toEqual(clamped)
  })
})

describe('targetWpmPatch', () => {
  it('stores the clamped target plus the solved bpm and words_per_stack', () => {
    const sol = deriveTargetWpm(240)
    expect(targetWpmPatch(240)).toEqual({
      target_wpm: 240,
      bpm: sol.bpm,
      words_per_stack: sol.wordsPerStack,
    })
  })

  it('clamps a negative target to the minimum', () => {
    const patch = targetWpmPatch(-50)
    expect(patch.target_wpm).toBe(clampReaderTargetWpm(-50))
  })
})

describe('lockAtWpmTogglePatch', () => {
  it('enabling solves the target WPM and clears tap mode', () => {
    const patch = lockAtWpmTogglePatch({ ...BASE_SETTINGS, tap_to_read: true }, true)
    const sol = deriveTargetWpm(BASE_SETTINGS.target_wpm)
    expect(patch).toEqual({
      lock_at_wpm: true,
      tap_to_read: false,
      target_wpm: clampReaderTargetWpm(BASE_SETTINGS.target_wpm),
      bpm: sol.bpm,
      words_per_stack: sol.wordsPerStack,
    })
  })

  it('disabling only clears the lock flag', () => {
    expect(lockAtWpmTogglePatch(BASE_SETTINGS, false)).toEqual({ lock_at_wpm: false })
  })
})
