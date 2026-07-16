import { describe, it, expect } from 'vitest'
import {
  formatShortcut,
  keyFromEvent,
  readWhileWorkingStatusError,
  readWhileWorkingStatusText,
  type ShortcutKeySource
} from '../shortcutCapture'
import type { ReadWhileWorkingStatus } from '../../types'

const event = (overrides: Partial<ShortcutKeySource>): ShortcutKeySource => ({
  key: '',
  code: '',
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...overrides
})

const status = (overrides: Partial<ReadWhileWorkingStatus>): ReadWhileWorkingStatus => ({
  enabled: false,
  supported: true,
  registered: false,
  shortcut: 'Control+Space',
  exitShortcut: 'Control+Space',
  exitRegistered: false,
  error: null,
  exitError: null,
  ...overrides
})

describe('formatShortcut', () => {
  it('renders Control as Ctrl and joins parts with spaced plus signs', () => {
    expect(formatShortcut('Control+Space')).toBe('Ctrl + Space')
  })

  it('handles multi-modifier shortcuts', () => {
    expect(formatShortcut('Control+Shift+K')).toBe('Ctrl + Shift + K')
  })

  it('leaves non-Control modifiers untouched', () => {
    expect(formatShortcut('Alt+F4')).toBe('Alt + F4')
  })
})

describe('keyFromEvent', () => {
  it('returns null for Escape', () => {
    expect(keyFromEvent(event({ key: 'Escape', code: 'Escape' }))).toBeNull()
  })

  it.each([
    'ControlLeft',
    'ControlRight',
    'ShiftLeft',
    'ShiftRight',
    'AltLeft',
    'AltRight',
    'MetaLeft',
    'MetaRight'
  ])('returns null for a bare modifier press (%s)', (code) => {
    expect(keyFromEvent(event({ key: 'Control', code }))).toBeNull()
  })

  it('strips the Key prefix from letter codes', () => {
    expect(keyFromEvent(event({ key: 'a', code: 'KeyA' }))).toBe('A')
  })

  it('strips the Digit prefix from number codes', () => {
    expect(keyFromEvent(event({ key: '5', code: 'Digit5' }))).toBe('5')
  })

  it('maps the Space code to Space', () => {
    expect(keyFromEvent(event({ key: ' ', code: 'Space' }))).toBe('Space')
  })

  it('passes other codes through unchanged', () => {
    expect(keyFromEvent(event({ key: 'F5', code: 'F5' }))).toBe('F5')
  })

  it('prefixes modifiers in Control, Alt, Shift, Command order', () => {
    expect(
      keyFromEvent(
        event({ key: 'k', code: 'KeyK', ctrlKey: true, altKey: true, shiftKey: true, metaKey: true })
      )
    ).toBe('Control+Alt+Shift+Command+K')
  })

  it('builds a single-modifier shortcut', () => {
    expect(keyFromEvent(event({ key: ' ', code: 'Space', ctrlKey: true }))).toBe('Control+Space')
  })
})

describe('readWhileWorkingStatusError', () => {
  it('is empty when there is no status', () => {
    expect(readWhileWorkingStatusError(null)).toBeUndefined()
  })

  it('prefers the capture error over the exit error', () => {
    expect(readWhileWorkingStatusError(status({ error: 'boom', exitError: 'later' }))).toBe('boom')
  })

  it('falls back to the exit error', () => {
    expect(readWhileWorkingStatusError(status({ exitError: 'exit boom' }))).toBe('exit boom')
  })
})

describe('readWhileWorkingStatusText', () => {
  it('returns null without a status', () => {
    expect(readWhileWorkingStatusText(null)).toBeNull()
  })

  it('surfaces an error verbatim', () => {
    expect(readWhileWorkingStatusText(status({ error: 'shortcut taken' }))).toBe('shortcut taken')
  })

  it('describes the listening state with formatted shortcuts', () => {
    expect(
      readWhileWorkingStatusText(
        status({ enabled: true, registered: true, shortcut: 'Control+Space', exitShortcut: 'Control+Shift+Space' })
      )
    ).toBe('Listening for Ctrl + Space. Exit with Ctrl + Shift + Space.')
  })

  it('reports off when enabled but not registered', () => {
    expect(readWhileWorkingStatusText(status({ enabled: true, registered: false }))).toBe(
      'Overlay Reader is off.'
    )
  })

  it('reports off when disabled', () => {
    expect(readWhileWorkingStatusText(status({}))).toBe('Overlay Reader is off.')
  })
})
