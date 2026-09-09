import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReaderConfig, Settings, TransmuteConfig } from '../../types'
import {
  applyReaderConfigToTransmuteConfig,
  applyTransmutePreset,
  loadStoredTransmuteConfig,
  makeDefaultTransmuteConfig,
  transmutePresetFromConfig,
  validateTransmutePresets,
  TRANSMUTE_CONFIG_STORAGE_KEY,
} from '../transmuteConfig'

afterEach(() => {
  vi.unstubAllGlobals()
})

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
  lines_count: 1,
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
  custom_transmute_presets: [],
}

function makeTransmuteConfig(overrides: Partial<TransmuteConfig> = {}): TransmuteConfig {
  return {
    textId: 1,
    segmentId: 2,
    ...makeDefaultTransmuteConfig(BASE_SETTINGS),
    ...overrides,
  }
}

function makeReaderConfig(overrides: Partial<ReaderConfig> = {}): ReaderConfig {
  return {
    id: 'custom:cfg:test',
    name: 'Reader Saved Setup',
    font_size: 44,
    font_family: 'Georgia, serif',
    bpm: 144,
    words_per_stack: 4,
    stacks_visible: 3,
    lines_count: 2,
    lines_row_gap: 12,
    metronome_enabled: false,
    pause_at_sentences: false,
    pause_at_headlines: true,
    viewport_bg_color: '#101010',
    text_color: '#eeeeee',
    highlight_color: '#ffcc00',
    highlight_text_color: '#000000',
    highlight_active: true,
    highlight_mode: 'progressive-bar',
    highlight_panning_chunk_size: 0,
    highlighting_mode: 'progressive',
    show_chunk_dividers: false,
    stack_gap: 24,
    stack_vertical_offset: 16,
    stack_horizontal_offset: -8,
    ...overrides,
  }
}

describe('loadStoredTransmuteConfig', () => {
  it('defaults legacy stored configs that do not include highlight mode fields', () => {
    const getItem = vi.fn((key: string) => key === TRANSMUTE_CONFIG_STORAGE_KEY
      ? JSON.stringify({ bpm: 90, wordsPerStack: 5, resolution: '720x720' })
      : null)
    vi.stubGlobal('window', { localStorage: { getItem } })

    const config = loadStoredTransmuteConfig(BASE_SETTINGS)

    expect(config.bpm).toBe(90)
    expect(config.wordsPerStack).toBe(5)
    expect(config.resolution).toBe('720x720')
    expect(config.theme).toBe('dark')
    expect(config.highlightMode).toBe('default')
    expect(config.highlightPanningChunkSize).toBe(0)
    expect(config.highlightingMode).toBe('default')
  })
})

describe('transmute presets', () => {
  it('saves all transmute settings except source ids', () => {
    const config = makeTransmuteConfig({
      textId: 42,
      segmentId: 99,
      resolution: '1080x1920',
      highlightMode: 'panning-bar',
      highlightPanningChunkSize: 4,
      showProgressOverlay: true,
    })

    const preset = transmutePresetFromConfig('Portrait Highlight', config)

    expect(preset.name).toBe('Portrait Highlight')
    expect('textId' in preset).toBe(false)
    expect('segmentId' in preset).toBe(false)
    expect(preset.resolution).toBe('1080x1920')
    expect(preset.highlightMode).toBe('panning-bar')
    expect(preset.highlightPanningChunkSize).toBe(4)
    expect(preset.showProgressOverlay).toBe(true)
  })

  it('applies a preset while preserving the selected source', () => {
    const preset = transmutePresetFromConfig('Square', makeTransmuteConfig({ resolution: '720x720', bpm: 300 }))
    const current = makeTransmuteConfig({ textId: 10, segmentId: 11, resolution: '1280x720', bpm: 60 })

    const applied = applyTransmutePreset(current, preset)

    expect(applied.textId).toBe(10)
    expect(applied.segmentId).toBe(11)
    expect(applied.resolution).toBe('720x720')
    expect(applied.bpm).toBe(300)
  })

  it('validates presets with default handling and filters invalid entries', () => {
    const defaults = makeDefaultTransmuteConfig(BASE_SETTINGS)
    const valid = transmutePresetFromConfig('Valid', makeTransmuteConfig({ bpm: 180 }))

    const result = validateTransmutePresets([valid, null, { id: 'bad' }], defaults)

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Valid')
    expect(result[0].bpm).toBe(180)
  })
})

describe('reader config reuse', () => {
  it('applies saved reader configurations without overwriting video-only settings', () => {
    const current = makeTransmuteConfig({
      resolution: '1080x1920',
      maxDurationMinutes: 5,
      showProgressOverlay: true,
      bgColorOverride: '#222222',
    })

    const applied = applyReaderConfigToTransmuteConfig(current, makeReaderConfig())

    expect(applied.resolution).toBe('1080x1920')
    expect(applied.maxDurationMinutes).toBe(5)
    expect(applied.showProgressOverlay).toBe(true)
    expect(applied.bgColorOverride).toBe('#222222')
    expect(applied.bpm).toBe(144)
    expect(applied.wordsPerStack).toBe(4)
    expect(applied.highlightMode).toBe('progressive-bar')
    expect(applied.highlightColor).toBe('#ffcc00')
  })
})
