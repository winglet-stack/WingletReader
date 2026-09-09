/**
 * Quick Settings mode logic — Reader.tsx and ReaderConfigPanel.tsx.
 *
 * Covers:
 *  - Quick Settings panel visibility rules for Tap vs BPM mode (the only split
 *    left after ADR-0019 §4 de-UI'd Lock-at-WPM: Speed is always the BPM slider)
 *  - A stored lock_at_wpm can't strand the Speed control or hide Words-per-stack
 *  - Tap-to-read toggle patches only tap_to_read (no lock coupling)
 *  - ReaderConfigPanel (out of scope — the Transmute/RWW-entry editor still keeps
 *    the Lock/Target controls) still mirrors the lock mode rules.
 *
 * Issue 05 (ADR-0014 §6) rebuilt Quick Settings as a flat ordered live list on
 * the shared instruments (SliderField / Stepper / Segmented). The named-triplet
 * rows + per-row fine-tune reveals are gone: Speed/Text-size are sliders shown
 * directly, Words-per-stack/Stacks/Lines are steppers. Selectors below were
 * retargeted to the instruments; the live/persist/onBeforeRetokenize behavioural
 * contract is unchanged.
 *
 * Environment: happy-dom (matched by vitest.config.ts environmentMatchGlobs).
 */

import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import Reader from '../components/Reader'
import ReaderConfigPanel from '../components/ReaderConfigPanel'
import ReaderConfigDrawer from '../components/reader/ReaderConfigDrawer'
import type { Settings, TextRecord } from '../types'
import { NavigationProvider, useNavigation } from '../contexts/NavigationContext'
import { SettingsProvider } from '../contexts/SettingsContext'
import { LibraryProvider } from '../contexts/LibraryContext'
import { ReaderProvider, useReader } from '../contexts/ReaderContext'

// ── Cleanup ───────────────────────────────────────────────────────────────────
afterEach(cleanup)

// ── Shared mocks ──────────────────────────────────────────────────────────────

const mockOscillator = {
  connect: vi.fn(), start: vi.fn(), stop: vi.fn(),
  type: 'sine', frequency: { setValueAtTime: vi.fn() },
}
const mockGain = {
  connect: vi.fn(),
  gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
}
vi.stubGlobal('AudioContext', vi.fn(() => ({
  state: 'running', currentTime: 0,
  createOscillator: vi.fn(() => mockOscillator),
  createGain: vi.fn(() => mockGain),
  destination: {}, resume: vi.fn(), close: vi.fn(),
})))

vi.stubGlobal('api', {
  db: {
    getTexts: vi.fn().mockResolvedValue([]),
    getSettings: vi.fn().mockResolvedValue({}),
    saveSettings: vi.fn().mockResolvedValue({}),
    getReadingPosition: vi.fn().mockResolvedValue(null),
    getLatestResumeCandidate: vi.fn().mockResolvedValue(null),
    saveReadingPosition: vi.fn().mockResolvedValue({}),
    recordSessionStats: vi.fn().mockResolvedValue(undefined),
  },
})

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** 200-word text — long enough that fast-BPM playback doesn't stop mid-test. */
const LONG_CONTENT = Array.from({ length: 200 }, (_, i) => `word${i + 1}`).join(' ')

const BASE_SETTINGS: Settings = {
  words_per_stack: 2,
  stacks_visible: 1,
  stack_gap: 32,
  bpm: 120,
  metronome_enabled: false,
  pause_at_sentences: false,
  pause_at_headlines: false,
  font_size: 36,
  stack_vertical_offset: 0,
  stack_horizontal_offset: 0,
  theme: 'dark',
  highlight_active: false,
  lines_count: 1,
  lines_anchor: 'center',
  lines_row_gap: 0,
  segmentation_enabled: false,
  segmentation_threshold: 5000,
  segmentation_chunk_size: 1500,
  auto_chapter_detection: false,
  summaries_initialized: false,
  chunk_rule_long_word: false,
  chunk_rule_enumerations: false,
  chunk_rule_bullets: false,
  chunk_rule_commas: false,
  chunk_rule_names: false,
  chunk_rule_headlines: false,
  view_style: 'default',
  show_chunk_dividers: false,
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

const SAMPLE_TEXT: TextRecord = {
  id: 1, title: 'Test Book',
  content: 'one two three four five six seven eight nine ten eleven twelve',
  word_count: 12,
}

/** Render Reader inside the full provider stack with synchronous settings/text injection. */
function renderReader(
  text: TextRecord,
  settingsOverride: Partial<Settings> = {},
  opts: { onBack?: () => void } = {}
) {
  const settings = { ...BASE_SETTINGS, ...settingsOverride }
  render(
    <NavigationProvider>
      <SettingsProvider initialSettings={settings}>
        <LibraryProvider initialActiveText={text}>
          <ReaderProvider>
            <Reader onBack={opts.onBack ?? vi.fn()} onExitToLibrary={vi.fn()} />
          </ReaderProvider>
        </LibraryProvider>
      </SettingsProvider>
    </NavigationProvider>
  )
}

function ReaderRoute({ children }: { children: React.ReactNode }) {
  const { view, setView } = useNavigation()
  React.useEffect(() => {
    setView('reader')
  }, [setView])
  if (view !== 'reader') return null
  return <>{children}</>
}

function ReaderDrawerTestControls() {
  const {
    readerConfigDrawerOpen,
    setReaderConfigDrawerOpen,
  } = useReader()
  const { view } = useNavigation()
  return (
    <div>
      <span data-testid="reader-route-view">{view}</span>
      <span data-testid="reader-drawer-open">{String(readerConfigDrawerOpen)}</span>
      <button
        data-testid="open-reader-drawer"
        onClick={() => setReaderConfigDrawerOpen(true)}
      >
        open drawer
      </button>
    </div>
  )
}

function renderReaderInReaderRoute(
  text: TextRecord,
  settingsOverride: Partial<Settings> = {},
  opts: { onBack?: () => void } = {}
) {
  const settings = { ...BASE_SETTINGS, ...settingsOverride }
  render(
    <NavigationProvider>
      <ReaderRoute>
        <SettingsProvider initialSettings={settings}>
          <LibraryProvider initialActiveText={text}>
            <ReaderProvider>
              <ReaderDrawerTestControls />
              <Reader onBack={opts.onBack ?? vi.fn()} onExitToLibrary={vi.fn()} />
            </ReaderProvider>
          </LibraryProvider>
        </SettingsProvider>
      </ReaderRoute>
    </NavigationProvider>
  )
}

/** Open the Quick Settings dropdown. */
function openQuickSettings() {
  fireEvent.click(screen.getByRole('button', { name: 'Quick settings' }))
}

// ── Quick Settings — visibility per mode ─────────────────────────────────────

describe('Reader config drawer', () => {
  it('shows the stage-4 advisory without mutating settings values', () => {
    const onChange = vi.fn()
    render(
      <ReaderConfigDrawer
        open
        value={{ ...BASE_SETTINGS, words_per_stack: 3, stacks_visible: 4 }}
        onChange={onChange}
        onClose={vi.fn()}
        layoutAdvisory={{
          degradation: {
            stage: 'stage-4',
            axis: 'both',
            comfortFontSize: 18,
          },
          effectiveFontSize: 12,
        }}
      />
    )

    expect(screen.getByRole('status').textContent).toBe(
      'Text is very small at this window size. Fewer stacks or words per stack will make it larger.'
    )
    expect(onChange).not.toHaveBeenCalled()
    expect((screen.getByRole('spinbutton', { name: 'Words per stack value' }) as HTMLInputElement).value).toBe('3')
    expect((screen.getByRole('spinbutton', { name: 'Stacks visible value' }) as HTMLInputElement).value).toBe('4')
  })

  it('uses stronger copy below the practical readability threshold', () => {
    const { container } = render(
      <ReaderConfigDrawer
        open
        value={BASE_SETTINGS}
        onChange={vi.fn()}
        onClose={vi.fn()}
        layoutAdvisory={{
          degradation: {
            stage: 'stage-4',
            axis: 'height',
            comfortFontSize: 18,
          },
          effectiveFontSize: 7.9,
        }}
      />
    )

    expect(screen.getByRole('status').textContent).toBe(
      'Text is not practically readable at this window size. Fewer stacks or words per stack will make it larger.'
    )
    expect(container.querySelector('.reader-config-drawer__advisory--severe')).toBeTruthy()
  })

  it('shows no advisory for comfortable live layout stages', () => {
    render(
      <ReaderConfigDrawer
        open
        value={BASE_SETTINGS}
        onChange={vi.fn()}
        onClose={vi.fn()}
        layoutAdvisory={{
          degradation: {
            stage: 'stage-1',
            axis: 'none',
            comfortFontSize: 18,
          },
          effectiveFontSize: 36,
        }}
      />
    )

    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByText(/Text is very small/)).toBeNull()
  })

  it('opens beside Reader without routing away or remounting the stage', async () => {
    renderReaderInReaderRoute(SAMPLE_TEXT)
    await screen.findByRole('button', { name: 'Play' })

    const stage = document.querySelector('.reader-stage')
    expect(stage).toBeTruthy()

    fireEvent.click(screen.getByTestId('open-reader-drawer'))

    expect(screen.getByTestId('reader-route-view').textContent).toBe('reader')
    expect(screen.getByTestId('reader-drawer-open').textContent).toBe('true')
    expect(screen.getByRole('complementary', { name: 'Reader settings' })).toBeTruthy()
    expect(document.querySelector('.reader-stage')).toBe(stage)
  })

  it('persists live drawer edits and preserves position for words-per-stack changes', async () => {
    const saveSettings = vi.mocked(window.api.db.saveSettings)
    saveSettings.mockClear()
    saveSettings.mockResolvedValue({ ...BASE_SETTINGS, bpm: 600, words_per_stack: 3 })
    renderReaderInReaderRoute(
      { id: 2, title: 'Long', content: LONG_CONTENT, word_count: 200 },
      { bpm: 600 }
    )
    await screen.findByRole('button', { name: 'Play' })

    vi.useFakeTimers()
    try {
      act(() => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })
      act(() => { vi.advanceTimersByTime(300) })
      act(() => { fireEvent.click(screen.getByRole('button', { name: 'Pause' })) })

      const scrubber = screen.getByRole('slider', { name: 'Reading position' }) as HTMLInputElement
      expect(Number(scrubber.value)).toBeGreaterThan(0)

      fireEvent.click(screen.getByTestId('open-reader-drawer'))
      // The drawer now hosts the shared editor (SR-4): its Stepper commits the
      // typed value on blur, then the debounced draft persists. Type, blur to
      // commit, and flush the 400 ms debounce window.
      const wpsInput = screen.getByRole('spinbutton', { name: 'Words per stack value' })
      act(() => {
        fireEvent.change(wpsInput, { target: { value: '3' } })
        fireEvent.blur(wpsInput)
      })
      act(() => { vi.advanceTimersByTime(400) })
      await act(async () => { await Promise.resolve() })

      expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({ words_per_stack: 3 }))
      expect(document.querySelector('.reader-meta')?.textContent).toMatch(/1800 wpm/)
      const scrubberAfter = screen.getByRole('slider', { name: 'Reading position' }) as HTMLInputElement
      expect(Number(scrubberAfter.value)).toBeGreaterThan(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('Quick Settings — visibility: tap_to_read=true', () => {
  it('hides the Speed (BPM) slider when tap mode is on', () => {
    renderReader(SAMPLE_TEXT, { tap_to_read: true })
    openQuickSettings()
    expect(screen.queryByRole('slider', { name: 'BPM' })).toBeNull()
  })

  it('shows the Words per stack stepper when tap mode is on', () => {
    renderReader(SAMPLE_TEXT, { tap_to_read: true })
    openQuickSettings()
    expect(screen.getByRole('group', { name: 'Words per stack' })).toBeTruthy()
  })

  it('never renders Lock-at-WPM or Target WPM controls (de-UI\'d — ADR-0019 §4)', () => {
    // Even a stored lock_at_wpm:true must not resurrect the culled controls.
    renderReader(SAMPLE_TEXT, { tap_to_read: true, lock_at_wpm: true })
    openQuickSettings()
    expect(screen.queryByRole('checkbox', { name: 'Lock at WPM' })).toBeNull()
    expect(screen.queryByRole('slider', { name: 'Target WPM' })).toBeNull()
    // WPS stays visible; tap simply hides Speed.
    expect(screen.getByRole('group', { name: 'Words per stack' })).toBeTruthy()
    expect(screen.queryByRole('slider', { name: 'BPM' })).toBeNull()
  })
})

describe('ReaderConfigPanel - slider keyboard changes flush on next action', () => {
  it('saves a pending slider value when the slider loses focus', () => {
    vi.useFakeTimers()
    const onSave = vi.fn()
    render(<ReaderConfigPanel settings={BASE_SETTINGS} onSave={onSave} />)

    const slider = screen.getByRole('slider', { name: /font size/i }) as HTMLInputElement
    fireEvent.change(slider, { target: { value: '48' } })
    fireEvent.blur(slider)

    expect(onSave).toHaveBeenCalledOnce()
    expect(onSave.mock.calls[0][0]).toEqual(expect.objectContaining({ font_size: 48 }))
    vi.useRealTimers()
  })
})

describe('Quick Settings — visibility: BPM mode (tap_to_read=false)', () => {
  it('shows the BPM slider directly', () => {
    renderReader(SAMPLE_TEXT)
    openQuickSettings()
    expect(screen.getByRole('slider', { name: 'BPM' })).toBeTruthy()
  })

  it('shows the Words per stack stepper', () => {
    renderReader(SAMPLE_TEXT)
    openQuickSettings()
    expect(screen.getByRole('group', { name: 'Words per stack' })).toBeTruthy()
  })

  it('renders no Lock-at-WPM checkbox (control de-UI\'d — ADR-0019 §4)', () => {
    renderReader(SAMPLE_TEXT)
    openQuickSettings()
    expect(screen.queryByRole('checkbox', { name: 'Lock at WPM' })).toBeNull()
  })

  it('shows BPM, not Target WPM', () => {
    renderReader(SAMPLE_TEXT)
    openQuickSettings()
    expect(screen.queryByRole('slider', { name: 'Target WPM' })).toBeNull()
  })
})

describe('Quick Settings — a stored lock_at_wpm is inert (Speed always BPM)', () => {
  it('still shows the BPM slider and never Target WPM when lock_at_wpm is stored true', () => {
    renderReader(SAMPLE_TEXT, { lock_at_wpm: true })
    openQuickSettings()
    // The stored lock is dormant: Speed does not swap to Target WPM.
    expect(screen.getByRole('slider', { name: 'BPM' })).toBeTruthy()
    expect(screen.queryByRole('slider', { name: 'Target WPM' })).toBeNull()
  })

  it('still shows the Words per stack stepper when lock_at_wpm is stored true', () => {
    renderReader(SAMPLE_TEXT, { lock_at_wpm: true })
    openQuickSettings()
    expect(screen.getByRole('group', { name: 'Words per stack' })).toBeTruthy()
  })
})

// ── Quick Settings — mode transitions ─────────────────────────────────────────

describe('Quick Settings — Tap to Read toggle patches only tap_to_read', () => {
  it('patches {tap_to_read:true} without touching lock_at_wpm', () => {
    vi.mocked(window.api.db.saveSettings).mockResolvedValue({ ...BASE_SETTINGS, tap_to_read: true })
    renderReader(SAMPLE_TEXT, { tap_to_read: false })
    openQuickSettings()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Tap to Read' }))

    const patch = vi.mocked(window.api.db.saveSettings).mock.calls.at(-1)![0]
    expect(patch).toEqual(expect.objectContaining({ tap_to_read: true }))
    // The lock coupling is gone — the toggle no longer writes lock_at_wpm.
    expect(patch).not.toHaveProperty('lock_at_wpm')
  })

  it('enabling Tap hides the Speed slider but keeps Words per stack', () => {
    renderReader(SAMPLE_TEXT, { tap_to_read: false })
    openQuickSettings()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Tap to Read' }))

    expect(screen.queryByRole('slider', { name: 'BPM' })).toBeNull()
    expect(screen.getByRole('group', { name: 'Words per stack' })).toBeTruthy()
  })
})

// ── Quick Settings — top bar / idle meta ──────────────────────────────────────

describe('Quick Settings — WPM/min-left hidden in tap mode', () => {
  it('shows "Tap mode" in the top bar when tap_to_read is true', () => {
    renderReader(SAMPLE_TEXT, { tap_to_read: true })
    expect(screen.getByText('Tap mode')).toBeTruthy()
  })

  it('shows "wpm" in the top bar meta when tap_to_read is false', () => {
    renderReader(SAMPLE_TEXT, { tap_to_read: false })
    // The .reader-meta span should contain "X wpm · Y min left" (multiple elements may show WPM)
    const meta = document.querySelector('.reader-meta')
    expect(meta?.textContent).toMatch(/\d+ wpm/)
  })
})

// ── Quick Settings — flat instrument list (no triplets) ───────────────────────

describe('Quick Settings — flat instrument list', () => {
  it('uses Line count as the sole row-count control and restores the stored Anchor', () => {
    const saveSettings = vi.mocked(window.api.db.saveSettings)
    saveSettings.mockClear()
    renderReader(SAMPLE_TEXT, { lines_count: 3, lines_anchor: 'top' })
    openQuickSettings()

    expect(screen.queryByText('Multiple lines')).toBeNull()
    const count = screen.getByRole('spinbutton', { name: 'Line count value' }) as HTMLInputElement
    expect(count.value).toBe('3')
    expect(screen.getByRole('button', { name: 'Top-anchored' }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.change(count, { target: { value: '1' } })
    fireEvent.blur(count)
    expect(screen.queryByRole('group', { name: 'Anchor' })).toBeNull()
    expect(saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({
      lines_count: 1,
    }))

    fireEvent.change(count, { target: { value: '3' } })
    fireEvent.blur(count)
    expect(screen.getByRole('button', { name: 'Top-anchored' }).getAttribute('aria-pressed')).toBe('true')
    expect(saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({
      lines_count: 3,
    }))
  })

  it('shows a one-line count without revealing the anchor', () => {
    renderReader(SAMPLE_TEXT, { lines_count: 1, lines_anchor: 'top' })
    openQuickSettings()

    expect((screen.getByRole('spinbutton', { name: 'Line count value' }) as HTMLInputElement).value).toBe('1')
    expect(screen.queryByRole('group', { name: 'Anchor' })).toBeNull()
  })

  it('renders no Simplified/Advanced density switch', () => {
    renderReader(SAMPLE_TEXT)
    openQuickSettings()
    expect(screen.queryByRole('group', { name: 'Quick settings density' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Simplified' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Advanced' })).toBeNull()
  })

  it('shows Speed, Words-per-stack, and Text-size as direct instruments (no triplet groups)', () => {
    renderReader(SAMPLE_TEXT)
    openQuickSettings()
    expect(screen.getByRole('slider', { name: 'BPM' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Words per stack' })).toBeTruthy()
    expect(screen.getByRole('slider', { name: 'Font size' })).toBeTruthy()
    // The old triplet group wrappers are gone
    expect(screen.queryByRole('group', { name: 'Speed (Quick Settings)' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Text size (Quick Settings)' })).toBeNull()
  })

  it('Speed BPM slider previews live on drag and persists on release', () => {
    const saveSettings = vi.mocked(window.api.db.saveSettings)
    saveSettings.mockClear()
    renderReader(SAMPLE_TEXT)
    openQuickSettings()

    const slider = screen.getByRole('slider', { name: 'BPM' }) as HTMLInputElement
    // Drag = live preview only (no persist)
    fireEvent.change(slider, { target: { value: slider.max } })
    expect(saveSettings).not.toHaveBeenCalled()
    // Release persists the dragged value
    fireEvent.mouseUp(slider, { target: { value: slider.max } })
    expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({ bpm: expect.any(Number) }))
  })

  it('Text size slider previews live on drag and persists on release', () => {
    const saveSettings = vi.mocked(window.api.db.saveSettings)
    saveSettings.mockClear()
    saveSettings.mockResolvedValue({ ...BASE_SETTINGS, font_size: 60 })
    renderReader(SAMPLE_TEXT)
    openQuickSettings()

    const slider = screen.getByRole('slider', { name: 'Font size' }) as HTMLInputElement
    // Drag = live preview only (no persist)
    fireEvent.change(slider, { target: { value: '60' } })
    expect(saveSettings).not.toHaveBeenCalled()
    // Release persists the dragged value
    fireEvent.mouseUp(slider, { target: { value: '60' } })
    expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({ font_size: 60 }))
  })

  it('Words-per-stack stepper persists and preserves reading position', async () => {
    vi.useFakeTimers()
    try {
      const saveSettings = vi.mocked(window.api.db.saveSettings)
      saveSettings.mockClear()
      saveSettings.mockResolvedValue({ ...BASE_SETTINGS, words_per_stack: 2 })
      const LONG_TEXT: TextRecord = { id: 3, title: 'Long', content: LONG_CONTENT, word_count: 200 }
      renderReader(LONG_TEXT, { words_per_stack: 1, bpm: 600 })

      act(() => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })
      act(() => { vi.advanceTimersByTime(300) })
      act(() => { fireEvent.click(screen.getByRole('button', { name: 'Pause' })) })

      const scrubber = screen.getByRole('slider', { name: 'Reading position' }) as HTMLInputElement
      expect(Number(scrubber.value)).toBeGreaterThan(0)

      openQuickSettings()
      act(() => { fireEvent.click(screen.getByRole('button', { name: 'Increase Words per stack' })) })
      await act(async () => { await Promise.resolve() })

      expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({ words_per_stack: 2 }))
      const scrubberAfter = screen.getByRole('slider', { name: 'Reading position' }) as HTMLInputElement
      expect(Number(scrubberAfter.value)).toBeGreaterThan(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('Highlight mode segmented appears only when highlighting is on and writes the legacy twin', () => {
    const saveSettings = vi.mocked(window.api.db.saveSettings)
    saveSettings.mockClear()
    saveSettings.mockResolvedValue({ ...BASE_SETTINGS })

    // Off: no highlight-mode control
    const { unmount } = render(
      <NavigationProvider>
        <SettingsProvider initialSettings={{ ...BASE_SETTINGS, highlight_active: false }}>
          <LibraryProvider initialActiveText={SAMPLE_TEXT}>
            <ReaderProvider>
              <Reader onBack={vi.fn()} onExitToLibrary={vi.fn()} />
            </ReaderProvider>
          </LibraryProvider>
        </SettingsProvider>
      </NavigationProvider>
    )
    openQuickSettings()
    expect(screen.queryByRole('group', { name: 'Highlight mode' })).toBeNull()
    unmount()

    // On: segmented appears; picking Progressive writes both highlight_mode + twin
    renderReader(SAMPLE_TEXT, { highlight_active: true })
    openQuickSettings()
    const modeGroup = screen.getByRole('group', { name: 'Highlight mode' })
    expect(modeGroup).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Progressive' }))
    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ highlight_mode: 'progressive-bar', highlighting_mode: 'progressive' })
    )
  })
})

// ── Quick Settings — "See more settings" opens drawer ────────────────────────

describe('Quick Settings — See more settings opens Reader config drawer', () => {
  it('opens the drawer, closes the popover, and does not navigate away', async () => {
    renderReaderInReaderRoute(SAMPLE_TEXT)
    await screen.findByRole('button', { name: 'Play' })

    const stage = document.querySelector('.reader-stage')
    expect(stage).toBeTruthy()

    openQuickSettings()
    expect(screen.getByRole('dialog', { name: 'Quick settings' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /see more settings/i }))

    // Drawer opened
    expect(screen.getByRole('complementary', { name: 'Reader settings' })).toBeTruthy()
    // Popover closed
    expect(screen.queryByRole('dialog', { name: 'Quick settings' })).toBeNull()
    // Still on reader route
    expect(screen.getByTestId('reader-route-view').textContent).toBe('reader')
    // Stage not remounted
    expect(document.querySelector('.reader-stage')).toBe(stage)
  })
})

describe('ReaderConfigPanel — Tap mode shows Words per Stack even if lock_at_wpm=true', () => {
  it('Words per Stack row visible when tap_to_read=true regardless of lock_at_wpm', () => {
    render(
      <ReaderConfigPanel
        settings={{ ...BASE_SETTINGS, tap_to_read: true, lock_at_wpm: true }}
        onSave={vi.fn()}
      />
    )
    // The WPS label must be present
    expect(screen.getByText('Words per stack')).toBeTruthy()
  })

  it('Words per Stack row hidden when tap_to_read=false and lock_at_wpm=true', () => {
    render(
      <ReaderConfigPanel
        settings={{ ...BASE_SETTINGS, tap_to_read: false, lock_at_wpm: true }}
        onSave={vi.fn()}
      />
    )
    expect(screen.queryByText('Words per stack')).toBeNull()
  })
})
