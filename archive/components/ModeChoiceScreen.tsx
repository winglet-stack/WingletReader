import React from 'react'

interface Props {
  onLibrary: () => void
  onReadWhileWorking: () => void
}

function LibraryIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 4.5h9.5A3.5 3.5 0 0 1 18 8v11.5H8.5A3.5 3.5 0 0 0 5 16z" />
      <path d="M5 4.5A3.5 3.5 0 0 1 8.5 8H18" />
      <path d="M8.5 8v11.5" />
    </svg>
  )
}

function MonitorIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="3" y="4.5" width="18" height="12" rx="2" />
      <path d="M9 20h6" />
      <path d="M12 16.5V20" />
    </svg>
  )
}

export default function ModeChoiceScreen({ onLibrary, onReadWhileWorking }: Props) {
  return (
    <div className="mode-choice-screen">
      <div className="mode-choice-grid" aria-label="Choose reading mode">
        <button className="mode-choice-card" onClick={onLibrary}>
          <span className="mode-choice-icon"><LibraryIcon /></span>
          <span className="mode-choice-title">Library</span>
          <span className="mode-choice-subtitle">Normal reader mode</span>
        </button>

        <button className="mode-choice-card" onClick={onReadWhileWorking}>
          <span className="mode-choice-icon"><MonitorIcon /></span>
          <span className="mode-choice-title">Read while working</span>
          <span className="mode-choice-subtitle">Use selected text from other apps</span>
        </button>
      </div>
    </div>
  )
}
