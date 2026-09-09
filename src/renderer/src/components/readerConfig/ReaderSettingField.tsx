import React from 'react'
import type { Settings, ReaderPalette } from '../../types'
import { settingMeta, type SettingMeta } from '../settings/settingMetadata'
import SettingToggleRow from '../SettingToggleRow'
import SliderField from '../settings/instruments/SliderField'
import Segmented from '../settings/instruments/Segmented'
import Stepper from '../settings/instruments/Stepper'
import ColorSettingRow from './ColorSettingRow'
import HighlightModeRow from './HighlightModeRow'
import SettingsLabel from '../settings/SettingsLabel'
import AdvanceKeyRow from './AdvanceKeyRow'
import LiveRewindKeyRow from './LiveRewindKeyRow'
import PaletteSelector from '../PaletteSelector'
import { PRESET_PALETTES, validatePalettes } from '../../engine/palettes'
import { effectiveLinesCount, linesCountPatch } from '../../../../shared/settings'

interface Props {
  field: string
  local: Settings
  update: (patch: Partial<Settings>) => void
  /** Immediate (non-debounced) saver for discrete actions like palette add/delete. */
  onSave: (patch: Partial<Settings>) => void
}

/**
 * Renders one Reader setting row from the metadata table, placed by the layout
 * descriptor (`readerSettingsLayout.ts`). A handful of load-bearing rows are
 * bespoke — the Advance-mode segmented, the Speed WPM readout, the font-family
 * text box, the highlight-mode twin writer (`HighlightModeRow`), and palette
 * add/delete — reusing the same components the retired calm grid used. Every
 * other row is generic, dispatched by the field's metadata `instrument` so new
 * plain fields need no code here.
 *
 * Row visibility comes from the metadata `reveal` predicate (the single source);
 * `disabledWhen` shows-but-disables. Fields the descriptor never places don't
 * reach here, so culled/dormant keys (`view_style`, `show_chunk_dividers`,
 * `lock_at_wpm`) simply don't render.
 */
export default function ReaderSettingField({ field, local, update, onSave }: Props) {
  const meta = settingMeta(field)
  if (meta.reveal && !meta.reveal(local)) return null

  const bespoke = BESPOKE_RENDERERS[field]
  if (bespoke) return bespoke({ meta, local, update, onSave })
  return <GenericField meta={meta} local={local} update={update} />
}

// ── Bespoke rows ──────────────────────────────────────────────────────────────
// The handful of fields whose control can't be driven generically from metadata.
// A map (not a switch) keeps the dispatcher above flat.

interface FieldContext {
  meta: SettingMeta
  local: Settings
  update: (patch: Partial<Settings>) => void
  onSave: (patch: Partial<Settings>) => void
}

const BESPOKE_RENDERERS: Record<string, (ctx: FieldContext) => React.ReactNode> = {
  tap_to_read: ({ meta, local, update }) => (
    <LabelledRow label={meta.label} hint={meta.explain}>
      <Segmented
        label={meta.label}
        value={local.tap_to_read}
        options={meta.options as ReadonlyArray<{ value: boolean; label: string }>}
        onChange={(tap_to_read) => update({ tap_to_read })}
      />
    </LabelledRow>
  ),

  tap_to_read_key: ({ local, update }) => (
    <AdvanceKeyRow
      tapKey={local.tap_to_read_key}
      liveRewindKey={local.live_rewind_key ?? 'Mouse1'}
      update={update}
    />
  ),

  live_rewind_key: ({ local, update }) => (
    <LiveRewindKeyRow
      bindKey={local.live_rewind_key ?? 'Mouse1'}
      tapKey={local.tap_to_read_key}
      update={update}
    />
  ),

  bpm: ({ meta, local, update }) => (
    <LabelledRow
      label={meta.label}
      feedback={`${local.bpm * local.words_per_stack} wpm at current stack size`}
    >
      <SliderField
        label={meta.label}
        value={local.bpm}
        min={meta.min!}
        max={meta.max!}
        step={meta.step}
        transform={meta.transform}
        clampValue={meta.clampValue}
        onLiveSet={(bpm) => update({ bpm })}
      />
    </LabelledRow>
  ),

  font_family: ({ meta, local, update }) => (
    <LabelledRow label={meta.label} hint="Leave blank for system default">
      <div className="settings-control">
        <input
          type="text"
          className="form-input"
          style={{ width: 180 }}
          value={local.font_family}
          placeholder="e.g. Georgia, Arial"
          onChange={(e) => update({ font_family: e.target.value })}
        />
        {local.font_family && (
          <button className="btn-ghost btn-small" onClick={() => update({ font_family: '' })}>
            Reset
          </button>
        )}
      </div>
    </LabelledRow>
  ),

  highlight_mode: ({ local, update }) => (
    <HighlightModeRow mode={local.highlight_mode ?? 'default'} update={update} />
  ),

  palette: ({ local, update, onSave }) => (
    <PaletteField local={local} update={update} onSave={onSave} />
  ),
}

// ── Generic, metadata-driven rows (Toggle / Stepper / Slider / Colour) ────────

/** One-line hints for fields whose copy isn't already carried by metadata `explain`. */
const FIELD_HINTS: Record<string, string> = {
  metronome_enabled: 'Play a beat click on each stack advance',
  pause_at_sentences: 'Add a beat pause at sentence-ending stacks',
  pause_at_headlines: 'Add extra pause when reading headline stacks',
  words_per_stack: 'Words shown at once in each slot',
  lines_count: 'Rows of word stacks displayed before redrawing; 1 is single-line',
  font_size: 'Size of words shown in the reader',
  highlight_active: 'Color the active word stack so it stands out',
  text_color: 'Color of the words displayed in the reader',
  viewport_bg_color: 'Reader stage background color',
  highlight_color: 'Background of the active stack',
}

/** Conditional/nested rows carry the calm grid's inset treatment. */
const INDENTED_FIELDS = new Set([
  'lines_anchor',
  'highlight_panning_chunk_size',
  'highlight_color',
  'highlight_text_color',
])

function GenericField({
  meta,
  local,
  update,
}: {
  meta: SettingMeta
  local: Settings
  update: (patch: Partial<Settings>) => void
}) {
  const field = meta.field
  const hint = FIELD_HINTS[field] ?? meta.explain
  const indented = INDENTED_FIELDS.has(field)
  const disabled = meta.disabledWhen ? meta.disabledWhen(local) : false
  const rawValue = field === 'lines_count'
    ? effectiveLinesCount(local)
    : local[field as keyof Settings]
  const set = (v: unknown) => {
    if (field === 'lines_count') {
      update(linesCountPatch(Number(v)))
      return
    }
    update({ [field]: v } as unknown as Partial<Settings>)
  }

  switch (meta.instrument) {
    case 'Toggle':
      return (
        <SettingToggleRow
          label={meta.label}
          hint={hint}
          checked={Boolean(rawValue)}
          disabled={disabled}
          onChange={set}
        />
      )

    case 'Stepper':
      return (
        <LabelledRow label={meta.label} hint={hint} indented={indented}>
          <div className="settings-control">
            <Stepper
              label={meta.label}
              value={Number(rawValue)}
              min={meta.min!}
              max={meta.max!}
              step={meta.step}
              disabled={disabled}
              onChange={set}
            />
          </div>
        </LabelledRow>
      )

    case 'Slider':
      return (
        <LabelledRow label={meta.label} hint={hint} indented={indented}>
          <SliderField
            label={meta.label}
            value={Number(rawValue)}
            min={meta.min!}
            max={meta.max!}
            step={meta.step}
            transform={meta.transform}
            clampValue={meta.clampValue}
            disabled={disabled}
            onLiveSet={set}
          />
        </LabelledRow>
      )

    case 'Segmented':
      return (
        <LabelledRow label={meta.label} hint={hint} indented={indented}>
          <Segmented
            label={meta.label}
            value={(rawValue ?? meta.defaultValue) as string | boolean}
            options={meta.options!}
            disabled={disabled}
            onChange={set}
          />
        </LabelledRow>
      )

    case 'Colour':
      return (
        <ColorSettingRow
          label={meta.label}
          hint={hint ?? 'Auto selects highest contrast when unset'}
          theme={local.theme}
          value={String(rawValue ?? '')}
          lightDefault={meta.colourDefaults!.light}
          darkDefault={meta.colourDefaults!.dark}
          indented={indented}
          onChange={(v) => set(v)}
        />
      )

    default:
      return null
  }
}

/** Shared label + hint + control frame (the calm grid's `settings-row`). */
function LabelledRow({
  label,
  hint,
  feedback,
  indented,
  children,
}: {
  label: string
  hint?: string
  feedback?: React.ReactNode
  indented?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={`settings-row${indented ? ' rcp-indented' : ''}`}>
      <SettingsLabel label={label} hint={hint} feedback={feedback} />
      {children}
    </div>
  )
}

// ── Palette (relocated from the calm-grid Colours group, intact) ──────────────

function PaletteField({ local, update, onSave }: Omit<Props, 'field'>) {
  const customPalettes = validatePalettes(local.custom_palettes)

  function handleSelectPalette(palette: ReaderPalette) {
    update({
      viewport_bg_color: palette.viewport_bg_color,
      text_color: palette.text_color,
      highlight_color: palette.highlight_color,
      highlight_text_color: palette.highlight_text_color,
      highlight_active: palette.highlight_active,
    })
  }

  function handleDeletePalette(id: string) {
    onSave({ custom_palettes: customPalettes.filter((p) => p.id !== id) })
  }

  return (
    <PaletteSelector
      presets={PRESET_PALETTES}
      custom={customPalettes}
      currentColors={{
        viewport_bg_color: local.viewport_bg_color,
        text_color: local.text_color,
        highlight_color: local.highlight_color,
        highlight_text_color: local.highlight_text_color,
        highlight_active: local.highlight_active,
      }}
      theme={local.theme}
      onSelect={handleSelectPalette}
      onDelete={handleDeletePalette}
    />
  )
}
