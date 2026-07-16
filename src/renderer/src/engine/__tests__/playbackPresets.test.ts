import { describe, expect, it } from 'vitest'
import {
  PRESET_PLAYBACK,
  generatePlaybackPresetId,
  playbackPresetMatchesSettings,
  validatePlaybackPresets,
} from '../playback-presets'
import type { PlaybackPreset } from '../../types'

function makePreset(overrides: Partial<PlaybackPreset> = {}): PlaybackPreset {
  return {
    id: 'preset:test',
    name: 'Test',
    bpm: 120,
    words_per_stack: 3,
    stacks_visible: 2,
    lines_enabled: true,
    lines_count: 4,
    ...overrides,
  }
}

describe('playback presets', () => {
  it('keeps the built-in compatibility presets valid', () => {
    expect(validatePlaybackPresets(PRESET_PLAYBACK)).toEqual(PRESET_PLAYBACK)
  })

  it('filters invalid saved presets', () => {
    const valid = makePreset()

    expect(
      validatePlaybackPresets([
        valid,
        null,
        { ...valid, id: '' },
        { ...valid, name: '' },
        { ...valid, bpm: 0 },
        { ...valid, words_per_stack: '3' },
        { ...valid, stacks_visible: -1 },
        { ...valid, lines_count: 0 },
      ])
    ).toEqual([valid])
  })

  it('defaults missing lines_enabled to false for old saved records', () => {
    const { lines_enabled: _linesEnabled, ...legacyPreset } = makePreset()

    expect(validatePlaybackPresets([legacyPreset])).toEqual([
      {
        ...legacyPreset,
        lines_enabled: false,
      },
    ])
  })

  it('returns an empty list for non-array input', () => {
    expect(validatePlaybackPresets(null)).toEqual([])
    expect(validatePlaybackPresets({ id: 'preset:test' })).toEqual([])
  })

  it('compares only playback fields against settings-like values', () => {
    const preset = makePreset()

    expect(playbackPresetMatchesSettings(preset, preset)).toBe(true)
    expect(
      playbackPresetMatchesSettings(preset, {
        ...preset,
        bpm: preset.bpm + 1,
      })
    ).toBe(false)
  })

  it('generates custom playback preset ids', () => {
    expect(generatePlaybackPresetId()).toMatch(/^custom:pbk:/)
  })
})
