import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  setConfigStorage,
  loadStoredTransmuteConfig,
  persistTransmuteConfig,
  makeDefaultTransmuteConfig,
  TRANSMUTE_CONFIG_STORAGE_KEY,
  type ConfigStorage,
} from '../engine/transmuteConfig'
import type { Settings } from '../types'

// ── In-memory ConfigStorage ───────────────────────────────────────────────────

function makeMemoryStore(): ConfigStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    get(key) { return data.get(key) ?? null },
    set(key, value) { data.set(key, value) },
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_SETTINGS: Settings = {
  words_per_stack: 3,
  stacks_visible: 1,
  stack_gap: 32,
  bpm: 60,
  metronome_enabled: false,
  pause_at_sentences: true,
  pause_at_headlines: true,
  font_size: 36,
  stack_vertical_offset: 0,
  stack_horizontal_offset: 0,
  theme: 'dark',
  highlight_active: true,
  lines_enabled: false,
  lines_count: 3,
  lines_row_gap: 8,
  segmentation_enabled: true,
  segmentation_threshold: 5000,
  segmentation_chunk_size: 1500,
  auto_chapter_detection: true,
  summaries_initialized: false,
  chunk_rule_long_word: false,
  chunk_rule_enumerations: false,
  chunk_rule_bullets: false,
  chunk_rule_commas: false,
  chunk_rule_names: false,
  chunk_rule_headlines: true,
  view_style: 'default',
  show_chunk_dividers: true,
  highlight_color: '',
  viewport_bg_color: '',
  text_color: '',
  font_family: '',
  highlight_text_color: '',
  highlight_mode: 'default',
  highlight_panning_chunk_size: 0,
  highlighting_mode: 'default',
  tap_to_read: false,
  tap_to_read_key: 'Space',
  lock_at_wpm: false,
  target_wpm: 200,
  custom_palettes: [],
  custom_text_presets: [],
  custom_font_presets: [],
  custom_playback_presets: [],
  custom_reader_configs: [],
}

// ── Tests ─────────────────────────────────────────────────────────────────────

let store: ReturnType<typeof makeMemoryStore>

beforeEach(() => {
  store = makeMemoryStore()
  setConfigStorage(store)
})

afterEach(() => {
  // Restore default (localStorage-backed) implementation so other modules aren't affected
  setConfigStorage({
    get(key) {
      try {
        if (typeof window === 'undefined' || !window.localStorage) return null
        return window.localStorage.getItem(key)
      } catch { return null }
    },
    set(key, value) {
      try {
        if (typeof window === 'undefined' || !window.localStorage) return
        window.localStorage.setItem(key, value)
      } catch { /* best-effort */ }
    }
  })
})

describe('loadStoredTransmuteConfig — empty store', () => {
  it('returns defaults when nothing is stored', () => {
    const result = loadStoredTransmuteConfig(BASE_SETTINGS)
    const defaults = makeDefaultTransmuteConfig(BASE_SETTINGS)
    expect(result).toEqual(defaults)
  })

  it('does not touch localStorage', () => {
    expect(store.data.size).toBe(0)
    loadStoredTransmuteConfig(BASE_SETTINGS)
    expect(store.data.size).toBe(0)
  })
})

describe('persistTransmuteConfig + loadStoredTransmuteConfig — round-trip', () => {
  it('persists and reloads a full config faithfully', () => {
    const original = makeDefaultTransmuteConfig(BASE_SETTINGS)
    persistTransmuteConfig(original)

    expect(store.data.has(TRANSMUTE_CONFIG_STORAGE_KEY)).toBe(true)

    const reloaded = loadStoredTransmuteConfig(BASE_SETTINGS)
    expect(reloaded).toEqual(original)
  })

  it('persists changed fields and reloads them', () => {
    const modified = { ...makeDefaultTransmuteConfig(BASE_SETTINGS), bpm: 300, wordsPerStack: 5 }
    persistTransmuteConfig(modified)

    const reloaded = loadStoredTransmuteConfig(BASE_SETTINGS)
    expect(reloaded.bpm).toBe(300)
    expect(reloaded.wordsPerStack).toBe(5)
  })

  it('strips textId and segmentId before storing', () => {
    const withRuntime = {
      ...makeDefaultTransmuteConfig(BASE_SETTINGS),
      textId: 'some-text',
      segmentId: 42,
    }
    persistTransmuteConfig(withRuntime)

    const raw = JSON.parse(store.data.get(TRANSMUTE_CONFIG_STORAGE_KEY)!)
    expect(raw).not.toHaveProperty('textId')
    expect(raw).not.toHaveProperty('segmentId')
  })
})

describe('loadStoredTransmuteConfig — default-filling', () => {
  it('fills missing fields from defaults', () => {
    store.data.set(TRANSMUTE_CONFIG_STORAGE_KEY, JSON.stringify({ bpm: 120 }))

    const defaults = makeDefaultTransmuteConfig(BASE_SETTINGS)
    const result = loadStoredTransmuteConfig(BASE_SETTINGS)

    expect(result.bpm).toBe(120)
    expect(result.wordsPerStack).toBe(defaults.wordsPerStack)
    expect(result.resolution).toBe(defaults.resolution)
    expect(result.contentLimitType).toBe(defaults.contentLimitType)
  })

  it('clamps bpm to allowed range', () => {
    store.data.set(TRANSMUTE_CONFIG_STORAGE_KEY, JSON.stringify({ bpm: 99999 }))
    const result = loadStoredTransmuteConfig(BASE_SETTINGS)
    expect(result.bpm).toBeLessThanOrEqual(5000)
  })

  it('returns defaults on invalid JSON', () => {
    store.data.set(TRANSMUTE_CONFIG_STORAGE_KEY, 'not-json{{{')
    const result = loadStoredTransmuteConfig(BASE_SETTINGS)
    expect(result).toEqual(makeDefaultTransmuteConfig(BASE_SETTINGS))
  })
})
