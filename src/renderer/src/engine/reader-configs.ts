import type { Settings, ReaderConfig, ReaderConfigFields } from '../types'

export const READER_CONFIG_FIELDS: ReadonlyArray<keyof ReaderConfigFields> = [
  'font_size',
  'font_family',
  'bpm',
  'words_per_stack',
  'stacks_visible',
  'lines_enabled',
  'lines_count',
  'lines_row_gap',
  'metronome_enabled',
  'pause_at_sentences',
  'pause_at_headlines',
  'viewport_bg_color',
  'text_color',
  'highlight_color',
  'highlight_text_color',
  'highlight_active',
  'highlight_mode',
  'highlight_panning_chunk_size',
  'highlighting_mode',
  'show_chunk_dividers',
  'stack_gap',
  'stack_vertical_offset',
  'stack_horizontal_offset',
] as const

export function readerConfigFromSettings(s: Settings): ReaderConfigFields {
  return {
    font_size: s.font_size,
    font_family: s.font_family,
    bpm: s.bpm,
    words_per_stack: s.words_per_stack,
    stacks_visible: s.stacks_visible,
    lines_enabled: s.lines_enabled,
    lines_count: s.lines_count,
    lines_row_gap: s.lines_row_gap,
    metronome_enabled: s.metronome_enabled,
    pause_at_sentences: s.pause_at_sentences,
    pause_at_headlines: s.pause_at_headlines,
    viewport_bg_color: s.viewport_bg_color,
    text_color: s.text_color,
    highlight_color: s.highlight_color,
    highlight_text_color: s.highlight_text_color,
    highlight_active: s.highlight_active,
    highlight_mode: s.highlight_mode,
    highlight_panning_chunk_size: s.highlight_panning_chunk_size,
    highlighting_mode: s.highlighting_mode,
    show_chunk_dividers: s.show_chunk_dividers,
    stack_gap: s.stack_gap,
    stack_vertical_offset: s.stack_vertical_offset,
    stack_horizontal_offset: s.stack_horizontal_offset,
  }
}

export function applyReaderConfig(c: ReaderConfig): ReaderConfigFields {
  const { id: _id, name: _name, ...fields } = c
  return fields
}

export function readerConfigMatchesSettings(c: ReaderConfig, s: Settings): boolean {
  return READER_CONFIG_FIELDS.every(
    (field) => c[field] === (s as unknown as Record<string, unknown>)[field]
  )
}

export function generateReaderConfigId(): string {
  return `custom:cfg:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

const READER_CONFIG_STRING_FIELDS = [
  'font_family',
  'viewport_bg_color',
  'text_color',
  'highlight_color',
  'highlight_text_color',
  'highlight_mode',
  'highlighting_mode',
] as const satisfies ReadonlyArray<keyof ReaderConfig>

const READER_CONFIG_NUMBER_FIELDS = [
  'font_size',
  'bpm',
  'words_per_stack',
  'stacks_visible',
  'lines_count',
  'lines_row_gap',
  'highlight_panning_chunk_size',
  'stack_gap',
  'stack_vertical_offset',
  'stack_horizontal_offset',
] as const satisfies ReadonlyArray<keyof ReaderConfig>

const READER_CONFIG_BOOLEAN_FIELDS = [
  'lines_enabled',
  'metronome_enabled',
  'pause_at_sentences',
  'pause_at_headlines',
  'highlight_active',
  'show_chunk_dividers',
] as const satisfies ReadonlyArray<keyof ReaderConfig>

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return !!raw && typeof raw === 'object'
}

function hasNonEmptyStringField(record: Record<string, unknown>, field: keyof ReaderConfig): boolean {
  return typeof record[field] === 'string' && record[field] !== ''
}

function hasFieldsOfType(
  record: Record<string, unknown>,
  fields: ReadonlyArray<keyof ReaderConfig>,
  expectedType: 'boolean' | 'number' | 'string'
): boolean {
  return fields.every((field) => typeof record[field] === expectedType)
}

export function validateReaderConfig(raw: unknown): ReaderConfig | null {
  if (!isRecord(raw)) return null
  if (!hasNonEmptyStringField(raw, 'id')) return null
  if (!hasNonEmptyStringField(raw, 'name')) return null
  if (!hasFieldsOfType(raw, READER_CONFIG_STRING_FIELDS, 'string')) return null
  if (!hasFieldsOfType(raw, READER_CONFIG_NUMBER_FIELDS, 'number')) return null
  if (!hasFieldsOfType(raw, READER_CONFIG_BOOLEAN_FIELDS, 'boolean')) return null
  return raw as ReaderConfig
}

export function validateReaderConfigs(raw: unknown): ReaderConfig[] {
  if (!Array.isArray(raw)) return []
  return raw.map(validateReaderConfig).filter((c): c is ReaderConfig => c !== null)
}

/**
 * Built-in starter Profiles (analogous to `PRESET_PALETTES`).
 * IDs use the `preset:` prefix so `isBuiltinProfile` can identify them as
 * non-deletable. Values are proposed for HITL sign-off (ADR-0014 §8).
 */
export const PRESET_READER_PROFILES: ReaderConfig[] = [
  {
    id: 'preset:calm',
    name: 'Calm',
    // 75 × 2 = 150 WPM
    bpm: 75,
    words_per_stack: 2,
    stacks_visible: 1,
    font_size: 40,
    font_family: '',
    lines_enabled: false,
    lines_count: 3,
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
  },
  {
    id: 'preset:fast',
    name: 'Fast',
    // 100 × 3 = 300 WPM
    bpm: 100,
    words_per_stack: 3,
    stacks_visible: 1,
    font_size: 34,
    font_family: '',
    lines_enabled: false,
    lines_count: 3,
    lines_row_gap: 8,
    metronome_enabled: false,
    pause_at_sentences: false,
    pause_at_headlines: false,
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
  },
  {
    id: 'preset:focus',
    name: 'Focus',
    // 200 × 1 = 200 WPM
    bpm: 200,
    words_per_stack: 1,
    stacks_visible: 1,
    font_size: 48,
    font_family: '',
    lines_enabled: false,
    lines_count: 3,
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
  },
  {
    id: 'preset:skim',
    name: 'Skim',
    // 85 × 3 = 255 WPM; 3 stacks visible for panoramic context
    bpm: 85,
    words_per_stack: 3,
    stacks_visible: 3,
    font_size: 26,
    font_family: '',
    lines_enabled: false,
    lines_count: 3,
    lines_row_gap: 8,
    metronome_enabled: false,
    pause_at_sentences: false,
    pause_at_headlines: false,
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
  },
]

/** True when a profile's id carries the `preset:` prefix (non-deletable). */
export function isBuiltinProfile(profile: ReaderConfig): boolean {
  return profile.id.startsWith('preset:')
}

// ── RWW Profiles (issue 06b) ──────────────────────────────────────────────────
//
// Read While Working carries its own independent reader config, but only over the
// six frozen `rww_*` projection fields (ADR-0008 / ADR-0014 §5). RWW Profiles are
// full `ReaderConfig` objects so they validate through the *same* path as user
// Profiles (`validateReaderConfigs` / `isBuiltinProfile`); applying one writes
// only those six fields into the `rww_*` overrides, leaving everything else
// inheriting the Standard Reader config.

/** The six Standard Reader fields RWW owns independently (the `rww_*` set). */
const RWW_PROFILE_READER_FIELDS = [
  'bpm',
  'words_per_stack',
  'stacks_visible',
  'lines_enabled',
  'lines_count',
  'font_size',
] as const

/** Maps each RWW-owned reader field to its frozen flat `rww_*` projection key. */
const RWW_READER_FIELD_TO_FLAT = {
  bpm: 'rww_bpm',
  words_per_stack: 'rww_words_per_stack',
  stacks_visible: 'rww_stacks_visible',
  lines_enabled: 'rww_lines_enabled',
  lines_count: 'rww_lines_count',
  font_size: 'rww_font_size',
} as const satisfies Record<(typeof RWW_PROFILE_READER_FIELDS)[number], keyof Settings>

/** Translates a reader-field patch into the equivalent flat `rww_*` patch. Keys
 *  outside the RWW-owned set (e.g. overlay/shortcut fields) pass through. */
export function toRwwFlatPatch(patch: Partial<Settings>): Partial<Settings> {
  const out: Record<string, unknown> = {}
  const map = RWW_READER_FIELD_TO_FLAT as Record<string, keyof Settings>
  for (const [key, value] of Object.entries(patch)) {
    out[map[key] ?? key] = value
  }
  return out as Partial<Settings>
}

