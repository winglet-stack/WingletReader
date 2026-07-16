import React from 'react'
import ReaderTopbar from './ReaderTopbar'
import ReaderScrubber from './ReaderScrubber'
import ReaderControls from './ReaderControls'
import ReaderKeyhints from './ReaderKeyhints'

interface Props {
  onBack: () => void
  backLabel?: string
  /** Omit to render the zero-stack controls natively disabled. */
  onInertControl?: () => void
  children: React.ReactNode
}

export default function ReaderInertFrame({
  onBack,
  backLabel = 'Hub',
  onInertControl,
  children,
}: Props) {
  const inert = onInertControl != null
  const route = onInertControl ?? (() => {})
  return (
    <div className="reader-shell reader-shell--empty">
      <ReaderTopbar
        title=""
        tapToRead={false}
        wpm={0}
        minutesLeft={0}
        showPlainText={false}
        isFullscreen={false}
        backLabel={backLabel}
        hideMeta
        onBack={onBack}
        onTogglePlainText={route}
        onToggleFullscreen={route}
      />

      <ReaderScrubber
        currentIndex={0}
        stacksLength={0}
        progress={0}
        transitionMs={0}
        rereReadEndIndex={null}
        goalBookmarkIndex={null}
        normalBookmarkMarkers={[]}
        onSeek={route}
      />

      <div className="reader-main">
        <div className="reader-stage-slot">{children}</div>
      </div>

      <ReaderControls
        playState="idle"
        currentIndex={0}
        stacksLength={0}
        hasSavedIndex={false}
        resumePct={null}
        countdownActive={false}
        inert={inert}
        onRestart={route}
        onRewind={route}
        onPause={route}
        onResume={route}
        onResumeSaved={route}
        onPlay={route}
        onSkipForward={route}
        onStop={route}
      />

      <ReaderKeyhints
        tapToRead={false}
        tapToReadKey="Space"
        hasSavedIndex={false}
        playState="idle"
      />
    </div>
  )
}
