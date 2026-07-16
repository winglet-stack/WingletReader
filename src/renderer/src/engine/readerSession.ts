/**
 * Pure session-lifecycle decisions extracted from Reader.tsx (RS-1…RS-4).
 * Decisions only — orchestration (setState, refs, timers, stop(), DB writes)
 * stays inline in the component.
 */

import type { PlaybackState, WordStack } from '../types'

type ReadingPositionSource = 'text' | 'segment'

export interface SessionBaseline {
  stackIndex: number
  source: ReadingPositionSource
}

/** One resume-countdown tick: 3 → 2 → 1 → 0. null (inactive) stays null. */
export function nextCountdownTick(countdown: number | null): number | null {
  return countdown !== null ? countdown - 1 : null
}

/** A countdown is complete when it has ticked down to 0 — time to start playback. */
export function isCountdownComplete(countdown: number): boolean {
  return countdown === 0
}

/**
 * Validates a saved stack index against the current stacks length.
 * Returns the index when it is usable as a resume point, otherwise null:
 * no saved position, a start-of-text position, or one outside the current
 * tokenization all mean "nothing to resume".
 */
export function resolveValidSavedIndex(
  savedStackIndex: number | null,
  stacksLength: number
): number | null {
  if (savedStackIndex === null) return null
  if (savedStackIndex <= 0) return null
  if (stacksLength === 0) return null
  if (savedStackIndex >= stacksLength) return null
  return savedStackIndex
}

/** A reading session starts only from rest; pause/resume stays inside the session. */
export function shouldStartReadingSession(prev: PlaybackState, next: PlaybackState): boolean {
  return next === 'playing' && (prev === 'idle' || prev === 'stopped')
}

/**
 * Captures the saved reading position as the session baseline. Missing saves
 * mean the reader's deliberate save point is the start of the text.
 */
export function selectSessionBaseline(
  savedPosition: { stackIndex: number; source?: ReadingPositionSource } | null | undefined,
  fallbackSource: ReadingPositionSource
): SessionBaseline {
  return {
    stackIndex: savedPosition ? Math.max(0, savedPosition.stackIndex) : 0,
    source: savedPosition?.source ?? fallbackSource,
  }
}

/**
 * Fire-once predicate behind the reread return point. A target fires when it
 * exists (> 0), playback has reached it (inclusive), and it has not already
 * fired for this target value.
 */
export function shouldFireOnce(
  currentIndex: number,
  targetIndex: number | null,
  alreadyFired: boolean
): boolean {
  if (targetIndex == null || targetIndex <= 0) return false
  if (currentIndex < targetIndex) return false
  return !alreadyFired
}

/**
 * Fire-once predicate for goal bookmarks. The goal only terminates itself when
 * playback crosses from before the resolved stack index to at/after it.
 * Manual seeks past the target are ignored by the caller through isManualMove.
 */
export function shouldFireOnCrossing(
  previousIndex: number,
  currentIndex: number,
  targetIndex: number | null,
  alreadyFired: boolean,
  isManualMove: boolean
): boolean {
  if (isManualMove) return false
  if (targetIndex == null || targetIndex <= 0) return false
  if (alreadyFired) return false
  return previousIndex < targetIndex && currentIndex >= targetIndex
}

/**
 * Save-position transition predicate. The reading position is persisted when
 * the user pauses or stops, but only off an actual play session (a stop not
 * preceded by playing must not save) and only for a meaningful end position.
 */
export function shouldSavePosition(
  prev: PlaybackState,
  next: PlaybackState,
  endPosition: number
): boolean {
  if (next !== 'paused' && next !== 'stopped') return false
  if (prev !== 'playing') return false
  return endPosition > 0
}

/**
 * Reading-complete transition predicate. The passage-summary callback fires on
 * any arrival at 'stopped' — natural finish, manual stop, or target reached —
 * except from 'idle', which is a reset rather than the end of a session.
 */
export function shouldFireComplete(prev: PlaybackState, next: PlaybackState): boolean {
  return next === 'stopped' && prev !== 'idle'
}

/** Cumulative word count of the stacks before the given stack index. */
export function wordOffsetAtIndex(stacks: WordStack[], index: number): number {
  return stacks.slice(0, index).reduce((sum, s) => sum + s.words.length, 0)
}

/**
 * Resolves a durable bookmark word offset to the live stack index used by the
 * current tokenization. Returns the first stack boundary at or after the offset.
 */
export function resolveWordsToStackIndex(wordOffset: number, stacks: WordStack[]): number {
  if (wordOffset <= 0) return 0

  let cumWords = 0
  for (let i = 0; i < stacks.length; i++) {
    cumWords += stacks[i].words.length
    if (cumWords >= wordOffset) return i + 1
  }
  return stacks.length
}

/**
 * After a words-per-stack change re-tokenizes the text (resetting playback to
 * stack 0), find the stack index in the fresh tokenization closest to a saved
 * word offset: the first stack whose starting word offset is >= the saved
 * offset, clamped to the last stack when the offset lies past the end.
 */
export function resolveRestoreIndex(offset: number, stacks: WordStack[]): number {
  if (stacks.length === 0) return 0
  let cumWords = 0
  let targetIdx = 0
  for (let i = 0; i < stacks.length; i++) {
    if (cumWords >= offset) {
      targetIdx = i
      break
    }
    cumWords += stacks[i].words.length
    targetIdx = i + 1
  }
  return Math.min(targetIdx, stacks.length - 1)
}

/**
 * Percent label for the resume-from-saved control.
 * null when there is nothing to resume (no valid index or empty tokenization).
 */
export function computeResumePct(
  validSavedIndex: number | null,
  stacksLength: number
): number | null {
  if (validSavedIndex === null || stacksLength <= 0) return null
  return Math.round((validSavedIndex / stacksLength) * 100)
}

/** Whole minutes of reading left at the current pace; 0 when the pace is unknown. */
export function computeMinutesLeft(
  totalWords: number,
  wordsRead: number,
  wpm: number
): number {
  if (wpm <= 0) return 0
  return Math.max(0, Math.ceil((totalWords - wordsRead) / wpm))
}
