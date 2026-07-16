import React from 'react'
import type { Settings } from '../../types'
import { isReservedReaderBinding } from '../../engine/readerBindings'
import BindingCaptureRow from './BindingCaptureRow'

interface Props {
  bindKey: string
  tapKey: string
  update: (patch: Partial<Settings>) => void
}

export default function LiveRewindKeyRow({ bindKey, tapKey, update }: Props) {
  return (
    <BindingCaptureRow
      label="Live rewind key"
      hint="Press a key or mouse button to capture"
      value={bindKey}
      ariaLabelPrefix="Current live rewind key"
      isBlocked={(code) => isReservedReaderBinding(code, tapKey)}
      onCapture={(code) => update({ live_rewind_key: code })}
    />
  )
}
