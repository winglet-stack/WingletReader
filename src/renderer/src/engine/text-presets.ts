// fallow-ignore-file unused-file
// fallow-ignore-file complexity
// Legacy per-dimension presets are retained for stored settings compatibility.
import type { TextSizePreset } from '../types'
import { parseNamedRecordBase } from './presetValidation'

export type TextSizeFields = Pick<TextSizePreset, 'font_size'>

/**
 * Built-in text size presets. Add new entries here — no other changes required.
 */
export const PRESET_TEXT_SIZES: TextSizePreset[] = [
  { id: 'preset:small',  name: 'Small',  font_size: 24 },
  { id: 'preset:medium', name: 'Medium', font_size: 36 },
  { id: 'preset:big',    name: 'Big',    font_size: 54 },
]

function validateTextPreset(raw: unknown): TextSizePreset | null {
  const base = parseNamedRecordBase(raw)
  if (!base) return null
  const fontSize = typeof base.p.font_size === 'number' && base.p.font_size > 0 ? base.p.font_size : null
  if (fontSize === null) return null
  return { id: base.id, name: base.name, font_size: fontSize }
}

export function validateTextPresets(raw: unknown): TextSizePreset[] {
  if (!Array.isArray(raw)) return []
  return raw.map(validateTextPreset).filter((p): p is TextSizePreset => p !== null)
}

export function textPresetMatchesSettings(preset: TextSizePreset, fields: TextSizeFields): boolean {
  return preset.font_size === fields.font_size
}

export function generateTextPresetId(): string {
  return `custom:txt:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}
