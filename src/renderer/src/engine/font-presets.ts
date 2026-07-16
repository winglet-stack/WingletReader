// fallow-ignore-file unused-file
// fallow-ignore-file complexity
// Legacy per-dimension presets are retained for stored settings compatibility.
import type { FontPreset } from '../types'
import { parseNamedRecordBase } from './presetValidation'

export type FontFields = Pick<FontPreset, 'font_family'>

/**
 * Built-in font presets. Add new entries here — no other changes required.
 * Empty string for font_family means the app's default system font.
 */
export const PRESET_FONTS: FontPreset[] = [
  { id: 'preset:default', name: 'Default', font_family: '' },
  { id: 'preset:serif',   name: 'Serif',   font_family: 'Georgia, serif' },
  { id: 'preset:sans',    name: 'Sans',    font_family: 'Arial, Helvetica, sans-serif' },
  { id: 'preset:mono',    name: 'Mono',    font_family: '"Courier New", monospace' },
]

function validateFontPreset(raw: unknown): FontPreset | null {
  const base = parseNamedRecordBase(raw)
  if (!base) return null
  if (typeof base.p.font_family !== 'string') return null
  return { id: base.id, name: base.name, font_family: base.p.font_family }
}

export function validateFontPresets(raw: unknown): FontPreset[] {
  if (!Array.isArray(raw)) return []
  return raw.map(validateFontPreset).filter((p): p is FontPreset => p !== null)
}

export function fontPresetMatchesSettings(preset: FontPreset, fields: FontFields): boolean {
  return preset.font_family === fields.font_family
}

export function generateFontPresetId(): string {
  return `custom:fnt:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}
