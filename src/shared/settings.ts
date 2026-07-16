/**
 * Single authoritative source of truth for application settings.
 *
 * `DEFAULT_SETTINGS` is the canonical defaults object; the `Settings` type is
 * inferred from it so the two can never drift. `parseSettings` is the load-time
 * validation seam: any JSON read from disk or received over IPC passes through
 * it before use. No runtime validation library — merging is type-guided by the
 * shape of `DEFAULT_SETTINGS` itself.
 */

export type HighlightMode = 'default' | 'progressive-bar' | 'panning-bar'

export type HighlightingMode = 'default' | 'progressive'

export interface ReaderPalette {
  id: string
  name: string
  viewport_bg_color: string
  text_color: string
  highlight_color: string
  highlight_text_color: string
  highlight_active: boolean
}

export interface TextSizePreset {
  id: string
  name: string
  font_size: number
}

export interface FontPreset {
  id: string
  name: string
  font_family: string
}

export interface PlaybackPreset {
  id: string
  name: string
  bpm: number
  words_per_stack: number
  stacks_visible: number
  lines_enabled: boolean
  lines_count: number
}

export interface ReaderConfig {
  id: string
  name: string
  font_size: number
  font_family: string
  bpm: number
  words_per_stack: number
  stacks_visible: number
  lines_enabled: boolean
  lines_count: number
  lines_row_gap: number
  metronome_enabled: boolean
  pause_at_sentences: boolean
  pause_at_headlines: boolean
  viewport_bg_color: string
  text_color: string
  highlight_color: string
  highlight_text_color: string
  highlight_active: boolean
  highlight_mode: HighlightMode
  highlight_panning_chunk_size: number
  highlighting_mode: HighlightingMode
  show_chunk_dividers: boolean
  stack_gap: number
  stack_vertical_offset: number
  stack_horizontal_offset: number
}

export interface TransmutePreset {
  id: string
  name: string
  bpm: number
  wordsPerStack: number
  pauseAtSentences: boolean
  pauseAtHeadlines: boolean
  fontSize: number
  fontFamily: string
  theme: 'dark' | 'light'
  bgColor: string
  textColor: string
  stackVerticalOffset: number
  stackHorizontalOffset: number
  highlightActive: boolean
  highlightColor: string
  highlightTextColor: string
  highlightMode: HighlightMode
  highlightPanningChunkSize: number
  highlightingMode: HighlightingMode
  linesEnabled: boolean
  linesCount: number
  linesRowGap: number
  stacksVisible: number
  stackGap: number
  showChunkDividers: boolean
  chunkRuleLongWord: boolean
  chunkRuleEnumerations: boolean
  chunkRuleBullets: boolean
  chunkRuleCommas: boolean
  chunkRuleNames: boolean
  resolution: '1280x720' | '1920x1080' | '1080x1920' | '720x720'
  maxDurationMinutes: number | null
  contentLimitType: 'none' | 'words' | 'percentage'
  contentLimitWords: number
  contentLimitPercentage: number
  showProgressOverlay: boolean
  bgColorOverride: string
  transparentBackground: boolean
}

/**
 * Canonical defaults. The `as` casts widen value literals to their intended
 * union types (and typed empty arrays) so the inferred `Settings` type is
 * correct without a hand-written interface.
 */
export const DEFAULT_SETTINGS = {
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
  theme: 'dark' as 'dark' | 'light',
  highlight_active: true,
  lines_enabled: false,
  lines_count: 3,
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
  view_style: 'default' as 'default' | 'focal-points',
  show_chunk_dividers: true,
  highlight_color: '',
  viewport_bg_color: '',
  text_color: '',
  font_family: '',
  highlight_text_color: '',
  highlight_mode: 'default' as HighlightMode,
  highlight_panning_chunk_size: 0,
  highlighting_mode: 'default' as HighlightingMode,
  tap_to_read: false,
  tap_to_read_key: 'Space',
  live_rewind_stacks: 1,
  live_rewind_key: 'Mouse1',
  lock_at_wpm: false,
  target_wpm: 200,
  read_while_working_enabled: false,
  read_while_working_shortcut: 'Control+Space',
  read_while_working_exit_shortcut: 'Control+Space',
  read_while_working_window_width: 640,
  read_while_working_window_height: 360,
  read_while_working_restore_clipboard: true,
  read_while_working_show_standby_control: true,
  read_while_working_standby_x: null as number | null,
  read_while_working_standby_y: null as number | null,
  rww_bpm: 60,
  rww_words_per_stack: 3,
  rww_stacks_visible: 1,
  rww_lines_enabled: false,
  rww_lines_count: 2,
  rww_font_size: 36,
  custom_rww_playback_presets: [] as PlaybackPreset[],
  custom_palettes: [] as ReaderPalette[],
  custom_text_presets: [] as TextSizePreset[],
  custom_font_presets: [] as FontPreset[],
  custom_playback_presets: [] as PlaybackPreset[],
  custom_reader_configs: [] as ReaderConfig[],
  custom_transmute_presets: [] as TransmutePreset[],
}

/**
 * Keys that consumers may legitimately omit. They always carry a value after a
 * load through `parseSettings` (they are present in `DEFAULT_SETTINGS`), but the
 * Read-while-working override fields and custom-preset collections are treated
 * as optional by renderer code that constructs partial settings objects.
 */
type OptionalSettingKeys =
  | 'read_while_working_enabled'
  | 'read_while_working_shortcut'
  | 'read_while_working_exit_shortcut'
  | 'read_while_working_window_width'
  | 'read_while_working_window_height'
  | 'read_while_working_restore_clipboard'
  | 'read_while_working_show_standby_control'
  | 'read_while_working_standby_x'
  | 'read_while_working_standby_y'
  | 'rww_bpm'
  | 'rww_words_per_stack'
  | 'rww_stacks_visible'
  | 'rww_lines_enabled'
  | 'rww_lines_count'
  | 'rww_font_size'
  | 'custom_rww_playback_presets'
  | 'custom_transmute_presets'

type RawSettings = typeof DEFAULT_SETTINGS

export type Settings = Omit<RawSettings, OptionalSettingKeys> &
  Partial<Pick<RawSettings, OptionalSettingKeys>>

// ── Mode-scoped settings store (ADR-0008) ────────────────────────────────────
//
// The flat `Settings` object above remains the canonical on-the-wire and
// effective shape consumed by the reader engine and the existing UI. ADR-0008
// introduces a *mode-scoped* view of the same fields so Settings can be edited
// per mode (Global / Standard Reader / Read While Working) and so RWW can carry
// only deltas over the live Standard Reader values.
//
// On disk the store is persisted nested; `flattenSettingsStore` projects it back
// to the flat `Settings` shape (so every existing consumer keeps working) and
// `settingsStoreFromFlat` migrates a legacy flat `settings` object — or
// re-normalises an already-nested store — into the canonical store.

/** Settings that are app/import/data scoped — never reader playback/display. */
const GLOBAL_SETTING_KEYS = [
  'theme',
  'segmentation_enabled',
  'segmentation_threshold',
  'segmentation_chunk_size',
  'auto_chapter_detection',
  'summaries_initialized',
  'chunk_rule_long_word',
  'chunk_rule_enumerations',
  'chunk_rule_bullets',
  'chunk_rule_commas',
  'chunk_rule_names',
  'chunk_rule_headlines',
  'read_while_working_enabled',
  'custom_transmute_presets'
] as const

/** The full Standard Reader field set (playback + display + reader presets). */
const READER_SETTING_KEYS = [
  'words_per_stack',
  'stacks_visible',
  'stack_gap',
  'bpm',
  'metronome_enabled',
  'pause_at_sentences',
  'pause_at_headlines',
  'font_size',
  'stack_vertical_offset',
  'stack_horizontal_offset',
  'highlight_active',
  'lines_enabled',
  'lines_count',
  'lines_row_gap',
  'view_style',
  'show_chunk_dividers',
  'highlight_color',
  'viewport_bg_color',
  'text_color',
  'font_family',
  'highlight_text_color',
  'highlight_mode',
  'highlight_panning_chunk_size',
  'highlighting_mode',
  'tap_to_read',
  'tap_to_read_key',
  'live_rewind_stacks',
  'live_rewind_key',
  'lock_at_wpm',
  'target_wpm',
  'custom_palettes',
  'custom_text_presets',
  'custom_font_presets',
  'custom_playback_presets',
  'custom_reader_configs'
] as const

/** Fields that only exist in the RWW mode body (overlay/tray, not reader playback). */
const RWW_ONLY_KEYS = [
  'read_while_working_shortcut',
  'read_while_working_exit_shortcut',
  'read_while_working_window_width',
  'read_while_working_window_height',
  'read_while_working_restore_clipboard',
  'read_while_working_show_standby_control',
  'read_while_working_standby_x',
  'read_while_working_standby_y',
  'custom_rww_playback_presets'
] as const

/**
 * Maps the legacy flat RWW override keys to the Standard Reader field they
 * override. These are the only reader fields RWW can override in wave 1; the
 * store type permits a full `Partial<ReaderSettings>` so issues 04–05 can widen
 * the override surface without another migration.
 */
export const RWW_OVERRIDE_FLAT_TO_READER = {
  rww_bpm: 'bpm',
  rww_words_per_stack: 'words_per_stack',
  rww_stacks_visible: 'stacks_visible',
  rww_lines_enabled: 'lines_enabled',
  rww_lines_count: 'lines_count',
  rww_font_size: 'font_size'
} as const

type RwwOverrideFlatKey = keyof typeof RWW_OVERRIDE_FLAT_TO_READER

export type GlobalSettings = Pick<Settings, (typeof GLOBAL_SETTING_KEYS)[number]>
export type ReaderSettings = Pick<Settings, (typeof READER_SETTING_KEYS)[number]>
export type RwwOnlyFields = Pick<Settings, (typeof RWW_ONLY_KEYS)[number]>
/** RWW persists only overrides (deltas over Standard Reader) plus its own fields. */
export type RwwSettings = Partial<ReaderSettings> & RwwOnlyFields

export type SettingsMode = 'global' | 'reader' | 'rww'

export interface SettingsStore {
  global: GlobalSettings
  reader: ReaderSettings
  rww: RwwSettings
  // transmute is reserved (ADR-0008) — Transmute still uses transmuteConfig.ts in
  // wave 1, so the store does not own it yet.
}

/**
 * The Standard Reader fields RWW carries as its own independent config. Today
 * this is exactly the set with frozen `rww_*` flat projection keys + resolver
 * support (ADR-0008). ADR-0014 §5 makes `rww` author a *complete* copy of them
 * (see {@link seedRwwFromReader}); widening this set store-native is a future
 * slice (06b), at which point this constant — not new `rww_*` keys — grows.
 */
const RWW_READER_FIELDS = Object.values(RWW_OVERRIDE_FLAT_TO_READER) as (keyof ReaderSettings)[]

/**
 * Seeds `store.rww` into a complete, independent reader config: any RWW reader
 * field still unset inherits the current Standard Reader value, written in
 * explicitly. Mutates and returns the passed store.
 *
 * - **Idempotent** — fields already present are left untouched, so re-seeding an
 *   already-migrated store is a no-op.
 * - **Lossless** — an explicit RWW value always wins over the reader fallback.
 *
 * After seeding, every {@link RWW_READER_FIELDS} entry is present in `rww`, so
 * the resolver's `rww[field] ?? reader[field]` fallback (ADR-0008, unchanged)
 * never fires for RWW. This realises ADR-0014 §5's independent-config amendment
 * without touching the storage shape, the resolver, or the six frozen `rww_*`
 * projection keys: editing Standard Reader no longer bleeds into RWW because RWW
 * now owns explicit values, re-seeded losslessly on every load/save.
 */
function seedRwwFromReader(store: SettingsStore): SettingsStore {
  const rww = store.rww as Record<string, unknown>
  const reader = store.reader as Record<string, unknown>
  for (const field of RWW_READER_FIELDS) {
    if (rww[field] === undefined) rww[field] = reader[field]
  }
  return store
}

/**
 * Overwrites RWW's complete reader config from the current Standard Reader
 * config — the store-level primitive behind the RWW Console's "Copy from Reader
 * defaults" action (ADR-0014 §5). Unlike {@link seedRwwFromReader}, this
 * overwrites any existing RWW values. Pure: returns a new store, input untouched.
 */
export function copyReaderDefaultsToRww(store: SettingsStore): SettingsStore {
  const rww = { ...(store.rww as Record<string, unknown>) }
  const reader = store.reader as Record<string, unknown>
  for (const field of RWW_READER_FIELDS) {
    rww[field] = reader[field]
  }
  return { ...store, rww: rww as SettingsStore['rww'] }
}

function pickKeys<K extends string>(source: Record<string, unknown>, keys: readonly K[]): Pick<Settings, never> {
  const out: Record<string, unknown> = {}
  for (const key of keys) out[key] = source[key]
  return out as Pick<Settings, never>
}

/**
 * Canonical default store, derived from `DEFAULT_SETTINGS`. RWW is seeded into a
 * complete independent copy of the reader defaults (ADR-0014 §5) so a fresh
 * store matches `settingsStoreFromFlat({})` and the resolver never falls back.
 */
export function defaultSettingsStore(): SettingsStore {
  const base = parseSettings({}) as unknown as Record<string, unknown>
  return seedRwwFromReader({
    global: pickKeys(base, GLOBAL_SETTING_KEYS) as GlobalSettings,
    reader: pickKeys(base, READER_SETTING_KEYS) as ReaderSettings,
    rww: pickKeys(base, RWW_ONLY_KEYS) as RwwSettings
  })
}

function looksLikeStore(raw: unknown): raw is Partial<Record<keyof SettingsStore, unknown>> {
  if (raw === null || typeof raw !== 'object') return false
  const r = raw as Record<string, unknown>
  return (
    (typeof r.reader === 'object' && r.reader !== null) ||
    (typeof r.global === 'object' && r.global !== null) ||
    (typeof r.rww === 'object' && r.rww !== null)
  )
}

/** Collapses a nested store-shaped object into a single flat settings object. */
function flattenNestedRaw(raw: Partial<Record<keyof SettingsStore, unknown>>): Record<string, unknown> {
  const global = (raw.global ?? {}) as Record<string, unknown>
  const reader = (raw.reader ?? {}) as Record<string, unknown>
  const rww = (raw.rww ?? {}) as Record<string, unknown>
  const flat: Record<string, unknown> = { ...global, ...reader }
  for (const key of RWW_ONLY_KEYS) {
    if (rww[key] !== undefined) flat[key] = rww[key]
  }
  for (const flatKey of Object.keys(RWW_OVERRIDE_FLAT_TO_READER) as RwwOverrideFlatKey[]) {
    const readerField = RWW_OVERRIDE_FLAT_TO_READER[flatKey]
    if (rww[readerField] !== undefined) flat[flatKey] = rww[readerField]
  }
  return flat
}

/**
 * Splits a canonical flat `Settings` into the mode-scoped store. RWW override
 * fields land in `rww` only when present (so unset keys inherit at read time).
 */
function splitSettingsToStore(settings: Settings): SettingsStore {
  const flat = settings as unknown as Record<string, unknown>
  const store: SettingsStore = {
    global: pickKeys(flat, GLOBAL_SETTING_KEYS) as GlobalSettings,
    reader: pickKeys(flat, READER_SETTING_KEYS) as ReaderSettings,
    rww: pickKeys(flat, RWW_ONLY_KEYS) as RwwSettings
  }
  const rww = store.rww as Record<string, unknown>
  for (const flatKey of Object.keys(RWW_OVERRIDE_FLAT_TO_READER) as RwwOverrideFlatKey[]) {
    if (flat[flatKey] !== undefined) {
      rww[RWW_OVERRIDE_FLAT_TO_READER[flatKey]] = flat[flatKey]
    }
  }
  return store
}

/**
 * Migrates arbitrary stored settings into the canonical store. Accepts either a
 * legacy flat `settings` object or an already-nested store; both round-trip
 * losslessly because validation funnels through `parseSettings`.
 */
export function settingsStoreFromFlat(raw: unknown): SettingsStore {
  const flatInput = looksLikeStore(raw) ? flattenNestedRaw(raw) : raw
  // Seed `rww` into a complete independent set on every load (ADR-0014 §5). The
  // seed is idempotent + lossless, so this also serves as the one-time migration
  // for existing users without a version flag.
  return seedRwwFromReader(splitSettingsToStore(parseSettings(flatInput)))
}

/** Projects a store back to the flat `Settings` shape every consumer expects. */
export function flattenSettingsStore(store: SettingsStore): Settings {
  const flat: Record<string, unknown> = { ...DEFAULT_SETTINGS }
  for (const key of GLOBAL_SETTING_KEYS) flat[key] = (store.global as Record<string, unknown>)[key]
  for (const key of READER_SETTING_KEYS) flat[key] = (store.reader as Record<string, unknown>)[key]
  const rww = store.rww as Record<string, unknown>
  for (const key of RWW_ONLY_KEYS) {
    if (rww[key] !== undefined) flat[key] = rww[key]
  }
  // Strip default override keys first, then re-apply only the ones RWW set, so
  // `parseSettings` drops unset overrides (preserving inherit-at-read semantics).
  for (const flatKey of Object.keys(RWW_OVERRIDE_FLAT_TO_READER) as RwwOverrideFlatKey[]) {
    delete flat[flatKey]
    const readerField = RWW_OVERRIDE_FLAT_TO_READER[flatKey]
    if (rww[readerField] !== undefined) flat[flatKey] = rww[readerField]
  }
  return parseSettings(flat)
}

/** True when `value` has the same runtime shape as the default `reference`. */
function matchesShape(value: unknown, reference: unknown): boolean {
  if (Array.isArray(reference)) return Array.isArray(value)
  return value !== null && typeof value === typeof reference
}

// These keys are "inherit from main reader unless explicitly overridden." They
// remain undefined when absent from stored data so that downstream ?? operators
// correctly fall back to the corresponding main-reader setting.
const RWW_INHERIT_KEYS: ReadonlySet<string> = new Set([
  'rww_bpm',
  'rww_words_per_stack',
  'rww_stacks_visible',
  'rww_lines_enabled',
  'rww_lines_count',
  'rww_font_size',
])

// Used as denominators or loop bounds — a stored zero would cause a divide-by-
// zero or infinite loop, so clamp to the default rather than accepting 0.
const POSITIVE_FLOOR_KEYS: ReadonlySet<string> = new Set([
  'bpm',
  'words_per_stack',
  'live_rewind_stacks',
  'rww_bpm',
  'rww_words_per_stack',
])

const NULLABLE_NUMBER_KEYS: ReadonlySet<string> = new Set([
  'read_while_working_standby_x',
  'read_while_working_standby_y',
])

function resolveStoredValue(
  key: string,
  incoming: unknown,
  defaultValue: unknown
): unknown {
  if (NULLABLE_NUMBER_KEYS.has(key) && (incoming === null || typeof incoming === 'number')) {
    return incoming
  }
  if (!matchesShape(incoming, defaultValue)) {
    return Array.isArray(defaultValue) ? [...defaultValue] : defaultValue
  }
  if (POSITIVE_FLOOR_KEYS.has(key) && typeof incoming === 'number' && incoming < 1) {
    return defaultValue
  }
  return incoming
}

/**
 * Merges arbitrary incoming data with the canonical defaults: fields with a
 * matching runtime type are kept, everything else (missing, malformed, or
 * unknown) falls back to the default. Unknown keys are discarded. The result is
 * always a fully-populated, typed `Settings` value.
 *
 * RWW inherit keys (rww_bpm, rww_words_per_stack, etc.) are intentionally left
 * undefined when absent from stored data — callers use `?? mainSetting` to fall
 * back to the main-reader value for users who have never touched those overrides.
 */
export function parseSettings(raw: unknown): Settings {
  const input =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}

  const result: Record<string, unknown> = {}
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof RawSettings)[]) {
    if (!(key in input) && RWW_INHERIT_KEYS.has(key)) continue

    const defaultValue = DEFAULT_SETTINGS[key]
    const incoming = input[key]
    result[key] = resolveStoredValue(key, incoming, defaultValue)
  }
  return result as Settings
}
