import React from 'react'
import type { PlaybackState } from '../../types'
import { formatBindingCode } from '../../engine/readerBindings'

interface Props {
  tapToRead: boolean
  tapToReadKey: string
  liveRewindKey: string
  hasSavedIndex: boolean
  playState: PlaybackState
}

export default function ReaderKeyhints({
  tapToRead,
  tapToReadKey,
  liveRewindKey,
  hasSavedIndex,
  playState,
}: Props) {
  const liveRewindLabel = formatBindingCode(liveRewindKey)

  return (
    <div className="reader-keyhints">
      {tapToRead ? (
        <>
          <span>Left click: live rewind</span>
          <span>Right click: advance</span>
          <span>{formatBindingCode(tapToReadKey)}: advance</span>
        </>
      ) : (
        <>
          <span>Space: {hasSavedIndex && playState === 'idle' ? 'resume' : 'play/pause'}</span>
          <span>{liveRewindLabel}: live rewind</span>
          <span>←/→: skip 10</span>
        </>
      )}
      <span>R: restart</span>
      <span>S: stop</span>
      <span>F: full-screen</span>
      <span>T: text view</span>
    </div>
  )
}
