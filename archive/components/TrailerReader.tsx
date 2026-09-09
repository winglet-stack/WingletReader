import React, { useEffect, useCallback, useRef, useState, useMemo } from 'react'
import exitButtonSrc from '@renderer/assets/reader-buttons/Exit.png'
import pauseButtonSrc from '@renderer/assets/reader-buttons/pause.png'
import restartButtonSrc from '@renderer/assets/reader-buttons/Restart.png'
import rewindButtonSrc from '@renderer/assets/reader-buttons/Rewind.png'
import skipForwardButtonSrc from '@renderer/assets/reader-buttons/SkiptForward.png'
import startButtonSrc from '@renderer/assets/reader-buttons/Start.png'
import { useTrailerPlayback } from '../hooks/useTrailerPlayback'
import { buildTrailerStacks } from '../engine/trailerTokenizer'
import { generatePrimer } from '../engine/textPrimer'
import type { TextRecord, Settings, TrailerStack } from '@renderer/types'

// Same sizing constants as Reader
const CHAR_WIDTH_RATIO = 0.62
const MAX_FULLSCREEN_FONT = 160
const MIN_FONT_SIZE = 12

function ReaderButtonIcon({ src, alt }: { src: string; alt: string }) {
  return <img className="reader-button-icon" src={src} alt="" aria-hidden="true" title={alt} />
}

function computeFontSize(
  text: string,
  stageW: number,
  stageH: number,
  baseFontSize: number,
  isFullscreen: boolean
): number {
  if (stageW <= 0 || stageH <= 0) return baseFontSize
  const chars = Math.max(1, text.length)
  const usableW = Math.max(40, stageW - 96)
  const byWidth = usableW / (chars * CHAR_WIDTH_RATIO)
  const byHeight = stageH * 0.4
  const ceiling = isFullscreen ? MAX_FULLSCREEN_FONT : baseFontSize
  return Math.max(MIN_FONT_SIZE, Math.floor(Math.min(ceiling, byWidth, byHeight)))
}

const SECTION_LABELS: Record<string, string> = {
  heading: 'Titles & Headings',
  intro: 'Introduction',
  bold: 'Key Terms',
  visualAid: 'Visual Aids',
  question: 'Review Questions',
  summary: 'Summary'
}

function TrailerStackDisplay({
  stack,
  fontSize
}: {
  stack: TrailerStack
  fontSize: number
}) {
  const text = stack.words.join(' ')

  if (stack.type === 'headline' || stack.section === 'heading') {
    return (
      <div className="stack-headline" style={{ fontSize: Math.round(fontSize * 0.7) }}>
        <div className="headline-rule" />
        <span>{text}</span>
        <div className="headline-rule" />
      </div>
    )
  }

  if (stack.bold) {
    return (
      <div className="stack-words stack-words--bold" style={{ fontSize }}>
        {text}
      </div>
    )
  }

  return (
    <div className="stack-words" style={{ fontSize }}>
      {text}
    </div>
  )
}

interface Props {
  text: TextRecord
  settings: Settings
  onBack: () => void
  onRead: () => void
}

export default function TrailerReader({ text, settings, onBack, onRead }: Props) {
  const primer = useMemo(() => generatePrimer(text.content ?? ''), [text.content])
  const trailerStacks = useMemo(() => buildTrailerStacks(primer, settings), [primer, settings])

  const {
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
  } = useTrailerPlayback({ stacks: trailerStacks, settings })

  const stageRef = useRef<HTMLDivElement>(null)
  const [stageDims, setStageDims] = useState({ width: 0, height: 0 })
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setStageDims({ width, height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }, [])

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return
      switch (e.code) {
        case 'Space':
          e.preventDefault()
          if (state === 'playing') pause()
          else if (state === 'paused') resume()
          else play()
          break
        case 'KeyR':
          restart()
          break
        case 'Escape':
          e.preventDefault()
          if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
          else stop()
          break
        case 'KeyS':
          stop()
          break
        case 'KeyF':
          e.preventDefault()
          toggleFullscreen()
          break
        case 'ArrowLeft':
          rewind(e.shiftKey ? 30 : 10)
          break
        case 'ArrowRight': {
          const newIdx = Math.min(trailerStacks.length - 1, currentIndex + (e.shiftKey ? 30 : 10))
          seekTo(newIdx)
          break
        }
      }
    },
    [state, play, pause, resume, stop, restart, rewind, seekTo, trailerStacks.length, currentIndex, toggleFullscreen]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const currentStack = trailerStacks[currentIndex] ?? null
  const currentSection = currentStack?.section ?? null
  const sectionLabel = currentSection ? SECTION_LABELS[currentSection] : null
  const isActiveState = state === 'playing' || state === 'paused'

  const longestText = currentStack ? currentStack.words.join(' ') : ''

  const dynamicFontSize = useMemo(
    () => computeFontSize(longestText, stageDims.width, stageDims.height, settings.font_size, isFullscreen),
    [longestText, stageDims.width, stageDims.height, settings.font_size, isFullscreen]
  )

  const totalWords = trailerStacks.reduce((s, st) => s + st.words.length, 0)
  const wordsRead = trailerStacks.slice(0, currentIndex).reduce((s, st) => s + st.words.length, 0)
  const minutesLeft = wpm > 0 ? Math.max(0, Math.ceil((totalWords - wordsRead) / wpm)) : 0

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => seekTo(Number(e.target.value))

  return (
    <div className={`reader-shell${isFullscreen ? ' reader-shell--fullscreen' : ''}`}>
      {/* Top bar */}
      <div className="reader-topbar">
        <button className="btn-ghost btn-small" onClick={onBack} aria-label="Back to Primer">
          &#8592; Primer
        </button>
        <span className="reader-title">{text.title}</span>
        <span className="trailer-mode-badge">Trailer</span>
        <span className="reader-meta">
          {wpm} wpm &middot; {minutesLeft} min left
        </span>
        <button
          className="btn-ghost btn-small"
          onClick={onRead}
          title="Switch to full reading"
          aria-label="Start full reading"
        >
          &#9654; Full Read
        </button>
        <button
          className={`btn-ghost btn-small reader-fullscreen-btn${isFullscreen ? ' reader-fullscreen-btn--active' : ''}`}
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit full-screen (F)' : 'Enter full-screen (F)'}
          aria-pressed={isFullscreen}
          aria-label={isFullscreen ? 'Exit full-screen' : 'Enter full-screen'}
        >
          {isFullscreen ? '⊡' : '⛶'}
        </button>
      </div>

      {/* Progress bar */}
      <div className="reader-progress-wrap">
        <input
          type="range"
          className="reader-scrubber"
          min={0}
          max={Math.max(0, trailerStacks.length - 1)}
          value={currentIndex}
          onChange={handleSeek}
          aria-label="Trailer reading position"
        />
        <div
          className="reader-progress-fill"
          style={{ width: `${progress * 100}%`, transitionDuration: `${Math.max(50, Math.min(300, Math.round(60_000 / settings.bpm)))}ms` }}
          role="progressbar"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>

      {/* Section label strip — visible only while actively reading */}
      {isActiveState && sectionLabel && (
        <div className="trailer-section-label" aria-live="polite">
          {sectionLabel}
          {currentStack?.section === 'visualAid' && (
            <span className="trailer-slowdown-badge">&#x1F4CC; Slowed 20%</span>
          )}
        </div>
      )}

      {/* Main display stage */}
      <div className="reader-stage" ref={stageRef} aria-live="polite" aria-atomic="true">
        {isFullscreen && (
          <div className="reader-fs-hud">
            <span className="reader-fs-meta">{wpm} wpm &middot; {minutesLeft} min left</span>
            <button
              className="reader-fs-exit"
              onClick={toggleFullscreen}
              title="Exit full-screen (Esc or F)"
              aria-label="Exit full-screen"
            >
              &#x229F; Exit
            </button>
          </div>
        )}

        {state === 'idle' || state === 'stopped' ? (
          <div className="reader-idle">
            <p>{state === 'stopped' ? 'Preview complete.' : 'Ready for trailer.'}</p>
            <p className="reader-idle-sub">
              {totalWords.toLocaleString()} words &middot; ~{wpm > 0 ? Math.ceil(totalWords / wpm) : 0} min at{' '}
              {wpm} wpm
            </p>
          </div>
        ) : currentStack ? (
          <div className="trailer-content">
            <div className="reader-stack-row" style={{ gridTemplateColumns: '1fr' }}>
              <div className={`stack-slot${settings.highlight_active ? ' stack-slot--active' : ''}`}>
                <TrailerStackDisplay stack={currentStack} fontSize={dynamicFontSize} />
              </div>
            </div>

            {waitingForUser && (
              <div className="trailer-question-prompt" role="status" aria-live="assertive">
                <span className="trailer-reflect-text">Take a moment to reflect.</span>
                <button className="trailer-continue-btn" onClick={resume}>
                  Continue &#9654;
                  <span className="trailer-continue-hint">(Space)</span>
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Controls — identical layout to Reader */}
      <div className="reader-controls" role="toolbar" aria-label="Playback controls">
        <button
          className="ctrl-btn"
          onClick={restart}
          title="Restart (R)"
          aria-label="Restart"
          disabled={trailerStacks.length === 0}
        >
          <ReaderButtonIcon src={restartButtonSrc} alt="Restart" />
        </button>
        <button
          className="ctrl-btn"
          onClick={() => rewind(10)}
          title="Rewind 10 stacks (←)"
          aria-label="Rewind"
          disabled={currentIndex === 0}
        >
          <ReaderButtonIcon src={rewindButtonSrc} alt="Rewind" />
        </button>
        {state === 'playing' ? (
          <button
            className="ctrl-btn ctrl-btn-primary"
            onClick={pause}
            title="Pause (Space)"
            aria-label="Pause"
          >
            <ReaderButtonIcon src={pauseButtonSrc} alt="Pause" />
          </button>
        ) : (
          <button
            className="ctrl-btn ctrl-btn-primary"
            onClick={state === 'paused' ? resume : play}
            title={waitingForUser ? 'Continue (Space)' : 'Play (Space)'}
            aria-label={waitingForUser ? 'Continue' : 'Play'}
            disabled={trailerStacks.length === 0}
          >
            <ReaderButtonIcon src={startButtonSrc} alt={waitingForUser ? 'Continue' : 'Play'} />
          </button>
        )}
        <button
          className="ctrl-btn"
          onClick={() => seekTo(Math.min(trailerStacks.length - 1, currentIndex + 10))}
          title="Skip forward 10 stacks (→)"
          aria-label="Skip forward"
          disabled={currentIndex >= trailerStacks.length - 1}
        >
          <ReaderButtonIcon src={skipForwardButtonSrc} alt="Skip forward" />
        </button>
        <button
          className="ctrl-btn"
          onClick={stop}
          title="Stop (S)"
          aria-label="Stop"
          disabled={state === 'idle' || state === 'stopped'}
        >
          <ReaderButtonIcon src={exitButtonSrc} alt="Stop" />
        </button>
      </div>

      {/* Keyboard hints */}
      <div className="reader-keyhints">
        <span>Space: {waitingForUser ? 'continue' : 'play/pause'}</span>
        <span>R: restart</span>
        <span>S: stop</span>
        <span>←/→: rewind/skip</span>
        <span>F: full-screen</span>
      </div>
    </div>
  )
}
