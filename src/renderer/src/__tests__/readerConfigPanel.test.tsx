/**
 * ReaderConfigPanel — behavioural characterization for the field-editor split.
 *
 * Covers the observable behaviour the decomposition must preserve:
 *  - Debounced save: one merged `onSave(next)` per field edit after the 400 ms debounce.
 *  - Lock-at-WPM transition patch (clears tap, solves BPM/WPS from the target).
 *  - Target-WPM conditional reveal (`!tap_to_read && lock_at_wpm`).
 *  - External resync: a changed `settings` prop replaces working state.
 *
 * Environment: happy-dom (matched by vitest.config.ts environmentMatchGlobs).
 */

import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import ReaderConfigPanel from '../components/ReaderConfigPanel'
import ReaderConfigEditorCore from '../components/readerConfig/ReaderConfigEditorCore'
import { deriveTargetWpm } from '../engine/readerConfigPatches'
import type { Settings } from '../types'

afterEach(cleanup)

const BASE_SETTINGS: Settings = {
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
  theme: 'dark',
  highlight_active: true,
  lines_count: 1,
  lines_anchor: 'center',
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
  view_style: 'default',
  show_chunk_dividers: true,
  highlight_color: '',
  viewport_bg_color: '',
  text_color: '',
  font_family: '',
  highlight_text_color: '',
  highlight_mode: 'default',
  highlight_panning_chunk_size: 0,
  highlighting_mode: 'default',
  tap_to_read: false,
  tap_to_read_key: 'Space',
  lock_at_wpm: false,
  target_wpm: 240,
  custom_palettes: [],
  custom_text_presets: [],
  custom_font_presets: [],
  custom_playback_presets: [],
  custom_reader_configs: [],
}

describe('ReaderConfigEditorCore', () => {
  it('emits partial patches without owning persistence', () => {
    const onChange = vi.fn()
    render(<ReaderConfigEditorCore value={BASE_SETTINGS} onChange={onChange} />)

    const slider = screen.getByRole('slider', { name: /font size/i }) as HTMLInputElement
    act(() => { fireEvent.change(slider, { target: { value: '48' } }) })

    expect(onChange).toHaveBeenCalledWith({ font_size: 48 })
  })
})

describe('ReaderConfigPanel — debounced save', () => {
  it('fires one merged onSave with the patch after the 400 ms debounce', () => {
    vi.useFakeTimers()
    try {
      const onSave = vi.fn()
      render(<ReaderConfigPanel settings={BASE_SETTINGS} onSave={onSave} />)

      const slider = screen.getByRole('slider', { name: /font size/i }) as HTMLInputElement
      act(() => { fireEvent.change(slider, { target: { value: '48' } }) })

      // Nothing yet — still inside the debounce window.
      expect(onSave).not.toHaveBeenCalled()

      act(() => { vi.advanceTimersByTime(400) })

      expect(onSave).toHaveBeenCalledOnce()
      // Merged into the full settings object, not just the lone field.
      expect(onSave.mock.calls[0][0]).toEqual(
        expect.objectContaining({ ...BASE_SETTINGS, font_size: 48 })
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('coalesces rapid edits into a single trailing save', () => {
    vi.useFakeTimers()
    try {
      const onSave = vi.fn()
      render(<ReaderConfigPanel settings={BASE_SETTINGS} onSave={onSave} />)

      const slider = screen.getByRole('slider', { name: /font size/i }) as HTMLInputElement
      act(() => { fireEvent.change(slider, { target: { value: '40' } }) })
      act(() => { vi.advanceTimersByTime(100) })
      act(() => { fireEvent.change(slider, { target: { value: '50' } }) })
      act(() => { vi.advanceTimersByTime(400) })

      expect(onSave).toHaveBeenCalledOnce()
      expect(onSave.mock.calls[0][0]).toEqual(expect.objectContaining({ font_size: 50 }))
    } finally {
      vi.useRealTimers()
    }
  })

  it('flushes immediately on blur of a number/range input', () => {
    vi.useFakeTimers()
    try {
      const onSave = vi.fn()
      render(<ReaderConfigPanel settings={BASE_SETTINGS} onSave={onSave} />)

      const slider = screen.getByRole('slider', { name: /font size/i }) as HTMLInputElement
      act(() => { fireEvent.change(slider, { target: { value: '48' } }) })
      act(() => { fireEvent.blur(slider) })

      expect(onSave).toHaveBeenCalledOnce()
      expect(onSave.mock.calls[0][0]).toEqual(expect.objectContaining({ font_size: 48 }))
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('ReaderConfigPanel — lock-at-WPM transition', () => {
  it('enabling Lock at WPM clears tap and saves the solved BPM/WPS', () => {
    vi.useFakeTimers()
    try {
      const onSave = vi.fn()
      render(<ReaderConfigPanel settings={BASE_SETTINGS} onSave={onSave} />)

      const lock = screen.getByRole('checkbox', { name: 'Lock at WPM' })
      act(() => { fireEvent.click(lock) })
      act(() => { vi.advanceTimersByTime(400) })

      const sol = deriveTargetWpm(BASE_SETTINGS.target_wpm)
      expect(onSave).toHaveBeenCalledOnce()
      expect(onSave.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          lock_at_wpm: true,
          tap_to_read: false,
          target_wpm: BASE_SETTINGS.target_wpm,
          bpm: sol.bpm,
          words_per_stack: sol.wordsPerStack,
        })
      )
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('ReaderConfigPanel — Target-WPM conditional reveal', () => {
  it('shows the Target WPM row only when lock_at_wpm and not tap_to_read', () => {
    render(<ReaderConfigPanel settings={{ ...BASE_SETTINGS, lock_at_wpm: true }} onSave={vi.fn()} />)
    expect(screen.getByRole('spinbutton', { name: 'Target WPM value' })).toBeTruthy()
  })

  it('hides the Target WPM row when lock_at_wpm is false', () => {
    render(<ReaderConfigPanel settings={BASE_SETTINGS} onSave={vi.fn()} />)
    expect(screen.queryByRole('spinbutton', { name: 'Target WPM value' })).toBeNull()
  })

  it('hides the Target WPM row when tap_to_read wins over lock_at_wpm', () => {
    render(
      <ReaderConfigPanel
        settings={{ ...BASE_SETTINGS, tap_to_read: true, lock_at_wpm: true }}
        onSave={vi.fn()}
      />
    )
    expect(screen.queryByRole('spinbutton', { name: 'Target WPM value' })).toBeNull()
  })
})

describe('ReaderConfigPanel — external resync', () => {
  it('replaces working state when the settings prop changes', () => {
    const { rerender } = render(<ReaderConfigPanel settings={BASE_SETTINGS} onSave={vi.fn()} />)

    const fontSize = screen.getByRole('slider', { name: /font size/i }) as HTMLInputElement
    expect(fontSize.value).toBe('36')

    rerender(<ReaderConfigPanel settings={{ ...BASE_SETTINGS, font_size: 72 }} onSave={vi.fn()} />)
    expect((screen.getByRole('slider', { name: /font size/i }) as HTMLInputElement).value).toBe('72')
  })
})
