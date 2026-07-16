import React from 'react'
import type { PlaybackState } from '../../types'

// ── Countdown overlay ─────────────────────────────────────────────────────────

interface CountdownProps {
  countdown: number
  color: string
}

export function ReaderCountdown({ countdown, color }: CountdownProps) {
  return (
    <div
      className="reader-countdown"
      aria-live="polite"
      aria-label="Reading resumes in"
      style={{ '--reader-countdown-color': color } as React.CSSProperties}
    >
      <span className="reader-countdown-number">{countdown}</span>
    </div>
  )
}

// ── Idle / stopped panel (text engaged) ───────────────────────────────────────
//
// Shown inside the Reader stage when a text is loaded but playback is idle or
// stopped: the resume/ready summary. Picking a *different* text is no longer a
// local toggle here — it is the persistent frame's top-bar Library / Reading
// control, which swaps the whole stage to the in-frame library
// (ADR-0013 §6–§7). This panel keeps only the engaged-text resume/ready UI.

interface IdleProps {
  playState: PlaybackState
  logoSrc: string
  tapToRead: boolean
  wpm: number
  totalWords: number
  resumePct: number | null
}

export function ReaderIdle({
  playState,
  logoSrc,
  tapToRead,
  wpm,
  totalWords,
  resumePct,
}: IdleProps) {
  return (
    <div className="reader-idle">
      {playState === 'idle' && (
        <img src={logoSrc} alt="WingletReader" className="reader-idle-logo" />
      )}
      <p>{playState === 'stopped' ? 'Finished.' : 'Ready to read.'}</p>
      <p className="reader-idle-sub">
        {tapToRead
          ? `${totalWords.toLocaleString()} words · tap mode`
          : `${totalWords.toLocaleString()} words · ~${Math.ceil(totalWords / wpm)} min at ${wpm} wpm`
        }
      </p>
      {playState === 'idle' && resumePct !== null && (
        <p className="reader-idle-resume">
          Saved position: {resumePct}% through — use Resume to continue
        </p>
      )}
    </div>
  )
}
