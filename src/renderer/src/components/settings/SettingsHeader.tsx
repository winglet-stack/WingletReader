import React from 'react'

interface Props {
  transmuteMode: boolean
  onBackToTransmute?: () => void
  saved: boolean
}

export default function SettingsHeader({ transmuteMode, onBackToTransmute, saved }: Props) {
  return (
    <header className="view-header">
      <div className="transmute-header-row">
        <h1>{transmuteMode ? 'Transmute Reader Settings' : 'Settings'}</h1>
        {transmuteMode && onBackToTransmute && (
          <button className="btn-ghost btn-small" onClick={onBackToTransmute}>
            Back to Transmute
          </button>
        )}
      </div>
      {saved && <span className="saved-badge">Saved ✓</span>}
    </header>
  )
}
