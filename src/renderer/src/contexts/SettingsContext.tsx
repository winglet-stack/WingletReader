import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { DEFAULT_SETTINGS, flattenSettingsStore, settingsStoreFromFlat } from '../../../shared/settings'
import type { ReaderSettings, Settings, SettingsMode, SettingsStore } from '../../../shared/settings'
import {
  clearRwwOverride,
  hasRwwOverride,
  resolveEffectiveSettings,
  setRwwOverride
} from '../../../shared/settingsHandler'
import {
  loadStoredTransmuteConfig,
  persistTransmuteConfig,
  readerFieldsFromSettings,
  transmuteConfigToSettings
} from '../engine/transmuteConfig'

interface SettingsContextValue {
  settings: Settings
  saveSettings: (patch: Partial<Settings>) => Promise<void>
  /** Mode-scoped view of `settings` (ADR-0008), derived through the handler. */
  settingsStore: SettingsStore
  /** Effective flat settings for a mode, via the unified Settings handler. */
  effectiveSettingsFor: (mode: SettingsMode) => Settings
  /** Persist the whole mode-scoped store natively (ADR-0008 write path). */
  saveSettingsStore: (store: SettingsStore) => Promise<void>
  /**
   * Applies a reader field to the RWW scope using override/clear semantics: a
   * value equal to the inherited Standard Reader value clears the override key
   * (so it keeps inheriting); any other value sets the override. Never stores a
   * redundant copy of the inherited value.
   */
  setRwwReaderField: <K extends keyof ReaderSettings>(
    field: K,
    value: ReaderSettings[K]
  ) => Promise<void>
  /** True when the RWW scope carries an explicit override for `field`. */
  hasRwwReaderOverride: (field: keyof ReaderSettings) => boolean
  transmuteReaderSettings: Settings
  saveTransmuteReaderSettings: (patch: Partial<Settings>) => void
}

export const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({
  children,
  initialSettings,
}: {
  children: React.ReactNode
  initialSettings?: Settings
}) {
  const [settings, setSettings] = useState<Settings>(initialSettings ?? DEFAULT_SETTINGS)
  const [transmuteVersion, setTransmuteVersion] = useState(0)

  useEffect(() => {
    if (initialSettings !== undefined) return
    window.api.db.getSettings().then(setSettings).catch(console.error)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const saveSettings = useCallback(async (patch: Partial<Settings>): Promise<void> => {
    const saved = await window.api.db.saveSettings(patch)
    setSettings(saved)
  }, [])

  // Read path goes through the unified Settings handler: the store is derived
  // from the loaded flat settings, and effective values per mode come from the
  // resolver — so renderer-side RWW inheritance matches the main process.
  const settingsStore = useMemo<SettingsStore>(() => settingsStoreFromFlat(settings), [settings])

  const effectiveSettingsFor = useCallback(
    (mode: SettingsMode): Settings => resolveEffectiveSettings(mode, settingsStore),
    [settingsStore]
  )

  // Store-native write path (ADR-0008): clearing an override must delete the
  // key, which the flat `saveSettings` bridge cannot express, so RWW override
  // edits persist the nested store directly.
  const saveSettingsStore = useCallback(async (store: SettingsStore): Promise<void> => {
    const saved = await window.api.db.saveSettingsStore(store)
    setSettings(flattenSettingsStore(saved))
  }, [])

  const setRwwReaderField = useCallback(
    async <K extends keyof ReaderSettings>(field: K, value: ReaderSettings[K]): Promise<void> => {
      const inherited = (settingsStore.reader as ReaderSettings)[field]
      const next =
        value === inherited
          ? clearRwwOverride(settingsStore, field)
          : setRwwOverride(settingsStore, field, value)
      await saveSettingsStore(next)
    },
    [settingsStore, saveSettingsStore]
  )

  const hasRwwReaderOverride = useCallback(
    (field: keyof ReaderSettings): boolean => hasRwwOverride(settingsStore, field),
    [settingsStore]
  )

  // transmuteVersion is intentionally listed last — ESLint won't know about it
  // because loadStoredTransmuteConfig reads from localStorage (not reactive),
  // so we use a version counter to force recomputation after a write.
  const transmuteReaderSettings = useMemo(
    () => transmuteConfigToSettings(loadStoredTransmuteConfig(settings), settings),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings, transmuteVersion]
  )

  const saveTransmuteReaderSettings = useCallback(
    (patch: Partial<Settings>): void => {
      const merged = { ...transmuteReaderSettings, ...patch }
      const currentConfig = loadStoredTransmuteConfig(settings)
      persistTransmuteConfig({ ...currentConfig, ...readerFieldsFromSettings(merged) })
      setTransmuteVersion((v) => v + 1)
    },
    [settings, transmuteReaderSettings]
  )

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      saveSettings,
      settingsStore,
      effectiveSettingsFor,
      saveSettingsStore,
      setRwwReaderField,
      hasRwwReaderOverride,
      transmuteReaderSettings,
      saveTransmuteReaderSettings
    }),
    [
      settings,
      saveSettings,
      settingsStore,
      effectiveSettingsFor,
      saveSettingsStore,
      setRwwReaderField,
      hasRwwReaderOverride,
      transmuteReaderSettings,
      saveTransmuteReaderSettings
    ]
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (ctx === null) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return ctx
}
