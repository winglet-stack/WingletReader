import { describe, it, expect } from 'vitest'
import {
  READER_RESERVED_BINDING_CODES,
  bindingCodeFromMouseButton,
  formatBindingCode,
  isMouseBinding,
  isReservedReaderBinding,
  isStageLeftHalf,
  mouseEventMatchesBinding,
  resolveStageMouseClick,
  tapToReadStageMouseAction,
} from '../readerBindings'

describe('readerBindings', () => {
  it('maps mouse buttons to MouseN codes', () => {
    expect(bindingCodeFromMouseButton(0)).toBe('Mouse1')
    expect(bindingCodeFromMouseButton(1)).toBe('Mouse3')
    expect(bindingCodeFromMouseButton(2)).toBe('Mouse2')
  })

  it('detects mouse bindings', () => {
    expect(isMouseBinding('Mouse1')).toBe(true)
    expect(isMouseBinding('KeyQ')).toBe(false)
  })

  it('matches mouse events to bindings', () => {
    const event = { button: 0 } as MouseEvent
    expect(mouseEventMatchesBinding(event, 'Mouse1')).toBe(true)
    expect(mouseEventMatchesBinding(event, 'Mouse2')).toBe(false)
  })

  it('blocks all readerKeymap-owned reserved keys', () => {
    for (const code of READER_RESERVED_BINDING_CODES) {
      expect(isReservedReaderBinding(code)).toBe(true)
    }
  })

  it('blocks the tap-to-read advance key when distinct from reserved keys', () => {
    expect(isReservedReaderBinding('KeyQ', 'KeyQ')).toBe(true)
    expect(isReservedReaderBinding('KeyQ', 'KeyJ')).toBe(false)
  })

  it('formats mouse and keyboard codes for display', () => {
    expect(formatBindingCode('Mouse1')).toBe('Mouse1')
    expect(formatBindingCode('KeyJ')).toBe('J')
  })

  it('splits the stage at the horizontal midpoint', () => {
    const rect = { left: 0, width: 200 } as DOMRect
    expect(isStageLeftHalf(50, rect)).toBe(true)
    expect(isStageLeftHalf(150, rect)).toBe(false)
  })

  it('maps tap-to-read stage clicks to rewind or advance', () => {
    const rect = { left: 0, width: 200, top: 0, height: 100 } as DOMRect
    expect(tapToReadStageMouseAction('playing', 0, 50, rect)).toBe('rewind')
    expect(tapToReadStageMouseAction('playing', 0, 150, rect)).toBe('advance')
    expect(tapToReadStageMouseAction('paused', 0, 50, rect)).toBe('rewind')
    expect(tapToReadStageMouseAction('paused', 0, 150, rect)).toBeNull()
    expect(tapToReadStageMouseAction('playing', 2, 50, rect)).toBeNull()
  })

  it('resolves stage clicks for tap-to-read and mouse-bound live rewind', () => {
    const rect = { left: 0, width: 200, top: 0, height: 100 } as DOMRect
    const mouse1 = { button: 0 } as MouseEvent

    expect(
      resolveStageMouseClick({
        playState: 'idle',
        countdownActive: false,
        tapToRead: false,
        liveRewindKey: 'Mouse1',
        button: 0,
        clientX: 50,
        rect,
        mouseEvent: mouse1,
      })
    ).toBeNull()

    expect(
      resolveStageMouseClick({
        playState: 'playing',
        countdownActive: false,
        tapToRead: true,
        liveRewindKey: 'Mouse1',
        button: 0,
        clientX: 150,
        rect,
        mouseEvent: mouse1,
      })
    ).toBe('advance')

    expect(
      resolveStageMouseClick({
        playState: 'playing',
        countdownActive: false,
        tapToRead: false,
        liveRewindKey: 'Mouse1',
        button: 0,
        clientX: 50,
        rect,
        mouseEvent: mouse1,
      })
    ).toBe('rewind')
  })
})
