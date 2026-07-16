import React from 'react'
import SettingsLabel from '../settings/SettingsLabel'

interface Props {
  label: string
  hint: string
  /** Current settings theme — selects which default swatch shows when unset. */
  theme: string
  value: string
  lightDefault: string
  darkDefault: string
  indented?: boolean
  onChange: (value: string) => void
}

/**
 * A label + native colour swatch + Reset button row. Encapsulates the
 * theme-aware default-colour and clear-on-reset logic so the field-group
 * sections stay free of that branching.
 */
export default function ColorSettingRow({
  label,
  hint,
  theme,
  value,
  lightDefault,
  darkDefault,
  indented,
  onChange,
}: Props) {
  const fallback = theme === 'light' ? lightDefault : darkDefault
  return (
    <div className={`settings-row${indented ? ' rcp-indented' : ''}`}>
      <SettingsLabel label={label} hint={hint} />
      <div className="settings-control settings-control-row">
        <input
          type="color"
          className="color-swatch-input"
          value={value || fallback}
          onChange={(e) => onChange(e.target.value)}
        />
        {value && (
          <button className="btn-ghost btn-small" onClick={() => onChange('')}>
            Reset
          </button>
        )}
      </div>
    </div>
  )
}
