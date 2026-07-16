import type { ReaderPalette } from '../types'
import { parseNamedRecordBase } from './presetValidation'

/** All color-related fields that a palette covers. */
export type PaletteColorFields = Pick<
  ReaderPalette,
  'viewport_bg_color' | 'text_color' | 'highlight_color' | 'highlight_text_color' | 'highlight_active'
>

/**
 * Built-in preset palettes. Add new entries here to expose them in the UI —
 * no other changes are required.
 */
export const PRESET_PALETTES: ReaderPalette[] = [
  {
    id: 'preset:default',
    name: 'Default',
    viewport_bg_color: '',
    text_color: '',
    highlight_color: '',
    highlight_text_color: '',
    highlight_active: true,
  },
  {
    id: 'preset:amber',
    name: 'Amber',
    viewport_bg_color: '#0f0e09',
    text_color: '#e8c97c',
    highlight_color: '#3d2b05',
    highlight_text_color: '#e8c97c',
    highlight_active: true,
  },
  {
    id: 'preset:night-blue',
    name: 'Night Blue',
    viewport_bg_color: '#060c14',
    text_color: '#b8cce4',
    highlight_color: '#142040',
    highlight_text_color: '#b8cce4',
    highlight_active: true,
  },
  {
    id: 'preset:sepia',
    name: 'Sepia',
    viewport_bg_color: '#f6edd6',
    text_color: '#3a2510',
    highlight_color: '#c4954a',
    highlight_text_color: '#1a0d00',
    highlight_active: true,
  },
  {
    id: 'preset:high-contrast',
    name: 'Hi-Contrast',
    viewport_bg_color: '#000000',
    text_color: '#ffffff',
    highlight_color: '#ffee00',
    highlight_text_color: '#000000',
    highlight_active: true,
  },
  {
    id: 'preset:soft-light',
    name: 'Soft Light',
    viewport_bg_color: '#f8f6f2',
    text_color: '#2c2c2c',
    highlight_color: '#c8def4',
    highlight_text_color: '#1a1a1a',
    highlight_active: true,
  },
]

const HEX_RE = /^#[0-9a-fA-F]{6}$/

function isValidColor(v: unknown): boolean {
  return v === '' || (typeof v === 'string' && HEX_RE.test(v))
}

function validatePalette(raw: unknown): ReaderPalette | null {
  const base = parseNamedRecordBase(raw)
  if (!base) return null
  const { p } = base
  return {
    id: base.id,
    name: base.name,
    viewport_bg_color: isValidColor(p.viewport_bg_color) ? (p.viewport_bg_color as string) : '',
    text_color: isValidColor(p.text_color) ? (p.text_color as string) : '',
    highlight_color: isValidColor(p.highlight_color) ? (p.highlight_color as string) : '',
    highlight_text_color: isValidColor(p.highlight_text_color) ? (p.highlight_text_color as string) : '',
    highlight_active: typeof p.highlight_active === 'boolean' ? p.highlight_active : true,
  }
}

export function validatePalettes(raw: unknown): ReaderPalette[] {
  if (!Array.isArray(raw)) return []
  return raw.map(validatePalette).filter((p): p is ReaderPalette => p !== null)
}

export function paletteMatchesColors(palette: ReaderPalette, colors: PaletteColorFields): boolean {
  return (
    palette.viewport_bg_color === colors.viewport_bg_color &&
    palette.text_color === colors.text_color &&
    palette.highlight_color === colors.highlight_color &&
    palette.highlight_text_color === colors.highlight_text_color &&
    palette.highlight_active === colors.highlight_active
  )
}

export function generatePaletteId(): string {
  return `custom:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}
