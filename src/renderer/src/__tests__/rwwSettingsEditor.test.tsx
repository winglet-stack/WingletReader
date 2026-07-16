import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import RwwSettingsEditor from '../components/settings/RwwSettingsEditor'
import {
  RWW_SETTINGS_LAYOUT,
  RWW_SETTINGS_LAYOUT_FIELDS,
} from '../components/settings/rwwSettingsLayout'
import { DEFAULT_SETTINGS, type Settings } from '../types'

const PREVIEW_OPEN_KEY = 'wingletreader.rwwSettings.playbackPreviewOpen'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe('rwwSettingsLayout descriptor', () => {
  it('declares the Overlay Reader two-tab structure', () => {
    expect(RWW_SETTINGS_LAYOUT.map((tab) => tab.id)).toEqual([
      'overlay',
      'playback-grid',
    ])
    expect(RWW_SETTINGS_LAYOUT.map((tab) => tab.label)).toEqual([
      'Overlay',
      'Reader configuration',
    ])
  })

  it('places the playback, layout, and overlay fields in the planned sections', () => {
    const [overlay, playbackGrid] = RWW_SETTINGS_LAYOUT
    const sections = playbackGrid.columns.flatMap((column) => column.sections)
    const playback = sections.find((section) => section.id === 'playback')!
    // Grid and Text merge into one Layout card as sub-headed groups (slice 03).
    const layout = sections.find((section) => section.id === 'layout')!
    const grid = layout.subsections!.find((sub) => sub.id === 'grid')!
    const text = layout.subsections!.find((sub) => sub.id === 'text')!
    const overlayFields = overlay.columns.flatMap((column) =>
      column.sections.flatMap((section) => section.fields)
    )

    expect(playback.fields).toEqual(['bpm', 'live_rewind_stacks', 'live_rewind_key'])
    // The Layout card carries no flat fields of its own; both groups live in
    // subsections. The preview no longer folds below it — it lives in a dedicated
    // preview-host column (slice 05).
    expect(layout.fields).toEqual([])
    const previewColumn = playbackGrid.columns.find((column) => column.previewHost)!
    expect(previewColumn.id).toBe('preview')
    expect(previewColumn.sections).toEqual([])
    expect(layout.subsections!.map((sub) => sub.id)).toEqual(['grid', 'text'])
    expect(grid.fields).toEqual([
      'words_per_stack',
      'stacks_visible',
      'lines_enabled',
      'lines_count',
    ])
    expect(text.fields).toEqual(['font_size'])
    // Overlay tab three-block stack order (ADR-0021): Standby pill → Shortcut
    // settings → Window size.
    expect(overlayFields).toEqual([
      'read_while_working_show_standby_control',
      'read_while_working_shortcut',
      'read_while_working_exit_shortcut',
      'read_while_working_window_width',
      'read_while_working_window_height',
    ])
  })

  it('stacks the combined Layout card in the playback column beside a preview column', () => {
    const playbackGrid = RWW_SETTINGS_LAYOUT.find((tab) => tab.id === 'playback-grid')!
    // Playback content lives in one column; the preview gets its own column
    // (slice 05), rendered only when the preview is open.
    expect(playbackGrid.columns.map((column) => column.id)).toEqual(['playback', 'preview'])
    const [column] = playbackGrid.columns
    // Playback renders first, the combined Layout card stacked directly below it.
    expect(column.sections.map((section) => section.id)).toEqual(['playback', 'layout'])
    const layout = column.sections.find((section) => section.id === 'layout')!
    // Grid and Text are sub-headed groups inside the Layout card, not columns.
    expect(layout.subsections!.map((sub) => sub.id)).toEqual(['grid', 'text'])
  })

  it('exports a flat field list in descriptor order', () => {
    expect(RWW_SETTINGS_LAYOUT_FIELDS).toEqual([
      'read_while_working_show_standby_control',
      'read_while_working_shortcut',
      'read_while_working_exit_shortcut',
      'read_while_working_window_width',
      'read_while_working_window_height',
      'bpm',
      'live_rewind_stacks',
      'live_rewind_key',
      'words_per_stack',
      'stacks_visible',
      'lines_enabled',
      'lines_count',
      'font_size',
    ])
  })
})

describe('RwwSettingsEditor', () => {
  it('renders the pinned tabbar and lands on Overlay controls', () => {
    render(
      <RwwSettingsEditor
        settings={{ ...DEFAULT_SETTINGS, bpm: 60, words_per_stack: 3 }}
        onSave={vi.fn()}
      />
    )

    expect(screen.getByRole('tablist', { name: 'Overlay Reader settings' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Overlay' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Overlay' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'Reader configuration' })).toBeTruthy()
    expect(screen.getByRole('tabpanel', { name: 'Overlay' })).toBeTruthy()
    // Three-block stack (ADR-0021): Standby pill · Shortcut settings · Window size.
    expect(screen.getByRole('heading', { name: 'Standby pill' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Shortcut settings' })).toBeTruthy()
    // Window size is the only fold-down (ADR-0021): collapsed by default, showing a
    // compact size summary with the width/height sliders hidden until expanded.
    expect(screen.getByRole('heading', { name: /Window size/ })).toBeTruthy()
    expect(screen.getByText('640 × 360')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: /Window size/ }).getAttribute('aria-expanded')
    ).toBe('false')
    expect(screen.queryByRole('slider', { name: 'Overlay width' })).toBeNull()
    expect(screen.queryByRole('slider', { name: 'Overlay height' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Clipboard' })).toBeNull()
    expect(screen.getByText('Show standby pill')).toBeTruthy()
    expect(screen.queryByText('Restore clipboard')).toBeNull()
    // Shortcut rebinding now lives in the Overlay tab body (rehomed from the host
    // square): labeled Summon/Exit recorder rows showing the current chord.
    expect(screen.getByRole('button', { name: 'Record Summon shortcut' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Record Exit shortcut' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Playback' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Preview' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copy from Reader defaults' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Start Overlay Reader' })).toBeNull()
  })

  it('expands the collapsed Window size fold-down to reveal width and height sliders', () => {
    render(
      <RwwSettingsEditor
        settings={{
          ...DEFAULT_SETTINGS,
          read_while_working_window_width: 640,
          read_while_working_window_height: 360,
        }}
        onSave={vi.fn()}
      />
    )

    // Collapsed: size summary present, sliders hidden, siblings visible.
    expect(screen.getByText('640 × 360')).toBeTruthy()
    expect(screen.queryByRole('slider', { name: 'Overlay width' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Standby pill' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Record Summon shortcut' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Window size/ }))

    // Expanded in place: sliders revealed, summary gone, siblings still visible.
    expect(screen.getByRole('slider', { name: 'Overlay width' })).toBeTruthy()
    expect(screen.getByRole('slider', { name: 'Overlay height' })).toBeTruthy()
    expect(screen.queryByText('640 × 360')).toBeNull()
    expect(
      screen.getByRole('button', { name: /Window size/ }).getAttribute('aria-expanded')
    ).toBe('true')
    expect(screen.getByRole('heading', { name: 'Standby pill' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Record Summon shortcut' })).toBeTruthy()

    // UI-local toggle: collapsing restores the summary.
    fireEvent.click(screen.getByRole('button', { name: /Window size/ }))
    expect(screen.queryByRole('slider', { name: 'Overlay width' })).toBeNull()
    expect(screen.getByText('640 × 360')).toBeTruthy()
  })

  it('switches between Overlay and Reader configuration controls', () => {
    render(
      <RwwSettingsEditor
        settings={{ ...DEFAULT_SETTINGS, bpm: 60, words_per_stack: 3 }}
        onSave={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Reader configuration' }))

    expect(
      screen.getByRole('tab', { name: 'Reader configuration' }).getAttribute('aria-selected')
    ).toBe('true')
    expect(screen.getByRole('tabpanel', { name: 'Reader configuration' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Playback' })).toBeTruthy()
    // One Layout card (h2) with Grid Layout and Text sub-headings (h3) inside it.
    expect(screen.getByRole('heading', { level: 2, name: 'Layout' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: 'Grid Layout' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: 'Text' })).toBeTruthy()

    expect(screen.getByRole('slider', { name: 'Speed' })).toBeTruthy()
    expect(screen.getByText('180 wpm at current stack size')).toBeTruthy()
    expect(screen.getByRole('spinbutton', { name: 'Words per stack value' })).toBeTruthy()
    expect(screen.getByRole('spinbutton', { name: 'Stacks visible value' })).toBeTruthy()
    expect(screen.getByRole('slider', { name: 'Font size' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Preview' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy from Reader defaults' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Start Overlay Reader' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Window size' })).toBeNull()
  })

  it('keeps the Overlay and Reader configuration tab bodies as distinct layout hosts', () => {
    // Tab-specific layout boundary (ADR-0021): the Overlay tab is the left-anchored
    // fixed-width three-block stack beside an optional embedded host column;
    // Reader configuration is the two-column editor. Neither host leaks into the
    // other across a tab switch.
    const { container } = render(
      <RwwSettingsEditor settings={{ ...DEFAULT_SETTINGS, bpm: 60 }} onSave={vi.fn()} />
    )

    // Overlay (default): the bespoke stack inside the tab layout row.
    const overlayLayout = container.querySelector('.rww-overlay-tab-layout')
    expect(overlayLayout).toBeTruthy()
    const overlayStack = container.querySelector('.rww-overlay-stack')
    expect(overlayStack).toBeTruthy()
    expect(overlayStack?.getAttribute('role')).toBe('tabpanel')
    expect(container.querySelector('.rse-columns')).toBeNull()
    // Fixed-width three-block frame: exactly the three Overlay blocks, in order.
    expect(
      [...container.querySelectorAll('.rww-overlay-block')].map((b) =>
        b.getAttribute('data-rww-section')
      )
    ).toEqual(['standby', 'shortcuts', 'window-size'])

    fireEvent.click(screen.getByRole('tab', { name: 'Reader configuration' }))

    // Reader configuration: the two-column grid, and the Overlay tab layout is gone.
    expect(container.querySelector('.rse-columns')).toBeTruthy()
    expect(container.querySelector('.rww-overlay-tab-layout')).toBeNull()
    expect(container.querySelector('.rww-overlay-stack')).toBeNull()
    expect(container.querySelector('.rww-overlay-block')).toBeNull()
  })

  it('renders the embedded Start host in the Overlay tab host column when hostChrome is provided', () => {
    const onStart = vi.fn()
    const { container } = render(
      <RwwSettingsEditor
        settings={DEFAULT_SETTINGS}
        onSave={vi.fn()}
        hostChrome={{
          status: null,
          starting: false,
          exiting: false,
          onStart,
          onExit: vi.fn(),
        }}
      />
    )

    expect(container.querySelector('.rww-overlay-host-column')).toBeTruthy()
    expect(container.querySelector('.rww-start-control--embedded')).toBeTruthy()
    expect(container.querySelector('.rww-start-control--viewport')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Start Overlay Reader' }))
    expect(onStart).toHaveBeenCalledOnce()
  })

  it('uses a single column when preview is closed and a second column when opened', () => {
    // Slice 04/05: preview closed → one column only (Playback + Layout card), no
    // empty second grid track. Opening the preview adds a dedicated second column
    // that hosts the live preview.
    const { container } = render(
      <RwwSettingsEditor settings={{ ...DEFAULT_SETTINGS, bpm: 60 }} onSave={vi.fn()} />
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Reader configuration' }))

    const columns = container.querySelector('.rse-columns')
    expect(columns).toBeTruthy()
    // Preview closed by default: single-column modifier, no reserved right track.
    expect(columns?.classList.contains('rse-columns--preview-closed')).toBe(true)
    expect(columns?.classList.contains('rse-columns--preview-open')).toBe(false)
    // Exactly one .rse-column holds Playback stacked above the Layout card; the
    // preview-host column is skipped while closed.
    expect(container.querySelectorAll('.rse-column').length).toBe(1)

    // Opening the preview switches to the two-column layout with a preview column.
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    const openColumns = container.querySelector('.rse-columns')
    expect(openColumns?.classList.contains('rse-columns--preview-open')).toBe(true)
    expect(openColumns?.classList.contains('rse-columns--preview-closed')).toBe(false)
    expect(container.querySelectorAll('.rse-column').length).toBe(2)
  })

  it('reveals Lines per screen only when Multiple lines is enabled', () => {
    const { container } = render(<RwwSettingsEditor settings={DEFAULT_SETTINGS} onSave={vi.fn()} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Reader configuration' }))

    expect(screen.queryByText('Lines per screen')).toBeNull()

    const multipleLinesRow = screen.getByText('Multiple lines').closest('.settings-row')
    const checkbox = multipleLinesRow?.querySelector('input[type="checkbox"]')
    expect(checkbox).toBeTruthy()
    fireEvent.click(checkbox!)

    expect(screen.getByRole('spinbutton', { name: 'Lines per screen value' })).toBeTruthy()
    expect(container.querySelector('[data-rww-section="grid"]')).toBeTruthy()
  })

  it('mounts the Playback preview in a dedicated second column and persists the UI preference', () => {
    const { container } = render(<RwwSettingsEditor settings={DEFAULT_SETTINGS} onSave={vi.fn()} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Reader configuration' }))

    expect(container.querySelector('.rcp-preview')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))

    // The preview lives in the dedicated second column (slice 05), not folded
    // below the Layout card in the playback column.
    const layoutSection = container.querySelector('[data-rww-section="layout"]')
    const playbackColumn = layoutSection?.closest('.rse-column')
    const previewColumn = container.querySelector('[data-rww-column="preview"]')
    const preview = container.querySelector('.rse-preview-inline')
    expect(preview).toBeTruthy()
    expect(previewColumn).toBeTruthy()
    // Two distinct columns: the preview is inside the preview column, not the
    // playback column that holds the Layout card.
    expect(previewColumn).not.toBe(playbackColumn)
    expect(previewColumn?.contains(preview!)).toBe(true)
    expect(playbackColumn?.contains(preview!)).toBe(false)
    expect(window.localStorage.getItem(PREVIEW_OPEN_KEY)).toBe('true')

    cleanup()
    const remount = render(<RwwSettingsEditor settings={DEFAULT_SETTINGS} onSave={vi.fn()} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Reader configuration' }))
    expect(remount.container.querySelector('.rcp-preview')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Hide preview' })).toBeTruthy()
  })

  it('marks the open preview as a square shrink-to-fit stage (slice 06)', () => {
    // The 1:1 shape is CSS-driven (container-unit min() cap); jsdom does no
    // layout, so the square intent is captured by a data-attribute that the CSS
    // mirrors. Assert the marker rides the preview inside the second column.
    const { container } = render(<RwwSettingsEditor settings={DEFAULT_SETTINGS} onSave={vi.fn()} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Reader configuration' }))
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))

    const preview = container.querySelector('.rse-preview-inline')
    expect(preview?.getAttribute('data-rww-preview-shape')).toBe('square')
    const previewColumn = container.querySelector('[data-rww-column="preview"]')
    expect(previewColumn?.contains(preview!)).toBe(true)
  })

  it('auto-saves Playback edits as frozen rww_* flat patches', () => {
    vi.useFakeTimers()
    try {
      const onSave = vi.fn()
      render(
        <RwwSettingsEditor
          settings={{ ...DEFAULT_SETTINGS, words_per_stack: 3 }}
          onSave={onSave}
        />
      )

      fireEvent.click(screen.getByRole('tab', { name: 'Reader configuration' }))
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Increase Words per stack' }))
      })
      expect(onSave).not.toHaveBeenCalled()

      act(() => {
        vi.advanceTimersByTime(400)
      })
      expect(onSave).toHaveBeenCalledOnce()
      expect(onSave.mock.calls[0][0]).toEqual({ rww_words_per_stack: 4 })
    } finally {
      vi.useRealTimers()
    }
  })

  it('flushes pending Playback edits before copying Reader defaults', async () => {
    const events: string[] = []
    const onSave = vi.fn(async (_patch: Partial<Settings>) => {
      events.push('save')
    })
    const onCopy = vi.fn(() => {
      events.push('copy')
    })
    render(
      <RwwSettingsEditor
        settings={{ ...DEFAULT_SETTINGS, words_per_stack: 3 }}
        onSave={onSave}
        onCopyFromReaderDefaults={onCopy}
      />
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Reader configuration' }))
    fireEvent.click(screen.getByRole('button', { name: 'Increase Words per stack' }))
    expect(onSave).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy from Reader defaults' }))
    })

    expect(onSave).toHaveBeenCalledOnce()
    expect(onSave.mock.calls[0][0]).toEqual({ rww_words_per_stack: 4 })
    expect(onCopy).toHaveBeenCalledOnce()
    expect(events).toEqual(['save', 'copy'])
  })

  it('saves Overlay controls directly without rww_* projection', () => {
    const onSave = vi.fn()
    render(<RwwSettingsEditor settings={DEFAULT_SETTINGS} onSave={onSave} />)

    fireEvent.click(screen.getByRole('tab', { name: 'Overlay' }))
    const standbyRow = screen.getByText('Show standby pill').closest('.settings-row')
    const standbyToggle = standbyRow?.querySelector('input[type="checkbox"]')
    expect(standbyToggle).toBeTruthy()
    fireEvent.click(standbyToggle!)

    expect(onSave).toHaveBeenCalledOnce()
    expect(onSave.mock.calls[0][0]).toEqual({
      read_while_working_show_standby_control: false,
    })
  })

  it('records a summon chord and saves it through the shortcut path, not onSave', () => {
    const onSave = vi.fn()
    const onSaveShortcut = vi.fn()
    render(
      <RwwSettingsEditor
        settings={{ ...DEFAULT_SETTINGS, read_while_working_shortcut: 'Control+Space' }}
        onSave={onSave}
        onSaveShortcut={onSaveShortcut}
      />
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Overlay' }))
    const summon = screen.getByRole('button', { name: 'Record Summon shortcut' })
    expect(summon.textContent).toBe('Ctrl + Space')

    fireEvent.click(summon)
    // Capturing state: the row prompts for a shortcut.
    const capturing = screen.getByRole('button', {
      name: /Recording Summon shortcut/i,
    })
    fireEvent.keyDown(capturing, { key: 'k', code: 'KeyK', ctrlKey: true, shiftKey: true })

    expect(onSaveShortcut).toHaveBeenCalledWith({
      read_while_working_shortcut: 'Control+Shift+K',
    })
    // Shortcut rebinds bypass the rww_* projection save path.
    expect(onSave).not.toHaveBeenCalled()
  })

  it('cancels shortcut capture on Escape without rebinding', () => {
    const onSaveShortcut = vi.fn()
    render(
      <RwwSettingsEditor
        settings={{ ...DEFAULT_SETTINGS, read_while_working_exit_shortcut: 'Control+Space' }}
        onSave={vi.fn()}
        onSaveShortcut={onSaveShortcut}
      />
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Overlay' }))
    fireEvent.click(screen.getByRole('button', { name: 'Record Exit shortcut' }))
    const capturing = screen.getByRole('button', { name: /Recording Exit shortcut/i })
    fireEvent.keyDown(capturing, { key: 'Escape', code: 'Escape' })

    expect(onSaveShortcut).not.toHaveBeenCalled()
    // Back to the idle keycap showing the unchanged chord.
    expect(screen.getByRole('button', { name: 'Record Exit shortcut' }).textContent).toBe(
      'Ctrl + Space'
    )
  })
})
