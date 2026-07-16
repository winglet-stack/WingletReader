import React from 'react'
import ReaderButtonIcon from './ReaderButtonIcon'
import rewindDarkSrc from '../../assets/reader-buttons/rewind-dark.png'
import rewindLightSrc from '../../assets/reader-buttons/rewind-light.png'
import skipForwardDarkSrc from '../../assets/reader-buttons/skip-forward-dark.png'
import skipForwardLightSrc from '../../assets/reader-buttons/skip-forward-light.png'

interface LocateButtonProps {
  detached: boolean
  onLocate: () => void
}

interface PagerProps {
  currentPage: number
  totalPages: number
  canBack: boolean
  canForward: boolean
  onPrev: () => void
  onNext: () => void
}

export function TextConsoleLocateButton({ detached, onLocate }: LocateButtonProps) {
  return (
    <button
      className={`plain-text-locate-btn${detached ? ' plain-text-locate-btn--active' : ''}`}
      onClick={onLocate}
      title={detached ? 'Return to the reading position' : 'Scroll to current reading position'}
      aria-label="Scroll to current reading position"
      aria-pressed={detached}
    >
      &#x2316;
    </button>
  )
}

export function TextConsolePager({
  currentPage,
  totalPages,
  canBack,
  canForward,
  onPrev,
  onNext,
}: PagerProps) {
  return (
    <div className="plain-text-console-pager" role="group" aria-label="Page navigation">
      <button
        className="ctrl-btn plain-text-console-pager-btn"
        onClick={onPrev}
        disabled={!canBack}
        title="Previous page"
        aria-label="Previous page"
      >
        <ReaderButtonIcon darkSrc={rewindDarkSrc} lightSrc={rewindLightSrc} alt="Previous page" />
      </button>
      <span className="plain-text-console-pager-label" aria-live="polite" aria-atomic="true">
        Page {currentPage + 1} / {totalPages}
      </span>
      <button
        className="ctrl-btn plain-text-console-pager-btn"
        onClick={onNext}
        disabled={!canForward}
        title="Next page"
        aria-label="Next page"
      >
        <ReaderButtonIcon darkSrc={skipForwardDarkSrc} lightSrc={skipForwardLightSrc} alt="Next page" />
      </button>
    </div>
  )
}
