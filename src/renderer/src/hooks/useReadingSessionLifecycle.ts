import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { SegmentContext } from '../engine/plainTextContext'
import {
  computeResumePct,
  isCountdownComplete,
  nextCountdownTick,
  resolveRestoreIndex,
  resolveValidSavedIndex,
  resolveWordsToStackIndex,
  selectSessionBaseline,
  shouldFireOnCrossing,
  shouldFireComplete,
  shouldFireOnce,
  shouldSavePosition,
  shouldStartReadingSession,
  wordOffsetAtIndex,
} from '../engine/readerSession'
import type { Bookmark, PlaybackState, ReadingPosition, TextRecord, WordStack } from '../types'

type PositionSource = NonNullable<ReadingPosition['source']>
type SavedPositionSnapshot = Pick<ReadingPosition, 'stackIndex' | 'source'>
type SessionEndReason = 'stop' | 'goal' | 'end'
interface SessionEnd {
  reason: SessionEndReason
}

interface ReadingSessionLifecycleOptions {
  text: TextRecord
  stacks: WordStack[]
  currentIndex: number
  playState: PlaybackState
  segmentCtx: SegmentContext | undefined
  resumeFromIndex: number | null
  rereReadEndIndex: number | null
  goalBookmark: Bookmark | null
  manualSeekRevision: number
  naturalEndRevision: number
  sessionEndEnabled?: boolean
  play: () => void
  playFrom: (index: number) => void
  pause: () => void
  stop: () => void
  pauseAndHold: () => void
  discardToStart: () => void
  onGoalBookmarkConsumed: (bookmarkId: number) => void
  onResumeHandled?: () => void
  onReadingComplete?: (
    startWordOffset: number,
    endWordOffset: number,
    endStackIndex: number
  ) => void
  refreshResumeCandidate: () => void | Promise<void>
}

interface RestorePosition {
  offset: number
  prevState: PlaybackState
}

interface SessionRefs {
  pendingPlayIndexRef: MutableRefObject<number>
  sessionStartRef: MutableRefObject<number>
  endPositionRef: MutableRefObject<number>
  stacksRef: MutableRefObject<WordStack[]>
  prevStateRef: MutableRefObject<PlaybackState>
  rereReadEndFiredRef: MutableRefObject<boolean>
  goalBookmarkFiredRef: MutableRefObject<boolean>
  restorePositionRef: MutableRefObject<RestorePosition | null>
  savedPositionRef: MutableRefObject<SavedPositionSnapshot | null>
  sessionBaselineRef: MutableRefObject<SavedPositionSnapshot | null>
  sessionEndRef: MutableRefObject<SessionEnd | null>
}

function useSessionRefs(
  stacks: WordStack[],
  rereReadEndIndex: number | null
): SessionRefs {
  const pendingPlayIndexRef = useRef(0)
  const sessionStartRef = useRef(0)
  const endPositionRef = useRef(0)
  const stacksRef = useRef(stacks)
  const prevStateRef = useRef<PlaybackState>('idle')
  const rereReadEndFiredRef = useRef(false)
  const goalBookmarkFiredRef = useRef(false)
  const restorePositionRef = useRef<RestorePosition | null>(null)
  const savedPositionRef = useRef<SavedPositionSnapshot | null>(null)
  const sessionBaselineRef = useRef<SavedPositionSnapshot | null>(null)
  const sessionEndRef = useRef<SessionEnd | null>(null)

  useEffect(() => {
    stacksRef.current = stacks
  }, [stacks])

  useEffect(() => {
    rereReadEndFiredRef.current = false
  }, [rereReadEndIndex])

  return useMemo(() => ({
    pendingPlayIndexRef,
    sessionStartRef,
    endPositionRef,
    stacksRef,
    prevStateRef,
    rereReadEndFiredRef,
    goalBookmarkFiredRef,
    restorePositionRef,
    savedPositionRef,
    sessionBaselineRef,
    sessionEndRef,
  }), [])
}

function positionSourceFor(segmentCtx: SegmentContext | undefined): PositionSource {
  return segmentCtx ? 'segment' : 'text'
}

function persistReadingPosition({
  textId,
  stackIndex,
  source,
  refreshResumeCandidate,
  refs,
}: {
  textId: number | undefined
  stackIndex: number
  source: PositionSource
  refreshResumeCandidate: () => void | Promise<void>
  refs: SessionRefs
}): Promise<ReadingPosition | null> {
  if (!textId) return Promise.resolve(null)

  refs.savedPositionRef.current = { stackIndex, source }

  return window.api.db
    .saveReadingPosition(textId, stackIndex, source)
    .then((position) => {
      if (source === 'text') {
        void refreshResumeCandidate()
      }
      return position
    })
    .catch(() => null)
}

function useResumeCountdown(
  resumeFromIndex: number | null,
  onResumeHandled: (() => void) | undefined,
  playFrom: (index: number) => void,
  setSavedStackIndex: Dispatch<SetStateAction<number | null>>,
  refs: SessionRefs
) {
  const [countdown, setCountdown] = useState<number | null>(null)

  useEffect(() => {
    if (resumeFromIndex == null) return
    onResumeHandled?.()
    refs.pendingPlayIndexRef.current = resumeFromIndex
    refs.sessionStartRef.current = resumeFromIndex
    setSavedStackIndex(null)
    setCountdown(3)
  }, [resumeFromIndex, onResumeHandled, refs, setSavedStackIndex])

  useEffect(() => {
    if (countdown === null) return
    if (isCountdownComplete(countdown)) {
      setCountdown(null)
      playFrom(refs.pendingPlayIndexRef.current)
      return
    }
    const timer = setTimeout(() => setCountdown(nextCountdownTick), 1000)
    return () => clearTimeout(timer)
  }, [countdown, playFrom, refs])

  return { countdown, setCountdown }
}

function useSavedReadingPosition(
  textId: number | undefined,
  positionSource: PositionSource,
  setSavedStackIndex: Dispatch<SetStateAction<number | null>>,
  setShowBookmarkPopover: Dispatch<SetStateAction<boolean>>,
  setCountdown: Dispatch<SetStateAction<number | null>>,
  refs: SessionRefs
) {
  useEffect(() => {
    if (!textId) return
    setSavedStackIndex(null)
    setShowBookmarkPopover(false)
    setCountdown(null)
    refs.savedPositionRef.current = null
    refs.sessionBaselineRef.current = null
    window.api.db
      .getReadingPosition(textId)
      .then((position) => {
        refs.savedPositionRef.current = position
          ? { stackIndex: position.stackIndex, source: position.source ?? positionSource }
          : null
        if (position && position.stackIndex > 0) {
          setSavedStackIndex(position.stackIndex)
        }
      })
      .catch(() => {})
  }, [textId, positionSource, setSavedStackIndex, setShowBookmarkPopover, setCountdown, refs])
}

function useEndPosition(currentIndex: number, playState: PlaybackState, refs: SessionRefs) {
  useEffect(() => {
    if (playState === 'playing' || playState === 'paused') {
      refs.endPositionRef.current = currentIndex
    }
  }, [currentIndex, playState, refs])
}

function usePositionSaveAndCompletion({
  textId,
  playState,
  segmentCtx,
  onReadingComplete,
  refreshResumeCandidate,
  refs,
  clearSessionEnd,
}: {
  textId: number | undefined
  playState: PlaybackState
  segmentCtx: SegmentContext | undefined
  onReadingComplete: ReadingSessionLifecycleOptions['onReadingComplete']
  refreshResumeCandidate: () => void | Promise<void>
  refs: SessionRefs
  clearSessionEnd: () => void
}) {
  useEffect(() => {
    const previous = refs.prevStateRef.current
    refs.prevStateRef.current = playState
    const positionSource = positionSourceFor(segmentCtx)

    if (
      shouldStartReadingSession(previous, playState) ||
      (previous === 'paused' && playState === 'playing' && refs.sessionEndRef.current)
    ) {
      refs.sessionBaselineRef.current = selectSessionBaseline(
        refs.savedPositionRef.current,
        positionSource
      )
    }

    if (playState === 'playing' && refs.sessionEndRef.current) {
      clearSessionEnd()
    }

    if (shouldSavePosition(previous, playState, refs.endPositionRef.current) && textId) {
      void persistReadingPosition({
        textId,
        stackIndex: refs.endPositionRef.current,
        source: positionSource,
        refreshResumeCandidate,
        refs,
      })
    }

    if (shouldFireComplete(previous, playState) && onReadingComplete) {
      onReadingComplete(
        wordOffsetAtIndex(refs.stacksRef.current, refs.sessionStartRef.current),
        wordOffsetAtIndex(refs.stacksRef.current, refs.endPositionRef.current),
        refs.endPositionRef.current
      )
    }
  }, [playState, onReadingComplete, textId, segmentCtx, refreshResumeCandidate, refs, clearSessionEnd])
}

function useSessionAutoStop({
  currentIndex,
  playState,
  rereReadEndIndex,
  goalBookmark,
  stacks,
  manualSeekRevision,
  sessionEndEnabled,
  stop,
  pauseAndHold,
  setSessionEnd,
  onGoalBookmarkConsumed,
  refs,
}: {
  currentIndex: number
  playState: PlaybackState
  rereReadEndIndex: number | null
  goalBookmark: Bookmark | null
  stacks: WordStack[]
  manualSeekRevision: number
  sessionEndEnabled: boolean
  stop: () => void
  pauseAndHold: () => void
  setSessionEnd: (reason: SessionEndReason) => void
  onGoalBookmarkConsumed: (bookmarkId: number) => void
  refs: SessionRefs
}) {
  const previousIndexRef = useRef(currentIndex)
  const seenManualSeekRevisionRef = useRef(manualSeekRevision)

  const goalBookmarkIndex = useMemo(
    () =>
      goalBookmark && stacks.length > 0
        ? resolveWordsToStackIndex(goalBookmark.wordOffset, stacks)
        : null,
    [goalBookmark, stacks]
  )

  useEffect(() => {
    refs.goalBookmarkFiredRef.current = false
  }, [goalBookmark?.id, goalBookmarkIndex, refs])

  useEffect(() => {
    const previousIndex = previousIndexRef.current
    const isManualMove = manualSeekRevision !== seenManualSeekRevisionRef.current
    seenManualSeekRevisionRef.current = manualSeekRevision

    if (playState !== 'playing') {
      previousIndexRef.current = currentIndex
      return
    }

    const hitRereEnd = shouldFireOnce(
      currentIndex,
      rereReadEndIndex,
      refs.rereReadEndFiredRef.current
    )
    const hitGoal = shouldFireOnCrossing(
      previousIndex,
      currentIndex,
      goalBookmarkIndex,
      refs.goalBookmarkFiredRef.current,
      isManualMove
    )

    previousIndexRef.current = currentIndex

    if (!hitRereEnd && !hitGoal) return

    if (hitRereEnd) refs.rereReadEndFiredRef.current = true
    if (hitGoal && goalBookmark) {
      refs.goalBookmarkFiredRef.current = true
      window.api.db
        .deleteBookmark(goalBookmark.id)
        .then(() => onGoalBookmarkConsumed(goalBookmark.id))
        .catch(() => {})
    }
    refs.endPositionRef.current = currentIndex
    if (hitGoal && sessionEndEnabled) {
      setSessionEnd('goal')
      pauseAndHold()
    } else {
      stop()
    }
  }, [
    currentIndex,
    playState,
    rereReadEndIndex,
    goalBookmark,
    goalBookmarkIndex,
    manualSeekRevision,
    sessionEndEnabled,
    stop,
    pauseAndHold,
    setSessionEnd,
    onGoalBookmarkConsumed,
    refs,
  ])
}

function useNaturalSessionEnd({
  naturalEndRevision,
  sessionEndEnabled,
  setSessionEnd,
}: {
  naturalEndRevision: number
  sessionEndEnabled: boolean
  setSessionEnd: (reason: SessionEndReason) => void
}) {
  const seenNaturalEndRevisionRef = useRef(naturalEndRevision)

  useEffect(() => {
    if (naturalEndRevision === seenNaturalEndRevisionRef.current) return
    seenNaturalEndRevisionRef.current = naturalEndRevision
    if (sessionEndEnabled) setSessionEnd('end')
  }, [naturalEndRevision, sessionEndEnabled, setSessionEnd])
}

function useClearSessionEndOnSeek({
  manualSeekRevision,
  clearSessionEnd,
}: {
  manualSeekRevision: number
  clearSessionEnd: () => void
}) {
  const seenManualSeekRevisionRef = useRef(manualSeekRevision)

  useEffect(() => {
    if (manualSeekRevision === seenManualSeekRevisionRef.current) return
    seenManualSeekRevisionRef.current = manualSeekRevision
    clearSessionEnd()
  }, [manualSeekRevision, clearSessionEnd])
}

function useRetokenizeRestore(
  stacks: WordStack[],
  playFrom: (index: number) => void,
  pause: () => void,
  refs: SessionRefs
) {
  useEffect(() => {
    const restore = refs.restorePositionRef.current
    if (!restore || stacks.length === 0) return
    refs.restorePositionRef.current = null

    const targetIndex = resolveRestoreIndex(restore.offset, stacks)
    if (restore.prevState === 'playing') {
      playFrom(targetIndex)
    } else if (restore.prevState === 'paused') {
      playFrom(targetIndex)
      pause()
    }
  }, [stacks, playFrom, pause, refs])
}

export function useReadingSessionLifecycle({
  text,
  stacks,
  currentIndex,
  playState,
  segmentCtx,
  resumeFromIndex,
  rereReadEndIndex,
  goalBookmark,
  manualSeekRevision,
  naturalEndRevision,
  sessionEndEnabled = true,
  play,
  playFrom,
  pause,
  stop,
  pauseAndHold,
  discardToStart,
  onGoalBookmarkConsumed,
  onResumeHandled,
  onReadingComplete,
  refreshResumeCandidate,
}: ReadingSessionLifecycleOptions) {
  const [savedStackIndex, setSavedStackIndex] = useState<number | null>(null)
  const [showBookmarkPopover, setShowBookmarkPopover] = useState(false)
  const [sessionEnd, setSessionEndState] = useState<SessionEnd | null>(null)
  const refs = useSessionRefs(stacks, rereReadEndIndex)
  const positionSource = positionSourceFor(segmentCtx)
  const setSessionEnd = useCallback((reason: SessionEndReason) => {
    const next = { reason }
    refs.sessionEndRef.current = next
    setSessionEndState(next)
  }, [refs])
  const clearSessionEnd = useCallback(() => {
    refs.sessionEndRef.current = null
    setSessionEndState(null)
  }, [refs])
  const { countdown, setCountdown } = useResumeCountdown(
    resumeFromIndex,
    onResumeHandled,
    playFrom,
    setSavedStackIndex,
    refs
  )
  useSavedReadingPosition(
    text.id,
    positionSource,
    setSavedStackIndex,
    setShowBookmarkPopover,
    setCountdown,
    refs
  )

  useEndPosition(currentIndex, playState, refs)
  usePositionSaveAndCompletion({
    textId: text.id,
    playState,
    segmentCtx,
    onReadingComplete,
    refreshResumeCandidate,
    refs,
    clearSessionEnd,
  })
  useSessionAutoStop({
    currentIndex,
    playState,
    rereReadEndIndex,
    goalBookmark,
    stacks,
    manualSeekRevision,
    sessionEndEnabled,
    stop,
    pauseAndHold,
    setSessionEnd,
    onGoalBookmarkConsumed,
    refs,
  })
  useNaturalSessionEnd({
    naturalEndRevision,
    sessionEndEnabled,
    setSessionEnd,
  })
  useClearSessionEndOnSeek({
    manualSeekRevision,
    clearSessionEnd,
  })
  useRetokenizeRestore(stacks, playFrom, pause, refs)

  const validSavedIndex = resolveValidSavedIndex(savedStackIndex, stacks.length)
  const resumePct = computeResumePct(validSavedIndex, stacks.length)

  const stopReading = useCallback(() => {
    setCountdown(null)
    if (sessionEndEnabled) {
      refs.endPositionRef.current = currentIndex
      setSessionEnd('stop')
      pauseAndHold()
      return
    }
    stop()
  }, [setCountdown, sessionEndEnabled, refs, currentIndex, setSessionEnd, pauseAndHold, stop])

  const handlePlay = useCallback(() => {
    refs.sessionStartRef.current = 0
    setSavedStackIndex(null)
    play()
  }, [play, refs, setSavedStackIndex])

  const handleResume = useCallback(() => {
    if (validSavedIndex === null) return
    refs.sessionStartRef.current = validSavedIndex
    setSavedStackIndex(null)
    playFrom(validSavedIndex)
  }, [validSavedIndex, playFrom, refs, setSavedStackIndex])

  const handleRestart = useCallback(() => {
    refs.sessionStartRef.current = 0
    setSavedStackIndex(null)
  }, [refs, setSavedStackIndex])

  const commitCurrentPosition = useCallback(() => {
    if (!refs.sessionBaselineRef.current) return Promise.resolve(null)
    return persistReadingPosition({
      textId: text.id,
      stackIndex: refs.endPositionRef.current,
      source: positionSource,
      refreshResumeCandidate,
      refs,
    })
  }, [text.id, positionSource, refreshResumeCandidate, refs])

  const revertToBaseline = useCallback(() => {
    const baseline = refs.sessionBaselineRef.current
    if (!baseline) return Promise.resolve(null)
    return persistReadingPosition({
      textId: text.id,
      stackIndex: baseline.stackIndex,
      source: baseline.source ?? positionSource,
      refreshResumeCandidate,
      refs,
    })
  }, [text.id, positionSource, refreshResumeCandidate, refs])

  const handleBeforeRetokenize = useCallback(() => {
    refs.restorePositionRef.current = {
      offset: wordOffsetAtIndex(stacks, currentIndex),
      prevState: playState,
    }
  }, [stacks, currentIndex, playState, refs])

  return {
    countdown,
    sessionEnd,
    showBookmarkPopover,
    validSavedIndex,
    resumePct,
    setShowBookmarkPopover,
    stopReading,
    handlePlay,
    handleResume,
    handleRestart,
    handleBeforeRetokenize,
    commitCurrentPosition,
    revertToBaseline,
    discardToStart,
    clearSessionEnd,
  }
}
