import React from 'react'
import type { Settings } from '../../types'
import NumericInput from '../NumericInput'
import AdvanceKeyRow from './AdvanceKeyRow'
import PlaybackSpeedRows from './PlaybackSpeedRows'

interface Props {
  local: Settings
  update: (patch: Partial<Settings>) => void
}

export default function PlaybackSection({ local, update }: Props) {
  return (
    <section className="settings-section">
      <h2 className="settings-heading">Playback</h2>

      <div className="settings-row">
        <label className="settings-label">
          Advance mode
          <span className="settings-hint">BPM auto-advances; Tap requires a keypress each stack</span>
        </label>
        <div className="settings-control settings-control-row">
          <button
            className={`theme-pill ${!local.tap_to_read ? 'theme-pill-active' : ''}`}
            onClick={() => update({ tap_to_read: false })}
          >
            BPM
          </button>
          <button
            className={`theme-pill ${local.tap_to_read ? 'theme-pill-active' : ''}`}
            onClick={() => update({ tap_to_read: true, lock_at_wpm: false })}
          >
            Tap to Read
          </button>
        </div>
      </div>

      {local.tap_to_read && (
        <AdvanceKeyRow
          tapKey={local.tap_to_read_key}
          liveRewindKey={local.live_rewind_key}
          update={update}
        />
      )}

      <PlaybackSpeedRows local={local} update={update} />

      <div className="settings-row">
        <label htmlFor="rcp-stacks-visible" className="settings-label">
          Stacks visible
          <span className="settings-hint">Slots displayed side by side before redraw</span>
        </label>
        <div className="settings-control">
          <NumericInput
            id="rcp-stacks-visible"
            value={local.stacks_visible}
            min={1}
            max={8}
            onCommit={(stacks_visible) => update({ stacks_visible })}
            ariaLabel="Stacks visible value"
          />
        </div>
      </div>

      <div className="settings-row">
        <label className="settings-label">
          Multiple lines
          <span className="settings-hint">Stack multiple rows of word groups before redrawing</span>
        </label>
        <div className="settings-control">
          <label className="toggle">
            <input
              type="checkbox"
              checked={local.lines_enabled}
              onChange={(e) => update({ lines_enabled: e.target.checked })}
            />
            <span className="toggle-track" />
          </label>
        </div>
      </div>

      {local.lines_enabled && (
        <div className="settings-row rcp-indented">
          <label htmlFor="rcp-lines-count" className="settings-label">
            Lines per screen
            <span className="settings-hint">Rows of word stacks displayed before redrawing</span>
          </label>
          <div className="settings-control">
            <NumericInput
              id="rcp-lines-count"
              value={local.lines_count}
              min={2}
              max={10}
              onCommit={(lines_count) => update({ lines_count })}
              ariaLabel="Lines per screen value"
            />
          </div>
        </div>
      )}

      <div className="settings-row">
        <label className="settings-label">
          Pause at sentences
          <span className="settings-hint">Add a beat pause at sentence-ending stacks</span>
        </label>
        <div className="settings-control">
          <label className="toggle">
            <input
              type="checkbox"
              checked={local.pause_at_sentences}
              onChange={(e) => update({ pause_at_sentences: e.target.checked })}
            />
            <span className="toggle-track" />
          </label>
        </div>
      </div>

      <div className="settings-row">
        <label className="settings-label">
          Pause at headlines
          <span className="settings-hint">Add extra pause when reading headline stacks</span>
        </label>
        <div className="settings-control">
          <label className="toggle">
            <input
              type="checkbox"
              checked={local.pause_at_headlines}
              onChange={(e) => update({ pause_at_headlines: e.target.checked })}
            />
            <span className="toggle-track" />
          </label>
        </div>
      </div>
    </section>
  )
}
