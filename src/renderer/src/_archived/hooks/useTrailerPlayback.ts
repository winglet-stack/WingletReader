import { useState, useRef, useCallback, useEffect } from 'react'
import { trailerPauseMs } from '../engine/trailerTokenizer'
import { useMetronome } from '../../hooks/useMetronome'
import type { PlaybackState, Settings, TrailerStack } from '../../types'

interface TrailerPlaybackOptions {
  stacks: TrailerStack[]
  settings: Settings
}

export interface TrailerPlaybackResult {
  currentIndex: number
  state: PlaybackState
  /** True when playback has auto-paused after a question and is waiting for the user to continue. */
  waitingForUser: boolean
  wpm: number
  progress: number
  play: () => void
  pause: () => void
  resume: () => void
  stop: () => void
  restart: () => void
  rewind: (steps?: number) => void
  seekTo: (index: number) => void
}

export function useTrailerPlayback({ stacks, settings }: TrailerPlaybackOptions): TrailerPlaybackResult {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [state, setState] = useState<PlaybackState>('idle')
  const [waitingForUser, setWaitingForUser] = useState(false)

  const indexRef = useRef(0)
  const stateRef = useRef<PlaybackState>('idle')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stacksRef = useRef<TrailerStack[]>(stacks)
  const settingsRef = useRef<Settings>(settings)
  // True when we have auto-paused at a question and resume() must advance the index first
  const pendingAdvanceRef = useRef(false)

  stacksRef.current = stacks
  settingsRef.current = settings

  const { click, dispose } = useMetronome()

  // Reset whenever the stacks array changes identity (primer or settings changed)
  useEffect(() => {
    clearTimer()
    indexRef.current = 0
    setCurrentIndex(0)
    setState('idle')
    stateRef.current = 'idle'
    setWaitingForUser(false)
    pendingAdvanceRef.current = false
  }, [stacks]) // eslint-disable-line react-hooks/exhaustive-deps

  function clearTimer() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const scheduleNext = useCallback(() => {
    clearTimer()
    const s = stacksRef.current
    const idx = indexRef.current
    const cfg = settingsRef.current

    if (stateRef.current !== 'playing') return
    if (idx >= s.length) {
      setState('stopped')
      stateRef.current = 'stopped'
      return
    }

    const stack = s[idx]
    const beatMs = 60_000 / cfg.bpm
    const delay = trailerPauseMs(stack, beatMs, { pauseAtSentences: cfg.pause_at_sentences })

    if (cfg.metronome_enabled) click(stack.section === 'heading')

    if (stack.pauseForUser) {
      // Show for the full beat, then auto-pause without advancing so the question
      // stays on screen while the user reflects.
      timerRef.current = setTimeout(() => {
        setState('paused')
        stateRef.current = 'paused'
        setWaitingForUser(true)
        pendingAdvanceRef.current = true
      }, delay)
    } else {
      timerRef.current = setTimeout(() => {
        const nextIdx = indexRef.current + 1
        indexRef.current = nextIdx
        setCurrentIndex(nextIdx)
        scheduleNext()
      }, delay)
    }
  }, [click])

  const play = useCallback(() => {
    if (stacksRef.current.length === 0) return
    clearTimer()
    indexRef.current = 0
    setCurrentIndex(0)
    setWaitingForUser(false)
    pendingAdvanceRef.current = false
    setState('playing')
    stateRef.current = 'playing'
    scheduleNext()
  }, [scheduleNext])

  const pause = useCallback(() => {
    clearTimer()
    setState('paused')
    stateRef.current = 'paused'
  }, [])

  const resume = useCallback(() => {
    if (stateRef.current !== 'paused') return
    setWaitingForUser(false)
    // When resuming after a question auto-pause, advance past the question first
    if (pendingAdvanceRef.current) {
      const nextIdx = indexRef.current + 1
      indexRef.current = nextIdx
      setCurrentIndex(nextIdx)
      pendingAdvanceRef.current = false
    }
    setState('playing')
    stateRef.current = 'playing'
    scheduleNext()
  }, [scheduleNext])

  const stop = useCallback(() => {
    clearTimer()
    indexRef.current = 0
    setCurrentIndex(0)
    setWaitingForUser(false)
    pendingAdvanceRef.current = false
    setState('stopped')
    stateRef.current = 'stopped'
  }, [])

  const restart = useCallback(() => {
    clearTimer()
    indexRef.current = 0
    setCurrentIndex(0)
    setWaitingForUser(false)
    pendingAdvanceRef.current = false
    setState('playing')
    stateRef.current = 'playing'
    scheduleNext()
  }, [scheduleNext])

  const rewind = useCallback(
    (steps = 10) => {
      const newIdx = Math.max(0, indexRef.current - steps)
      indexRef.current = newIdx
      setCurrentIndex(newIdx)
      setWaitingForUser(false)
      pendingAdvanceRef.current = false
      if (stateRef.current === 'playing') {
        clearTimer()
        scheduleNext()
      }
    },
    [scheduleNext]
  )

  const seekTo = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(stacksRef.current.length - 1, index))
      indexRef.current = clamped
      setCurrentIndex(clamped)
      setWaitingForUser(false)
      pendingAdvanceRef.current = false
      if (stateRef.current === 'playing') {
        clearTimer()
        scheduleNext()
      }
    },
    [scheduleNext]
  )

  useEffect(() => {
    return () => {
      clearTimer()
      dispose()
    }
  }, [dispose])

  const wpm = Math.round(settings.bpm * settings.words_per_stack)
  const progress = stacks.length > 0 ? Math.min(1, currentIndex / stacks.length) : 0

  return {
    currentIndex,
    state,
    waitingForUser,
    wpm,
    progress,
    play,
    pause,
    resume,
    stop,
    restart,
    rewind,
    seekTo
  }
}
