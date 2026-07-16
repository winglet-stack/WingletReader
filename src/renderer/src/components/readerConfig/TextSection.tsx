import React from 'react'
import type { Settings } from '../../types'
import NumericInput from '../NumericInput'
import ColorSettingRow from './ColorSettingRow'
import HighlightModeRow from './HighlightModeRow'
import SliderField from '../settings/instruments/SliderField'
import { settingMeta } from '../settings/settingMetadata'

interface Props {
  local: Settings
  update: (patch: Partial<Settings>) => void
}

// Issue-01 proof-of-wiring: font_size renders from the shared SliderField bound
// to its metadata range — the editor and Quick Settings now use one instrument.
const fontSizeMeta = settingMeta('font_size')

export default function TextSection({ local, update }: Props) {
  const highlightMode = local.highlight_mode ?? 'default'

  return (
    <section className="settings-section">
      <h2 className="settings-heading">Text</h2>

      <div className="settings-row">
        <label htmlFor="rcp-font-size" className="settings-label">
          Font size
          <span className="settings-hint">Size of words shown in the reader</span>
        </label>
        <SliderField
          id="rcp-font-size"
          label={fontSizeMeta.label}
          value={local.font_size}
          min={fontSizeMeta.min!}
          max={fontSizeMeta.max!}
          step={fontSizeMeta.step}
          onLiveSet={(font_size) => update({ font_size })}
        />
      </div>

      <ColorSettingRow
        label="Text color"
        hint="Color of the words displayed in the reader"
        theme={local.theme}
        value={local.text_color}
        lightDefault="#111111"
        darkDefault="#f0f0f0"
        onChange={(text_color) => update({ text_color })}
      />

      <div className="settings-row">
        <label htmlFor="rcp-font-family" className="settings-label">
          Font family
          <span className="settings-hint">Leave blank for system default</span>
        </label>
        <div className="settings-control">
          <input
            id="rcp-font-family"
            type="text"
            className="form-input"
            style={{ width: 180 }}
            value={local.font_family}
            placeholder="e.g. Georgia, Arial"
            onChange={(e) => update({ font_family: e.target.value })}
          />
          {local.font_family && (
            <button className="btn-ghost btn-small" onClick={() => update({ font_family: '' })}>
              Reset
            </button>
          )}
        </div>
      </div>

      <div className="settings-row">
        <label className="settings-label">
          Highlight colors
          <span className="settings-hint">Color the active word stack</span>
        </label>
        <div className="settings-control">
          <label className="toggle">
            <input
              type="checkbox"
              checked={local.highlight_active}
              onChange={(e) => update({ highlight_active: e.target.checked })}
            />
            <span className="toggle-track" />
          </label>
        </div>
      </div>

      {local.highlight_active && (
        <>
          <ColorSettingRow
            label="Highlight color"
            hint="Background of the active stack"
            theme={local.theme}
            value={local.highlight_color}
            lightDefault="#111111"
            darkDefault="#f0f0f0"
            indented
            onChange={(highlight_color) => update({ highlight_color })}
          />
          <ColorSettingRow
            label="Highlighted text color"
            hint="Auto selects highest contrast when unset"
            theme={local.theme}
            value={local.highlight_text_color}
            lightDefault="#ffffff"
            darkDefault="#000000"
            indented
            onChange={(highlight_text_color) => update({ highlight_text_color })}
          />
        </>
      )}

      <HighlightModeRow mode={highlightMode} update={update} />

      {highlightMode === 'panning-bar' && (
        <div className="settings-row rcp-indented">
          <label htmlFor="rcp-highlight-panning-chunk" className="settings-label">
            Panning chunk size
            <span className="settings-hint">0 uses the current stacks-visible count</span>
          </label>
          <div className="settings-control">
            <NumericInput
              id="rcp-highlight-panning-chunk"
              value={local.highlight_panning_chunk_size}
              min={0}
              max={20}
              onCommit={(highlight_panning_chunk_size) => update({ highlight_panning_chunk_size })}
              ariaLabel="Panning highlight chunk size"
            />
          </div>
        </div>
      )}
    </section>
  )
}
