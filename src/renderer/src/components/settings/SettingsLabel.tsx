import React from 'react'
import SettingHintTrigger from './SettingHintTrigger'

interface Props {
  label: string
  /** Static explain copy — rendered behind a ? tooltip trigger. */
  hint?: string
  /** Live readouts and inline validation — always visible below the label line. */
  feedback?: React.ReactNode
}

/** Shared settings-row label column: title, optional ? help, optional inline feedback. */
export default function SettingsLabel({ label, hint, feedback }: Props) {
  return (
    <div className="settings-label">
      <span className="settings-label-line">
        <span className="settings-label-text">{label}</span>
        {hint ? <SettingHintTrigger settingLabel={label} text={hint} /> : null}
      </span>
      {feedback ? <span className="settings-hint settings-hint--feedback">{feedback}</span> : null}
    </div>
  )
}
