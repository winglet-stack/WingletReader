import { describe, it, expect } from 'vitest'
import {
  DEFAULT_SETTINGS,
  effectiveLinesCount,
  linesCountPatch,
  parseSettings,
  resolvedLinesAnchor,
} from '../settings'

describe('line count helpers', () => {
  it('migrates legacy disabled/count data to one effective line without mutating input', () => {
    const stored = { lines_enabled: false, lines_count: 3 }
    const parsed = parseSettings(stored)

    expect(effectiveLinesCount(parsed)).toBe(1)
    expect(parsed.lines_count).toBe(1)
    expect('lines_enabled' in parsed).toBe(false)
    expect(stored).toEqual({ lines_enabled: false, lines_count: 3 })
  })

  it.each([0, -2])('clamps a count below one (%s) to one', (lines_count) => {
    expect(effectiveLinesCount({ lines_count })).toBe(1)
  })

  it('returns counts unchanged when they are at least one', () => {
    expect(effectiveLinesCount({ lines_count: 1 })).toBe(1)
    expect(effectiveLinesCount({ lines_count: 3 })).toBe(3)
  })

  it('writes only the count', () => {
    expect(linesCountPatch(1)).toEqual({ lines_count: 1 })
    expect(linesCountPatch(3)).toEqual({ lines_count: 3 })
  })

  it('defaults a missing anchor to center without mutating legacy input', () => {
    const stored = { lines_count: 3 }

    expect(resolvedLinesAnchor(stored)).toBe('center')
    expect(stored).toEqual({ lines_count: 3 })
  })

  it('keeps top inert at one line while preserving the stored choice for later', () => {
    const stored = { lines_count: 1, lines_anchor: 'top' as const }

    expect(resolvedLinesAnchor(stored)).toBe('center')
    expect(stored.lines_anchor).toBe('top')

    stored.lines_count = 3
    expect(resolvedLinesAnchor(stored)).toBe('top')
  })
})

describe('parseSettings', () => {
  it('hydrates a missing lines_anchor as center without writing into the source object', () => {
    const stored = { lines_count: 3 }

    expect(parseSettings(stored).lines_anchor).toBe('center')
    expect('lines_anchor' in stored).toBe(false)
  })

  it('returns defaults for all required fields when given an empty object', () => {
    const result = parseSettings({})
    // rww inherit keys (rww_bpm, rww_words_per_stack, etc.) are intentionally
    // absent when not in the stored data — they fall back via ?? at the call site.
    const requiredDefaults = Object.fromEntries(
      Object.entries(DEFAULT_SETTINGS).filter(
        ([k]) => !['rww_bpm', 'rww_words_per_stack', 'rww_stacks_visible', 'rww_lines_count', 'rww_font_size'].includes(k)
      )
    )
    expect(result).toEqual(requiredDefaults)
  })

  it('falls back to defaults for non-object input', () => {
    // Non-object input is treated like an empty object — same shape as
    // parseSettings({}), which omits rww inherit keys (they're undefined when absent).
    const emptyResult = parseSettings({})
    expect(parseSettings(null)).toEqual(emptyResult)
    expect(parseSettings(undefined)).toEqual(emptyResult)
    expect(parseSettings('nope')).toEqual(emptyResult)
    expect(parseSettings(42)).toEqual(emptyResult)
  })

  it('keeps valid provided values', () => {
    const result = parseSettings({
      bpm: 240,
      theme: 'light',
      font_family: 'Georgia, serif',
      highlight_active: false
    })
    expect(result.bpm).toBe(240)
    expect(result.theme).toBe('light')
    expect(result.font_family).toBe('Georgia, serif')
    expect(result.highlight_active).toBe(false)
  })

  it('fills missing fields from defaults while keeping the ones provided', () => {
    const result = parseSettings({ bpm: 123 })
    expect(result.bpm).toBe(123)
    expect(result.words_per_stack).toBe(DEFAULT_SETTINGS.words_per_stack)
    expect(result.theme).toBe(DEFAULT_SETTINGS.theme)
    expect(result.custom_palettes).toEqual([])
  })

  it('strips unknown keys', () => {
    const result = parseSettings({ bpm: 90, totally_unknown: 'x', another: 99 }) as Record<
      string,
      unknown
    >
    expect(result.bpm).toBe(90)
    expect('totally_unknown' in result).toBe(false)
    expect('another' in result).toBe(false)
    // logo_style was removed in ADR-0029 (logo canonicalized); an orphan key from
    // a pre-alpha stored settings blob must load fine and simply be dropped.
    const withOrphanLogo = parseSettings({ bpm: 90, logo_style: 'classic' }) as Record<string, unknown>
    expect(withOrphanLogo.bpm).toBe(90)
    expect('logo_style' in withOrphanLogo).toBe(false)
    // rww inherit keys are absent when not supplied (intentional — they fall back
    // via ?? to the main-reader setting at the call site)
    expect('rww_bpm' in result).toBe(false)
    // all other DEFAULT_SETTINGS keys are present
    const rwwInheritKeys = new Set(['rww_bpm', 'rww_words_per_stack', 'rww_stacks_visible', 'rww_lines_count', 'rww_font_size'])
    const expectedKeys = Object.keys(DEFAULT_SETTINGS).filter(k => !rwwInheritKeys.has(k))
    expect(Object.keys(result).sort()).toEqual(expectedKeys.sort())
  })

  it('replaces fields of the wrong primitive type with defaults', () => {
    const result = parseSettings({
      bpm: 'fast', // should be a number
      theme: 42, // should be a string
      highlight_active: 'yes', // should be a boolean
      font_size: null // should be a number
    })
    expect(result.bpm).toBe(DEFAULT_SETTINGS.bpm)
    expect(result.theme).toBe(DEFAULT_SETTINGS.theme)
    expect(result.highlight_active).toBe(DEFAULT_SETTINGS.highlight_active)
    expect(result.font_size).toBe(DEFAULT_SETTINGS.font_size)
  })

  it('replaces non-array values for array fields with a fresh default array', () => {
    const result = parseSettings({ custom_palettes: 'not-an-array' })
    expect(result.custom_palettes).toEqual([])
  })

  it('accepts arrays for collection fields', () => {
    const palette = {
      id: 'p1',
      name: 'Mono',
      viewport_bg_color: '#000',
      text_color: '#fff',
      highlight_color: '#ff0',
      highlight_text_color: '#000',
      highlight_active: true
    }
    const result = parseSettings({ custom_palettes: [palette] })
    expect(result.custom_palettes).toEqual([palette])
  })

  it('does not share array references with DEFAULT_SETTINGS', () => {
    const a = parseSettings({})
    const b = parseSettings({})
    a.custom_palettes!.push({
      id: 'x',
      name: 'x',
      viewport_bg_color: '',
      text_color: '',
      highlight_color: '',
      highlight_text_color: '',
      highlight_active: false
    })
    expect(b.custom_palettes).toEqual([])
    expect(DEFAULT_SETTINGS.custom_palettes).toEqual([])
  })
})
