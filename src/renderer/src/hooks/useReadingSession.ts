/**
 * The **reading session** (ADR-0026) — one interface, one module.
 *
 * A reading session is a single continuous run of one text: it begins when
 * playback starts from rest and ends on Stop, a Target crossing, the natural
 * end, or leaving the Reader. Pausing and resuming stay *inside* it. Everything
 * that statement implies lives behind {@link useReadingSession}: the playback
 * timer and index, the resume countdown, the position saves, the session
 * baseline and its commit/revert paths, goal-crossing detection and the goal's
 * self-deletion, and the natural end. The ADR-0035 **session stats** sensor
 * (`useSessionStatsTracker`) is owned here too — measurement rides the session
 * boundary, and exactly one record is emitted per session end.
 *
 * ## Why it is one interface
 *
 * Before `architecture-depth/11` this was two hooks the Reader wired together.
 * `usePlayback` returned twenty members, eight of which the component forwarded
 * into `useReadingSessionLifecycle`, one of which (`discardToStart`) came back
 * out unchanged to be called by the component that had supplied it. Restart was
 * a **paired-call protocol** — the lifecycle half and the playback half, in
 * order, at two separate call sites, enforced by neither hook. The goal stack
 * index was computed twice, identically, in both files. None of that was
 * reachable from a test without rendering the whole Reader.
 *
 * Now the Reader consumes intents — play, pause, resume, stop, restart, seek,
 * rewind, step, discard, commit — and reads state. No member exists only to be
 * handed back to its supplier, and every intent is complete on its own.
 *
 * ## What it does not own
 *
 * Which reader *surface* is open (quick settings, bookmark popover, config
 * drawer, plain-text view, library browse) and the Target-pick mode belong to
 * `hooks/useReaderSurfaces.ts`; the bookmark list belongs to the Reader
 * (`hooks/useBookmarkCollection.ts`). Both were coordinated inline in
 * `Reader.tsx` until `architecture-depth/12`. The dependency runs one way — the
 * surfaces owner calls this module's `pause` and `dismissSessionEnd`; nothing
 * here reads a surface. `showBookmarkPopover` briefly lived on this interface
 * because the saved-position load reset it on a text change; the surfaces owner
 * keys its whole state on the engaged text instead, so the reset is gone rather
 * than moved.
 *
 * ## Internal representation notes
 *
 * **Synchronous mirrors.** Effects need values that are also rendered. Rather
 * than a bag of hand-maintained parallel refs, the module keeps exactly one
 * mirror ({@link useSyncedRef} over the word index, so a re-tokenization does
 * not re-run the save effect) and otherwise reads the render's own values — the
 * session-end mirror is gone entirely, because the rule that needed it is now a
 * pure predicate taking a flag ({@link shouldCaptureSessionBaseline}). The
 * remaining refs are session *memory* — values with no rendered counterpart.
 *
 * **No persistence without an id.** The Overlay Reader host fabricates a
 * `TextRecord` with no `id`; {@link sessionPersists} names that contract, and
 * every write path routes through it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { SegmentContext } from '../engine/plainTextContext'
import {
  computeResumePct,
  isCountdownComplete,
  nextCountdownTick,
  playbackCanCross,
  resolveValidSavedIndex,
  selectSessionBaseline,
  sessionPersists,
  shouldCaptureSessionBaseline,
  shouldFireOnCrossing,
  shouldFireComplete,
  shouldFireOnce,
  shouldSavePosition,
  type SessionCompletion,
  type SessionEndReason,
} from '../engine/readerSession'
import type { StackWordIndex } from '../engine/wordIndex'
import { usePlayback, type PlaybackEngine } from './usePlayback'
import { useSessionStatsTracker } from './useSessionStatsTracker'
import { useStackWordIndex } from './useWordIndex'
import type {
  Bookmark,
  PlaybackState,
  ReadingPosition,
  SessionStatsRecord,
  Settings,
  TextRecord,
  WordStack,
} from '../types'

type PositionSource = NonNullable<ReadingPosition['source']>
type SavedPositionSnapshot = Pick<ReadingPosition, 'stackIndex' | 'source'>

export interface SessionCoordinationOptions {
  /** The engaged text. A record with **no `id`** persists nothing (see module docblock). */
  text: TextRecord
  /** Set when the engaged text is one segment of a larger text; selects the save source. */
  segmentCtx: SegmentContext | undefined
  /** Host configuration: which completion path a finished run takes. */
  completion: SessionCompletion
  /** Reread return point, if one is armed. */
  rereReadEndIndex: number | null
  /** The text's single Target, if it has one (ADR-0024). */
  goalBookmark: Bookmark | null
  /** Resume intent as a stack index (the Overlay Reader's auto-start uses this). */
  resumeFromIndex: number | null
  /** Resume intent as a durable word offset; resolved once stacks exist. Wins when set. */
  resumeFromWordOffset: number | null
  onResumeHandled?: () => void
  onGoalBookmarkConsumed: (bookmarkId: number) => void
  onReadingComplete?: (
    startWordOffset: number,
    endWordOffset: number,
    endStackIndex: number
  ) => void
  refreshResumeCandidate: () => void | Promise<void>
}

export interface ReadingSessionOptions extends SessionCoordinationOptions {
  /** Live reader settings — the playback engine reads them on every beat. */
  settings: Settings
}

export interface ReadingSession {
  // ── Observable state ──────────────────────────────────────────────────────
  /** The current tokenization. Empty until the off-thread builder delivers. */
  stacks: WordStack[]
  /** The word index's stack half over {@link stacks}. */
  stackIndex: StackWordIndex
  currentIndex: number
  playState: PlaybackState
  wpm: number
  /** 0–1 through the tokenization. */
  progress: number
  totalWords: number
  wordsRead: number
  /** 3 → 2 → 1 before a resume starts, else null. */
  countdown: number | null
  /** The session-end variant to show. Only a `session-dialog` host ever raises one. */
  sessionEnd: SessionEndReason | null
  /** The saved position when it is usable as a resume point, else null. */
  validSavedIndex: number | null
  resumePct: number | null
  /** The Target's live stack index — resolved once, here, for every consumer. */
  goalStackIndex: number | null

  // ── Intents ───────────────────────────────────────────────────────────────
  /** Start a new session at the beginning of the text. */
  play(): void
  /** Start a new session at the saved position. No-op when there is nothing to resume. */
  resumeSaved(): void
  /** Pause without ending the session. */
  pause(): void
  /** Resume inside the session. */
  resume(): void
  /** End the run the way this host completes runs. */
  stop(): void
  /** One intent: reset the session's start and replay from the beginning. */
  restart(): void
  /** A manual move: it never consumes a Target and it dismisses a shown session end. */
  seekTo(index: number): void
  rewind(steps?: number): void
  /** Advance one stack (tap-to-read). */
  step(): void
  /** Commit the held position — "Save & Exit" and every leave. */
  commit(): Promise<ReadingPosition | null>
  /** ADR-0026 §3's one exception: restore the baseline and reset to the start. */
  discard(): Promise<ReadingPosition | null>
  /** Dismiss a shown session end without ending or committing anything. */
  dismissSessionEnd(): void
  /** Remember the live position across a re-tokenization. */
  beforeRetokenize(): void

  // ── Session stats (ADR-0035) ──────────────────────────────────────────────
  /**
   * Retro-exempt the current counted-pause span: a reader surface opened or a
   * reader setting changed, so the pause is setup, not struggle (ADR-0035 §2).
   */
  noteSetupActivity(): void
  /**
   * The finished session's measured record — what the Session dialog's stats
   * block reads without an IPC round-trip. Null when nothing was recorded
   * (zero words, an unstored text, a `host-completion` host).
   */
  finishedSessionStats: SessionStatsRecord | null
}

/**
 * The reading session as the Reader consumes it: the playback engine plus the
 * session lifecycle, behind one interface.
 */
export function useReadingSession(options: ReadingSessionOptions): ReadingSession {
  const playback = usePlayback({
    text: options.text?.content ?? '',
    settings: options.settings,
    // ADR-0026 §4: the guided completion path holds the final position instead
    // of stopping, so the End variant can show real progress.
    pauseOnNaturalEnd: options.completion === 'session-dialog',
  })

  return useSessionCoordination(playback, options)
}

// ── Session memory ──────────────────────────────────────────────────────────

interface RestorePosition {
  offset: number
  prevState: PlaybackState
}

/**
 * Values the session remembers across renders that have no rendered
 * counterpart: transition inputs, fire-once latches, and the two positions of
 * the ADR-0026 save model.
 */
interface SessionMemory {
  /** Where the current session began — the passage-summary start offset. */
  sessionStartRef: MutableRefObject<number>
  /** The last index playback actually held; every save writes this, not the live index. */
  endPositionRef: MutableRefObject<number>
  /** Previous play state, for the transition predicates. */
  prevStateRef: MutableRefObject<PlaybackState>
  rereReadEndFiredRef: MutableRefObject<boolean>
  goalFiredRef: MutableRefObject<boolean>
  /** Position to restore once a re-tokenization delivers new stacks. */
  restorePositionRef: MutableRefObject<RestorePosition | null>
  /** The store's saved position as this session last saw it. */
  savedPositionRef: MutableRefObject<SavedPositionSnapshot | null>
  /** The **session baseline** — what "Exit without saving" restores (ADR-0026 §1). */
  baselineRef: MutableRefObject<SavedPositionSnapshot | null>
}

function useSessionMemory(rereReadEndIndex: number | null): SessionMemory {
  const sessionStartRef = useRef(0)
  const endPositionRef = useRef(0)
  const prevStateRef = useRef<PlaybackState>('idle')
  const rereReadEndFiredRef = useRef(false)
  const goalFiredRef = useRef(false)
  const restorePositionRef = useRef<RestorePosition | null>(null)
  const savedPositionRef = useRef<SavedPositionSnapshot | null>(null)
  const baselineRef = useRef<SavedPositionSnapshot | null>(null)

  useEffect(() => {
    rereReadEndFiredRef.current = false
  }, [rereReadEndIndex])

  return useMemo(() => ({
    sessionStartRef,
    endPositionRef,
    prevStateRef,
    rereReadEndFiredRef,
    goalFiredRef,
    restorePositionRef,
    savedPositionRef,
    baselineRef,
  }), [])
}

/**
 * A ref that always holds the current render's value.
 *
 * The module's one concession to "an effect needs this value but must not re-run
 * when it changes". Everything else an effect needs is read from the render it
 * was scheduled by.
 */
function useSyncedRef<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value)
  ref.current = value
  return ref
}

function positionSourceFor(segmentCtx: SegmentContext | undefined): PositionSource {
  return segmentCtx ? 'segment' : 'text'
}

function persistReadingPosition({
  textId,
  stackIndex,
  source,
  refreshResumeCandidate,
  memory,
}: {
  textId: number | undefined
  stackIndex: number
  source: PositionSource
  refreshResumeCandidate: () => void | Promise<void>
  memory: SessionMemory
}): Promise<ReadingPosition | null> {
  if (!sessionPersists(textId)) return Promise.resolve(null)

  memory.savedPositionRef.current = { stackIndex, source }

  return window.api.db
    .saveReadingPosition(textId as number, stackIndex, source)
    .then((position) => {
      if (source === 'text') {
        void refreshResumeCandidate()
      }
      return position
    })
    .catch(() => null)
}

// ── Lifecycle clusters ──────────────────────────────────────────────────────

function useResumeCountdown(
  resumeFromIndex: number | null,
  onResumeHandled: (() => void) | undefined,
  playFrom: (index: number) => void,
  setSavedStackIndex: Dispatch<SetStateAction<number | null>>,
  memory: SessionMemory
) {
  const [countdown, setCountdown] = useState<number | null>(null)
  const pendingPlayIndexRef = useRef(0)

  useEffect(() => {
    if (resumeFromIndex == null) return
    onResumeHandled?.()
    pendingPlayIndexRef.current = resumeFromIndex
    memory.sessionStartRef.current = resumeFromIndex
    setSavedStackIndex(null)
    setCountdown(3)
  }, [resumeFromIndex, onResumeHandled, memory, setSavedStackIndex])

  useEffect(() => {
    if (countdown === null) return
    if (isCountdownComplete(countdown)) {
      setCountdown(null)
      playFrom(pendingPlayIndexRef.current)
      return
    }
    const timer = setTimeout(() => setCountdown(nextCountdownTick), 1000)
    return () => clearTimeout(timer)
  }, [countdown, playFrom])

  return { countdown, setCountdown }
}

function useSavedReadingPosition(
  textId: number | undefined,
  positionSource: PositionSource,
  setSavedStackIndex: Dispatch<SetStateAction<number | null>>,
  setCountdown: Dispatch<SetStateAction<number | null>>,
  memory: SessionMemory
) {
  useEffect(() => {
    if (!sessionPersists(textId)) return
    setSavedStackIndex(null)
    setCountdown(null)
    memory.savedPositionRef.current = null
    memory.baselineRef.current = null
    window.api.db
      .getReadingPosition(textId as number)
      .then((position) => {
        memory.savedPositionRef.current = position
          ? { stackIndex: position.stackIndex, source: position.source ?? positionSource }
          : null
        if (position && position.stackIndex > 0) {
          setSavedStackIndex(position.stackIndex)
        }
      })
      .catch(() => {})
  }, [textId, positionSource, setSavedStackIndex, setCountdown, memory])
}

function useEndPosition(currentIndex: number, playState: PlaybackState, memory: SessionMemory) {
  useEffect(() => {
    if (playState === 'playing' || playState === 'paused') {
      memory.endPositionRef.current = currentIndex
    }
  }, [currentIndex, playState, memory])
}

function usePositionSaveAndCompletion({
  textId,
  playState,
  sessionEnd,
  segmentCtx,
  stackIndexRef,
  onReadingComplete,
  refreshResumeCandidate,
  memory,
  dismissSessionEnd,
}: {
  textId: number | undefined
  playState: PlaybackState
  sessionEnd: SessionEndReason | null
  segmentCtx: SegmentContext | undefined
  stackIndexRef: MutableRefObject<StackWordIndex>
  onReadingComplete: SessionCoordinationOptions['onReadingComplete']
  refreshResumeCandidate: () => void | Promise<void>
  memory: SessionMemory
  dismissSessionEnd: () => void
}) {
  useEffect(() => {
    const previous = memory.prevStateRef.current
    memory.prevStateRef.current = playState
    const positionSource = positionSourceFor(segmentCtx)

    if (shouldCaptureSessionBaseline(previous, playState, sessionEnd !== null)) {
      memory.baselineRef.current = selectSessionBaseline(
        memory.savedPositionRef.current,
        positionSource
      )
    }

    if (playState === 'playing' && sessionEnd !== null) {
      dismissSessionEnd()
    }

    if (shouldSavePosition(previous, playState, memory.endPositionRef.current)) {
      void persistReadingPosition({
        textId,
        stackIndex: memory.endPositionRef.current,
        source: positionSource,
        refreshResumeCandidate,
        memory,
      })
    }

    if (shouldFireComplete(previous, playState) && onReadingComplete) {
      onReadingComplete(
        stackIndexRef.current.offsetAtStack(memory.sessionStartRef.current),
        stackIndexRef.current.offsetAtStack(memory.endPositionRef.current),
        memory.endPositionRef.current
      )
    }
  }, [
    playState,
    sessionEnd,
    onReadingComplete,
    textId,
    segmentCtx,
    stackIndexRef,
    refreshResumeCandidate,
    memory,
    dismissSessionEnd,
  ])
}

function useSessionAutoStop({
  currentIndex,
  playState,
  rereReadEndIndex,
  goalBookmark,
  goalStackIndex,
  manualMoveRevision,
  endsWithDialog,
  stop,
  pauseAndHold,
  raiseSessionEnd,
  onGoalBookmarkConsumed,
  memory,
}: {
  currentIndex: number
  playState: PlaybackState
  rereReadEndIndex: number | null
  goalBookmark: Bookmark | null
  goalStackIndex: number | null
  manualMoveRevision: number
  endsWithDialog: boolean
  stop: () => void
  pauseAndHold: () => void
  raiseSessionEnd: (reason: SessionEndReason) => void
  onGoalBookmarkConsumed: (bookmarkId: number) => void
  memory: SessionMemory
}) {
  const previousIndexRef = useRef(currentIndex)
  const seenManualMoveRevisionRef = useRef(manualMoveRevision)

  useEffect(() => {
    memory.goalFiredRef.current = false
  }, [goalBookmark?.id, goalStackIndex, memory])

  useEffect(() => {
    const previousIndex = previousIndexRef.current
    const isManualMove = manualMoveRevision !== seenManualMoveRevisionRef.current
    seenManualMoveRevisionRef.current = manualMoveRevision

    if (!playbackCanCross(playState)) {
      previousIndexRef.current = currentIndex
      return
    }

    const hitRereEnd = shouldFireOnce(
      currentIndex,
      rereReadEndIndex,
      memory.rereReadEndFiredRef.current
    )
    const hitGoal = shouldFireOnCrossing(
      previousIndex,
      currentIndex,
      goalStackIndex,
      memory.goalFiredRef.current,
      isManualMove
    )

    previousIndexRef.current = currentIndex

    if (!hitRereEnd && !hitGoal) return

    if (hitRereEnd) memory.rereReadEndFiredRef.current = true
    if (hitGoal && goalBookmark) {
      // ADR-0024: a crossed Target consumes itself; a manual scrub past it does
      // not, which `shouldFireOnCrossing` decides above.
      memory.goalFiredRef.current = true
      window.api.db
        .deleteBookmark(goalBookmark.id)
        .then(() => onGoalBookmarkConsumed(goalBookmark.id))
        .catch(() => {})
    }
    memory.endPositionRef.current = currentIndex
    if (hitGoal && endsWithDialog) {
      raiseSessionEnd('goal')
      pauseAndHold()
    } else {
      stop()
    }
  }, [
    currentIndex,
    playState,
    rereReadEndIndex,
    goalBookmark,
    goalStackIndex,
    manualMoveRevision,
    endsWithDialog,
    stop,
    pauseAndHold,
    raiseSessionEnd,
    onGoalBookmarkConsumed,
    memory,
  ])
}

function useNaturalSessionEnd({
  naturalEndRevision,
  endsWithDialog,
  raiseSessionEnd,
}: {
  naturalEndRevision: number
  endsWithDialog: boolean
  raiseSessionEnd: (reason: SessionEndReason) => void
}) {
  const seenNaturalEndRevisionRef = useRef(naturalEndRevision)

  useEffect(() => {
    if (naturalEndRevision === seenNaturalEndRevisionRef.current) return
    seenNaturalEndRevisionRef.current = naturalEndRevision
    if (endsWithDialog) raiseSessionEnd('end')
  }, [naturalEndRevision, endsWithDialog, raiseSessionEnd])
}

function useRetokenizeRestore(
  stackIndex: StackWordIndex,
  playFrom: (index: number) => void,
  pause: () => void,
  memory: SessionMemory
) {
  useEffect(() => {
    const restore = memory.restorePositionRef.current
    if (!restore || stackIndex.stackCount === 0) return
    memory.restorePositionRef.current = null

    const targetIndex = stackIndex.restoreStackAtOffset(restore.offset)
    if (restore.prevState === 'playing') {
      playFrom(targetIndex)
    } else if (restore.prevState === 'paused') {
      playFrom(targetIndex)
      pause()
    }
  }, [stackIndex, playFrom, pause, memory])
}

/**
 * Every effect the session runs, in one call and in one order: the resume
 * countdown, the saved-position load, the held end position, the save/complete
 * transitions, target and reread crossing, the natural end, and the
 * re-tokenization restore.
 */
function useSessionLifecycle({
  text,
  segmentCtx,
  positionSource,
  playState,
  currentIndex,
  stackIndex,
  stackIndexRef,
  resumeFromIndex,
  rereReadEndIndex,
  goalBookmark,
  goalStackIndex,
  manualMoveRevision,
  naturalEndRevision,
  endsWithDialog,
  sessionEnd,
  memory,
  playFrom,
  pause,
  stop,
  pauseAndHold,
  setSavedStackIndex,
  raiseSessionEnd,
  dismissSessionEnd,
  onResumeHandled,
  onGoalBookmarkConsumed,
  onReadingComplete,
  refreshResumeCandidate,
}: {
  text: TextRecord
  segmentCtx: SegmentContext | undefined
  positionSource: PositionSource
  playState: PlaybackState
  currentIndex: number
  stackIndex: StackWordIndex
  stackIndexRef: MutableRefObject<StackWordIndex>
  resumeFromIndex: number | null
  rereReadEndIndex: number | null
  goalBookmark: Bookmark | null
  goalStackIndex: number | null
  manualMoveRevision: number
  naturalEndRevision: number
  endsWithDialog: boolean
  sessionEnd: SessionEndReason | null
  memory: SessionMemory
  playFrom: (index: number) => void
  pause: () => void
  stop: () => void
  pauseAndHold: () => void
  setSavedStackIndex: Dispatch<SetStateAction<number | null>>
  raiseSessionEnd: (reason: SessionEndReason) => void
  dismissSessionEnd: () => void
  onResumeHandled: SessionCoordinationOptions['onResumeHandled']
  onGoalBookmarkConsumed: (bookmarkId: number) => void
  onReadingComplete: SessionCoordinationOptions['onReadingComplete']
  refreshResumeCandidate: () => void | Promise<void>
}) {
  const { countdown, setCountdown } = useResumeCountdown(
    resumeFromIndex,
    onResumeHandled,
    playFrom,
    setSavedStackIndex,
    memory
  )
  useSavedReadingPosition(text.id, positionSource, setSavedStackIndex, setCountdown, memory)
  useEndPosition(currentIndex, playState, memory)
  usePositionSaveAndCompletion({
    textId: text.id,
    playState,
    sessionEnd,
    segmentCtx,
    stackIndexRef,
    onReadingComplete,
    refreshResumeCandidate,
    memory,
    dismissSessionEnd,
  })
  useSessionAutoStop({
    currentIndex,
    playState,
    rereReadEndIndex,
    goalBookmark,
    goalStackIndex,
    manualMoveRevision,
    endsWithDialog,
    stop,
    pauseAndHold,
    raiseSessionEnd,
    onGoalBookmarkConsumed,
    memory,
  })
  useNaturalSessionEnd({
    naturalEndRevision,
    endsWithDialog,
    raiseSessionEnd,
  })
  useRetokenizeRestore(stackIndex, playFrom, pause, memory)

  return { countdown, setCountdown }
}

// ── Intents ─────────────────────────────────────────────────────────────────

type SessionIntents = Pick<
  ReadingSession,
  'play' | 'resumeSaved' | 'restart' | 'stop' | 'seekTo' | 'commit' | 'discard' | 'beforeRetokenize'
>

/**
 * The intents that change the session. Each one is complete on its own: no
 * caller pairs two of them, and none is a verb the caller supplied.
 */
function useSessionIntents({
  textId,
  positionSource,
  endsWithDialog,
  currentIndex,
  playState,
  stackIndex,
  validSavedIndex,
  memory,
  refreshResumeCandidate,
  setSavedStackIndex,
  setSessionEnd,
  setCountdown,
  setManualMoveRevision,
  raiseSessionEnd,
  playbackPlay,
  playFrom,
  playbackRestart,
  playbackStop,
  pauseAndHold,
  discardToStart,
  playbackSeekTo,
}: {
  textId: number | undefined
  positionSource: PositionSource
  endsWithDialog: boolean
  currentIndex: number
  playState: PlaybackState
  stackIndex: StackWordIndex
  validSavedIndex: number | null
  memory: SessionMemory
  refreshResumeCandidate: () => void | Promise<void>
  setSavedStackIndex: Dispatch<SetStateAction<number | null>>
  setSessionEnd: Dispatch<SetStateAction<SessionEndReason | null>>
  setCountdown: Dispatch<SetStateAction<number | null>>
  setManualMoveRevision: Dispatch<SetStateAction<number>>
  raiseSessionEnd: (reason: SessionEndReason) => void
  playbackPlay: () => void
  playFrom: (index: number) => void
  playbackRestart: () => void
  playbackStop: () => void
  pauseAndHold: () => void
  discardToStart: () => void
  playbackSeekTo: (index: number) => void
}): SessionIntents {
  const play = useCallback(() => {
    memory.sessionStartRef.current = 0
    setSavedStackIndex(null)
    playbackPlay()
  }, [playbackPlay, memory, setSavedStackIndex])

  const resumeSaved = useCallback(() => {
    if (validSavedIndex === null) return
    memory.sessionStartRef.current = validSavedIndex
    setSavedStackIndex(null)
    playFrom(validSavedIndex)
  }, [validSavedIndex, playFrom, memory, setSavedStackIndex])

  /**
   * One intent. It was a paired-call protocol — the caller had to reset the
   * session's start *and* restart playback, in order, at every call site.
   */
  const restart = useCallback(() => {
    memory.sessionStartRef.current = 0
    setSavedStackIndex(null)
    playbackRestart()
  }, [playbackRestart, memory, setSavedStackIndex])

  const stop = useCallback(() => {
    setCountdown(null)
    if (endsWithDialog) {
      // ADR-0026 §4: hold the position so the dialog can show real progress.
      memory.endPositionRef.current = currentIndex
      raiseSessionEnd('stop')
      pauseAndHold()
      return
    }
    playbackStop()
  }, [setCountdown, endsWithDialog, memory, currentIndex, raiseSessionEnd, pauseAndHold, playbackStop])

  /**
   * Every deliberate move by the reader: the scrubber, a bookmark jump, the
   * skip-forward key. It marks the move as manual — which is what keeps a
   * scrub past the Target from consuming it (ADR-0024) — and dismisses a shown
   * session end, since the reader has moved on from the position it described.
   */
  const seekTo = useCallback((index: number) => {
    setManualMoveRevision((revision) => revision + 1)
    setSessionEnd(null)
    playbackSeekTo(index)
  }, [playbackSeekTo, setManualMoveRevision, setSessionEnd])

  const commit = useCallback(() => {
    if (!memory.baselineRef.current) return Promise.resolve(null)
    return persistReadingPosition({
      textId,
      stackIndex: memory.endPositionRef.current,
      source: positionSource,
      refreshResumeCandidate,
      memory,
    })
  }, [textId, positionSource, refreshResumeCandidate, memory])

  /**
   * ADR-0026 §3's one exception to unconditional save-on-leave: restore the
   * baseline, then reset playback to the start. Both halves, one intent — the
   * reset used to be a playback member the Reader received from the lifecycle
   * hook that had been handed it.
   */
  const discard = useCallback(() => {
    const baseline = memory.baselineRef.current
    if (!baseline) return Promise.resolve(null)
    return persistReadingPosition({
      textId,
      stackIndex: baseline.stackIndex,
      source: baseline.source ?? positionSource,
      refreshResumeCandidate,
      memory,
    }).then((position) => {
      discardToStart()
      setSessionEnd(null)
      return position
    })
  }, [textId, positionSource, refreshResumeCandidate, memory, discardToStart, setSessionEnd])

  const beforeRetokenize = useCallback(() => {
    memory.restorePositionRef.current = {
      offset: stackIndex.offsetAtStack(currentIndex),
      prevState: playState,
    }
  }, [stackIndex, currentIndex, playState, memory])

  return { play, resumeSaved, restart, stop, seekTo, commit, discard, beforeRetokenize }
}

// ── Coordination ────────────────────────────────────────────────────────────

/**
 * The session's coordination half, over an explicit playback engine.
 *
 * Module-private. It was exported so the behavior suite's hand-written fake
 * Reader could drive the state machine against a fake engine;
 * `architecture-depth/12` retired that harness — the suite drives
 * {@link useReadingSession} itself — so the seam is internal again.
 */
function useSessionCoordination(
  playback: PlaybackEngine,
  {
    text,
    segmentCtx,
    completion,
    rereReadEndIndex,
    goalBookmark,
    resumeFromIndex: resumeFromStackIndex,
    resumeFromWordOffset,
    onResumeHandled,
    onGoalBookmarkConsumed,
    onReadingComplete,
    refreshResumeCandidate,
  }: SessionCoordinationOptions
): ReadingSession {
  // Destructured rather than held as one object: the engine's verbs are stable
  // across renders, so the session's intents are too, and a consumer's callback
  // deps do not churn once per beat.
  const {
    stacks,
    currentIndex,
    state: playState,
    bpm,
    wpm,
    progress,
    naturalEndRevision,
    play: playbackPlay,
    playFrom,
    pause: playbackPause,
    resume,
    stop: playbackStop,
    pauseAndHold,
    discardToStart,
    restart: playbackRestart,
    rewind: playbackRewind,
    seekTo: playbackSeekTo,
    stepForward,
  } = playback
  const stackIndex = useStackWordIndex(stacks)
  const stackIndexRef = useSyncedRef(stackIndex)
  const positionSource = positionSourceFor(segmentCtx)
  // The one place the host's completion configuration is read.
  const endsWithDialog = completion === 'session-dialog'

  const [savedStackIndex, setSavedStackIndex] = useState<number | null>(null)
  const [sessionEnd, setSessionEnd] = useState<SessionEndReason | null>(null)
  const [manualMoveRevision, setManualMoveRevision] = useState(0)
  const memory = useSessionMemory(rereReadEndIndex)

  // The ADR-0035 sensor: session measurement in refs, one record per session
  // end. It watches the same signals the lifecycle does; the intent wrappers
  // below are the only places it is told anything.
  const statsTracker = useSessionStatsTracker({
    completion,
    text,
    playState,
    currentIndex,
    manualMoveRevision,
    stackIndex,
    // The gap clamp's tempo term (ADR-0036 §3); live off the engine, so a
    // mid-session speed change moves it.
    bpm,
  })

  const raiseSessionEnd = useCallback((reason: SessionEndReason) => {
    // §4 pauses and holds instead of stopping, so the session is over the
    // moment an end is raised — finalize the measured record here (before the
    // dialog renders) so `finishedSessionStats` is readable when it shows.
    statsTracker.endSession()
    setSessionEnd(reason)
  }, [statsTracker])
  const dismissSessionEnd = useCallback(() => {
    setSessionEnd(null)
  }, [])

  /** The explicit pause intent — the only pause the stats tracker may count. */
  const pause = useCallback(() => {
    statsTracker.notePauseIntent()
    playbackPause()
  }, [statsTracker, playbackPause])

  /** Every rewind intent (button, ←, live rewind) — one stats event per run. */
  const rewind = useCallback((steps?: number) => {
    statsTracker.noteRewindIntent()
    playbackRewind(steps)
  }, [statsTracker, playbackRewind])

  /**
   * The Target's live stack index, resolved once for every consumer: the
   * crossing detector below and the scrubber marker the Reader paints.
   */
  const goalStackIndex = useMemo(
    () =>
      goalBookmark && stackIndex.stackCount > 0
        ? stackIndex.stackAtOffset(goalBookmark.wordOffset)
        : null,
    [goalBookmark, stackIndex]
  )

  /**
   * A resume intent arrives either as a stack index or as a durable word offset
   * (a bookmark). The offset needs the tokenization, which lands here rather
   * than in the context that opened the text, so it stays null until stacks
   * exist and the resume then fires once, on a real index.
   */
  const resumeFromIndex = useMemo(() => {
    if (resumeFromWordOffset == null) return resumeFromStackIndex
    return stackIndex.stackCount === 0 ? null : stackIndex.stackAtOffset(resumeFromWordOffset)
  }, [resumeFromWordOffset, resumeFromStackIndex, stackIndex])

  const { countdown, setCountdown } = useSessionLifecycle({
    text,
    segmentCtx,
    positionSource,
    playState,
    currentIndex,
    stackIndex,
    stackIndexRef,
    resumeFromIndex,
    rereReadEndIndex,
    goalBookmark,
    goalStackIndex,
    manualMoveRevision,
    naturalEndRevision,
    endsWithDialog,
    sessionEnd,
    memory,
    playFrom,
    // The retokenize-restore's pause is the session's own consequence, not a
    // user pause intent — it must not open a counted-pause span.
    pause: playbackPause,
    stop: playbackStop,
    pauseAndHold,
    setSavedStackIndex,
    raiseSessionEnd,
    dismissSessionEnd,
    onResumeHandled,
    onGoalBookmarkConsumed,
    onReadingComplete,
    refreshResumeCandidate,
  })

  const validSavedIndex = resolveValidSavedIndex(savedStackIndex, stackIndex.stackCount)
  const resumePct = computeResumePct(validSavedIndex, stackIndex.stackCount)

  const { play, resumeSaved, restart, stop, seekTo, commit, discard, beforeRetokenize } =
    useSessionIntents({
      textId: text.id,
      positionSource,
      endsWithDialog,
      currentIndex,
      playState,
      stackIndex,
      validSavedIndex,
      memory,
      refreshResumeCandidate,
      setSavedStackIndex,
      setSessionEnd,
      setCountdown,
      setManualMoveRevision,
      raiseSessionEnd,
      playbackPlay,
      playFrom,
      playbackRestart,
      playbackStop,
      pauseAndHold,
      discardToStart,
      playbackSeekTo,
    })

  return useMemo(() => ({
    stacks,
    stackIndex,
    currentIndex,
    playState,
    wpm,
    progress,
    totalWords: stackIndex.totalWords,
    wordsRead: stackIndex.offsetAtStack(currentIndex),
    countdown,
    sessionEnd,
    validSavedIndex,
    resumePct,
    goalStackIndex,
    play,
    resumeSaved,
    pause,
    resume,
    stop,
    restart,
    seekTo,
    rewind,
    step: stepForward,
    commit,
    discard,
    dismissSessionEnd,
    beforeRetokenize,
    noteSetupActivity: statsTracker.noteSetupActivity,
    // Read at memo time: the tracker finalizes the record synchronously before
    // `sessionEnd` is set, and `sessionEnd` is a dependency here, so the render
    // that shows the dialog already sees the finished numbers.
    finishedSessionStats: statsTracker.finished.current,
  }), [
    stacks,
    stackIndex,
    currentIndex,
    playState,
    wpm,
    progress,
    pause,
    resume,
    rewind,
    stepForward,
    countdown,
    sessionEnd,
    validSavedIndex,
    resumePct,
    goalStackIndex,
    play,
    resumeSaved,
    stop,
    restart,
    seekTo,
    commit,
    discard,
    dismissSessionEnd,
    beforeRetokenize,
    statsTracker,
  ])
}
