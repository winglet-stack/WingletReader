// fallow-ignore-file complexity
// Legacy per-dimension presets are retained for stored settings compatibility.
import type { PlaybackPreset } from '../types'
import { parseNamedRecordBase } from './presetValidation'

export type PlaybackFields = Pick<
  PlaybackPreset,
  'bpm' | 'words_per_stack' | 'stacks_visible' | 'lines_enabled' | 'lines_count'
>

/**
 * Built-in playback presets. Add new entries here — no other changes required.
 * RVP  = single-word rapid serial visual presentation (1 stack, 1 word/stack).
 * Chunking = multi-stack chunked reading (3 stacks, 3 words/stack).
 */
export const PRESET_PLAYBACK: PlaybackPreset[] = [
  {
    id: 'preset:rvp',
    name: 'RVP',
    bpm: 60,
    words_per_stack: 1,
    stacks_visible: 1,
    lines_enabled: false,
    lines_count: 3,
  },
  {
    id: 'preset:chunking',
    name: 'Chunking',
    bpm: 60,
    words_per_stack: 3,
    stacks_visible: 3,
    lines_enabled: false,
    lines_count: 3,
  },
]

function validatePlaybackPreset(raw: unknown): PlaybackPreset | null {
  const base = parseNamedRecordBase(raw)
  if (!base) return null
  const { p } = base
  const bpm = typeof p.bpm === 'number' && p.bpm > 0 ? p.bpm : null
  const wps = typeof p.words_per_stack === 'number' && p.words_per_stack > 0 ? p.words_per_stack : null
  const stacks = typeof p.stacks_visible === 'number' && p.stacks_visible > 0 ? p.stacks_visible : null
  const linesCount = typeof p.lines_count === 'number' && p.lines_count > 0 ? p.lines_count : null
  if (bpm === null || wps === null || stacks === null || linesCount === null) return null
  return {
    id: base.id,
    name: base.name,
    bpm,
    words_per_stack: wps,
    stacks_visible: stacks,
    lines_enabled: typeof p.lines_enabled === 'boolean' ? p.lines_enabled : false,
    lines_count: linesCount,
  }
}

export function validatePlaybackPresets(raw: unknown): PlaybackPreset[] {
  if (!Array.isArray(raw)) return []
  return raw.map(validatePlaybackPreset).filter((p): p is PlaybackPreset => p !== null)
}

export function playbackPresetMatchesSettings(preset: PlaybackPreset, fields: PlaybackFields): boolean {
  return (
    preset.bpm === fields.bpm &&
    preset.words_per_stack === fields.words_per_stack &&
    preset.stacks_visible === fields.stacks_visible &&
    preset.lines_enabled === fields.lines_enabled &&
    preset.lines_count === fields.lines_count
  )
}

export function generatePlaybackPresetId(): string {
  return `custom:pbk:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}
