import type { ReadWhileWorkingStatus } from '../types'

/**
 * Subset of a keyboard event needed to derive a shortcut string.
 * Structurally satisfied by React.KeyboardEvent and native KeyboardEvent.
 */
export interface ShortcutKeySource {
  key: string
  code: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
}

const MODIFIER_CODES = [
  'ControlLeft',
  'ControlRight',
  'ShiftLeft',
  'ShiftRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight'
]

export const formatShortcut = (shortcut: string): string =>
  shortcut.replace(/Control/g, 'Ctrl').replace(/\+/g, ' + ')

/**
 * Derive an accelerator string ("Control+Shift+K") from a key event, or null
 * when the event cannot complete a shortcut (Escape, or a modifier by itself).
 */
export function keyFromEvent(e: ShortcutKeySource): string | null {
  if (e.key === 'Escape') return null
  const key =
    e.code === 'Space' ? 'Space' :
    e.code.startsWith('Key') ? e.code.slice(3) :
    e.code.startsWith('Digit') ? e.code.slice(5) :
    e.code

  if (MODIFIER_CODES.includes(e.code)) {
    return null
  }

  const parts = [
    e.ctrlKey ? 'Control' : '',
    e.altKey ? 'Alt' : '',
    e.shiftKey ? 'Shift' : '',
    e.metaKey ? 'Command' : '',
    key
  ].filter(Boolean)

  return parts.join('+')
}

export const readWhileWorkingStatusError = (
  status: ReadWhileWorkingStatus | null
): string | null | undefined => status?.error ?? status?.exitError

export function readWhileWorkingStatusText(status: ReadWhileWorkingStatus | null): string | null {
  if (!status) return null
  const error = readWhileWorkingStatusError(status)
  if (error) return error
  return status.enabled && status.registered
    ? `Listening for ${formatShortcut(status.shortcut)}. Exit with ${formatShortcut(status.exitShortcut)}.`
    : 'Overlay Reader is off.'
}
