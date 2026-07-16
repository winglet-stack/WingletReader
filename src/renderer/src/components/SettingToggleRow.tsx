import React from 'react'
import SettingsLabel from './settings/SettingsLabel'

interface SettingToggleRowProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  hint?: string
  feedback?: React.ReactNode
  disabled?: boolean
  ariaLabel?: string
}

export default function SettingToggleRow({
  label,
  checked,
  onChange,
  hint,
  feedback,
  disabled = false,
  ariaLabel
}: SettingToggleRowProps) {
  return (
    <div className="settings-row">
      <SettingsLabel label={label} hint={hint} feedback={feedback} />
      <div className="settings-control">
        <label className="toggle">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
            aria-label={ariaLabel}
          />
          <span className="toggle-track" />
        </label>
      </div>
    </div>
  )
}
