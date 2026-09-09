import { useState, useRef, useCallback } from 'react'
import { calcTokenDuration } from '../engine/scriptBuilder'
import type { ScriptTokenConfig, ScriptToken, ScriptBlock } from '../engine/scriptTypes'

export type ScriptMode = 'preview' | 'click-to-read'

export interface UseScriptPlaybackResult {
  currentTokenIdx: number
  isPlaying: boolean
  mode: ScriptMode
  tokens: ScriptToken[]
  /** Enter preview mode — auto-advance using calcTokenDuration timing (block-aware). */
  startPreview(): void
  /** Enter click-to-read mode — user clicks to advance; wall-clock timestamps recorded. */
  startClickToRead(): void
  pause(): void
  stop(): void
  /**
   * Advance to the next token.
   * In click-to-read mode: stamps elapsed wall-clock ms as the current token's timestampMs.
   * In preview mode: resets the auto-advance timer from the new position.
   */
  advance(): void
  /** Jump to a specific token without changing play/pause state. */
  seekTo(idx: number): void
  /** Replace the tokens and blocks arrays; resets position to 0 and stops playback. */
  setTokens(tokens: ScriptToken[], blocks?: ScriptBlock[]): void
  /**
   * Update tokens in-place without stopping playback or resetting position.
   * Clamps currentTokenIdx to the new array length if needed.
   * Use this for mutations (edit, delete, reorder, config change) during playback.
   */
  patchTokens(tokens: ScriptToken[]): void
  /**
   * Update the blocks reference used for per-token duration resolution.
   * Call whenever block configs change (alongside patchTokens for the flat list).
   */
  patchBlocks(blocks: ScriptBlock[]): void
  /** Update a single token in-place. */
  updateToken(id: number, patch: Partial<ScriptToken>): void
}

// Fallback block used when a token's blockId cannot be resolved (should not happen in practice).
function makeFallbackBlock(bpm: number): ScriptBlock {
  return {
    id: -1,
    sourceText: '',
    config: { bpm, wordsPerStack: 3, stacksVisible: 1 },
    tokens: [],
  }
}

export function useScriptPlayback(
  initialTokens: ScriptToken[],
  initialBlocks: ScriptBlock[],
  projectConfig: ScriptTokenConfig,
  onTokensChange: (tokens: ScriptToken[]) => void
): UseScriptPlaybackResult {
  const [tokens, setTokensState] = useState<ScriptToken[]>(initialTokens)
  const [currentTokenIdx, setCurrentTokenIdx] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [mode, setMode] = useState<ScriptMode>('preview')

  // Refs prevent stale closures inside setTimeout callbacks.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tokensRef = useRef(tokens)
  tokensRef.current = tokens
  const blocksRef = useRef<ScriptBlock[]>(initialBlocks)
  // Note: blocksRef is NOT kept in sync automatically — caller must call patchBlocks when blocks change.
  const configRef = useRef(projectConfig)
  configRef.current = projectConfig
  const idxRef = useRef(currentTokenIdx)
  idxRef.current = currentTokenIdx
  const isPlayingRef = useRef(isPlaying)
  isPlayingRef.current = isPlaying
  const modeRef = useRef(mode)
  modeRef.current = mode
  // Wall-clock start time for click-to-read timestamp recording.
  const startTimeRef = useRef<number | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const scheduleNext = useCallback(() => {
    clearTimer()
    const idx = idxRef.current
    const ts = tokensRef.current
    if (idx >= ts.length - 1) {
      setIsPlaying(false)
      return
    }
    const token = ts[idx]
    const block =
      blocksRef.current.find((b) => b.id === token.blockId) ??
      makeFallbackBlock(configRef.current.bpm)
    const durMs = calcTokenDuration(token, block, configRef.current)
    timerRef.current = setTimeout(() => {
      const nextIdx = idxRef.current + 1
      idxRef.current = nextIdx
      setCurrentTokenIdx(nextIdx)
      if (isPlayingRef.current && modeRef.current === 'preview') {
        scheduleNext()
      }
    }, durMs)
  }, [clearTimer])

  const startPreview = useCallback(() => {
    clearTimer()
    idxRef.current = 0
    setCurrentTokenIdx(0)
    setMode('preview')
    modeRef.current = 'preview'
    setIsPlaying(true)
    isPlayingRef.current = true
    scheduleNext()
  }, [clearTimer, scheduleNext])

  const startClickToRead = useCallback(() => {
    clearTimer()
    setMode('click-to-read')
    modeRef.current = 'click-to-read'
    setIsPlaying(true)
    isPlayingRef.current = true
    startTimeRef.current = Date.now()
    // No auto-advance timer — user drives via advance(), timestamps recorded.
  }, [clearTimer])

  const pause = useCallback(() => {
    clearTimer()
    setIsPlaying(false)
    isPlayingRef.current = false
  }, [clearTimer])

  const stop = useCallback(() => {
    clearTimer()
    setIsPlaying(false)
    isPlayingRef.current = false
    idxRef.current = 0
    setCurrentTokenIdx(0)
    startTimeRef.current = null
  }, [clearTimer])

  const advance = useCallback(() => {
    const ts = tokensRef.current
    const idx = idxRef.current

    let updatedTokens = ts

    if (modeRef.current === 'click-to-read' && startTimeRef.current !== null) {
      const elapsed = Date.now() - startTimeRef.current
      updatedTokens = ts.map((t, i) =>
        i === idx ? { ...t, timestampMs: elapsed } : t
      )
      tokensRef.current = updatedTokens
      setTokensState(updatedTokens)
      onTokensChange(updatedTokens)
    }

    const nextIdx = Math.min(idx + 1, ts.length - 1)
    idxRef.current = nextIdx
    setCurrentTokenIdx(nextIdx)

    if (modeRef.current === 'preview' && isPlayingRef.current) {
      clearTimer()
      scheduleNext()
    }
  }, [clearTimer, scheduleNext, onTokensChange])

  const seekTo = useCallback(
    (idx: number) => {
      clearTimer()
      const clamped = Math.max(0, Math.min(tokensRef.current.length - 1, idx))
      idxRef.current = clamped
      setCurrentTokenIdx(clamped)
    },
    [clearTimer]
  )

  const setTokens = useCallback(
    (newTokens: ScriptToken[], newBlocks?: ScriptBlock[]) => {
      clearTimer()
      setIsPlaying(false)
      isPlayingRef.current = false
      idxRef.current = 0
      setCurrentTokenIdx(0)
      startTimeRef.current = null
      tokensRef.current = newTokens
      setTokensState(newTokens)
      if (newBlocks !== undefined) {
        blocksRef.current = newBlocks
      }
    },
    [clearTimer]
  )

  const patchTokens = useCallback((newTokens: ScriptToken[]) => {
    tokensRef.current = newTokens
    setTokensState(newTokens)
    if (newTokens.length === 0) {
      idxRef.current = 0
      setCurrentTokenIdx(0)
    } else if (idxRef.current >= newTokens.length) {
      const clamped = newTokens.length - 1
      idxRef.current = clamped
      setCurrentTokenIdx(clamped)
    }
  }, [])

  const patchBlocks = useCallback((newBlocks: ScriptBlock[]) => {
    blocksRef.current = newBlocks
  }, [])

  const updateToken = useCallback(
    (id: number, patch: Partial<ScriptToken>) => {
      const updated = tokensRef.current.map((t) => (t.id === id ? { ...t, ...patch } : t))
      tokensRef.current = updated
      setTokensState(updated)
      onTokensChange(updated)
    },
    [onTokensChange]
  )

  return {
    currentTokenIdx,
    isPlaying,
    mode,
    tokens,
    startPreview,
    startClickToRead,
    pause,
    stop,
    advance,
    seekTo,
    setTokens,
    patchTokens,
    patchBlocks,
    updateToken,
  }
}
