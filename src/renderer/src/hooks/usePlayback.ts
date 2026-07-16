import { useState, useRef, useCallback, useEffect } from 'react'
import { pauseMs, rulesFromSettings } from '../engine/tokenizer'
import { requestStacks } from '../engine/stackBuilder'
import { useMetronome } from './useMetronome'
import type { WordStack, PlaybackState, Settings } from '../types'

interface PlaybackOptions {
  text: string
  settings: Settings
  pauseOnNaturalEnd?: boolean
}

interface PlaybackResult {
  stacks: WordStack[]
  currentIndex: number
  state: PlaybackState
  wpm: number
  progress: number // 0–1
  play: () => void
  playFrom: (index: number) => void
  pause: () => void
  resume: () => void
  stop: () => void
  pauseAndHold: () => void
  discardToStart: () => void
  restart: () => void
  rewind: (steps?: number) => void
  seekTo: (index: number) => void
  naturalEndRevision: number
  /** Advances exactly one stack forward. Only effective when state is 'playing'. */
  stepForward: () => void
}

export function usePlayback({
  text,
  settings,
  pauseOnNaturalEnd = false,
}: PlaybackOptions): PlaybackResult {
  const [stacks, setStacks] = useState<WordStack[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [state, setState] = useState<PlaybackState>('idle')
  const [naturalEndRevision, setNaturalEndRevision] = useState(0)

  const indexRef = useRef(0)
  const stateRef = useRef<PlaybackState>('idle')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stacksRef = useRef<WordStack[]>([])
  const settingsRef = useRef<Settings>(settings)

  // Keep settingsRef current so scheduleNext always reads live settings
  settingsRef.current = settings

  const { click, dispose } = useMetronome()

  // Re-tokenize whenever text or any chunk-rule setting changes.
  //
  // The whole-book `buildStacks` pass is the dominant engage cost (QA-3), so it is
  // scheduled through `requestStacks` — a Web Worker in production (off the
  // first-paint frame), a synchronous fallback in tests/jsdom. Position and state
  // are reset synchronously and stale stacks are cleared immediately so playback
  // can never act on the previous text while the new build is in flight; the built
  // stacks land in `stacksRef`/state when `requestStacks` delivers (synchronously
  // in the fallback, on the worker response in production). Lifecycle restore
  // (`useRetokenizeRestore`) already waits for stacks to arrive, so resume/seek/
  // rewind/goal behaviour is preserved while stacks stream in.
  useEffect(() => {
    stacksRef.current = []
    setStacks([])
    indexRef.current = 0
    setCurrentIndex(0)
    setState('idle')
    stateRef.current = 'idle'
    clearTimer()

    const handle = requestStacks(
      { text, wordsPerStack: settings.words_per_stack, rules: rulesFromSettings(settings) },
      (built) => {
        stacksRef.current = built
        setStacks(built)
      }
    )
    return () => handle.cancel()
  }, [
    text,
    settings.words_per_stack,
    settings.chunk_rule_long_word,
    settings.chunk_rule_enumerations,
    settings.chunk_rule_bullets,
    settings.chunk_rule_commas,
    settings.chunk_rule_names,
    settings.chunk_rule_headlines,
  ])

  const clearTimer = () => {
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
      if (pauseOnNaturalEnd) {
        setState('paused')
        stateRef.current = 'paused'
        setNaturalEndRevision((revision) => revision + 1)
      } else {
        setState('stopped')
        stateRef.current = 'stopped'
      }
      return
    }

    const stack = s[idx]
    const beatMs = 60_000 / cfg.bpm
    const delay = pauseMs(stack.type, beatMs, {
      pauseAtSentences: cfg.pause_at_sentences,
      pauseAtHeadlines: cfg.pause_at_headlines
    })

    if (cfg.metronome_enabled) click(stack.type === 'headline')

    // In tap-to-read mode don't schedule; wait for explicit stepForward call.
    if (cfg.tap_to_read) return

    timerRef.current = setTimeout(() => {
      const nextIdx = indexRef.current + 1
      indexRef.current = nextIdx
      setCurrentIndex(nextIdx)
      scheduleNext()
    }, delay)
  }, [click, pauseOnNaturalEnd])

  const play = useCallback(() => {
    if (stacksRef.current.length === 0) return
    indexRef.current = 0
    setCurrentIndex(0)
    setState('playing')
    stateRef.current = 'playing'
    scheduleNext()
  }, [scheduleNext])

  const playFrom = useCallback((index: number) => {
    if (stacksRef.current.length === 0) return
    const clamped = Math.max(0, Math.min(stacksRef.current.length - 1, index))
    indexRef.current = clamped
    setCurrentIndex(clamped)
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
    setState('playing')
    stateRef.current = 'playing'
    scheduleNext()
  }, [scheduleNext])

  const stop = useCallback(() => {
    clearTimer()
    setState('stopped')
    stateRef.current = 'stopped'
  }, [])

  const pauseAndHold = useCallback(() => {
    clearTimer()
    setState('paused')
    stateRef.current = 'paused'
  }, [])

  const discardToStart = useCallback(() => {
    clearTimer()
    indexRef.current = 0
    setCurrentIndex(0)
    setState('stopped')
    stateRef.current = 'stopped'
  }, [])

  const restart = useCallback(() => {
    clearTimer()
    indexRef.current = 0
    setCurrentIndex(0)
    setState('playing')
    stateRef.current = 'playing'
    scheduleNext()
  }, [scheduleNext])

  const rewind = useCallback(
    (steps = 10) => {
      const newIdx = Math.max(0, indexRef.current - steps)
      indexRef.current = newIdx
      setCurrentIndex(newIdx)
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
      if (stateRef.current === 'playing') {
        clearTimer()
        scheduleNext()
      }
    },
    [scheduleNext]
  )

  // Advance exactly one stack. Used in tap-to-read mode; mirrors the timer callback.
  const stepForward = useCallback(() => {
    if (stateRef.current !== 'playing') return
    const nextIdx = indexRef.current + 1
    indexRef.current = nextIdx
    setCurrentIndex(nextIdx)
    scheduleNext()
  }, [scheduleNext])

  // When tap_to_read is toggled OFF while playing, restart the auto-advance timer.
  const prevTapToReadRef = useRef(settings.tap_to_read)
  useEffect(() => {
    const prev = prevTapToReadRef.current
    prevTapToReadRef.current = settings.tap_to_read
    if (prev && !settings.tap_to_read && stateRef.current === 'playing') {
      scheduleNext()
    }
  }, [settings.tap_to_read, scheduleNext])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimer()
      dispose()
    }
  }, [dispose])

  const wpm = Math.round(settings.bpm * settings.words_per_stack)
  const progress = stacks.length > 0 ? Math.min(1, currentIndex / stacks.length) : 0

  return {
    stacks,
    currentIndex,
    state,
    wpm,
    progress,
    play,
    playFrom,
    pause,
    resume,
    stop,
    pauseAndHold,
    discardToStart,
    restart,
    rewind,
    seekTo,
    naturalEndRevision,
    stepForward
  }
}
