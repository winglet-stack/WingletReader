import React from 'react'

interface Props {
  onContinue: () => void
}

export default function FastTrackShowcase({ onContinue }: Props) {
  return (
    <div
      className="showcase-screen"
      onClick={onContinue}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onContinue() }}
      aria-label="Continue to library"
    >
      <div className="showcase-content">
        <p className="showcase-wordmark">WingletReader</p>
        <div className="showcase-disclaimer">
          Click anywhere to continue to your library or upload texts to read.
        </div>
      </div>
    </div>
  )
}
