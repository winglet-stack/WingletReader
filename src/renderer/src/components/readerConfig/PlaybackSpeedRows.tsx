import React from 'react'
import type { Settings } from '../../types'
import NumericInput from '../NumericInput'
import {
  READER_TARGET_WPM_SLIDER_MIN,
  READER_TARGET_WPM_SLIDER_MAX,
  READER_TARGET_WPM_SLIDER_STEP,
  READER_TARGET_WPM_MIN,
  READER_TARGET_WPM_MAX,
  clampReaderTargetWpm,
  readerTargetWpmToSlider,
  sliderToReaderTargetWpm,
} from '../../engine/wpmSolver'
import {
  BPM_SLIDER_MAX,
  BPM_SLIDER_MIN,
  BPM_SLIDER_STEP,
  READER_BPM_MAX,
  READER_BPM_MIN,
  READER_BPM_STEP,
  bpmToSlider,
  clampReaderBpm,
  sliderToBpm,
} from '../../engine/bpmScale'
import {
  deriveTargetWpm,
  targetWpmPatch,
  lockAtWpmTogglePatch,
} from '../../engine/readerConfigPatches'

interface Props {
  local: Settings
  update: (patch: Partial<Settings>) => void
}

/**
 * The mode-dependent speed controls: Lock-at-WPM toggle, Target WPM, BPM, and
 * Words-per-stack. Which rows show depends on the tap / lock combination, so all
 * the reveal branching lives here rather than in the parent Playback section.
 */
export default function PlaybackSpeedRows({ local, update }: Props) {
  const showLockToggle = !local.tap_to_read
  const showTargetWpm = !local.tap_to_read && local.lock_at_wpm
  const showBpm = !local.tap_to_read && !local.lock_at_wpm
  const showWps = local.tap_to_read || !local.lock_at_wpm
  const wpm = local.bpm * local.words_per_stack
  const targetSol = deriveTargetWpm(local.target_wpm)

  return (
    <>
      {showLockToggle && (
        <div className="settings-row">
          <label className="settings-label">
            Lock at WPM
            <span className="settings-hint">Auto-derive BPM and words per stack from a target reading speed</span>
          </label>
          <div className="settings-control">
            <label className="toggle">
              <input
                type="checkbox"
                aria-label="Lock at WPM"
                checked={local.lock_at_wpm}
                onChange={(e) => update(lockAtWpmTogglePatch(local, e.target.checked))}
              />
              <span className="toggle-track" />
            </label>
          </div>
        </div>
      )}

      {showTargetWpm && (
        <div className="settings-row rcp-indented">
          <label htmlFor="rcp-target-wpm" className="settings-label">
            Target WPM
            <span className="settings-hint">
              {`→ BPM: ${targetSol.bpm} · WPS: ${targetSol.wordsPerStack} · effective ${targetSol.effectiveWpm} wpm`}
            </span>
          </label>
          <div className="settings-control settings-control-wide">
            <input
              id="rcp-target-wpm"
              type="range"
              min={READER_TARGET_WPM_SLIDER_MIN}
              max={READER_TARGET_WPM_SLIDER_MAX}
              step={READER_TARGET_WPM_SLIDER_STEP}
              value={readerTargetWpmToSlider(local.target_wpm)}
              onChange={(e) => update(targetWpmPatch(sliderToReaderTargetWpm(Number(e.target.value))))}
              className="range-slider"
            />
            <NumericInput
              value={clampReaderTargetWpm(local.target_wpm)}
              min={READER_TARGET_WPM_MIN}
              max={READER_TARGET_WPM_MAX}
              step={5}
              onCommit={(targetWpm) => update(targetWpmPatch(targetWpm))}
              ariaLabel="Target WPM value"
            />
          </div>
        </div>
      )}

      {showBpm && (
        <div className="settings-row">
          <label htmlFor="rcp-bpm" className="settings-label">
            BPM
            <span className="settings-hint">{wpm} wpm at current stack size</span>
          </label>
          <div className="settings-control settings-control-wide">
            <input
              id="rcp-bpm"
              type="range"
              min={BPM_SLIDER_MIN}
              max={BPM_SLIDER_MAX}
              step={BPM_SLIDER_STEP}
              value={bpmToSlider(local.bpm)}
              onChange={(e) => update({ bpm: sliderToBpm(Number(e.target.value)) })}
              className="range-slider"
            />
            <NumericInput
              value={local.bpm}
              min={READER_BPM_MIN}
              max={READER_BPM_MAX}
              step={READER_BPM_STEP}
              onCommit={(bpm) => update({ bpm: clampReaderBpm(bpm) })}
              ariaLabel="BPM value"
            />
          </div>
        </div>
      )}

      {showWps && (
        <div className="settings-row">
          <label htmlFor="rcp-words-per-stack" className="settings-label">
            Words per stack
            <span className="settings-hint">Words shown at once in each slot</span>
          </label>
          <div className="settings-control">
            <NumericInput
              id="rcp-words-per-stack"
              value={local.words_per_stack}
              min={1}
              max={10}
              onCommit={(words_per_stack) => update({ words_per_stack })}
              ariaLabel="Words per stack value"
            />
          </div>
        </div>
      )}
    </>
  )
}
