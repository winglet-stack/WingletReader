import React, { useCallback, useState } from 'react'
import { formatShortcut, keyFromEvent } from '../../engine/shortcutCapture'
import SettingsLabel from './SettingsLabel'

interface Props {
  label: string
  hint: string
  value: string
  onCapture: (accelerator: string) => void
}

/**
 * Press-to-capture row for a global Overlay Reader accelerator (summon/exit).
 * Unlike BindingCaptureRow (single key/mouse code), this records a full modifier
 * chord ("Control+Space") via keyFromEvent. Escape cancels without rebinding, and
 * a lone modifier keeps waiting until a full chord lands (ADR-0021).
 */
export default function RwwShortcutRow({ label, hint, value, onCapture }: Props) {
  const [capturing, setCapturing] = useState(false)

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setCapturing(false)
        return
      }
      const accelerator = keyFromEvent(e)
      if (!accelerator) return // modifier-only so far; keep waiting for a full chord
      onCapture(accelerator)
      setCapturing(false)
    },
    [onCapture]
  )

  return (
    <div className="settings-row rww-shortcut-row">
      <SettingsLabel label={label} hint={hint} />
      <div className="settings-control">
        <button
          type="button"
          className={`key-capture-btn rww-shortcut-row__capture${
            capturing ? ' key-capture-btn--active' : ''
          }`}
          onClick={() => setCapturing(true)}
          onKeyDown={capturing ? handleKeyDown : undefined}
          onBlur={() => setCapturing(false)}
          aria-label={
            capturing
              ? `Recording ${label}. Press a shortcut, or Escape to cancel.`
              : `Record ${label}`
          }
          aria-pressed={capturing}
        >
          {capturing ? 'Press a shortcut…' : formatShortcut(value)}
        </button>
      </div>
    </div>
  )
}
