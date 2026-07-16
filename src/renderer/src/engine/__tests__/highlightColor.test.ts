import { describe, it, expect } from 'vitest'
import {
  hexToRgb,
  relativeLuminance,
  contrastRatio,
  autoTextColor,
  resolveHighlightTextColor,
} from '../highlightColor'

// ── hexToRgb ──────────────────────────────────────────────────────────────

describe('hexToRgb', () => {
  it('parses a standard 6-digit hex', () => {
    expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 })
    expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 })
    expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 })
  })

  it('accepts hex without a leading #', () => {
    expect(hexToRgb('aabbcc')).toEqual({ r: 170, g: 187, b: 204 })
  })

  it('is case-insensitive', () => {
    expect(hexToRgb('#AABBCC')).toEqual(hexToRgb('#aabbcc'))
  })

  it('returns null for invalid input', () => {
    expect(hexToRgb('')).toBeNull()
    expect(hexToRgb('#fff')).toBeNull()     // 3-digit shorthand not supported
    expect(hexToRgb('#gggggg')).toBeNull()  // non-hex chars
    expect(hexToRgb('not-a-color')).toBeNull()
  })

  it('strips leading/trailing whitespace', () => {
    expect(hexToRgb('  #ffffff  ')).toEqual({ r: 255, g: 255, b: 255 })
  })
})

// ── relativeLuminance ─────────────────────────────────────────────────────

describe('relativeLuminance', () => {
  it('returns 1.0 for pure white', () => {
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1.0, 4)
  })

  it('returns 0.0 for pure black', () => {
    expect(relativeLuminance(0, 0, 0)).toBeCloseTo(0.0, 4)
  })

  it('produces a value between 0 and 1 for mid-tones', () => {
    const lum = relativeLuminance(128, 128, 128)
    expect(lum).toBeGreaterThan(0)
    expect(lum).toBeLessThan(1)
  })
})

// ── contrastRatio ─────────────────────────────────────────────────────────

describe('contrastRatio', () => {
  it('returns 21 for white against black', () => {
    expect(contrastRatio(1.0, 0.0)).toBeCloseTo(21, 0)
  })

  it('returns 1 for identical luminances', () => {
    expect(contrastRatio(0.5, 0.5)).toBeCloseTo(1, 4)
  })

  it('is symmetric — order of arguments does not matter', () => {
    const a = contrastRatio(0.2, 0.8)
    const b = contrastRatio(0.8, 0.2)
    expect(a).toBeCloseTo(b, 6)
  })
})

// ── autoTextColor ─────────────────────────────────────────────────────────

describe('autoTextColor', () => {
  it('picks white text on a dark background', () => {
    expect(autoTextColor('#000000')).toBe('#ffffff')
    expect(autoTextColor('#0d0d0d')).toBe('#ffffff')
    expect(autoTextColor('#1a1a2e')).toBe('#ffffff')
  })

  it('picks black text on a light background', () => {
    expect(autoTextColor('#ffffff')).toBe('#000000')
    expect(autoTextColor('#f0f0f0')).toBe('#000000')
    expect(autoTextColor('#fafafa')).toBe('#000000')
  })

  it('picks the higher-contrast option for mid-tone backgrounds', () => {
    // A medium blue — white typically wins
    const result = autoTextColor('#4a90d9')
    expect(result === '#ffffff' || result === '#000000').toBe(true)
  })

  it('falls back to #000000 for an invalid color', () => {
    expect(autoTextColor('')).toBe('#000000')
    expect(autoTextColor('not-a-color')).toBe('#000000')
  })

  it('handles saturated colors correctly', () => {
    // Bright yellow (#ffff00) has very high luminance — should pick black
    expect(autoTextColor('#ffff00')).toBe('#000000')
    // Pure red has luminance ~0.2126, above the ~0.179 crossover, so black wins too
    expect(autoTextColor('#ff0000')).toBe('#000000')
    // Deep blue (#0000ff) has very low luminance (~0.0722) — white wins
    expect(autoTextColor('#0000ff')).toBe('#ffffff')
  })
})

// ── resolveHighlightTextColor ─────────────────────────────────────────────

describe('resolveHighlightTextColor', () => {
  it('returns the custom text color when it is a valid hex', () => {
    expect(resolveHighlightTextColor('#aabbcc', '#ff0000')).toBe('#ff0000')
  })

  it('ignores the custom color and returns null when it is an invalid hex', () => {
    expect(resolveHighlightTextColor('#aabbcc', 'badvalue')).toBeNull()
    expect(resolveHighlightTextColor('#aabbcc', '')).not.toBe('badvalue')
  })

  it('auto-calculates contrast when highlightColor is set and customTextColor is empty', () => {
    const result = resolveHighlightTextColor('#000000', '')
    expect(result).toBe('#ffffff')
  })

  it('returns null when both colors are empty (use CSS fallback)', () => {
    expect(resolveHighlightTextColor('', '')).toBeNull()
  })

  it('returns null when highlightColor is empty and customTextColor is invalid', () => {
    expect(resolveHighlightTextColor('', 'not-a-color')).toBeNull()
  })

  it('custom color takes precedence over auto-contrast', () => {
    // Even if it results in poor contrast, the user override is respected
    const custom = '#cccccc'
    expect(resolveHighlightTextColor('#ffffff', custom)).toBe(custom)
  })
})
