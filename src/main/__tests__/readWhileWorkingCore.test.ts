import { describe, expect, it } from 'vitest'
import {
  clampTemporaryReaderSize,
  classifyCaptureReadiness,
  formatShortcutForDisplay,
  interpretCapture,
  normalizeShortcutInput,
  planClipboardRestore,
  resolveStandbyPillBounds,
  shouldShowStandbyPill
} from '../readWhileWorkingCore'

describe('read while working core helpers', () => {
  it('normalizes user-entered shortcut text to Electron accelerator form', () => {
    expect(normalizeShortcutInput('ctrl + space')).toBe('Control+Space')
    expect(normalizeShortcutInput('Ctrl+Alt+r')).toBe('Control+Alt+R')
    expect(normalizeShortcutInput('shift+f8')).toBe('Shift+F8')
  })

  it('falls back to the default shortcut for modifier-only input', () => {
    expect(normalizeShortcutInput('Control+Shift')).toBe('Control+Space')
    expect(normalizeShortcutInput('Alt')).toBe('Control+Space')
    expect(normalizeShortcutInput('Control+Alt+Shift')).toBe('Control+Space')
  })

  it('formats shortcuts for display', () => {
    expect(formatShortcutForDisplay('Control+Space')).toBe('Ctrl+Space')
  })

  it('clamps temporary reader window sizes', () => {
    expect(clampTemporaryReaderSize(200, 100)).toEqual({ width: 640, height: 360 })
    expect(clampTemporaryReaderSize(5000, 5000)).toEqual({ width: 1200, height: 900 })
    expect(clampTemporaryReaderSize(720, 420)).toEqual({ width: 720, height: 420 })
  })

  it('shows the standby pill only for registered armed mode with the setting on', () => {
    expect(shouldShowStandbyPill({
      enabled: true,
      registered: true,
      showStandbyControl: true
    })).toBe(true)
    expect(shouldShowStandbyPill({
      enabled: true,
      registered: true,
      showStandbyControl: false
    })).toBe(false)
    expect(shouldShowStandbyPill({
      enabled: true,
      registered: false,
      showStandbyControl: true
    })).toBe(false)
  })

  it('places the standby pill bottom-right by default', () => {
    expect(resolveStandbyPillBounds({
      storedX: null,
      storedY: null,
      workArea: { x: 0, y: 0, width: 1280, height: 720 },
      width: 300,
      height: 50,
      margin: 20
    })).toEqual({ x: 960, y: 650, width: 300, height: 50 })
  })

  it('clamps remembered standby pill coordinates into the display work area', () => {
    expect(resolveStandbyPillBounds({
      storedX: 2000,
      storedY: -300,
      workArea: { x: 100, y: 80, width: 800, height: 600 },
      width: 300,
      height: 50,
      margin: 20
    })).toEqual({ x: 600, y: 80, width: 300, height: 50 })
  })

  it('classifies capture readiness edge cases', () => {
    expect(classifyCaptureReadiness({
      platform: 'linux',
      enabled: true,
      busy: false,
      hasActiveSession: false
    })).toEqual({ ok: false, reason: 'unsupported' })

    expect(classifyCaptureReadiness({
      platform: 'win32',
      enabled: true,
      busy: true,
      hasActiveSession: false
    })).toEqual({ ok: false, reason: 'busy' })

    expect(classifyCaptureReadiness({
      platform: 'win32',
      enabled: true,
      busy: false,
      hasActiveSession: true
    })).toEqual({ ok: false, reason: 'active-session' })

    expect(classifyCaptureReadiness({
      platform: 'win32',
      enabled: true,
      busy: false,
      hasActiveSession: false
    })).toEqual({ ok: true })
  })

  it('interprets a capture with usable text as open', () => {
    expect(interpretCapture('Hello world')).toEqual({
      kind: 'open',
      text: 'Hello world'
    })
  })

  it('interprets an empty capture as no-selection', () => {
    // Empty selection (cleared sentinel survives the copy) or unusable content
    // (whitespace/image trimmed to nothing) both surface the same calm notice.
    expect(interpretCapture('')).toEqual({ kind: 'no-selection' })
  })

  it('plans no clipboard restore when restore is disabled', () => {
    expect(planClipboardRestore('before', 'captured', 'captured', false)).toBeNull()
  })

  it('skips clipboard restore when another app wrote during the capture window', () => {
    // currentClipboard !== capturedText → a concurrent write; do not clobber it.
    expect(planClipboardRestore('before', 'newer-copy', 'captured', true)).toBeNull()
  })

  it('restores the previous clipboard when nothing else touched it', () => {
    expect(planClipboardRestore('before', 'captured', 'captured', true)).toBe('before')
  })
})
