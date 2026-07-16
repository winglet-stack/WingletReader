/**
 * ReaderSettingsEditor + layout descriptor — new-structure characterization
 * (ADR-0019 / SR-1). Pins the two-tab taxonomy that replaces the retired calm
 * grid + power view: field placement in the descriptor, and the editor's rendered
 * structure (tabs, columns, moved/promoted/relocated fields, culled fields absent,
 * host flags, and debounced auto-save).
 *
 * Environment: happy-dom (matched by vitest.config.ts environmentMatchGlobs).
 */

import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import ReaderSettingsEditor from '../components/readerConfig/ReaderSettingsEditor'
import {
  READER_SETTINGS_LAYOUT,
  READER_SETTINGS_LAYOUT_FIELDS,
} from '../components/settings/readerSettingsLayout'
import { SETTING_METADATA } from '../components/settings/settingMetadata'
import { DEFAULT_SETTINGS } from '../types'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

const PREVIEW_OPEN_KEY = 'wingletreader.readerSettings.previewOpen'

describe('readerSettingsLayout descriptor', () => {
  it('declares column tabs: Playback & Grid Layout, Display, then Custom colors', () => {
    expect(READER_SETTINGS_LAYOUT.map((t) => t.id)).toEqual([
      'playback-grid',
      'display',
      'custom-colors',
    ])
    const [tab1, tab2, tab3] = READER_SETTINGS_LAYOUT
    expect(tab1.kind).toBe('columns')
    expect(tab2.kind).toBe('columns')
    expect(tab3.kind).toBe('columns')
    expect(tab1.columns.map((c) => c.id)).toEqual(['playback', 'grid'])
    expect(tab2.columns.map((c) => c.id)).toEqual(['display-text-spacing', 'colors'])
    expect(tab3.columns.map((c) => c.id)).toEqual(['custom-colors', 'custom-colors-preview'])
    expect(tab2.columns[0].sections.map((s) => s.id)).toEqual(['text-highlighting', 'spacing'])
    expect(tab2.columns[1].sections.map((s) => s.id)).toEqual(['colors'])
    expect(tab3.columns[0].sections.map((s) => s.id)).toEqual(['custom-colors'])
    expect(tab3.columns[1].sections).toEqual([])
    expect(tab1.columns[1].previewBelow).toBe(true)
    expect(tab2.columns[1].previewBelow).toBe(true)
    expect(tab3.columns[1].previewBelow).toBe(true)
  })

  it('moves words_per_stack to Grid Layout and promotes metronome into Playback', () => {
    const tab1 = READER_SETTINGS_LAYOUT[0]
    const playback = tab1.columns.find((c) => c.id === 'playback')!
    const grid = tab1.columns.find((c) => c.id === 'grid')!
    expect(playback.sections[0].fields).toContain('metronome_enabled')
    expect(grid.sections[0].fields).toContain('words_per_stack')
    expect(playback.sections[0].fields).not.toContain('words_per_stack')
  })

  it('relocates Palette, panning size, and the Spacing sliders to their new homes', () => {
    const display = READER_SETTINGS_LAYOUT[1]
    const displaySections = display.columns.flatMap((c) => c.sections)
    const textHl = displaySections.find((s) => s.id === 'text-highlighting')!
    const colors = displaySections.find((s) => s.id === 'colors')!
    const spacing = displaySections.find((s) => s.id === 'spacing')!
    expect(textHl.fields).toContain('highlight_panning_chunk_size')
    expect(colors.fields[0]).toBe('palette')
    expect(spacing.fields).toEqual([
      'lines_row_gap',
      'stack_gap',
      'stack_vertical_offset',
      'stack_horizontal_offset',
    ])
  })

  it('places none of the culled/dormant fields (ADR-0019 §4 — SR-2 owns their removal)', () => {
    for (const culled of ['lock_at_wpm', 'target_wpm', 'view_style', 'show_chunk_dividers']) {
      expect(READER_SETTINGS_LAYOUT_FIELDS).not.toContain(culled)
    }
  })

  it('every placed field resolves in the metadata table (metadata is the single source)', () => {
    for (const field of READER_SETTINGS_LAYOUT_FIELDS) {
      expect(SETTING_METADATA[field], `missing metadata for ${field}`).toBeTruthy()
    }
  })
})

describe('ReaderSettingsEditor — Settings host', () => {
  it('lands directly on the two-tab layout — no card grid, no "Edit everything"', () => {
    render(<ReaderSettingsEditor settings={DEFAULT_SETTINGS} onSave={vi.fn()} />)
    expect(screen.getByRole('tab', { name: 'Playback & Grid Layout' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Display' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Custom colors' })).toBeTruthy()
    expect(screen.queryByText('Edit everything')).toBeNull()
  })

  it('shows Speed with a derived WPM readout, Metronome, and Words per stack under Grid', () => {
    render(
      <ReaderSettingsEditor
        settings={{ ...DEFAULT_SETTINGS, bpm: 60, words_per_stack: 3 }}
        onSave={vi.fn()}
      />
    )
    expect(screen.getByRole('slider', { name: 'Speed' })).toBeTruthy()
    expect(screen.getByText('180 wpm at current stack size')).toBeTruthy()
    expect(screen.getByText('Metronome')).toBeTruthy()
    expect(screen.getByRole('spinbutton', { name: 'Words per stack value' })).toBeTruthy()
  })

  it('does not render the culled Lock-at-WPM / Target WPM controls, and Speed stays reachable', () => {
    render(<ReaderSettingsEditor settings={{ ...DEFAULT_SETTINGS, lock_at_wpm: true }} onSave={vi.fn()} />)
    expect(screen.queryByText('Lock at WPM')).toBeNull()
    expect(screen.queryByText(/Target WPM/)).toBeNull()
    expect(screen.getByRole('slider', { name: 'Speed' })).toBeTruthy()
  })

  it('shows the tabs and a collapsed preview without a top preset row in the Settings host', () => {
    const { container } = render(<ReaderSettingsEditor settings={DEFAULT_SETTINGS} onSave={vi.fn()} />)
    expect(screen.queryByText('+ Save current')).toBeNull()
    expect(screen.getByRole('tab', { name: 'Playback & Grid Layout' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Display' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Custom colors' })).toBeTruthy()
    // SR-3: collapsed by default — the toggle is present, the preview panel is not.
    expect(screen.getByRole('button', { name: 'Preview' })).toBeTruthy()
    expect(container.querySelector('.rcp-preview')).toBeNull()
  })

  it('folds the preview panel in on toggle and back out again; controls stay mounted', () => {
    const { container } = render(<ReaderSettingsEditor settings={DEFAULT_SETTINGS} onSave={vi.fn()} />)
    expect(container.querySelector('.rcp-preview')).toBeNull()
    expect(container.querySelector('.rcp-layout')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(container.querySelector('.rcp-preview')).toBeTruthy()
    expect(container.querySelector('.rcp-layout')).toBeNull()
    expect(container.querySelector('.rse-preview-inline')).toBeTruthy()
    expect(container.querySelector('.rse-preview-footer-col')).toBeTruthy()
    // Controls remain rendered alongside the folded-in preview.
    expect(screen.getByRole('slider', { name: 'Speed' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Hide preview' }))
    expect(container.querySelector('.rcp-preview')).toBeNull()
  })

  it('keeps Tab 1 Playback and Grid Layout side-by-side on the Settings host', () => {
    const { container } = render(<ReaderSettingsEditor settings={DEFAULT_SETTINGS} onSave={vi.fn()} />)
    expect(container.querySelector('.rse-columns')).toBeTruthy()
    expect(container.querySelector('.rse-stack')).toBeNull()
    const headings = screen.getAllByRole('heading', { level: 2 })
    const playbackIdx = headings.findIndex((h) => h.textContent === 'Playback')
    const gridIdx = headings.findIndex((h) => h.textContent === 'Grid Layout')
    expect(playbackIdx).toBeGreaterThanOrEqual(0)
    expect(gridIdx).toBeGreaterThanOrEqual(0)
    expect(container.querySelector('.rse-preview-footer-col')).toBeNull()
  })

  it('renders the inline preview below Grid Layout inside the right column when open on Tab 1', () => {
    const { container } = render(<ReaderSettingsEditor settings={DEFAULT_SETTINGS} onSave={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    const gridSection = container.querySelector('[data-rse-section="grid"]')
    const gridCol = gridSection?.parentElement
    const preview = container.querySelector('.rse-preview-inline')
    expect(gridCol).toBeTruthy()
    expect(preview).toBeTruthy()
    expect(gridCol!.contains(preview!)).toBe(true)
  })

  it('renders Display as two columns and folds preview below Colors when open', () => {
    const { container } = render(<ReaderSettingsEditor settings={DEFAULT_SETTINGS} onSave={vi.fn()} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Display' }))
    expect(container.querySelector('.rse-display-console')).toBeNull()
    expect(container.querySelector('.rse-display-nest')).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Text & Highlighting' })).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Colors' })).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Spacing' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Text & Highlighting' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Colors' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Spacing' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    const colorsSection = container.querySelector('[data-rse-section="colors"]')
    const colorsCol = colorsSection?.parentElement
    const textSection = container.querySelector('[data-rse-section="text-highlighting"]')
    const textCol = textSection?.parentElement
    const preview = container.querySelector('.rse-preview-inline')
    expect(preview).toBeTruthy()
    expect(colorsCol?.contains(preview!)).toBe(true)
    expect(textCol?.contains(preview!)).toBe(false)
  })

  it('persists the preview open pref to localStorage and restores it on mount (a UI pref, not a Setting)', () => {
    const onSave = vi.fn()
    render(<ReaderSettingsEditor settings={DEFAULT_SETTINGS} onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(window.localStorage.getItem(PREVIEW_OPEN_KEY)).toBe('true')
    // Toggling the preview never touches the Settings store / export-import.
    expect(onSave).not.toHaveBeenCalled()
    cleanup()

    // Fresh mount reads the persisted pref back — opens with the panel showing.
    const remount = render(<ReaderSettingsEditor settings={DEFAULT_SETTINGS} onSave={vi.fn()} />)
    expect(remount.container.querySelector('.rcp-preview')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Hide preview' })).toBeTruthy()
  })

  it('omits the preview affordance when the host flag is off (drawer host, SR-4)', () => {
    // Even with the pref set open, showPreview:false renders no toggle and no panel.
    window.localStorage.setItem(PREVIEW_OPEN_KEY, 'true')
    const { container } = render(
      <ReaderSettingsEditor
        settings={DEFAULT_SETTINGS}
        onSave={vi.fn()}
        showPreview={false}
      />
    )
    expect(screen.queryByText('+ Save current')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Preview' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Hide preview' })).toBeNull()
    expect(container.querySelector('.rcp-preview')).toBeNull()
    expect(container.querySelector('.rse-stack')).toBeNull()
    expect(container.querySelector('.rse-columns')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Display' }))
    expect(container.querySelector('.rse-display-nest')).toBeNull()
    expect(container.querySelectorAll('.settings-section')).toHaveLength(3)
  })

  it('never renders the live-stage advisory in the Settings Reader defaults host', () => {
    render(
      <ReaderSettingsEditor
        settings={{
          ...DEFAULT_SETTINGS,
          font_size: 72,
          words_per_stack: 8,
          stacks_visible: 6,
          lines_enabled: true,
          lines_count: 6,
        }}
        onSave={vi.fn()}
      />
    )

    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByText(/Text is very small at this window size/)).toBeNull()
    expect(screen.queryByText(/not practically readable/)).toBeNull()
  })

  it('shows all Display sections and keeps Colors palette-first with custom colors opening a tab', () => {
    const onSave = vi.fn()
    const { container } = render(<ReaderSettingsEditor settings={DEFAULT_SETTINGS} onSave={onSave} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Display' }))
    expect(container.querySelector('.rse-display-nest')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Text & Highlighting' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Colors' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Spacing' })).toBeTruthy()
    expect(screen.getByRole('slider', { name: 'Font size' })).toBeTruthy()
    expect(screen.getByText('Presets')).toBeTruthy()
    expect(screen.queryByText('+ Save current as palette')).toBeNull()
    const customColorsButton = screen.getByRole('button', { name: 'Custom colors' })
    expect(screen.queryByText('Text color')).toBeNull()
    expect(onSave).not.toHaveBeenCalled()
    expect(window.localStorage.length).toBe(0)

    fireEvent.click(customColorsButton)
    expect(screen.getByRole('tab', { name: 'Custom colors' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('Text color')).toBeTruthy()
    expect(screen.getByText('Background color')).toBeTruthy()
    expect(screen.getByText('Highlight color')).toBeTruthy()
    expect(screen.getByText('Highlighted text color')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Palette name' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save as palette' })).toBeTruthy()
    expect(container.querySelector('.rse-preview-inline')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Preview' })).toBeNull()
    expect(onSave).not.toHaveBeenCalled()
    expect(window.localStorage.length).toBe(0)
  })

  it('preserves highlight color reveal gating inside the Custom colors tab', () => {
    render(
      <ReaderSettingsEditor
        settings={{ ...DEFAULT_SETTINGS, highlight_active: false }}
        onSave={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Display' }))
    fireEvent.click(screen.getByRole('button', { name: 'Custom colors' }))

    expect(screen.getByText('Text color')).toBeTruthy()
    expect(screen.getByText('Background color')).toBeTruthy()
    expect(screen.queryByText('Highlight color')).toBeNull()
    expect(screen.queryByText('Highlighted text color')).toBeNull()
  })

  it('saves the current Custom colors as a palette that appears when navigating back', () => {
    const onSave = vi.fn()
    const settings = {
      ...DEFAULT_SETTINGS,
      viewport_bg_color: '#101010',
      text_color: '#f7f7f7',
      highlight_color: '#4050a0',
      highlight_text_color: '#ffffff',
      highlight_active: true,
    }
    const { rerender } = render(<ReaderSettingsEditor settings={settings} onSave={onSave} />)

    fireEvent.click(screen.getByRole('tab', { name: 'Custom colors' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Palette name' }), {
      target: { value: 'Night Focus' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save as palette' }))

    expect(onSave).toHaveBeenCalledOnce()
    const patch = onSave.mock.calls[0][0]
    expect(patch.custom_palettes).toHaveLength(1)
    expect(patch.custom_palettes[0]).toEqual(expect.objectContaining({
      name: 'Night Focus',
      viewport_bg_color: '#101010',
      text_color: '#f7f7f7',
      highlight_color: '#4050a0',
      highlight_text_color: '#ffffff',
      highlight_active: true,
    }))

    rerender(<ReaderSettingsEditor settings={{ ...settings, custom_palettes: patch.custom_palettes }} onSave={onSave} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Display' }))
    expect(screen.getByText('Your palettes')).toBeTruthy()
    expect(screen.getByText('Night Focus')).toBeTruthy()
  })

  it('auto-saves edits after the debounce, with no Save button', () => {
    vi.useFakeTimers()
    try {
      const onSave = vi.fn()
      render(<ReaderSettingsEditor settings={{ ...DEFAULT_SETTINGS, words_per_stack: 3 }} onSave={onSave} />)
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Increase Words per stack' }))
      })
      expect(onSave).not.toHaveBeenCalled()
      act(() => {
        vi.advanceTimersByTime(400)
      })
      expect(onSave).toHaveBeenCalledOnce()
      expect(onSave.mock.calls[0][0]).toEqual(expect.objectContaining({ words_per_stack: 4 }))
      expect(screen.queryByRole('button', { name: /^Save$/ })).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('applies edits immediately (no debounce) in the drawer host with liveApply (SR-4)', () => {
    // The live reader behind the drawer is the preview, so edits must reach
    // onSave synchronously — not after the 400ms draft debounce.
    const onSave = vi.fn()
    render(
      <ReaderSettingsEditor
        settings={{ ...DEFAULT_SETTINGS, words_per_stack: 3 }}
        onSave={onSave}
        showPreview={false}
        liveApply
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Increase Words per stack' }))
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0]).toEqual(expect.objectContaining({ words_per_stack: 4 }))
  })
})
