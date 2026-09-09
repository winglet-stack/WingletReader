/**
 * Integrity tests for the declarative setting-metadata table (issue 01). These
 * pin the roster encoding so a future re-bucket or range edit is a deliberate,
 * reviewed change — and guard the table against drift with DEFAULT_SETTINGS.
 */

import { describe, it, expect } from 'vitest'
import {
  SETTING_METADATA,
  SETTING_GROUP_FIELDS,
  READER_CALM_GROUPS,
  settingMeta,
  BPM_SLIDER_TRANSFORM,
} from '../components/settings/settingMetadata'
import { DEFAULT_SETTINGS } from '../types'
import { bpmToSlider, sliderToBpm } from '../engine/bpmScale'

describe('settingMetadata — font_size (issue-01 proof field)', () => {
  it('is a Text Slider over 18–96 step 2', () => {
    const m = settingMeta('font_size')
    expect(m.instrument).toBe('Slider')
    expect(m.group).toBe('text')
    expect([m.min, m.max, m.step]).toEqual([18, 96, 2])
    expect(m.transform).toBeUndefined()
  })
})

describe('settingMetadata — non-linear sliders keep their existing mappings', () => {
  it('bpm carries the bpmScale transform', () => {
    const m = settingMeta('bpm')
    expect(m.transform).toBe(BPM_SLIDER_TRANSFORM)
    expect(m.transform!.toSlider).toBe(bpmToSlider)
    expect(m.transform!.fromSlider).toBe(sliderToBpm)
  })
})

describe('settingMetadata — reveal gates', () => {
  const base = DEFAULT_SETTINGS

  it('Speed (bpm) shows whenever not tapping — lock no longer gates it (ADR-0019 §4)', () => {
    const bpmMode = { ...base, tap_to_read: false, lock_at_wpm: false }
    const lockMode = { ...base, tap_to_read: false, lock_at_wpm: true }
    const tapMode = { ...base, tap_to_read: true }

    expect(settingMeta('bpm').reveal!(bpmMode)).toBe(true)
    // A stored lock (dormant, de-UI'd) must not strand the Speed control.
    expect(settingMeta('bpm').reveal!(lockMode)).toBe(true)
    expect(settingMeta('bpm').reveal!(tapMode)).toBe(false)
    expect(settingMeta('tap_to_read_key').reveal!(tapMode)).toBe(true)
  })

  it('words_per_stack is always visible — a pure grid parameter now (ADR-0019)', () => {
    expect(settingMeta('words_per_stack').reveal).toBeUndefined()
  })

  it('line count is always visible and Anchor follows the resolved effective count', () => {
    expect(settingMeta('lines_count').reveal).toBeUndefined()

    const anchor = settingMeta('lines_anchor')
    expect(anchor.reveal!({ ...base, lines_count: 1 })).toBe(false)
    expect(anchor.reveal!({ ...base, lines_count: 3 })).toBe(true)
  })

  it('highlight mode/panning and highlight colours gate on their owners', () => {

    // highlight_mode is nested under the Highlight toggle (ADR-0019).
    expect(settingMeta('highlight_mode').reveal!({ ...base, highlight_active: false })).toBe(false)
    expect(settingMeta('highlight_mode').reveal!({ ...base, highlight_active: true })).toBe(true)

    // Panning size gates on BOTH owners so it can't orphan when highlighting is off.
    expect(settingMeta('highlight_panning_chunk_size').reveal!({ ...base, highlight_active: true, highlight_mode: 'default' })).toBe(false)
    expect(settingMeta('highlight_panning_chunk_size').reveal!({ ...base, highlight_active: true, highlight_mode: 'panning-bar' })).toBe(true)
    expect(settingMeta('highlight_panning_chunk_size').reveal!({ ...base, highlight_active: false, highlight_mode: 'panning-bar' })).toBe(false)

    expect(settingMeta('highlight_color').reveal!({ ...base, highlight_active: false })).toBe(false)
    expect(settingMeta('highlight_text_color').reveal!({ ...base, highlight_active: true })).toBe(true)
  })

  it('lines_row_gap is disabled (not hidden) without multiple lines', () => {
    const m = settingMeta('lines_row_gap')
    expect(m.reveal).toBeUndefined()
    expect(m.disabledWhen!({ ...base, lines_count: 1 })).toBe(true)
    expect(m.disabledWhen!({ ...base, lines_count: 3 })).toBe(false)
  })
})

describe('settingMetadata — structure matches the roster', () => {
  it('exposes the five calm cards laid 3 + 2', () => {
    expect(READER_CALM_GROUPS).toEqual(['playback', 'text', 'layout', 'highlight', 'colours'])
  })

  it('highlight_mode is a 3-way Segmented; the derived highlighting_mode twin is NOT a row', () => {
    expect(settingMeta('highlight_mode').instrument).toBe('Segmented')
    expect(settingMeta('highlight_mode').options).toHaveLength(3)
    expect(SETTING_METADATA['highlighting_mode']).toBeUndefined()
  })

  it('models line count and Anchor without exposing the derived lines toggle', () => {
    expect(settingMeta('lines_count')).toEqual(expect.objectContaining({
      instrument: 'Stepper',
      label: 'Line count',
      min: 1,
      max: 10,
    }))
    expect(settingMeta('lines_anchor')).toEqual(expect.objectContaining({
      instrument: 'Segmented',
      label: 'Anchor',
      defaultValue: 'center',
    }))
    expect(settingMeta('lines_anchor').options).toEqual([
      { value: 'center', label: 'Centred' },
      { value: 'top', label: 'Top-anchored' },
    ])
    expect((SETTING_METADATA as Record<string, unknown>).lines_enabled).toBeUndefined()
  })

  it('drops the culled settings from the metadata roster (ADR-0019 §4 — SR-2)', () => {
    // lock_at_wpm/target_wpm/view_style/show_chunk_dividers are de-UI'd; their
    // Settings keys stay dormant but they carry no rendered metadata entry.
    for (const culled of ['lock_at_wpm', 'target_wpm', 'view_style', 'show_chunk_dividers']) {
      expect(SETTING_METADATA[culled]).toBeUndefined()
    }
  })

  it('no longer encodes a calm/power tier (concept dissolved — ADR-0019 §2)', () => {
    for (const m of Object.values(SETTING_METADATA)) {
      expect(m).not.toHaveProperty('tier')
    }
  })

  it('models the RWW Overlay & Shortcuts card', () => {
    const fields = SETTING_GROUP_FIELDS.overlay.map((m) => m.field)
    expect(fields).toContain('read_while_working_window_width')
    expect(fields).toContain('read_while_working_shortcut')
    expect(fields).toContain('read_while_working_restore_clipboard')
  })
})

describe('settingMetadata — no drift with DEFAULT_SETTINGS', () => {
  it('every encoded default equals the canonical default', () => {
    for (const m of Object.values(SETTING_METADATA)) {
      if (m.defaultValue === undefined) continue // sentinels (palette) carry no field default
      expect({ field: m.field, value: m.defaultValue }).toEqual({
        field: m.field,
        value: (DEFAULT_SETTINGS as Record<string, unknown>)[m.field],
      })
    }
  })
})
