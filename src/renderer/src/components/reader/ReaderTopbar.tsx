import React from 'react'
import returnFromReaderSrc from '../../assets/navigation/ReturnFromReader.png'

/**
 * Single-ink fullscreen toggle glyph (currentColor, ADR-0022 convention).
 * Diagonal arrows: pointing outward = enter fullscreen, inward = exit. Local to
 * the reader top bar rather than folded into ChromeIcon (Settings-scoped, 32px).
 */
function FullscreenIcon({ isFullscreen }: { isFullscreen: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      {isFullscreen ? (
        // Arrows pointing inward — compress / exit fullscreen
        <path d="M3 3L9 9M9 4V9H4M21 3L15 9M15 4V9H20M3 21L9 15M4 15H9V20M21 21L15 15M20 15H15V20" />
      ) : (
        // Arrows pointing outward — expand / enter fullscreen
        <path d="M9 9L3 3M3 8V3H8M15 9L21 3M16 3H21V8M9 15L3 21M3 16V21H8M15 15L21 21M16 21H21V16" />
      )}
    </svg>
  )
}

interface Props {
  title: string
  tapToRead: boolean
  wpm: number
  minutesLeft: number
  showPlainText: boolean
  isFullscreen: boolean
  backLabel: string
  /** Empty-library frame (ADR-0013 §5): suppress the live wpm/minutes readout. */
  hideMeta?: boolean
  onBack: () => void
  onTogglePlainText: () => void
  onToggleFullscreen: () => void
}

export default function ReaderTopbar({
  title,
  tapToRead,
  wpm,
  minutesLeft,
  showPlainText,
  isFullscreen,
  backLabel,
  hideMeta = false,
  onBack,
  onTogglePlainText,
  onToggleFullscreen,
}: Props) {
  const showHubReturnSprite = backLabel === 'Hub'
  const backAriaLabel = backLabel === 'Library' ? 'Back to library' : backLabel

  return (
    <div className="reader-topbar">
      <div className="reader-topbar-start">
        <button
          className={showHubReturnSprite ? 'reader-hub-return-btn' : 'btn-ghost btn-small'}
          onClick={onBack}
          aria-label={backAriaLabel}
          title={backAriaLabel}
        >
          {showHubReturnSprite ? (
            <img className="reader-hub-return-img" src={returnFromReaderSrc} alt="" aria-hidden="true" />
          ) : (
            <>&#8592; {backLabel}</>
          )}
        </button>
        <span className="reader-title">{title}</span>
      </div>

      <div className="reader-topbar-end">
        {hideMeta ? (
          <span className="reader-meta" />
        ) : (
          <span className="reader-meta">
            {tapToRead ? 'Tap mode' : `${wpm} wpm · ${minutesLeft} min left`}
          </span>
        )}
        <button
          className={`btn-ghost btn-small reader-plaintext-btn${showPlainText ? ' reader-plaintext-btn--active' : ''}`}
          onClick={onTogglePlainText}
          title={showPlainText ? 'Back to reader (T)' : 'Plain text view (T)'}
          aria-pressed={showPlainText}
          aria-label={showPlainText ? 'Back to reader' : 'Plain text view'}
        >
          {showPlainText ? 'Reader' : 'Text'}
        </button>
        <button
          className={`btn-ghost btn-small reader-fullscreen-btn${isFullscreen ? ' reader-fullscreen-btn--active' : ''}`}
          onClick={onToggleFullscreen}
          title={isFullscreen ? 'Exit full-screen (F)' : 'Enter full-screen (F)'}
          aria-pressed={isFullscreen}
          aria-label={isFullscreen ? 'Exit full-screen' : 'Enter full-screen'}
        >
          <FullscreenIcon isFullscreen={isFullscreen} />
        </button>
      </div>
    </div>
  )
}
