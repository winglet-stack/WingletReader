import type { Settings } from '../types'
import {
  solveForTargetWpm,
  clampReaderTargetWpm,
  READER_WPM_CONSTRAINTS,
} from './wpmSolver'

/**
 * Pure decision helpers for ReaderConfigPanel's playback transitions.
 *
 * The WPM math itself lives in wpmSolver (the single source of truth); these
 * helpers only assemble the `Partial<Settings>` patches the panel applies, so
 * the field-rendering components stay free of inline branching.
 */

export interface TargetWpmDerivation {
  bpm: number
  wordsPerStack: number
  effectiveWpm: number
}

/**
 * Solve a (clamped) target WPM into its BPM / words-per-stack pair.
 * Folds the panel's three previously-inline `solveForTargetWpm` calls (summary
 * line + slider + numeric input) into one place.
 */
export function deriveTargetWpm(targetWpm: number): TargetWpmDerivation {
  const sol = solveForTargetWpm(clampReaderTargetWpm(targetWpm), READER_WPM_CONSTRAINTS)
  return { bpm: sol.bpm, wordsPerStack: sol.wordsPerStack, effectiveWpm: sol.effectiveWpm }
}

/**
 * Patch applied when the Target-WPM slider or numeric input changes: stores the
 * clamped target alongside its solved BPM and words-per-stack.
 */
export function targetWpmPatch(targetWpm: number): Partial<Settings> {
  const clamped = clampReaderTargetWpm(targetWpm)
  const sol = deriveTargetWpm(clamped)
  return { target_wpm: clamped, bpm: sol.bpm, words_per_stack: sol.wordsPerStack }
}

/**
 * Patch for toggling Lock-at-WPM. Enabling solves for the current target WPM and
 * clears tap mode (the two are mutually exclusive); disabling just clears the flag.
 */
export function lockAtWpmTogglePatch(local: Settings, enabled: boolean): Partial<Settings> {
  if (!enabled) return { lock_at_wpm: false }
  const targetWpm = clampReaderTargetWpm(local.target_wpm)
  const sol = deriveTargetWpm(targetWpm)
  return {
    lock_at_wpm: true,
    tap_to_read: false,
    target_wpm: targetWpm,
    bpm: sol.bpm,
    words_per_stack: sol.wordsPerStack,
  }
}
