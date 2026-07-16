import type {
  HighlightMode,
  HighlightingMode,
  ReaderConfig,
  Settings,
  TransmuteConfig,
  TransmutePreset
} from '../types'

export const TRANSMUTE_CONFIG_STORAGE_KEY = 'fasttrack.transmute.readerConfig.v1'

export interface ConfigStorage {
  get(key: string): string | null
  set(key: string, value: string): void
}

const localStorageImpl: ConfigStorage = {
  get(key) {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null
      return window.localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set(key, value) {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return
      window.localStorage.setItem(key, value)
    } catch {
      // best-effort
    }
  }
}

let _configStorage: ConfigStorage = localStorageImpl

export function setConfigStorage(impl: ConfigStorage): void {
  _configStorage = impl
}

export const TRANSMUTE_BPM_MIN = 20
export const TRANSMUTE_BPM_MAX = 5000
export const TRANSMUTE_BPM_STEP = 5
export const TRANSMUTE_WPS_MIN = 1
export const TRANSMUTE_WPS_MAX = 20
export const TRANSMUTE_WPS_STEP = 1

export type StoredTransmuteConfig = Omit<TransmuteConfig, 'textId' | 'segmentId'>

const RESOLUTIONS = ['1280x720', '1920x1080', '1080x1920', '720x720'] as const
const CONTENT_LIMIT_TYPES = ['none', 'words', 'percentage'] as const
const HIGHLIGHT_MODES: HighlightMode[] = ['default', 'progressive-bar', 'panning-bar']
const HIGHLIGHTING_MODES: HighlightingMode[] = ['default', 'progressive']

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val))
}

function asFiniteNumber(raw: unknown, fallback: number): number {
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

function asString(raw: unknown, fallback: string): string {
  return typeof raw === 'string' ? raw : fallback
}

function asBoolean(raw: unknown, fallback: boolean): boolean {
  return typeof raw === 'boolean' ? raw : fallback
}

function asNullablePositiveNumber(raw: unknown, fallback: number | null): number | null {
  if (raw === null || raw === '' || raw === undefined) return fallback
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function asTheme(raw: unknown, fallback: Settings['theme']): Settings['theme'] {
  return raw === 'light' || raw === 'dark' ? raw : fallback
}

function asHighlightMode(raw: unknown, fallback: HighlightMode): HighlightMode {
  return HIGHLIGHT_MODES.includes(raw as HighlightMode) ? raw as HighlightMode : fallback
}

function asHighlightingMode(raw: unknown, fallback: HighlightingMode): HighlightingMode {
  return HIGHLIGHTING_MODES.includes(raw as HighlightingMode) ? raw as HighlightingMode : fallback
}

function asResolution(raw: unknown, fallback: TransmuteConfig['resolution']): TransmuteConfig['resolution'] {
  return RESOLUTIONS.includes(raw as TransmuteConfig['resolution'])
    ? raw as TransmuteConfig['resolution']
    : fallback
}

function asContentLimitType(
  raw: unknown,
  fallback: TransmuteConfig['contentLimitType']
): TransmuteConfig['contentLimitType'] {
  return CONTENT_LIMIT_TYPES.includes(raw as TransmuteConfig['contentLimitType'])
    ? raw as TransmuteConfig['contentLimitType']
    : fallback
}

export function defaultReaderBg(theme: Settings['theme']): string {
  return theme === 'light' ? '#fbf7ee' : '#0d0d0d'
}

export function defaultReaderFg(theme: Settings['theme']): string {
  return theme === 'light' ? '#1a1a1a' : '#f4f0e6'
}

/** Extract all Reader-derived fields from Settings into their TransmuteConfig counterparts. */
export function readerFieldsFromSettings(
  settings: Settings
): Omit<
  TransmuteConfig,
  | 'textId'
  | 'segmentId'
  | 'resolution'
  | 'maxDurationMinutes'
  | 'contentLimitType'
  | 'contentLimitWords'
  | 'contentLimitPercentage'
  | 'showProgressOverlay'
  | 'bgColorOverride'
  | 'transparentBackground'
> {
  const theme = settings.theme ?? 'dark'
  return {
    bpm: settings.bpm,
    wordsPerStack: settings.words_per_stack,
    pauseAtSentences: settings.pause_at_sentences,
    pauseAtHeadlines: settings.pause_at_headlines,
    fontSize: settings.font_size,
    fontFamily: settings.font_family || '',
    theme,
    bgColor: settings.viewport_bg_color || defaultReaderBg(theme),
    textColor: settings.text_color || defaultReaderFg(theme),
    stackVerticalOffset: settings.stack_vertical_offset,
    stackHorizontalOffset: settings.stack_horizontal_offset,
    highlightActive: settings.highlight_active,
    highlightColor: settings.highlight_color || '',
    highlightTextColor: settings.highlight_text_color,
    highlightMode: settings.highlight_mode ?? 'default',
    highlightPanningChunkSize: settings.highlight_panning_chunk_size ?? 0,
    highlightingMode: settings.highlighting_mode ?? 'default',
    linesEnabled: settings.lines_enabled,
    linesCount: settings.lines_count,
    linesRowGap: settings.lines_row_gap,
    stacksVisible: settings.stacks_visible,
    stackGap: settings.stack_gap,
    showChunkDividers: settings.show_chunk_dividers,
    chunkRuleLongWord: settings.chunk_rule_long_word,
    chunkRuleEnumerations: settings.chunk_rule_enumerations,
    chunkRuleBullets: settings.chunk_rule_bullets,
    chunkRuleCommas: settings.chunk_rule_commas,
    chunkRuleNames: settings.chunk_rule_names
  }
}

function readerFieldsFromReaderConfig(
  readerConfig: ReaderConfig,
  theme: Settings['theme']
): Pick<
  StoredTransmuteConfig,
  | 'bpm'
  | 'wordsPerStack'
  | 'pauseAtSentences'
  | 'pauseAtHeadlines'
  | 'fontSize'
  | 'fontFamily'
  | 'theme'
  | 'bgColor'
  | 'textColor'
  | 'stackVerticalOffset'
  | 'stackHorizontalOffset'
  | 'highlightActive'
  | 'highlightColor'
  | 'highlightTextColor'
  | 'highlightMode'
  | 'highlightPanningChunkSize'
  | 'highlightingMode'
  | 'linesEnabled'
  | 'linesCount'
  | 'linesRowGap'
  | 'stacksVisible'
  | 'stackGap'
  | 'showChunkDividers'
> {
  return {
    bpm: readerConfig.bpm,
    wordsPerStack: readerConfig.words_per_stack,
    pauseAtSentences: readerConfig.pause_at_sentences,
    pauseAtHeadlines: readerConfig.pause_at_headlines,
    fontSize: readerConfig.font_size,
    fontFamily: readerConfig.font_family || '',
    theme,
    bgColor: readerConfig.viewport_bg_color || defaultReaderBg(theme),
    textColor: readerConfig.text_color || defaultReaderFg(theme),
    stackVerticalOffset: readerConfig.stack_vertical_offset,
    stackHorizontalOffset: readerConfig.stack_horizontal_offset,
    highlightActive: readerConfig.highlight_active,
    highlightColor: readerConfig.highlight_color || '',
    highlightTextColor: readerConfig.highlight_text_color,
    highlightMode: readerConfig.highlight_mode ?? 'default',
    highlightPanningChunkSize: readerConfig.highlight_panning_chunk_size ?? 0,
    highlightingMode: readerConfig.highlighting_mode ?? 'default',
    linesEnabled: readerConfig.lines_enabled,
    linesCount: readerConfig.lines_count,
    linesRowGap: readerConfig.lines_row_gap,
    stacksVisible: readerConfig.stacks_visible,
    stackGap: readerConfig.stack_gap,
    showChunkDividers: readerConfig.show_chunk_dividers
  }
}

export function applyReaderConfigToTransmuteConfig(
  current: TransmuteConfig,
  readerConfig: ReaderConfig
): TransmuteConfig {
  return {
    ...current,
    ...readerFieldsFromReaderConfig(readerConfig, current.theme ?? 'dark')
  }
}

export function makeDefaultTransmuteConfig(settings: Settings): StoredTransmuteConfig {
  return {
    ...readerFieldsFromSettings(settings),
    resolution: '1280x720',
    maxDurationMinutes: null,
    contentLimitType: 'none',
    contentLimitWords: 1000,
    contentLimitPercentage: 100,
    showProgressOverlay: false,
    bgColorOverride: '',
    transparentBackground: false
  }
}

function normalizeStoredTransmuteConfig(
  raw: unknown,
  defaults: StoredTransmuteConfig
): StoredTransmuteConfig {
  if (!raw || typeof raw !== 'object') return defaults
  const r = raw as Record<string, unknown>
  const theme = asTheme(r.theme, defaults.theme)

  return {
    bpm: clamp(asFiniteNumber(r.bpm, defaults.bpm), TRANSMUTE_BPM_MIN, TRANSMUTE_BPM_MAX),
    wordsPerStack: clamp(
      Math.round(asFiniteNumber(r.wordsPerStack, defaults.wordsPerStack)),
      TRANSMUTE_WPS_MIN,
      TRANSMUTE_WPS_MAX
    ),
    pauseAtSentences: asBoolean(r.pauseAtSentences, defaults.pauseAtSentences),
    pauseAtHeadlines: asBoolean(r.pauseAtHeadlines, defaults.pauseAtHeadlines),
    fontSize: clamp(asFiniteNumber(r.fontSize, defaults.fontSize), 6, 240),
    fontFamily: asString(r.fontFamily, defaults.fontFamily),
    theme,
    bgColor: asString(r.bgColor, defaults.bgColor || defaultReaderBg(theme)),
    textColor: asString(r.textColor, defaults.textColor || defaultReaderFg(theme)),
    stackVerticalOffset: asFiniteNumber(r.stackVerticalOffset, defaults.stackVerticalOffset),
    stackHorizontalOffset: asFiniteNumber(r.stackHorizontalOffset, defaults.stackHorizontalOffset),
    highlightActive: asBoolean(r.highlightActive, defaults.highlightActive),
    highlightColor: asString(r.highlightColor, defaults.highlightColor),
    highlightTextColor: asString(r.highlightTextColor, defaults.highlightTextColor),
    highlightMode: asHighlightMode(r.highlightMode, defaults.highlightMode),
    highlightPanningChunkSize: Math.max(
      0,
      Math.round(asFiniteNumber(r.highlightPanningChunkSize, defaults.highlightPanningChunkSize))
    ),
    highlightingMode: asHighlightingMode(r.highlightingMode, defaults.highlightingMode),
    linesEnabled: asBoolean(r.linesEnabled, defaults.linesEnabled),
    linesCount: Math.max(1, Math.round(asFiniteNumber(r.linesCount, defaults.linesCount))),
    linesRowGap: Math.max(0, asFiniteNumber(r.linesRowGap, defaults.linesRowGap)),
    stacksVisible: Math.max(1, Math.round(asFiniteNumber(r.stacksVisible, defaults.stacksVisible))),
    stackGap: Math.max(0, asFiniteNumber(r.stackGap, defaults.stackGap)),
    showChunkDividers: asBoolean(r.showChunkDividers, defaults.showChunkDividers),
    chunkRuleLongWord: asBoolean(r.chunkRuleLongWord, defaults.chunkRuleLongWord),
    chunkRuleEnumerations: asBoolean(r.chunkRuleEnumerations, defaults.chunkRuleEnumerations),
    chunkRuleBullets: asBoolean(r.chunkRuleBullets, defaults.chunkRuleBullets),
    chunkRuleCommas: asBoolean(r.chunkRuleCommas, defaults.chunkRuleCommas),
    chunkRuleNames: asBoolean(r.chunkRuleNames, defaults.chunkRuleNames),
    resolution: asResolution(r.resolution, defaults.resolution),
    maxDurationMinutes: asNullablePositiveNumber(r.maxDurationMinutes, defaults.maxDurationMinutes),
    contentLimitType: asContentLimitType(r.contentLimitType, defaults.contentLimitType),
    contentLimitWords: Math.max(1, Math.round(asFiniteNumber(r.contentLimitWords, defaults.contentLimitWords))),
    contentLimitPercentage: clamp(
      Math.round(asFiniteNumber(r.contentLimitPercentage, defaults.contentLimitPercentage)),
      1,
      100
    ),
    showProgressOverlay: asBoolean(r.showProgressOverlay, defaults.showProgressOverlay),
    bgColorOverride: asString(r.bgColorOverride, defaults.bgColorOverride),
    transparentBackground: asBoolean(r.transparentBackground, defaults.transparentBackground)
  }
}

export function loadStoredTransmuteConfig(settings: Settings): StoredTransmuteConfig {
  const defaults = makeDefaultTransmuteConfig(settings)
  try {
    const raw = _configStorage.get(TRANSMUTE_CONFIG_STORAGE_KEY)
    if (!raw) return defaults
    return normalizeStoredTransmuteConfig(JSON.parse(raw), defaults)
  } catch {
    return defaults
  }
}

export function persistTransmuteConfig(config: TransmuteConfig | StoredTransmuteConfig) {
  try {
    const {
      textId: _textId,
      segmentId: _segmentId,
      ...stored
    } = config as TransmuteConfig
    _configStorage.set(TRANSMUTE_CONFIG_STORAGE_KEY, JSON.stringify(stored))
  } catch {
    // Storage is best-effort; rendering should continue even if persistence is unavailable.
  }
}

export function transmuteConfigToSettings(
  config: StoredTransmuteConfig,
  base: Settings
): Settings {
  return {
    ...base,
    theme: config.theme,
    bpm: config.bpm,
    words_per_stack: config.wordsPerStack,
    pause_at_sentences: config.pauseAtSentences,
    pause_at_headlines: config.pauseAtHeadlines,
    font_size: config.fontSize,
    font_family: config.fontFamily,
    viewport_bg_color: config.bgColor,
    text_color: config.textColor,
    stack_vertical_offset: config.stackVerticalOffset,
    stack_horizontal_offset: config.stackHorizontalOffset,
    highlight_active: config.highlightActive,
    highlight_color: config.highlightColor,
    highlight_text_color: config.highlightTextColor,
    highlight_mode: config.highlightMode,
    highlight_panning_chunk_size: config.highlightPanningChunkSize,
    highlighting_mode: config.highlightingMode,
    lines_enabled: config.linesEnabled,
    lines_count: config.linesCount,
    lines_row_gap: config.linesRowGap,
    stacks_visible: config.stacksVisible,
    stack_gap: config.stackGap,
    show_chunk_dividers: config.showChunkDividers,
    chunk_rule_long_word: config.chunkRuleLongWord,
    chunk_rule_enumerations: config.chunkRuleEnumerations,
    chunk_rule_bullets: config.chunkRuleBullets,
    chunk_rule_commas: config.chunkRuleCommas,
    chunk_rule_names: config.chunkRuleNames
  }
}

export function transmutePresetFromConfig(
  name: string,
  config: TransmuteConfig | StoredTransmuteConfig
): TransmutePreset {
  const {
    textId: _textId,
    segmentId: _segmentId,
    ...fields
  } = config as TransmuteConfig

  return {
    id: generateTransmutePresetId(),
    name,
    ...fields
  }
}

export function applyTransmutePreset(
  current: TransmuteConfig,
  preset: TransmutePreset
): TransmuteConfig {
  const { id: _id, name: _name, ...fields } = preset
  return {
    ...current,
    ...fields
  }
}

export function transmutePresetMatchesConfig(
  preset: TransmutePreset,
  config: TransmuteConfig | StoredTransmuteConfig
): boolean {
  const { id: _id, name: _name, ...fields } = preset
  return Object.entries(fields).every(([key, value]) =>
    (config as unknown as Record<string, unknown>)[key] === value
  )
}

function validateTransmutePreset(
  raw: unknown,
  defaults: StoredTransmuteConfig
): TransmutePreset | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || !r.id) return null
  if (typeof r.name !== 'string' || !r.name) return null
  return {
    id: r.id,
    name: r.name,
    ...normalizeStoredTransmuteConfig(raw, defaults)
  }
}

export function validateTransmutePresets(
  raw: unknown,
  defaults: StoredTransmuteConfig
): TransmutePreset[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item) => validateTransmutePreset(item, defaults)).filter((p): p is TransmutePreset => p !== null)
}

function generateTransmutePresetId(): string {
  return `custom:transmute:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}
