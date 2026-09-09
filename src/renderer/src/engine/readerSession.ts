/**
 * Pure **reading session** decisions (ADR-0026).
 *
 * This half answers questions; `hooks/useReadingSession.ts` is the module that
 * sequences them and owns the orchestration (playback timer, refs, DB writes).
 * Until `architecture-depth/11` that orchestration lived inline in `Reader.tsx`,
 * which is why this file used to say "decisions only — orchestration stays in
 * the component". It no longer does: everything a decision here governs is
 * applied behind the session interface, and every rule the session enforces is
 * stated here rather than as an inline condition in an effect.
 */

import type { PlaybackState } from '../types'

type ReadingPositionSource = 'text' | 'segment'

export interface SessionBaseline {
  stackIndex: number
  source: ReadingPositionSource
}

/** Why a reading session ended — the Session dialog's three variants (ADR-0026 §5). */
export type SessionEndReason = 'stop' | 'goal' | 'end'

/**
 * **Host configuration**: which completion path a finished reading run takes in
 * this host. It is not a feature switch and not a capability flag — it names the
 * one thing it selects, and the session module is the only module that reads it.
 *
 * - `session-dialog` — the standard Reader (ADR-0026 §4/§5): Stop, a Target
 *   crossing and the natural end all **pause and hold** the position and raise a
 *   session end for the guided dialog.
 * - `host-completion` — the Overlay Reader (ADR-0026 consequences): the same
 *   three arrivals **stop** playback and the host owns the follow-up, so no
 *   session end is ever raised and the natural end is terminal.
 *
 * It replaces the former `sessionEndEnabled` boolean, which fanned out to four
 * consumption points and changed playback termination, dialog mounting and Stop
 * semantics at once (`architecture-depth/11`).
 */
export type SessionCompletion = 'session-dialog' | 'host-completion'

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
 * Baseline-capture rule (ADR-0026 §2, with its one documented exception).
 *
 * §2: a session begins on the rest → playing transition, and pause/resume
 * *inside* a session never moves the baseline.
 *
 * The exception: once a session end is showing (§4 pauses and holds instead of
 * stopping), the session is over even though playback state says `paused`. So
 * playing again from that held position is a **new** session and must re-capture
 * the baseline — otherwise "Exit without saving" from the second run would
 * revert to the first run's start. This lived as an inline `&&` in the effect
 * until `architecture-depth/11`; it belongs here, with the rule it qualifies.
 */
export function shouldCaptureSessionBaseline(
  prev: PlaybackState,
  next: PlaybackState,
  sessionEndShowing: boolean
): boolean {
  if (shouldStartReadingSession(prev, next)) return true
  return sessionEndShowing && prev === 'paused' && next === 'playing'
}

/**
 * Whether this session persists anything at all.
 *
 * A text with **no id** is not in the store: the Overlay Reader host fabricates
 * its `TextRecord` from a temporary session, so every reading position, baseline
 * commit and revert for it is a no-op. That was an implicit consequence of an
 * early return in the save helper; `architecture-depth/11` made it a named rule
 * so the contract is legible and testable rather than inferred.
 */
export function sessionPersists(textId: number | undefined): boolean {
  return Boolean(textId)
}

/**
 * Whether a finished session's measured record is written to the store at all
 * (ADR-0035 §1/§2). Three gates, stated once:
 *
 * - Only the guided-completion host measures — `host-completion` (the Overlay
 *   Reader) never raises a session end and never records.
 * - Only a text that exists in the store can be attributed — the same no-id
 *   contract as {@link sessionPersists}, since the Overlay Reader fabricates
 *   its `TextRecord` without one.
 * - A session that advanced zero words records nothing.
 */
export function shouldRecordSessionStats(
  completion: SessionCompletion,
  textId: number | undefined,
  wordsRead: number
): boolean {
  if (completion !== 'session-dialog') return false
  if (!sessionPersists(textId)) return false
  return wordsRead > 0
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
 * Whether a stack index change can be a **crossing** at all.
 *
 * Only playback crosses. Every other index change — a scrub, a bookmark jump, a
 * re-tokenization landing the playhead somewhere new — is a move, and a move
 * never consumes a Target (ADR-0024). This was the one rule of the crossing
 * detector left as a bare `playState !== 'playing'` guard in the effect
 * (`architecture-depth/01`'s finding, restated by 11); it is stated here now,
 * beside the predicate it fronts.
 */
export function playbackCanCross(playState: PlaybackState): boolean {
  return playState === 'playing'
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

/*
 * Word-offset ⇄ stack-index conversion used to live here as three functions
 * that each re-walked the tokenization — and `wordOffsetAtIndex` allocated a
 * fresh prefix copy of the stack array on every call, from a render path.
 * `architecture-depth/08` moved them onto the **word index**
 * (`engine/wordIndex.ts`), which prefix-sums the tokenization once and answers
 * in O(1) / O(log n): `offsetAtStack`, `stackAtOffset`, `restoreStackAtOffset`.
 * Their behaviour is unchanged and pinned by `__tests__/wordIndex.test.ts`.
 */

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
