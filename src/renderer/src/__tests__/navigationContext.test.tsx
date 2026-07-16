/**
 * NavigationContext — provider + hook tests.
 * Environment: happy-dom (matched by vitest.config.ts environmentMatchGlobs).
 *
 * Pure state: no window.api needed.
 */
import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { NavigationProvider, useNavigation } from '../contexts/NavigationContext'

afterEach(cleanup)

function wrapper({ children }: { children: React.ReactNode }) {
  return <NavigationProvider>{children}</NavigationProvider>
}

describe('NavigationContext', () => {
  it('defaults view to "hub", settingsMode to "global", no Settings subview, and Settings origin', () => {
    const { result } = renderHook(() => useNavigation(), { wrapper })
    expect(result.current.view).toBe('hub')
    expect(result.current.settingsMode).toBe('global')
    expect(result.current.settingsSubview).toBeNull()
    expect(result.current.settingsSubviewOrigin).toBe('settings')
  })

  it('setView updates the current view for live routes', () => {
    const { result } = renderHook(() => useNavigation(), { wrapper })
    act(() => result.current.setView('add-chapter'))
    expect(result.current.view).toBe('add-chapter')
  })

  it('redirects alpha dead routes to the Library', () => {
    const { result } = renderHook(() => useNavigation(), { wrapper })
    act(() => result.current.setView('showcase'))
    expect(result.current.view).toBe('library')
  })

  it('openTransmuteReaderSettings sets view=settings + settingsMode=transmute', () => {
    const { result } = renderHook(() => useNavigation(), { wrapper })
    act(() => result.current.openTransmuteReaderSettings())
    expect(result.current.view).toBe('settings')
    expect(result.current.settingsMode).toBe('transmute')
  })

  it('openGlobalSettings sets view=settings + settingsMode=global', () => {
    const { result } = renderHook(() => useNavigation(), { wrapper })
    // First flip to transmute so we can prove it resets to global.
    act(() => result.current.openTransmuteReaderSettings())
    act(() => result.current.openGlobalSettings())
    expect(result.current.view).toBe('settings')
    expect(result.current.settingsMode).toBe('global')
  })

  it('openOverlayReaderSettings opens the Overlay Reader Settings subview', () => {
    const { result } = renderHook(() => useNavigation(), { wrapper })
    act(() => result.current.openTransmuteReaderSettings())
    act(() => result.current.openOverlayReaderSettings())
    expect(result.current.view).toBe('settings')
    expect(result.current.settingsMode).toBe('global')
    expect(result.current.settingsSubview).toBe('overlay-reader')
    expect(result.current.settingsSubviewOrigin).toBe('hub')
  })

  it('stamps Settings origin for Settings subview drill-ins and re-entry', () => {
    const { result } = renderHook(() => useNavigation(), { wrapper })
    act(() => result.current.openOverlayReaderSettings())
    expect(result.current.settingsSubviewOrigin).toBe('hub')

    act(() => result.current.setSettingsSubview(null))
    expect(result.current.settingsSubview).toBeNull()
    expect(result.current.settingsSubviewOrigin).toBe('settings')

    act(() => result.current.setSettingsSubview('overlay-reader'))
    expect(result.current.settingsSubview).toBe('overlay-reader')
    expect(result.current.settingsSubviewOrigin).toBe('settings')

    act(() => result.current.setSettingsSubview('reader-defaults'))
    expect(result.current.settingsSubview).toBe('reader-defaults')
    expect(result.current.settingsSubviewOrigin).toBe('settings')
  })

  it('clears settingsSubview when leaving Settings or reopening Settings', () => {
    const { result } = renderHook(() => useNavigation(), { wrapper })
    act(() => result.current.openGlobalSettings())
    act(() => result.current.setSettingsSubview('reader-defaults'))
    expect(result.current.settingsSubview).toBe('reader-defaults')

    act(() => result.current.setView('library'))
    expect(result.current.view).toBe('library')
    expect(result.current.settingsSubview).toBeNull()

    act(() => result.current.setSettingsSubview('data'))
    act(() => result.current.openGlobalSettings())
    expect(result.current.view).toBe('settings')
    expect(result.current.settingsSubview).toBeNull()
  })

  it('useNavigation throws when called outside a NavigationProvider', () => {
    expect(() => renderHook(() => useNavigation())).toThrow(
      /useNavigation must be used within a NavigationProvider/
    )
  })
})
