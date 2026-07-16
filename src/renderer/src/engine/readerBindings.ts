/**
 * Reader input binding codes — keyboard `e.code` values and mouse `MouseN` tokens.
 * Mouse1 = primary (left) button; Mouse2 = secondary (right); Mouse3 = middle.
 */

const MOUSE_BUTTON_TO_CODE: Record<number, string> = {
  0: 'Mouse1',
  1: 'Mouse3',
  2: 'Mouse2',
}

/** Keyboard codes owned by {@link readerKeymap.ts} — cannot be bound to live rewind. */
export const READER_RESERVED_BINDING_CODES = [
  'Space',
  'ArrowLeft',
  'ArrowRight',
  'KeyR',
  'KeyS',
  'KeyF',
  'KeyT',
  'Escape',
  'KeyC',
] as const

export function isMouseBinding(code: string | undefined): boolean {
  return typeof code === 'string' && code.startsWith('Mouse')
}

export function bindingCodeFromMouseButton(button: number): string | null {
  return MOUSE_BUTTON_TO_CODE[button] ?? null
}

export function mouseEventMatchesBinding(e: MouseEvent, binding: string): boolean {
  const code = bindingCodeFromMouseButton(e.button)
  return code !== null && code === binding
}

export function isReservedReaderBinding(code: string, tapToReadKey?: string): boolean {
  if ((READER_RESERVED_BINDING_CODES as readonly string[]).includes(code)) return true
  if (tapToReadKey && code === tapToReadKey) return true
  return false
}

export function formatBindingCode(code: string | undefined): string {
  if (!code) return '—'
  const map: Record<string, string> = {
    Space: 'Space',
    Enter: 'Enter',
    Escape: 'Esc',
    Tab: 'Tab',
    ArrowLeft: '←',
    ArrowRight: '→',
    ArrowUp: '↑',
    ArrowDown: '↓',
    Mouse1: 'Mouse1',
    Mouse2: 'Mouse2',
    Mouse3: 'Mouse3',
  }
  if (map[code]) return map[code]
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  return code
}

/** True when live rewind should respond (playing or paused). */
function isLiveRewindPlayState(playState: string): boolean {
  return playState === 'playing' || playState === 'paused'
}

/** Left half of the stage rewinds in Tap to Read mode. */
export function isStageLeftHalf(clientX: number, rect: DOMRect): boolean {
  return clientX - rect.left < rect.width / 2
}

/** Tap-to-read stage click: left half rewinds, right half advances (playing only). */
export function tapToReadStageMouseAction(
  playState: string,
  button: number,
  clientX: number,
  rect: DOMRect
): 'rewind' | 'advance' | null {
  if (button !== 0) return null
  const left = isStageLeftHalf(clientX, rect)
  if (playState === 'playing') return left ? 'rewind' : 'advance'
  if (playState === 'paused' && left) return 'rewind'
  return null
}

/** Stage mousedown during play/pause: tap-to-read halves or mouse-bound live rewind. */
export function resolveStageMouseClick(input: {
  playState: string
  countdownActive: boolean
  tapToRead: boolean
  liveRewindKey: string
  button: number
  clientX: number
  rect: DOMRect
  mouseEvent: MouseEvent
}): 'rewind' | 'advance' | null {
  if (!isLiveRewindPlayState(input.playState) || input.countdownActive) return null
  if (input.tapToRead) {
    return tapToReadStageMouseAction(input.playState, input.button, input.clientX, input.rect)
  }
  const key = input.liveRewindKey || 'Mouse1'
  if (isMouseBinding(key) && mouseEventMatchesBinding(input.mouseEvent, key)) return 'rewind'
  return null
}
