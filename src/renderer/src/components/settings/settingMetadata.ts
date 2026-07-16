/**
 * Declarative setting-metadata table — the single source every settings surface
 * (Reader-defaults grid, Quick Settings, RWW Console, General) renders from, so a
 * given setting can never drift in how it looks or behaves across surfaces.
 *
 * Encodes `.scratch/settings-rework/metadata-roster.md` verbatim: the field
 * roster, groups, instruments, ranges/steps, reveal gates
 * and inline explanations are already resolved there — this file does not
 * re-derive or re-bucket them. Decisions D1–D4 in that roster are deferred to
 * their consuming slice (02/03/06); the ranges below are the *current* shipped
 * values (e.g. words_per_stack 1–10), and the ADR-0014 §3 tightening (1–5, etc.)
 * lands with its slice's clamp-on-load migration. Where the roster's range
 * differs, a `// D1` comment marks the future tightening.
 *
 * Instrument `Slider` == the extracted `SliderField` (range + numeric entry);
 * non-linear sliders carry a `transform`. `highlighting_mode` is intentionally
 * absent — it is a derived twin written alongside `highlight_mode`, not its own
 * row (see the writer in `readerConfig/HighlightModeRow.tsx`).
 */

import type { Settings } from '../../types'
import type { SliderTransform } from './instruments/SliderField'
import type { SegmentedOption } from './instruments/Segmented'
import {
  BPM_SLIDER_MIN,
  BPM_SLIDER_MAX,
  BPM_SLIDER_STEP,
  bpmToSlider,
  sliderToBpm,
  clampReaderBpm,
} from '../../engine/bpmScale'
import {
  READER_TARGET_WPM_SLIDER_MIN,
  READER_TARGET_WPM_SLIDER_MAX,
  READER_TARGET_WPM_SLIDER_STEP,
  readerTargetWpmToSlider,
  sliderToReaderTargetWpm,
} from '../../engine/wpmSolver'

export type Instrument =
  | 'Toggle'
  | 'Stepper'
  | 'Slider'
  | 'Segmented'
  | 'Colour'
  | 'Palette'
  | 'KeyCapture'
  | 'Text'

/** Reader-config groups (Playback · Text · Layout · Highlight · Colours),
 *  the Alignment/Spacing group, and the RWW-only Overlay & Shortcuts card.
 *  (The `calm`/`power` tier concept was dissolved — ADR-0019 §2/§4.) */
export type SettingGroup =
  | 'playback'
  | 'text'
  | 'layout'
  | 'highlight'
  | 'colours'
  | 'alignment'
  | 'overlay'

export interface SettingMeta {
  /** Settings key, or a sentinel (`'palette'`) for non-single-field controls. */
  field: string
  group: SettingGroup
  instrument: Instrument
  label: string
  /** Canonical default (mirrors `DEFAULT_SETTINGS`; pinned by a drift test). */
  defaultValue?: Settings[keyof Settings]
  /** Numeric bounds/step for Stepper / Slider instruments. */
  min?: number
  max?: number
  step?: number
  /** Non-linear value↔slider mapping for Slider instruments that need it. */
  transform?: SliderTransform
  /** Domain clamp for the numeric entry (defaults to a plain min/max clamp). */
  clampValue?: (value: number) => number
  /** Choices for Segmented instruments. */
  options?: ReadonlyArray<SegmentedOption<string | boolean>>
  /** Theme-default swatches for Colour rows (shown when the value is blank). */
  colourDefaults?: { light: string; dark: string }
  /** Predicate gating row visibility; absent === always visible. */
  reveal?: (s: Settings) => boolean
  /** Predicate that disables (but still shows) the row. */
  disabledWhen?: (s: Settings) => boolean
  /** Inline per-setting explanation — only the abstract settings earn one. */
  explain?: string
}

// ── Non-linear slider transforms (preserve existing BPM / Target-WPM feel) ────

export const BPM_SLIDER_TRANSFORM: SliderTransform = {
  toSlider: bpmToSlider,
  fromSlider: sliderToBpm,
  sliderMin: BPM_SLIDER_MIN,
  sliderMax: BPM_SLIDER_MAX,
  sliderStep: BPM_SLIDER_STEP,
}

export const TARGET_WPM_SLIDER_TRANSFORM: SliderTransform = {
  toSlider: readerTargetWpmToSlider,
  fromSlider: sliderToReaderTargetWpm,
  sliderMin: READER_TARGET_WPM_SLIDER_MIN,
  sliderMax: READER_TARGET_WPM_SLIDER_MAX,
  sliderStep: READER_TARGET_WPM_SLIDER_STEP,
}

// ── Playback ──────────────────────────────────────────────────────────────────

const PLAYBACK: SettingMeta[] = [
  {
    field: 'tap_to_read',
    group: 'playback',
    instrument: 'Segmented',
    label: 'Advance mode',
    defaultValue: false,
    options: [
      { value: false, label: 'BPM' },
      { value: true, label: 'Tap to Read' },
    ],
    explain: 'BPM auto-advances each stack on a beat; Tap to Read waits for a keypress before each stack.',
  },
  {
    field: 'tap_to_read_key',
    group: 'playback',
    instrument: 'KeyCapture',
    label: 'Tap key',
    defaultValue: 'Space',
    reveal: (s) => s.tap_to_read === true,
  },
  {
    field: 'live_rewind_stacks',
    group: 'playback',
    instrument: 'Stepper',
    label: 'Live rewind step',
    defaultValue: 1,
    min: 1,
    max: 10,
    step: 1,
    explain: 'Stacks to jump back on live rewind without pausing playback.',
  },
  {
    field: 'live_rewind_key',
    group: 'playback',
    instrument: 'KeyCapture',
    label: 'Live rewind key',
    defaultValue: 'Mouse1',
    explain: 'Key or mouse button for in-flow rewind while playing or paused.',
  },
  {
    field: 'bpm',
    group: 'playback',
    instrument: 'Slider',
    label: 'Speed',
    defaultValue: 60,
    min: 20,
    max: 650,
    step: 5,
    transform: BPM_SLIDER_TRANSFORM,
    clampValue: clampReaderBpm,
    // Speed shows in every BPM-mode context. `lock_at_wpm` is de-UI'd (ADR-0019
    // §4) so it no longer gates Speed — a stored lock can't strand the control.
    reveal: (s) => !s.tap_to_read,
  },
  {
    field: 'words_per_stack',
    group: 'playback',
    instrument: 'Stepper',
    label: 'Words per stack',
    defaultValue: 3,
    min: 1,
    max: 10, // D1: tighten to 1–5 with clamp-on-load in slice 02
    step: 1,
    // Always visible — a pure grid parameter now (moved to Grid Layout, ADR-0019).
  },
  {
    field: 'pause_at_sentences',
    group: 'playback',
    instrument: 'Toggle',
    label: 'Pause at sentences',
    defaultValue: true,
  },
  {
    field: 'pause_at_headlines',
    group: 'playback',
    instrument: 'Toggle',
    label: 'Pause at headlines',
    defaultValue: true,
  },
  {
    field: 'metronome_enabled',
    group: 'playback',
    instrument: 'Toggle',
    label: 'Metronome',
    defaultValue: false,
  },
]

// ── Text ──────────────────────────────────────────────────────────────────────

const TEXT: SettingMeta[] = [
  {
    field: 'font_size',
    group: 'text',
    instrument: 'Slider', // issue-01 proof-of-wiring field
    label: 'Font size',
    defaultValue: 36,
    min: 18,
    max: 96,
    step: 2,
  },
  {
    field: 'font_family',
    group: 'text',
    instrument: 'Text',
    label: 'Font family',
    defaultValue: '',
  },
]

// ── Layout ──────────────────────────────────────────────────────────────────

const LAYOUT: SettingMeta[] = [
  {
    field: 'stacks_visible',
    group: 'layout',
    instrument: 'Stepper',
    label: 'Stacks visible',
    defaultValue: 1,
    min: 1,
    max: 8, // D1: tighten to 1–5 with clamp-on-load in slice 02
    step: 1,
    explain: 'How many word stacks sit side by side before the view redraws.',
  },
  {
    field: 'lines_enabled',
    group: 'layout',
    instrument: 'Toggle',
    label: 'Multiple lines',
    defaultValue: false,
  },
  {
    field: 'lines_count',
    group: 'layout',
    instrument: 'Stepper',
    label: 'Lines per screen',
    defaultValue: 3,
    min: 2,
    max: 10, // D1: tighten to 2–6 with clamp-on-load in slice 02
    step: 1,
    reveal: (s) => s.lines_enabled === true,
  },
]

// ── Highlight ─────────────────────────────────────────────────────────────────

const HIGHLIGHT: SettingMeta[] = [
  {
    field: 'highlight_active',
    group: 'highlight',
    instrument: 'Toggle',
    label: 'Highlight word stack',
    defaultValue: true,
  },
  {
    field: 'highlight_mode',
    group: 'highlight',
    instrument: 'Segmented',
    label: 'Highlight mode',
    defaultValue: 'default',
    // Also writes the legacy `highlighting_mode` twin (see file header).
    options: [
      { value: 'default', label: 'Default' },
      { value: 'progressive-bar', label: 'Progressive' },
      { value: 'panning-bar', label: 'Panning' },
    ],
    // Nested under the Highlight toggle (ADR-0019 Text & Highlighting).
    reveal: (s) => s.highlight_active === true,
    explain: 'Default highlights the whole active stack; Progressive fills it word by word; Panning slides a fixed-size bar across.',
  },
  {
    field: 'highlight_panning_chunk_size',
    group: 'highlight',
    instrument: 'Stepper',
    label: 'Panning chunk size',
    defaultValue: 0,
    min: 0,
    max: 20,
    step: 1,
    // Gated on both owners so a stored 'panning-bar' can't orphan the row when
    // highlighting is off (its parent Highlight-mode row is hidden then too).
    reveal: (s) => s.highlight_active === true && s.highlight_mode === 'panning-bar',
    explain: 'Words covered by the panning bar at once; 0 uses the current stacks-visible count.',
  },
]

// ── Colours ───────────────────────────────────────────────────────────────────

const COLOURS: SettingMeta[] = [
  {
    field: 'palette',
    group: 'colours',
    instrument: 'Palette',
    label: 'Palette',
    // Relocates into this card's focused editor in slice 04.
  },
  {
    field: 'text_color',
    group: 'colours',
    instrument: 'Colour',
    label: 'Text color',
    defaultValue: '',
    colourDefaults: { light: '#111111', dark: '#f0f0f0' },
  },
  {
    field: 'viewport_bg_color',
    group: 'colours',
    instrument: 'Colour',
    label: 'Background color',
    defaultValue: '',
    colourDefaults: { light: '#fafafa', dark: '#0d0d0d' },
  },
  {
    field: 'highlight_color',
    group: 'colours',
    instrument: 'Colour',
    label: 'Highlight color',
    defaultValue: '',
    colourDefaults: { light: '#111111', dark: '#f0f0f0' },
    reveal: (s) => s.highlight_active === true,
  },
  {
    field: 'highlight_text_color',
    group: 'colours',
    instrument: 'Colour',
    label: 'Highlighted text color',
    defaultValue: '',
    colourDefaults: { light: '#ffffff', dark: '#000000' },
    reveal: (s) => s.highlight_active === true,
    explain: 'Auto-selects the highest-contrast text color against the highlight when left unset.',
  },
]

// ── Alignment (the Spacing section in the two-tab editor — ADR-0019) ────────────

const ALIGNMENT: SettingMeta[] = [
  {
    field: 'lines_row_gap',
    group: 'alignment',
    instrument: 'Slider',
    label: 'Row gap',
    defaultValue: 8,
    min: 0,
    max: 64,
    step: 4,
    disabledWhen: (s) => !s.lines_enabled,
  },
  {
    field: 'stack_gap',
    group: 'alignment',
    instrument: 'Slider',
    label: 'Stack gap',
    defaultValue: 32,
    min: 8,
    max: 80,
    step: 4,
  },
  {
    field: 'stack_vertical_offset',
    group: 'alignment',
    instrument: 'Slider',
    label: 'Vertical offset',
    defaultValue: 0,
    min: -200,
    max: 200,
    step: 8,
  },
  {
    field: 'stack_horizontal_offset',
    group: 'alignment',
    instrument: 'Slider',
    label: 'Horizontal offset',
    defaultValue: 0,
    min: -200,
    max: 200,
    step: 8,
  },
]

// ── RWW-only: Overlay & Shortcuts card (issue 06) ─────────────────────────────

const OVERLAY: SettingMeta[] = [
  {
    field: 'read_while_working_window_width',
    group: 'overlay',
    instrument: 'Slider',
    label: 'Overlay width',
    defaultValue: 640,
    // D2: proposed range, pending confirm at slice 06.
    min: 320,
    max: 1280,
    step: 20,
  },
  {
    field: 'read_while_working_window_height',
    group: 'overlay',
    instrument: 'Slider',
    label: 'Overlay height',
    defaultValue: 360,
    // D2: proposed range, pending confirm at slice 06.
    min: 180,
    max: 800,
    step: 20,
  },
  {
    field: 'read_while_working_shortcut',
    group: 'overlay',
    instrument: 'KeyCapture',
    label: 'Summon shortcut',
    defaultValue: 'Control+Space',
    explain: 'Global hotkey that summons the overlay from any app.',
  },
  {
    field: 'read_while_working_exit_shortcut',
    group: 'overlay',
    instrument: 'KeyCapture',
    label: 'Exit shortcut',
    defaultValue: 'Control+Space',
    explain: 'Global hotkey that hides the overlay back to the tray.',
  },
  {
    field: 'read_while_working_restore_clipboard',
    group: 'overlay',
    instrument: 'Toggle',
    label: 'Restore clipboard',
    defaultValue: true,
    explain: 'Restores whatever was on the clipboard after the overlay captures selected text.',
  },
]

// ── Assembled table ───────────────────────────────────────────────────────────

/** The five calm cards in their laid-out order (3 + 2, mirroring the hub). */
export const READER_CALM_GROUPS: SettingGroup[] = ['playback', 'text', 'layout', 'highlight', 'colours']

/** Ordered rows for every group — surfaces iterate these, never redefine them. */
export const SETTING_GROUP_FIELDS: Record<SettingGroup, SettingMeta[]> = {
  playback: PLAYBACK,
  text: TEXT,
  layout: LAYOUT,
  highlight: HIGHLIGHT,
  colours: COLOURS,
  alignment: ALIGNMENT,
  overlay: OVERLAY,
}

const ALL_META: SettingMeta[] = [
  ...PLAYBACK,
  ...TEXT,
  ...LAYOUT,
  ...HIGHLIGHT,
  ...COLOURS,
  ...ALIGNMENT,
  ...OVERLAY,
]

/** Field → metadata lookup. Surfaces read range/step/instrument/explain here. */
export const SETTING_METADATA: Record<string, SettingMeta> = Object.fromEntries(
  ALL_META.map((meta) => [meta.field, meta])
)

/** Narrow accessor that throws on an unknown field (catches typos at call sites). */
export function settingMeta(field: string): SettingMeta {
  const meta = SETTING_METADATA[field]
  if (!meta) throw new Error(`No setting metadata for field "${field}"`)
  return meta
}
