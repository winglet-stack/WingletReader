import React from 'react'
import ReaderButtonIcon from './ReaderButtonIcon'
import pauseDarkSrc from '../../assets/reader-buttons/pause-dark.png'
import pauseLightSrc from '../../assets/reader-buttons/pause-light.png'
import playDarkSrc from '../../assets/reader-buttons/play-dark.png'
import playLightSrc from '../../assets/reader-buttons/play-light.png'
import repeatDarkSrc from '../../assets/reader-buttons/repeat-dark.png'
import repeatLightSrc from '../../assets/reader-buttons/repeat-light.png'
import rewindDarkSrc from '../../assets/reader-buttons/rewind-dark.png'
import rewindLightSrc from '../../assets/reader-buttons/rewind-light.png'
import skipForwardDarkSrc from '../../assets/reader-buttons/skip-forward-dark.png'
import skipForwardLightSrc from '../../assets/reader-buttons/skip-forward-light.png'
import stopDarkSrc from '../../assets/reader-buttons/stop-dark.png'
import stopLightSrc from '../../assets/reader-buttons/stop-light.png'

interface Props {
  playState: 'idle' | 'playing' | 'paused' | 'stopped'
  currentIndex: number
  stacksLength: number
  /** Saved-position resume available (validated index exists). */
  hasSavedIndex: boolean
  /** Percent label for the resume-from-saved button title. */
  resumePct: number | null
  countdownActive: boolean
  /** Keep empty-library controls clickable so they can route to Import. */
  inert?: boolean
  onRestart: () => void
  onRewind: () => void
  onPause: () => void
  onResume: () => void
  onResumeSaved: () => void
  onPlay: () => void
  onSkipForward: () => void
  onStop: () => void
  /** Optional left-column replacement; keeps ReaderControls unaware of caller state. */
  leftSlot?: React.ReactNode
  /** Optional center-column replacement for the default playback transport. */
  transport?: React.ReactNode
  /** Footer right column (bookmarks + quick settings); wiring stays in Reader. */
  utilities?: React.ReactNode
}

function isDisabledInLiveMode(inert: boolean, unavailable: boolean): boolean {
  return !inert && unavailable
}

function isStopUnavailable(playState: Props['playState'], countdownActive: boolean): boolean {
  return (playState === 'idle' || playState === 'stopped') && !countdownActive
}

export default function ReaderControls({
  playState,
  currentIndex,
  stacksLength,
  hasSavedIndex,
  resumePct,
  countdownActive,
  inert = false,
  onRestart,
  onRewind,
  onPause,
  onResume,
  onResumeSaved,
  onPlay,
  onSkipForward,
  onStop,
  leftSlot,
  transport,
  utilities,
}: Props) {
  const restartDisabled = isDisabledInLiveMode(inert, stacksLength === 0)
  const rewindDisabled = isDisabledInLiveMode(inert, currentIndex === 0)
  const playDisabled = isDisabledInLiveMode(inert, stacksLength === 0)
  const skipForwardDisabled = isDisabledInLiveMode(inert, currentIndex >= stacksLength - 1)
  const stopDisabled = isDisabledInLiveMode(inert, isStopUnavailable(playState, countdownActive))

  return (
    <div className={`reader-controls${inert ? ' reader-controls--inert' : ''}`}>
      {leftSlot ?? <div className="reader-controls-spacer" aria-hidden="true" />}
      {transport ?? (
        <div
          className="reader-controls-playback"
          role="toolbar"
          aria-label="Playback controls"
        >
          <button
            className="ctrl-btn"
            onClick={onRestart}
            title="Restart (R)"
            aria-label="Restart"
            disabled={restartDisabled}
          >
            <ReaderButtonIcon darkSrc={repeatDarkSrc} lightSrc={repeatLightSrc} alt="Restart" />
          </button>

          <button
            className="ctrl-btn"
            onClick={onRewind}
            title="Rewind 10 stacks (←)"
            aria-label="Rewind"
            disabled={rewindDisabled}
          >
            <ReaderButtonIcon darkSrc={rewindDarkSrc} lightSrc={rewindLightSrc} alt="Rewind" />
          </button>

          {playState === 'playing' ? (
            <button
              className="ctrl-btn ctrl-btn-primary"
              onClick={onPause}
              title="Pause (Space)"
              aria-label="Pause"
            >
              <ReaderButtonIcon darkSrc={pauseDarkSrc} lightSrc={pauseLightSrc} alt="Pause" />
            </button>
          ) : playState === 'paused' ? (
            <button
              className="ctrl-btn ctrl-btn-primary"
              onClick={onResume}
              title="Resume (Space)"
              aria-label="Resume"
            >
              <ReaderButtonIcon darkSrc={playDarkSrc} lightSrc={playLightSrc} alt="Resume" />
            </button>
          ) : hasSavedIndex ? (
            <button
              className="ctrl-btn ctrl-btn-primary"
              onClick={onResumeSaved}
              title={`Resume from ${resumePct}% (Space)`}
              aria-label="Resume from saved position"
            >
              <ReaderButtonIcon darkSrc={playDarkSrc} lightSrc={playLightSrc} alt="Resume" />
            </button>
          ) : (
            <button
              className="ctrl-btn ctrl-btn-primary"
              onClick={onPlay}
              title="Play (Space)"
              aria-label="Play"
              disabled={playDisabled}
            >
              <ReaderButtonIcon darkSrc={playDarkSrc} lightSrc={playLightSrc} alt="Play" />
            </button>
          )}

          <button
            className="ctrl-btn"
            onClick={onSkipForward}
            title="Skip forward 10 stacks (→)"
            aria-label="Skip forward"
            disabled={skipForwardDisabled}
          >
            <ReaderButtonIcon darkSrc={skipForwardDarkSrc} lightSrc={skipForwardLightSrc} alt="Skip forward" />
          </button>

          <button
            className="ctrl-btn"
            onClick={onStop}
            title="Stop (S)"
            aria-label="Stop"
            disabled={stopDisabled}
          >
            <ReaderButtonIcon darkSrc={stopDarkSrc} lightSrc={stopLightSrc} alt="Stop" />
          </button>
        </div>
      )}

      <div className="reader-controls-utilities">
        {utilities}
      </div>
    </div>
  )
}
