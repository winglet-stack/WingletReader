/**
 * SettingsContext — provider + hook tests.
 * Environment: happy-dom (matched by vitest.config.ts environmentMatchGlobs).
 */
import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { SettingsProvider, useSettings } from '../contexts/SettingsContext'
import { setConfigStorage } from '../engine/transmuteConfig'
import type { Settings } from '../types'
import { DEFAULT_SETTINGS } from '../types'

afterEach(() => {
  cleanup()
  setConfigStorage({
    get: () => null,
    set: () => {}
  })
})

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_SETTINGS: Settings = {
  ...DEFAULT_SETTINGS,
  bpm: 80,
  theme: 'light',
  rww_bpm: 90,
  rww_words_per_stack: 2,
  rww_stacks_visible: 1,
  rww_lines_count: 1,
  custom_rww_playback_presets: [],
}

let saveSettingsMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  saveSettingsMock = vi.fn().mockImplementation(async (patch: Partial<Settings>) => ({
    ...BASE_SETTINGS,
    ...patch,
  }))
  vi.stubGlobal('api', {
    db: {
      getSettings: vi.fn().mockResolvedValue(BASE_SETTINGS),
      saveSettings: saveSettingsMock,
    },
  })
})

function wrapper({ children }: { children: React.ReactNode }) {
  return <SettingsProvider>{children}</SettingsProvider>
}

// ── Provider mount ────────────────────────────────────────────────────────────

describe('SettingsContext — provider', () => {
  it('starts with DEFAULT_SETTINGS then updates to loaded settings', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper })
    // Initial render uses DEFAULT_SETTINGS
    expect(result.current.settings.bpm).toBe(DEFAULT_SETTINGS.bpm)

    // After the async getSettings() resolves, settings update to BASE_SETTINGS
    await act(async () => {})
    expect(result.current.settings.bpm).toBe(80)
    expect(result.current.settings.theme).toBe('light')
  })

  it('loads settings from window.api.db.getSettings on mount', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper })
    await act(async () => {})
    expect(window.api.db.getSettings).toHaveBeenCalledTimes(1)
    expect(result.current.settings).toMatchObject({ bpm: 80, theme: 'light' })
  })

  it('useSettings throws when called outside a SettingsProvider', () => {
    expect(() => renderHook(() => useSettings())).toThrow(
      /useSettings must be used within a SettingsProvider/
    )
  })
})

// ── saveSettings ──────────────────────────────────────────────────────────────

describe('SettingsContext — saveSettings', () => {
  it('calls window.api.db.saveSettings with the patch', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper })
    await act(async () => {})

    await act(async () => {
      await result.current.saveSettings({ bpm: 120 })
    })

    expect(saveSettingsMock).toHaveBeenCalledWith({ bpm: 120 })
  })

  it('updates settings state with the returned value', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper })
    await act(async () => {})

    await act(async () => {
      await result.current.saveSettings({ bpm: 120 })
    })

    expect(result.current.settings.bpm).toBe(120)
  })
})

// ── saveTransmuteReaderSettings ───────────────────────────────────────────────

describe('SettingsContext — saveTransmuteReaderSettings', () => {
  it('persists to transmute config store and updates transmuteReaderSettings', async () => {
    const stored: Record<string, string> = {}
    setConfigStorage({
      get: (key) => stored[key] ?? null,
      set: (key, val) => { stored[key] = val },
    })

    const { result } = renderHook(() => useSettings(), { wrapper })
    await act(async () => {})

    const initialBpm = result.current.transmuteReaderSettings.bpm

    await act(async () => {
      result.current.saveTransmuteReaderSettings({ bpm: 999 })
    })

    // transmuteReaderSettings should reflect the written value
    expect(result.current.transmuteReaderSettings.bpm).toBe(999)
    // The stored value should also be updated
    const storedKey = Object.keys(stored)[0]
    expect(storedKey).toBeTruthy()
    const parsed = JSON.parse(stored[storedKey])
    expect(parsed.bpm).toBe(999)
    // Guard: initial bpm was different
    expect(initialBpm).not.toBe(999)
  })

  it('does NOT call window.api.db.saveSettings', async () => {
    setConfigStorage({ get: () => null, set: () => {} })

    const { result } = renderHook(() => useSettings(), { wrapper })
    await act(async () => {})

    await act(async () => {
      result.current.saveTransmuteReaderSettings({ bpm: 200 })
    })

    expect(saveSettingsMock).not.toHaveBeenCalled()
  })
})
