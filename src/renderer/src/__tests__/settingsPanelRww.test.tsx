/**
 * SettingsPanel — flat app-preferences surface tests (issue 09 / 07a).
 *
 * Settings is a 5-card grid landing (ADR-0014 §7 / issue 07a): Appearance,
 * Reader defaults, Read While Working, Import, Data. Chunking rules and the
 * restore-from-backup action live behind the Import card in an inline sub-view.
 * Reader tuning lives in the defaults editor; RWW management in the Console.
 *
 * Environment: happy-dom (matched by vitest.config.ts environmentMatchGlobs).
 */
import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react'
import SettingsPanel from '../components/SettingsPanel'
import { SettingsProvider } from '../contexts/SettingsContext'
import { NavigationProvider } from '../contexts/NavigationContext'
import type { Settings } from '../types'

afterEach(cleanup)

// ── Fixtures ──────────────────────────────────────────────────────────────────

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
  target_wpm: 200,
  read_while_working_enabled: false,
  read_while_working_shortcut: 'Control+Space',
  read_while_working_exit_shortcut: 'Control+Space',
  read_while_working_window_width: 640,
  read_while_working_window_height: 360,
  read_while_working_restore_clipboard: true,
  rww_bpm: 90,
  rww_words_per_stack: 2,
  rww_stacks_visible: 1,
  rww_lines_enabled: false,
  rww_lines_count: 2,
  custom_rww_playback_presets: [],
  custom_palettes: [],
  custom_text_presets: [],
  custom_font_presets: [],
  custom_playback_presets: [],
  custom_reader_configs: [],
}

let saveSettingsMock: ReturnType<typeof vi.fn>
let saveSettingsStoreMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  saveSettingsMock = vi.fn().mockResolvedValue(BASE_SETTINGS)
  saveSettingsStoreMock = vi.fn().mockImplementation(async (store) => store)
  vi.stubGlobal('api', {
    readWhileWorking: {
      getStatus: vi.fn().mockResolvedValue({
        enabled: false,
        supported: true,
        registered: false,
        shortcut: 'Control+Space',
        exitShortcut: 'Control+Space',
        exitRegistered: false,
        error: null,
        exitError: null,
      }),
    },
    db: {
      getSettings: vi.fn().mockResolvedValue(BASE_SETTINGS),
      saveSettings: saveSettingsMock,
      saveSettingsStore: saveSettingsStoreMock,
    },
  })
})

async function renderInProvider(jsx: React.ReactElement) {
  await act(async () => {
    render(
      <NavigationProvider>
        <SettingsProvider>{jsx}</SettingsProvider>
      </NavigationProvider>
    )
  })
}

async function renderPanel(
  opts: {
    settings?: Partial<Settings>
    onExport?: () => void
    onImport?: () => void
  } = {}
) {
  const merged = opts.settings ? { ...BASE_SETTINGS, ...opts.settings } : BASE_SETTINGS
  vi.mocked(window.api.db.getSettings).mockResolvedValue(merged)
  await renderInProvider(
      <SettingsPanel
        onExport={opts.onExport ?? vi.fn()}
        onImport={opts.onImport ?? vi.fn()}
      />
  )
}

const findCheckboxByLabel = (label: string) =>
  screen.queryAllByRole('checkbox').find(
    (el) =>
      el.closest('.settings-row')?.querySelector('.settings-label')?.textContent?.includes(label)
  )

// ── No mode chips / no density switch ─────────────────────────────────────────

describe('SettingsPanel — flat surface (no chips, no density)', () => {
  it('renders no mode chip tabs', async () => {
    await renderPanel()
    expect(screen.queryByRole('tab', { name: 'Global' })).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Standard Reader' })).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Read While Working' })).toBeNull()
  })

  it('renders no Simplified/Advanced density toggle', async () => {
    await renderPanel()
    expect(screen.queryByRole('button', { name: 'Simplified' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Advanced' })).toBeNull()
  })

  it('shows Appearance, Reader defaults, Overlay Reader, Import and Data cards on the landing grid', async () => {
    await renderPanel()
    const settingsSections = screen.getByRole('group', { name: 'Settings sections' })
    expect(within(settingsSections).getByRole('group', { name: 'Appearance' })).toBeTruthy()
    expect(
      within(settingsSections).getByRole('button', { name: 'Edit Reader defaults' })
    ).toBeTruthy()
    expect(
      within(settingsSections).getByRole('button', { name: 'Open Overlay Reader settings' })
    ).toBeTruthy()
    expect(
      within(settingsSections).getByRole('button', { name: 'Open Import settings' })
    ).toBeTruthy()
    expect(
      within(settingsSections).getByRole('button', { name: 'Open Data settings' })
    ).toBeTruthy()
    expect(within(settingsSections).getByRole('heading', { name: 'Reader defaults' })).toBeTruthy()
    expect(within(settingsSections).getByRole('heading', { name: 'Overlay Reader' })).toBeTruthy()
    expect(within(settingsSections).getByRole('heading', { name: 'Import' })).toBeTruthy()
    expect(within(settingsSections).getByRole('heading', { name: 'Data' })).toBeTruthy()
    // Chunking rules are behind the Import card — not on the landing grid.
    expect(screen.queryByRole('heading', { name: 'Chunking Rules' })).toBeNull()
  })
})

// ── Appearance ────────────────────────────────────────────────────────────────

describe('SettingsPanel — Appearance', () => {
  it('Theme remains editable — toggling to Light auto-saves immediately', async () => {
    await renderPanel()
    // Theme pills live directly on the Appearance card — no drill-in.
    fireEvent.click(screen.getByText('○ Light'))
    expect(screen.getByText('○ Light').className).toContain('theme-pill-active')
    expect(saveSettingsMock).toHaveBeenCalledTimes(1)
    expect((saveSettingsMock.mock.calls[0][0] as Partial<Settings>).theme).toBe('light')
  })

  it('does not expose a user-facing logo_style control', async () => {
    await renderPanel()
    expect(screen.queryByText(/logo style/i)).toBeNull()
    expect(screen.queryByRole('heading', { name: /logo/i })).toBeNull()
  })
})

// ── Reader defaults entry → two-tab editor (ADR-0019) ──────────────────────────

describe('SettingsPanel — Reader defaults entry', () => {
  it('opens the two-tab Reader-defaults editor from the entry (no card grid, no power view)', async () => {
    await renderPanel()
    // Flat surface: the defaults editor is not shown until the entry is opened.
    expect(screen.queryByRole('tab', { name: 'Playback & Grid Layout' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /edit reader defaults/i }))

    expect(screen.getByRole('region', { name: 'Reader defaults' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Reader defaults' })).toBeNull()
    // Two-tab editor (ADR-0019): Playback & Grid Layout · Display — no drill-in cards.
    expect(screen.getByRole('tab', { name: 'Playback & Grid Layout' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Display' })).toBeTruthy()
    expect(screen.queryByText('Edit everything')).toBeNull()
    // Reader-config auto-saves: no explicit Save button in the defaults editor.
    expect(screen.queryByRole('button', { name: /no changes|save changes/i })).toBeNull()
    // The flat-surface sections are no longer on screen.
    expect(screen.queryByRole('heading', { name: 'Chunking Rules' })).toBeNull()
  })

  it('lands on Playback & Grid Layout and switches to the Display sections', async () => {
    await renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /edit reader defaults/i }))

    // Tab 1 shows both column headings on one screen.
    expect(screen.getByRole('heading', { name: 'Playback' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Grid Layout' })).toBeTruthy()

    // Switch to Display without leaving the editor; its three sections appear together.
    fireEvent.click(screen.getByRole('tab', { name: 'Display' }))
    expect(screen.getByRole('heading', { name: 'Text & Highlighting' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Colors' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Spacing' })).toBeTruthy()
  })

  it('removes the old in-flow Back to Settings button from the editor host', async () => {
    await renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /edit reader defaults/i }))
    expect(screen.getByRole('tab', { name: 'Playback & Grid Layout' })).toBeTruthy()

    expect(screen.queryByRole('button', { name: /back to settings/i })).toBeNull()
  })
})

// ── Overlay Reader entry → Settings subview ────────────────────────────────────

describe('SettingsPanel — Read While Working entry', () => {
  it('opens the Overlay Reader settings subview on the Overlay tab', async () => {
    await renderPanel()

    // No raw RWW management in flat Settings.
    expect(screen.queryByRole('heading', { name: 'Overlay & Shortcuts' })).toBeNull()
    expect(
      screen.queryByRole('button', { name: /record overlay reader shortcut/i })
    ).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /open overlay reader settings/i }))
    expect(screen.getByRole('region', { name: 'Overlay Reader settings' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Overlay Reader settings' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Start Overlay Reader' })).toBeNull()
    expect(screen.getByRole('tab', { name: 'Overlay' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Overlay' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'Reader configuration' })).toBeTruthy()
    // Window size is a collapsed fold-down (ADR-0021): a size summary shows and the
    // width/height sliders are hidden until the block is expanded.
    expect(screen.getByText('640 × 360')).toBeTruthy()
    expect(screen.queryByRole('slider', { name: 'Overlay width' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Window size/ }))
    expect(screen.getByRole('slider', { name: 'Overlay width' })).toBeTruthy()
    expect(screen.getByRole('slider', { name: 'Overlay height' })).toBeTruthy()
    // Shortcut rebinding is rehomed to the Overlay tab body (ADR-0021).
    expect(screen.getByRole('button', { name: 'Record Summon shortcut' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Record Exit shortcut' })).toBeTruthy()
    expect(screen.queryByText('Restore clipboard')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Preview' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copy from Reader defaults' })).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: 'Reader configuration' }))
    expect(screen.getByRole('slider', { name: 'Speed' })).toBeTruthy()
    expect(screen.getByRole('spinbutton', { name: 'Words per stack value' })).toBeTruthy()
    expect(screen.getByRole('slider', { name: 'Font size' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Preview' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy from Reader defaults' })).toBeTruthy()
  })

  it('copies Reader defaults into the six Overlay Reader reader fields store-natively', async () => {
    await renderPanel({
      settings: {
        bpm: 140,
        words_per_stack: 5,
        stacks_visible: 2,
        lines_enabled: true,
        lines_count: 4,
        font_size: 44,
        rww_bpm: 60,
        rww_words_per_stack: 1,
        rww_stacks_visible: 1,
        rww_lines_enabled: false,
        rww_lines_count: 2,
        rww_font_size: 20,
        read_while_working_window_width: 777,
      },
    })

    fireEvent.click(screen.getByRole('button', { name: /open overlay reader settings/i }))
    fireEvent.click(screen.getByRole('tab', { name: 'Reader configuration' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy from Reader defaults' }))
    })

    expect(saveSettingsStoreMock).toHaveBeenCalledOnce()
    const savedStore = saveSettingsStoreMock.mock.calls[0][0] as {
      reader: Record<string, unknown>
      rww: Record<string, unknown>
    }
    expect(savedStore.rww.bpm).toBe(savedStore.reader.bpm)
    expect(savedStore.rww.words_per_stack).toBe(savedStore.reader.words_per_stack)
    expect(savedStore.rww.stacks_visible).toBe(savedStore.reader.stacks_visible)
    expect(savedStore.rww.lines_enabled).toBe(savedStore.reader.lines_enabled)
    expect(savedStore.rww.lines_count).toBe(savedStore.reader.lines_count)
    expect(savedStore.rww.font_size).toBe(savedStore.reader.font_size)
    expect(savedStore.rww.read_while_working_window_width).toBe(777)
    expect('stack_gap' in savedStore.rww).toBe(false)
  })

  it('does not render the raw read_while_working_enabled toggle', async () => {
    await renderPanel()
    const enableToggle = findCheckboxByLabel('Enable')
    expect(enableToggle).toBeUndefined()
  })
})

// ── Import / chunking still saves ──────────────────────────────────────────────

describe('SettingsPanel — chunking auto-save', () => {
  it('persists a chunking rule toggle immediately on change', async () => {
    await renderPanel()
    // Chunking rules live behind the Import card — navigate there first.
    fireEvent.click(screen.getByRole('button', { name: /open import settings/i }))
    const commasToggle = findCheckboxByLabel('Commas')
    expect(commasToggle).toBeTruthy()
    fireEvent.click(commasToggle!)
    expect(saveSettingsMock).toHaveBeenCalledTimes(1)
    const patch = saveSettingsMock.mock.calls[0][0] as Partial<Settings>
    expect(patch.chunk_rule_commas).toBe(true)
  })
})

// ── Data export / import ───────────────────────────────────────────────────────

describe('SettingsPanel - Data export/import', () => {
  it('fires the export callback from the Data sub-view', async () => {
    const onExport = vi.fn()
    await renderPanel({ onExport })

    fireEvent.click(screen.getByRole('button', { name: /open data settings/i }))
    expect(screen.getByRole('button', { name: /create portable drive/i })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /export all data/i }))
    expect(onExport).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.rdc-back')).toBeNull()
  })

  it('fires the import callback from the Import sub-view', async () => {
    const onImport = vi.fn()
    await renderPanel({ onImport })

    fireEvent.click(screen.getByRole('button', { name: /open import settings/i }))
    fireEvent.click(screen.getByRole('button', { name: /import from json/i }))
    expect(onImport).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.rdc-back')).toBeNull()
  })
})

// ── Transmute entry path is unchanged (issue 04) ───────────────────────────────

describe('SettingsPanel — transmute entry path', () => {
  it('renders the transmute editor and no flat-surface sections or chips', async () => {
    await renderInProvider(
      <SettingsPanel onExport={vi.fn()} onImport={vi.fn()} mode="transmute" />
    )
    expect(screen.getByRole('heading', { name: 'Transmute Reader Settings' })).toBeTruthy()
    expect(screen.queryByRole('tab', { name: 'Global' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Chunking Rules' })).toBeNull()
  })
})
