import { describe, it, expect } from 'vitest'
import {
  resolveZoomKeyAction,
  ZOOM_MIN_LEVEL,
  ZOOM_MAX_LEVEL,
  ZOOM_RESET_LEVEL,
  type ZoomKeyInput
} from '../zoomGuard'

function key(partial: Partial<ZoomKeyInput>): ZoomKeyInput {
  return { type: 'keyDown', key: '-', control: true, meta: false, ...partial }
}

describe('resolveZoomKeyAction', () => {
  it('zooms out one step on Ctrl+-', () => {
    expect(resolveZoomKeyAction(key({ key: '-' }), 0)).toBe(-1)
  })

  it('zooms in one step on Ctrl++ and Ctrl+=', () => {
    expect(resolveZoomKeyAction(key({ key: '+' }), 0)).toBe(1)
    expect(resolveZoomKeyAction(key({ key: '=' }), 0)).toBe(1)
  })

  it('resets to 100% on Ctrl+0 regardless of current level', () => {
    expect(resolveZoomKeyAction(key({ key: '0' }), -2)).toBe(ZOOM_RESET_LEVEL)
    expect(resolveZoomKeyAction(key({ key: '0' }), 4)).toBe(ZOOM_RESET_LEVEL)
  })

  it('clamps at the legibility floor — cannot zoom out past the minimum', () => {
    expect(resolveZoomKeyAction(key({ key: '-' }), ZOOM_MIN_LEVEL)).toBe(ZOOM_MIN_LEVEL)
  })

  it('clamps at the ceiling — cannot zoom in past the maximum', () => {
    expect(resolveZoomKeyAction(key({ key: '+' }), ZOOM_MAX_LEVEL)).toBe(ZOOM_MAX_LEVEL)
  })

  it('always offers a way back up from the floor', () => {
    expect(resolveZoomKeyAction(key({ key: '+' }), ZOOM_MIN_LEVEL)).toBe(ZOOM_MIN_LEVEL + 1)
  })

  it('honours the meta key (Cmd) as well as Control', () => {
    expect(resolveZoomKeyAction(key({ key: '-', control: false, meta: true }), 0)).toBe(-1)
  })

  it('ignores zoom keys without a modifier', () => {
    expect(resolveZoomKeyAction(key({ key: '-', control: false, meta: false }), 0)).toBeNull()
  })

  it('ignores non-zoom keys', () => {
    expect(resolveZoomKeyAction(key({ key: 'a' }), 0)).toBeNull()
  })

  it('ignores keyUp events so a single press moves one step', () => {
    expect(resolveZoomKeyAction(key({ key: '-', type: 'keyUp' }), 0)).toBeNull()
  })
})
