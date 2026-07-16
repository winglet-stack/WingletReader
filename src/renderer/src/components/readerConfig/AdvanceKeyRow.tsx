import React from 'react'
import type { Settings } from '../../types'
import { isReservedReaderBinding } from '../../engine/readerBindings'
import BindingCaptureRow from './BindingCaptureRow'

interface Props {
  tapKey: string
  liveRewindKey: string
  update: (patch: Partial<Settings>) => void
}

/** Press-to-capture row for rebinding the Tap-to-Read advance key. Owns its own capture state. */
export default function AdvanceKeyRow({ tapKey, liveRewindKey, update }: Props) {
  return (
    <BindingCaptureRow
      label="Advance key"
      hint="Press to capture a new key binding"
      value={tapKey}
      ariaLabelPrefix="Current advance key"
      isBlocked={(code) => isReservedReaderBinding(code) || code === liveRewindKey}
      onCapture={(code) => update({ tap_to_read_key: code })}
    />
  )
}
