import {
  READER_SCALE_LOCK_MIN_WINDOW_HEIGHT,
  READER_SCALE_LOCK_MIN_WINDOW_WIDTH
} from '../shared/readerDisplayScale'
export type {
  ReadWhileWorkingStatus,
  TemporaryReaderSession,
} from '../shared/domainRecords'

export const READ_WHILE_WORKING_DEFAULTS = {
  enabled: false,
  shortcut: 'Control+Space',
  exitShortcut: 'Control+Space',
  windowWidth: 640,
  windowHeight: 360,
  restoreClipboard: true
}

export const TEMP_READER_WINDOW_LIMITS = {
  minWidth: READER_SCALE_LOCK_MIN_WINDOW_WIDTH,
  maxWidth: 1200,
  minHeight: READER_SCALE_LOCK_MIN_WINDOW_HEIGHT,
  maxHeight: 900
}

export const STANDBY_PILL_WINDOW = {
  width: 312,
  height: 56,
  margin: 16
}

export interface WorkAreaBounds {
  x: number
  y: number
  width: number
  height: number
}

export function shouldShowStandbyPill(options: {
  enabled: boolean
  registered: boolean
  showStandbyControl: boolean
}): boolean {
  return options.enabled && options.registered && options.showStandbyControl
}

const MODIFIER_ALIASES: Record<string, string> = {
  ctrl: 'Control',
  control: 'Control',
  cmd: 'Command',
  command: 'Command',
  meta: 'Command',
  shift: 'Shift',
  alt: 'Alt',
  option: 'Alt',
  super: 'Super',
  win: 'Super',
  windows: 'Super',
}

function normalizeKeyPart(part: string): string {
  const trimmed = part.trim()
  if (!trimmed) return ''

  const lower = trimmed.toLowerCase()
  if (MODIFIER_ALIASES[lower]) return MODIFIER_ALIASES[lower]
  if (lower === 'space' || trimmed === ' ') return 'Space'
  if (lower === 'esc') return 'Escape'
  if (lower === 'plus') return 'Plus'
  if (/^f\d{1,2}$/i.test(trimmed)) return trimmed.toUpperCase()
  if (/^[a-z]$/i.test(trimmed)) return trimmed.toUpperCase()
  if (/^\d$/.test(trimmed)) return trimmed

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

export function normalizeShortcutInput(raw: string): string {
  const parts = raw
    .replace(/\s*\+\s*/g, '+')
    .split('+')
    .map(normalizeKeyPart)
    .filter(Boolean)

  if (parts.length === 0) return READ_WHILE_WORKING_DEFAULTS.shortcut

  const modifiers = ['Control', 'Alt', 'Shift', 'Command', 'Super']
  const orderedModifiers = modifiers.filter((modifier) => parts.includes(modifier))
  const keys = parts.filter((part) => !modifiers.includes(part))

  if (keys.length === 0) return READ_WHILE_WORKING_DEFAULTS.shortcut

  const key = keys[keys.length - 1]

  return [...orderedModifiers, key].join('+')
}

export function formatShortcutForDisplay(shortcut: string): string {
  return normalizeShortcutInput(shortcut).replace('Control', 'Ctrl')
}

export function clampTemporaryReaderSize(width: number, height: number) {
  const w = Number.isFinite(width) ? Math.round(width) : READ_WHILE_WORKING_DEFAULTS.windowWidth
  const h = Number.isFinite(height) ? Math.round(height) : READ_WHILE_WORKING_DEFAULTS.windowHeight

  return {
    width: Math.max(TEMP_READER_WINDOW_LIMITS.minWidth, Math.min(TEMP_READER_WINDOW_LIMITS.maxWidth, w)),
    height: Math.max(TEMP_READER_WINDOW_LIMITS.minHeight, Math.min(TEMP_READER_WINDOW_LIMITS.maxHeight, h))
  }
}

function clampPosition(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.max(min, Math.min(max, value))
}

export function resolveStandbyPillBounds(options: {
  storedX: number | null | undefined
  storedY: number | null | undefined
  workArea: WorkAreaBounds
  width?: number
  height?: number
  margin?: number
}): WorkAreaBounds {
  const width = options.width ?? STANDBY_PILL_WINDOW.width
  const height = options.height ?? STANDBY_PILL_WINDOW.height
  const margin = options.margin ?? STANDBY_PILL_WINDOW.margin
  const defaultX = options.workArea.x + options.workArea.width - width - margin
  const defaultY = options.workArea.y + options.workArea.height - height - margin
  const rawX = Number.isFinite(options.storedX) ? Math.round(options.storedX as number) : defaultX
  const rawY = Number.isFinite(options.storedY) ? Math.round(options.storedY as number) : defaultY
  const maxX = options.workArea.x + options.workArea.width - width
  const maxY = options.workArea.y + options.workArea.height - height

  return {
    x: clampPosition(rawX, options.workArea.x, maxX),
    y: clampPosition(rawY, options.workArea.y, maxY),
    width,
    height
  }
}

export function classifyCaptureReadiness(options: {
  platform: NodeJS.Platform
  enabled: boolean
  busy: boolean
  hasActiveSession: boolean
}): { ok: true } | { ok: false; reason: 'disabled' | 'unsupported' | 'busy' | 'active-session' } {
  if (!options.enabled) return { ok: false, reason: 'disabled' }
  if (options.platform !== 'win32') return { ok: false, reason: 'unsupported' }
  if (options.hasActiveSession) return { ok: false, reason: 'active-session' }
  if (options.busy) return { ok: false, reason: 'busy' }
  return { ok: true }
}

// Capture writes this sentinel to the clipboard before issuing the copy
// keystroke, then polls until the clipboard moves off the sentinel (the copy
// landed) or the timeout elapses (the copy did not land in time). A non-empty
// sentinel is required so the poll detects a change even when the previous
// clipboard was already empty.
export const CAPTURE_CLEAR_SENTINEL = '__rww_cap__'
export const CAPTURE_POLL_TIMEOUT_MS = 1000
export const CAPTURE_POLL_INTERVAL_MS = 25

export type CaptureInterpretation =
  | { kind: 'open'; text: string }
  | { kind: 'no-selection' }

// Pure decision for what a capture attempt produced. `capturedText` is the
// clipboard value after import cleanup + trim. An empty result is 'no-selection'
// whether the copy keystroke produced nothing (empty selection — on Windows
// Ctrl+C leaves the cleared sentinel untouched) or only unusable content
// (whitespace, an image). Either way the caller surfaces a brief notice and
// never tears down Read While Working. A copy keystroke that actually throws or
// times out is a separate concern, handled by the caller's catch.
export function interpretCapture(capturedText: string): CaptureInterpretation {
  if (capturedText) return { kind: 'open', text: capturedText }
  return { kind: 'no-selection' }
}

// Pure decision for clipboard restoration after a capture. `capturedText` is the
// value the copy keystroke landed in the clipboard (the reference point); if the
// live clipboard no longer matches it, another app wrote during the capture
// window and we must not stomp that newer value with a stale restore. Returns
// the string to write back, or null meaning "leave the clipboard alone".
export function planClipboardRestore(
  previousClipboard: string,
  currentClipboard: string,
  capturedText: string,
  restoreEnabled: boolean
): string | null {
  if (!restoreEnabled) return null
  if (currentClipboard !== capturedText) return null
  return previousClipboard
}
