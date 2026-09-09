import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react'
import type { AppView } from '../appShell/routeTable'

export type SettingsMode = 'global' | 'transmute'
export type SettingsSubview = 'reader-defaults' | 'overlay-reader' | 'import' | 'data' | null
export type SettingsSubviewOrigin = 'hub' | 'settings'

/**
 * Minimal unsaved source shape passed from Import -> Transmute.
 * Session-only; never persisted to the JSON store or localStorage.
 * (PRD section 5.3 / 5.8 - ADR-0009)
 */
export interface UnsavedTransmuteSource {
  title: string
  content: string
}

export interface NavigationContextValue {
  view: AppView
  setView: (v: AppView) => void
  settingsMode: SettingsMode
  settingsSubview: SettingsSubview
  settingsSubviewOrigin: SettingsSubviewOrigin
  setSettingsSubview: (subview: SettingsSubview) => void
  openGlobalSettings: () => void
  openOverlayReaderSettings: () => void
  openTransmuteReaderSettings: () => void
  openTransmuteForText: (textId: number) => void
  transmuteLaunchTextId: number | null
  clearTransmuteLaunch: () => void
  openTransmuteForUnsavedSource: (source: UnsavedTransmuteSource) => void
  transmuteLaunchSource: UnsavedTransmuteSource | null
  clearTransmuteLaunchSource: () => void
}

const NavigationContext = createContext<NavigationContextValue | null>(null)

export { NavigationContext }

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [view, setRawView] = useState<AppView>('hub')
  const [settingsMode, setSettingsMode] = useState<SettingsMode>('global')
  const [settingsSubview, setRawSettingsSubview] = useState<SettingsSubview>(null)
  const [settingsSubviewOrigin, setSettingsSubviewOrigin] =
    useState<SettingsSubviewOrigin>('settings')
  const [transmuteLaunchTextId, setTransmuteLaunchTextId] = useState<number | null>(null)
  const [transmuteLaunchSource, setTransmuteLaunchSource] = useState<UnsavedTransmuteSource | null>(null)

  // Route *state* only (ADR-0006). Liveness is the route table's policy and is
  // resolved once, where the shell reads it — not re-enforced here.
  const setView = useCallback((nextView: AppView) => {
    if (nextView !== 'settings') {
      setRawSettingsSubview(null)
      setSettingsSubviewOrigin('settings')
    }
    setRawView(nextView)
  }, [])

  const setSettingsSubview = useCallback((subview: SettingsSubview) => {
    setSettingsSubviewOrigin('settings')
    setRawSettingsSubview(subview)
  }, [])

  const openGlobalSettings = useCallback(() => {
    setSettingsMode('global')
    setSettingsSubviewOrigin('settings')
    setRawSettingsSubview(null)
    setView('settings')
  }, [setView])

  const openOverlayReaderSettings = useCallback(() => {
    setSettingsMode('global')
    setSettingsSubviewOrigin('hub')
    setRawSettingsSubview('overlay-reader')
    setView('settings')
  }, [setView])

  const openTransmuteReaderSettings = useCallback(() => {
    setSettingsMode('transmute')
    setSettingsSubviewOrigin('settings')
    setRawSettingsSubview(null)
    setView('settings')
  }, [setView])

  const openTransmuteForText = useCallback((textId: number) => {
    setTransmuteLaunchTextId(textId)
    setView('transmute')
  }, [setView])

  const clearTransmuteLaunch = useCallback(() => {
    setTransmuteLaunchTextId(null)
  }, [])

  const openTransmuteForUnsavedSource = useCallback((source: UnsavedTransmuteSource) => {
    setTransmuteLaunchSource(source)
    setView('transmute')
  }, [setView])

  const clearTransmuteLaunchSource = useCallback(() => {
    setTransmuteLaunchSource(null)
  }, [])

  useEffect(() => {
    return window.api?.readWhileWorking?.onExited?.(() => setView('library'))
  }, [setView])

  const value = useMemo<NavigationContextValue>(
    () => ({
      view,
      setView,
      settingsMode,
      settingsSubview,
      settingsSubviewOrigin,
      setSettingsSubview,
      openGlobalSettings,
      openOverlayReaderSettings,
      openTransmuteReaderSettings,
      openTransmuteForText,
      transmuteLaunchTextId,
      clearTransmuteLaunch,
      openTransmuteForUnsavedSource,
      transmuteLaunchSource,
      clearTransmuteLaunchSource,
    }),
    [view, settingsMode, settingsSubview, settingsSubviewOrigin, setSettingsSubview, openGlobalSettings, openOverlayReaderSettings, openTransmuteReaderSettings, openTransmuteForText, transmuteLaunchTextId, clearTransmuteLaunch, openTransmuteForUnsavedSource, transmuteLaunchSource, clearTransmuteLaunchSource]
  )

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>
}

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext)
  if (ctx === null) {
    throw new Error('useNavigation must be used within a NavigationProvider')
  }
  return ctx
}
