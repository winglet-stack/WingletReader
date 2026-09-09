/**
 * The reader surface owner (`architecture-depth/12`) — the React half.
 *
 * The policy itself is covered in `readerSurfaces.test.ts`; this suite covers
 * what only the binding can answer: that engaging a text *establishes* the
 * surfaces instead of three effects un-setting the previous text's, that the
 * owner performs the consequences it claims (pausing, dismissing a session
 * end), and that the borrowed config-drawer cell stays in step in both
 * directions.
 *
 * Environment: happy-dom (vitest.config.ts environmentMatchGlobs).
 */

import React, { useState } from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { useReaderSurfaces, type ReaderSurfaces } from '../hooks/useReaderSurfaces'
import type { TextRecord } from '../types'

afterEach(cleanup)

const TEXT_A: TextRecord = { id: 1, title: 'A', content: 'one two three', word_count: 3 }
const TEXT_B: TextRecord = { id: 2, title: 'B', content: 'four five six', word_count: 3 }

function renderSurfaces(initialText: TextRecord = TEXT_A) {
  const held = { current: null as ReaderSurfaces | null }
  const pause = vi.fn()
  const dismissSessionEnd = vi.fn()
  const drawer = { current: false }

  function Probe({ text }: { text: TextRecord }) {
    const [configDrawerOpen, setConfigDrawerOpen] = useState(false)
    drawer.current = configDrawerOpen
    held.current = useReaderSurfaces({
      text,
      configDrawerOpen,
      setConfigDrawerOpen,
      pause,
      dismissSessionEnd,
    })
    return (
      <button type="button" onClick={() => setConfigDrawerOpen(true)}>
        outside open drawer
      </button>
    )
  }

  const view = render(<Probe text={initialText} />)
  return {
    surfaces: () => held.current as ReaderSurfaces,
    pause,
    dismissSessionEnd,
    drawer,
    engage: (text: TextRecord) => act(() => { view.rerender(<Probe text={text} />) }),
    openDrawerFromOutside: () =>
      act(() => { view.getByRole('button', { name: 'outside open drawer' }).click() }),
  }
}

describe('useReaderSurfaces - engaging a text', () => {
  it('establishes fresh surfaces for a new text rather than un-setting the old ones', () => {
    const { surfaces, engage } = renderSurfaces()

    act(() => { surfaces().toggleBrowse() })
    act(() => { surfaces().armGoalPick('Chapter turn') })
    expect(surfaces().goalPickArmed).toBe(true)
    expect(surfaces().stage).toBe('text-view')

    engage(TEXT_B)

    expect(surfaces().stage).toBe('reading')
    expect(surfaces().panel).toBe('none')
    expect(surfaces().browsing).toBe(false)
    expect(surfaces().textViewOpen).toBe(false)
    expect(surfaces().textViewMode).toBe('plain')
    expect(surfaces().goalPickDraft).toBeNull()
  })

  it('keeps the surfaces as they are when the same text re-renders', () => {
    const { surfaces, engage } = renderSurfaces()

    act(() => { surfaces().openQuickSettings(true) })
    engage(TEXT_A)

    expect(surfaces().quickSettingsOpen).toBe(true)
  })
})

describe('useReaderSurfaces - the consequences the owner performs', () => {
  it('pauses playback when browse takes the stage, and not when it gives it back', () => {
    const { surfaces, pause } = renderSurfaces()

    act(() => { surfaces().toggleBrowse() })
    expect(pause).toHaveBeenCalledTimes(1)

    act(() => { surfaces().toggleBrowse() })
    expect(pause).toHaveBeenCalledTimes(1)
  })

  it('pauses when a Target pick is armed, and dismisses the Target dialog only for its own bridge', () => {
    const { surfaces, pause, dismissSessionEnd } = renderSurfaces()

    act(() => { surfaces().armGoalPick('Chapter turn') })
    expect(pause).toHaveBeenCalledTimes(1)
    expect(dismissSessionEnd).not.toHaveBeenCalled()

    act(() => { surfaces().armGoalPick('', 'session-dialog') })
    expect(pause).toHaveBeenCalledTimes(2)
    expect(dismissSessionEnd).toHaveBeenCalledTimes(1)
  })

  it('trims the label it carries into the pick', () => {
    const { surfaces } = renderSurfaces()

    act(() => { surfaces().armGoalPick('  Chapter turn  ') })
    expect(surfaces().goalPickDraft).toEqual({ wordOffset: null, customLabel: 'Chapter turn' })
  })
})

describe('useReaderSurfaces - the borrowed config drawer', () => {
  it('writes the route cell when an intent moves the panel slot', () => {
    const { surfaces, drawer } = renderSurfaces()

    act(() => { surfaces().openConfigDrawer(true) })
    expect(drawer.current).toBe(true)
    expect(surfaces().configDrawerOpen).toBe(true)

    act(() => { surfaces().openBookmarks(true) })
    expect(drawer.current).toBe(false)
    expect(surfaces().bookmarksOpen).toBe(true)
  })

  it('reconciles an outside open into the slot, closing whatever popover was up', () => {
    const { surfaces, openDrawerFromOutside } = renderSurfaces()

    act(() => { surfaces().openQuickSettings(true) })
    openDrawerFromOutside()

    expect(surfaces().quickSettingsOpen).toBe(false)
    expect(surfaces().configDrawerOpen).toBe(true)
    expect(surfaces().panel).toBe('config-drawer')
  })
})
