import React from 'react'
import type { Settings } from '../../types'
import SettingsLabel from '../settings/SettingsLabel'

interface Props {
  /** The resolved highlight mode (already defaulted to 'default'). */
  mode: string
  update: (patch: Partial<Settings>) => void
}

/** The three-way Default / Progressive / Panning highlight-mode pill selector. */
export default function HighlightModeRow({ mode, update }: Props) {
  return (
    <div className="settings-row">
      <SettingsLabel
        label="Highlighting mode"
        hint="How the active word stack is visually highlighted"
      />
      <div className="settings-control settings-control-row">
        <button
          className={`theme-pill ${mode === 'default' ? 'theme-pill-active' : ''}`}
          onClick={() => update({ highlight_mode: 'default', highlighting_mode: 'default' })}
        >
          Default
        </button>
        <button
          className={`theme-pill ${mode === 'progressive-bar' ? 'theme-pill-active' : ''}`}
          onClick={() => update({ highlight_mode: 'progressive-bar', highlighting_mode: 'progressive' })}
        >
          Progressive
        </button>
        <button
          className={`theme-pill ${mode === 'panning-bar' ? 'theme-pill-active' : ''}`}
          onClick={() => update({ highlight_mode: 'panning-bar', highlighting_mode: 'progressive' })}
        >
          Panning
        </button>
      </div>
    </div>
  )
}
