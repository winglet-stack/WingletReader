import React, { useCallback, useState } from 'react'
import { formatBindingCode, bindingCodeFromMouseButton } from '../../engine/readerBindings'
import SettingsLabel from '../settings/SettingsLabel'

interface Props {
  label: string
  hint: string
  value: string
  ariaLabelPrefix: string
  isBlocked: (code: string) => boolean
  onCapture: (code: string) => void
}

/** Press-to-capture row for keyboard keys and mouse buttons. */
export default function BindingCaptureRow({
  label,
  hint,
  value,
  ariaLabelPrefix,
  isBlocked,
  onCapture,
}: Props) {
  const [capturing, setCapturing] = useState(false)
  const [blocked, setBlocked] = useState(false)

  const tryCapture = useCallback(
    (code: string) => {
      if (isBlocked(code)) {
        setBlocked(true)
        return
      }
      setBlocked(false)
      onCapture(code)
      setCapturing(false)
    },
    [isBlocked, onCapture]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.code) tryCapture(e.code)
    },
    [tryCapture]
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault()
      e.stopPropagation()
      const code = bindingCodeFromMouseButton(e.button)
      if (code) tryCapture(code)
    },
    [tryCapture]
  )

  return (
    <div className="settings-row">
      <SettingsLabel
        label={label}
        hint={hint}
        feedback={blocked ? 'That binding is already in use' : undefined}
      />
      <div className="settings-control">
        <button
          type="button"
          className={`key-capture-btn${capturing ? ' key-capture-btn--active' : ''}${blocked ? ' key-capture-btn--blocked' : ''}`}
          onClick={() => {
            setBlocked(false)
            setCapturing(true)
          }}
          onKeyDown={capturing ? handleKeyDown : undefined}
          onMouseDown={capturing ? handleMouseDown : undefined}
          onBlur={() => {
            setCapturing(false)
            setBlocked(false)
          }}
          aria-label={
            capturing
              ? 'Press a key or mouse button to capture'
              : `${ariaLabelPrefix}: ${formatBindingCode(value)}`
          }
          aria-pressed={capturing}
        >
          {capturing ? 'Press a key or mouse button…' : formatBindingCode(value)}
        </button>
      </div>
    </div>
  )
}
