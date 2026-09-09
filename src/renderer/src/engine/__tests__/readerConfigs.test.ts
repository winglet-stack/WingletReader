import { describe, it, expect } from 'vitest'
import type { Settings, ReaderConfig } from '../../types'
import {
  READER_CONFIG_FIELDS,
  readerConfigFromSettings,
  applyReaderConfig,
  readerConfigMatchesSettings,
  generateReaderConfigId,
  validateReaderConfig,
  validateReaderConfigs,
} from '../reader-configs'

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
}

function makeConfig(overrides: Partial<ReaderConfig> = {}): ReaderConfig {
  return {
    id: 'custom:cfg:abc123',
    name: 'Test Config',
    font_size: 36,
    font_family: '',
    bpm: 60,
    words_per_stack: 3,
    stacks_visible: 1,
    lines_count: 1,
    lines_anchor: 'center',
    lines_row_gap: 8,
    metronome_enabled: false,
    pause_at_sentences: true,
    pause_at_headlines: true,
    viewport_bg_color: '',
    text_color: '',
    highlight_color: '',
    highlight_text_color: '',
    highlight_active: true,
    highlight_mode: 'default',
    highlight_panning_chunk_size: 0,
    highlighting_mode: 'default',
    show_chunk_dividers: true,
    stack_gap: 32,
    stack_vertical_offset: 0,
    stack_horizontal_offset: 0,
    ...overrides,
  }
}

describe('READER_CONFIG_FIELDS', () => {
  it('contains exactly 23 field names', () => {
    expect(READER_CONFIG_FIELDS).toHaveLength(23)
  })

  it('does not include id or name', () => {
    expect(READER_CONFIG_FIELDS).not.toContain('id')
    expect(READER_CONFIG_FIELDS).not.toContain('name')
  })

  it('does not include non-reader settings like theme or chunk_rule_*', () => {
    expect(READER_CONFIG_FIELDS).not.toContain('theme')
    expect(READER_CONFIG_FIELDS).not.toContain('chunk_rule_long_word')
    expect(READER_CONFIG_FIELDS).not.toContain('tap_to_read')
    expect(READER_CONFIG_FIELDS).not.toContain('lock_at_wpm')
  })
})

describe('readerConfigFromSettings', () => {
  it('extracts all 23 reader fields from settings', () => {
    const fields = readerConfigFromSettings(BASE_SETTINGS)
    expect(Object.keys(fields)).toHaveLength(23)
  })

  it('picks the correct field values', () => {
    const settings: Settings = {
      ...BASE_SETTINGS,
      font_size: 54,
      font_family: 'Georgia, serif',
      bpm: 120,
      viewport_bg_color: '#000000',
      lines_anchor: 'top',
    }
    const fields = readerConfigFromSettings(settings)
    expect(fields.font_size).toBe(54)
    expect(fields.font_family).toBe('Georgia, serif')
    expect(fields.bpm).toBe(120)
    expect(fields.viewport_bg_color).toBe('#000000')
    expect(fields.lines_anchor).toBe('top')
  })

  it('does not include id, name, theme, or other non-reader fields', () => {
    const fields = readerConfigFromSettings(BASE_SETTINGS)
    const keys = Object.keys(fields)
    expect(keys).not.toContain('id')
    expect(keys).not.toContain('name')
    expect(keys).not.toContain('theme')
    expect(keys).not.toContain('chunk_rule_long_word')
  })
})

describe('applyReaderConfig', () => {
  it('returns all 23 fields without id and name', () => {
    const config = makeConfig()
    const applied = applyReaderConfig(config)
    expect(Object.keys(applied)).not.toContain('id')
    expect(Object.keys(applied)).not.toContain('name')
    expect(Object.keys(applied)).toHaveLength(23)
  })

  it('preserves field values exactly', () => {
    const config = makeConfig({ font_size: 54, viewport_bg_color: '#ff0000', lines_anchor: 'top' })
    const applied = applyReaderConfig(config)
    expect(applied.font_size).toBe(54)
    expect(applied.viewport_bg_color).toBe('#ff0000')
    expect(applied.lines_anchor).toBe('top')
  })
})

describe('readerConfigMatchesSettings', () => {
  it('returns true when all 23 config fields match settings', () => {
    const config = makeConfig()
    expect(readerConfigMatchesSettings(config, BASE_SETTINGS)).toBe(true)
  })

  it('returns false when font_size differs', () => {
    const config = makeConfig({ font_size: 54 })
    expect(readerConfigMatchesSettings(config, BASE_SETTINGS)).toBe(false)
  })

  it('returns false when bpm differs', () => {
    const config = makeConfig({ bpm: 120 })
    expect(readerConfigMatchesSettings(config, BASE_SETTINGS)).toBe(false)
  })

  it('returns false when viewport_bg_color differs', () => {
    const config = makeConfig({ viewport_bg_color: '#abcdef' })
    expect(readerConfigMatchesSettings(config, BASE_SETTINGS)).toBe(false)
  })

  it('returns true after applying config to settings', () => {
    const config = makeConfig({ font_size: 24, bpm: 90 })
    const updated = { ...BASE_SETTINGS, ...applyReaderConfig(config) }
    expect(readerConfigMatchesSettings(config, updated)).toBe(true)
  })
})

describe('generateReaderConfigId', () => {
  it('starts with custom:cfg:', () => {
    expect(generateReaderConfigId()).toMatch(/^custom:cfg:/)
  })

  it('generates unique IDs on consecutive calls', () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateReaderConfigId()))
    expect(ids.size).toBe(20)
  })
})

describe('validateReaderConfig', () => {
  it('returns null for null input', () => {
    expect(validateReaderConfig(null)).toBeNull()
  })

  it('returns null for non-object input', () => {
    expect(validateReaderConfig('string')).toBeNull()
    expect(validateReaderConfig(42)).toBeNull()
  })

  it('returns null when id is missing', () => {
    const { id: _id, ...noId } = makeConfig()
    expect(validateReaderConfig(noId)).toBeNull()
  })

  it('returns null when name is missing', () => {
    const { name: _name, ...noName } = makeConfig()
    expect(validateReaderConfig(noName)).toBeNull()
  })

  it('returns null when a numeric field is not a number', () => {
    expect(validateReaderConfig({ ...makeConfig(), font_size: 'big' })).toBeNull()
  })

  it('returns the config when all fields are valid', () => {
    const config = makeConfig()
    expect(validateReaderConfig(config)).toEqual(config)
  })

  it('loads a pre-slice Profile with a centered anchor', () => {
    const { lines_anchor: _linesAnchor, ...legacy } = makeConfig()

    expect(validateReaderConfig(legacy)?.lines_anchor).toBe('center')
  })

  it('round-trips a top anchor and rejects unknown anchor values', () => {
    const config = makeConfig({ lines_anchor: 'top' })

    expect(validateReaderConfig(config)).toEqual(config)
    expect(validateReaderConfig({ ...config, lines_anchor: 'bottom' })).toBeNull()
  })
})

describe('validateReaderConfigs', () => {
  it('returns empty array for non-array input', () => {
    expect(validateReaderConfigs(null)).toEqual([])
    expect(validateReaderConfigs('oops')).toEqual([])
  })

  it('filters out invalid entries', () => {
    const valid = makeConfig()
    const result = validateReaderConfigs([valid, null, { id: 'bad' }, 42])
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(valid)
  })

  it('keeps all valid entries', () => {
    const configs = [makeConfig({ id: 'a', name: 'A' }), makeConfig({ id: 'b', name: 'B' })]
    expect(validateReaderConfigs(configs)).toHaveLength(2)
  })
})
