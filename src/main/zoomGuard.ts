// UI zoom guard (window-level Chromium zoom).
//
// Chromium's built-in Ctrl+'-' / Ctrl+'+' / Ctrl+'0' shortcuts change the
// window zoom level with no floor or ceiling, so a user can scale the main
// menu/chrome down until it is illegible with no obvious way back. This module
// is the pure decision half: given a keyboard event and the current zoom level,
// it returns the next clamped level (or null when the key is not a zoom key).
// index.ts owns the Electron wiring (before-input-event + setZoomLevel).
//
// zoomLevel is Chromium's logarithmic scale: 0 = 100%, each step is a 1.2x
// factor. The limits below keep the chrome between roughly 70% and 250%.

export const ZOOM_MIN_LEVEL = -2
export const ZOOM_MAX_LEVEL = 5
export const ZOOM_STEP = 1
export const ZOOM_RESET_LEVEL = 0

export interface ZoomKeyInput {
  type: string
  key: string
  control: boolean
  meta: boolean
}

function clampLevel(level: number): number {
  return Math.min(ZOOM_MAX_LEVEL, Math.max(ZOOM_MIN_LEVEL, level))
}

/**
 * Resolve a keyboard event into the next clamped zoom level.
 *
 * Returns the new level for a zoom keystroke (Ctrl/Cmd with '-', '+'/'=', or
 * '0'), or null when the event is not a zoom shortcut and should pass through
 * untouched. Out-of-range requests are clamped, so the chrome can never be
 * scaled past the legibility floor/ceiling, and Ctrl+'+' / Ctrl+'0' always give
 * the user a way back up.
 */
export function resolveZoomKeyAction(input: ZoomKeyInput, currentLevel: number): number | null {
  if (input.type !== 'keyDown') return null
  if (!input.control && !input.meta) return null

  switch (input.key) {
    case '-':
    case '_':
      return clampLevel(currentLevel - ZOOM_STEP)
    case '+':
    case '=':
      return clampLevel(currentLevel + ZOOM_STEP)
    case '0':
      return ZOOM_RESET_LEVEL
    default:
      return null
  }
}
