/**
 * The **session stats** sensor (ADR-0035 §2) — measurement for one reading
 * session, owned by the session module and consumed nowhere else.
 *
 * Everything here is a ref: nothing sets state, so the tracker adds no renders,
 * and its per-beat cost is one comparison and at most two ref writes inside an
 * effect the beat already scheduled. The Reader's playback performance is
 * untouchable (ADR-0035 §2).
 *
 * ## The measurement span
 *
 * A span opens on any entry into `playing` while none is active and closes when
 * the session ends — a raised session end (Stop, a Target crossing, the natural
 * end), engaging another text, or leaving the Reader (unmount). That is
 * deliberately *not* the baseline-recapture rule: once a session end has been
 * raised the record is already emitted, so whatever plays next (a resume from
 * the held dialog position, an Abort-then-resume) is a fresh measurement span
 * and its words start from the held position — nothing is counted twice.
 *
 * ## What each number means (ADR-0035 §2)
 *
 * - **Words read** are progress the span *earned* (ADR-0036 §2): a monotone
 *   **credited frontier** advances only on an advancement event — a playback
 *   timer beat or a tap-to-read `step()` — and each advance credits the words
 *   it carried the frontier past. Manual moves (the scrubber, skip-forward, a
 *   bookmark jump — marked by the same `manualMoveRevision` the crossing
 *   detector uses) rebase the frontier forward without credit, so a skipped
 *   gap is never credited, not even by backtracking into it and reading it;
 *   backward moves leave the frontier in place, so replayed text never
 *   double-counts. The credited total is complete at every instant — no fold
 *   path reads the live viewport index for words.
 * - **Active reading time** is the sum of the gaps *between advancement
 *   events* (ADR-0036 §3), not the time the `playing` state was held: the
 *   entry gap (play or resume → the first advancement), every gap between
 *   consecutive advancements, and the exit gap (last advancement → pause,
 *   stop or session end), each clamped independently at `maxCreditedGapMs`
 *   (`statsMath`) for the BPM in force when it closes. Tap-to-read
 *   schedules no timer, so an idle tap session would otherwise sit in
 *   `playing` banking hours of "reading"; a timer-mode stall (app suspend, lid
 *   close) is the same hole from the other side. Every delta clamps at 0
 *   against clock changes.
 * - **Counted pauses** open on the explicit pause *intent* only (the session's
 *   auto-pauses — `pauseAndHold`, the retokenize restore — never pass through
 *   it) and are counted at resume unless the span was exempted by
 *   {@link SessionStatsTracker.noteSetupActivity} — a reader surface opening or
 *   a setting changing within the 30-second exemption window means setup, not
 *   struggle. Only the first setup activity decides. A pause span still open
 *   when the session ends is the session's tail, not an interruption of
 *   reading, and is not counted.
 * - **Rewind events** are maximal runs: the first rewind intent counts, further
 *   ones are the same event until forward playback advances.
 *
 * Emission is one fire-and-forget `recordSessionStats` per finished span,
 * gated by `shouldRecordSessionStats` (standard Reader only, stored text only,
 * more than zero words). The emitted record stays readable on
 * {@link SessionStatsTracker.finished} so the Session dialog can show the
 * finished session's own numbers without an IPC round-trip.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { MutableRefObject } from 'react'
import { creditedGapMs, PAUSE_EXEMPTION_WINDOW_MS } from '../../../shared/statsMath'
import { shouldRecordSessionStats, type SessionCompletion } from '../engine/readerSession'
import type { StackWordIndex } from '../engine/wordIndex'
import type { PlaybackState, SessionStatsRecord, TextRecord } from '../types'

export interface SessionStatsTrackerOptions {
  /** Host configuration — `host-completion` (RWW) opens no span and emits nothing. */
  completion: SessionCompletion
  /** The engaged text; its id/title are snapshotted into the span at start. */
  text: TextRecord
  playState: PlaybackState
  currentIndex: number
  /** The session's manual-move marker: a bumped revision means the index change is navigation. */
  manualMoveRevision: number
  stackIndex: StackWordIndex
  /**
   * The live BPM — the gap clamp's tempo term (ADR-0036 §3). Read at the
   * moment a gap closes, so a mid-session speed change moves the clamp with it.
   */
  bpm: number
}

export interface SessionStatsTracker {
  /** An explicit pause intent — opens a counted-pause span while playing. */
  notePauseIntent(): void
  /** Any rewind intent (button, ←, live rewind) — counts once per run. */
  noteRewindIntent(): void
  /** Let the first setup activity decide whether the current pause is exempt. */
  noteSetupActivity(): void
  /** Finalize the active span and emit its record (one call per session end). */
  endSession(): void
  /** The last finished session's record; null when nothing was recorded. */
  finished: MutableRefObject<SessionStatsRecord | null>
}

/** Everything one measurement span remembers. Lives in a ref; never rendered. */
interface MeasurementSpan {
  textId: number | undefined
  title: string
  startedAt: number
  /** ADR-0036 §2 accumulator — `wordsRead` at emit, complete at every instant. */
  creditedWords: number
  /** The furthest word offset the span has earned or seen past. Monotone: advancement events credit up to it, manual forward seeks rebase it without credit. */
  frontierOffset: number
  activeMs: number
  /**
   * When the gap now accruing started: the moment playback entered `playing`,
   * or the last advancement event since. Null while not playing — leaving
   * `playing` closes the exit gap and drops the anchor (ADR-0036 §3).
   */
  gapSince: number | null
  pauses: number
  rewinds: number
  /** Inside a run of consecutive rewind intents — the run already counted once. */
  inRewindRun: boolean
  /** An explicit pause awaiting resume; counted then unless exempted. */
  pauseSpanOpen: boolean
  /** Timestamp of the explicit pause intent that opened the current span. */
  pauseIntentAt: number | null
  /** The first setup activity has made the current span's exemption decision. */
  pauseExemptionDecided: boolean
  pauseSpanExempt: boolean
}

/**
 * Close the open gap into `activeMs` and stop accruing (ADR-0036 §3). A no-op
 * when no gap is open, so every "stopped reading" path — pause, stop, leaving
 * the Reader mid-play — can call it unconditionally.
 */
function closeGap(span: MeasurementSpan, now: number, bpm: number): void {
  if (span.gapSince === null) return
  span.activeMs += creditedGapMs(now - span.gapSince, bpm)
  span.gapSince = null
}

/**
 * An advancement event lands: credit the gap that ended here and start the
 * next one. With no gap open — an advancement whose commit already left
 * `playing`, as the natural end's final beat does — nothing accrues and
 * nothing re-opens; that gap was closed by the transition instead.
 */
function noteAdvancement(span: MeasurementSpan, now: number, bpm: number): void {
  if (span.gapSince === null) return
  closeGap(span, now, bpm)
  span.gapSince = now
}

/** The same "current render's value, stable identity" concession the session makes. */
function useSyncedRef<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value)
  ref.current = value
  return ref
}

export function useSessionStatsTracker({
  completion,
  text,
  playState,
  currentIndex,
  manualMoveRevision,
  stackIndex,
  bpm,
}: SessionStatsTrackerOptions): SessionStatsTracker {
  const completionRef = useSyncedRef(completion)
  const textRef = useSyncedRef(text)
  const playStateRef = useSyncedRef(playState)
  const currentIndexRef = useSyncedRef(currentIndex)
  const stackIndexRef = useSyncedRef(stackIndex)
  const bpmRef = useSyncedRef(bpm)

  const spanRef = useRef<MeasurementSpan | null>(null)
  const finished = useRef<SessionStatsRecord | null>(null)
  const prevPlayStateRef = useRef<PlaybackState>('idle')
  const prevIndexRef = useRef(currentIndex)
  const seenManualMoveRevisionRef = useRef(manualMoveRevision)

  const endSession = useCallback(() => {
    const span = spanRef.current
    if (!span) return
    spanRef.current = null
    const now = Date.now()
    // Ended mid-play (a Stop or Target raise): close the exit gap, clamped
    // like any other (ADR-0036 §3) — a session ended after an idle stretch
    // banks the clamp, not the idle. The words need nothing here: the credited
    // frontier is complete at every instant, and no fold path reads the live
    // index (ADR-0036 §2).
    closeGap(span, now, bpmRef.current)
    const wordsRead = span.creditedWords
    if (!shouldRecordSessionStats(completionRef.current, span.textId, wordsRead)) {
      finished.current = null
      return
    }
    const record: SessionStatsRecord = {
      textId: span.textId as number,
      title: span.title,
      startedAt: span.startedAt,
      endedAt: now,
      activeMs: span.activeMs,
      wordsRead,
      pauses: span.pauses,
      rewinds: span.rewinds,
    }
    finished.current = record
    try {
      void window.api.db.recordSessionStats(record).catch((error) => {
        console.error('recordSessionStats failed:', error)
      })
    } catch (error) {
      console.error('recordSessionStats failed:', error)
    }
  }, [bpmRef, completionRef])

  // Play-state transitions: span open/continue, the entry and exit gaps of the
  // §3 accrual, and the counted-pause span's resolution at resume.
  useEffect(() => {
    const prev = prevPlayStateRef.current
    if (prev === playState) return
    prevPlayStateRef.current = playState
    const span = spanRef.current
    const now = Date.now()

    if (playState === 'playing') {
      if (span) {
        // Resume opens the entry gap: play/resume → first advancement.
        span.gapSince = now
        if (span.pauseSpanOpen) {
          if (!span.pauseSpanExempt) span.pauses += 1
          span.pauseSpanOpen = false
          span.pauseIntentAt = null
          span.pauseExemptionDecided = false
          span.pauseSpanExempt = false
        }
      } else if (completionRef.current === 'session-dialog') {
        const engaged = textRef.current
        spanRef.current = {
          textId: engaged.id,
          title: engaged.title,
          startedAt: now,
          creditedWords: 0,
          frontierOffset: stackIndexRef.current.offsetAtStack(currentIndexRef.current),
          activeMs: 0,
          gapSince: now,
          pauses: 0,
          rewinds: 0,
          inRewindRun: false,
          pauseSpanOpen: false,
          pauseIntentAt: null,
          pauseExemptionDecided: false,
          pauseSpanExempt: false,
        }
      }
    } else if (prev === 'playing' && span) {
      // Close the exit gap only — the credited frontier already holds every
      // word playback carried the playhead past (ADR-0036 §2).
      closeGap(span, now, bpmRef.current)
    }
  }, [playState, bpmRef, completionRef, currentIndexRef, stackIndexRef, textRef])

  // Index movement: an advancement event (a timer beat or a tap-to-read
  // `step()`) credits the frontier delta, closes its gap-clamped stretch of
  // active time and closes a rewind run; manual moves (scrubber, skip-forward,
  // bookmark jump) rebase the frontier without credit and leave the open gap
  // running — a seek is not reading, and the gap it sits inside is clamped
  // like any other.
  useEffect(() => {
    const isManualMove = manualMoveRevision !== seenManualMoveRevisionRef.current
    seenManualMoveRevisionRef.current = manualMoveRevision
    const previousIndex = prevIndexRef.current
    prevIndexRef.current = currentIndex
    const span = spanRef.current
    if (!span) return
    const offset = stackIndexRef.current.offsetAtStack(currentIndex)
    if (isManualMove) {
      // ADR-0036 §2: a forward seek rebases the frontier to the seek target,
      // crediting nothing — the skipped gap sits behind the frontier and can
      // never be credited retroactively. A backward seek leaves it in place.
      if (offset > span.frontierOffset) span.frontierOffset = offset
      return
    }
    if (currentIndex > previousIndex) {
      // No playing gate on the credit: the natural end's final advance and its
      // pause land in one commit, so this render's play state is already
      // 'paused' when the final stack must still credit. Non-playback forward
      // jumps (a span opening at its start index, the re-tokenization restore)
      // land at the frontier and credit zero by construction.
      span.creditedWords += Math.max(0, offset - span.frontierOffset)
      if (offset > span.frontierOffset) span.frontierOffset = offset
      // The tick between which active time accrues (ADR-0036 §3): credit the
      // gap that ended here, clamped, and start the next one.
      noteAdvancement(span, Date.now(), bpmRef.current)
      // The rewind-run re-arm keeps its original rule: forward *playback*.
      if (playStateRef.current === 'playing') span.inRewindRun = false
    }
  }, [currentIndex, manualMoveRevision, bpmRef, playStateRef, stackIndexRef])

  // Engaging another text ends the session it interrupts: the span snapshotted
  // its own text identity at start, so the emit is for the text that was read.
  const prevTextRef = useRef(text)
  useEffect(() => {
    if (prevTextRef.current === text) return
    prevTextRef.current = text
    endSession()
  }, [text, endSession])

  // Leaving the Reader ends the session — the unmount half of "every end path".
  useEffect(() => () => endSession(), [endSession])

  const notePauseIntent = useCallback(() => {
    const span = spanRef.current
    if (!span || playStateRef.current !== 'playing' || span.pauseSpanOpen) return
    span.pauseSpanOpen = true
    span.pauseIntentAt = Date.now()
    span.pauseExemptionDecided = false
    span.pauseSpanExempt = false
  }, [playStateRef])

  const noteRewindIntent = useCallback(() => {
    const span = spanRef.current
    if (!span || span.inRewindRun) return
    span.rewinds += 1
    span.inRewindRun = true
  }, [])

  const noteSetupActivity = useCallback(() => {
    const span = spanRef.current
    if (!span || !span.pauseSpanOpen || span.pauseExemptionDecided) return
    const pauseIntentAt = span.pauseIntentAt
    if (pauseIntentAt === null) return
    span.pauseExemptionDecided = true
    const elapsedMs = Date.now() - pauseIntentAt
    span.pauseSpanExempt = elapsedMs >= 0 && elapsedMs <= PAUSE_EXEMPTION_WINDOW_MS
  }, [])

  return useMemo(
    () => ({ notePauseIntent, noteRewindIntent, noteSetupActivity, endSession, finished }),
    [notePauseIntent, noteRewindIntent, noteSetupActivity, endSession]
  )
}
