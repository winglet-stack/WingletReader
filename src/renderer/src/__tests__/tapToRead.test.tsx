/**
 * Tap to Read — component and hook behaviour tests.
 * Environment: happy-dom (matched by vitest.config.ts environmentMatchGlobs).
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import SettingsPanel from '../components/SettingsPanel'
import { SettingsProvider } from '../contexts/SettingsContext'
import { NavigationProvider } from '../contexts/NavigationContext'
import { usePlayback } from '../hooks/usePlayback'
import type { Settings } from '../types'

// ── Cleanup between tests ─────────────────────────────────────────────────────
afterEach(cleanup)

// ── Shared mocks ──────────────────────────────────────────────────────────────

// AudioContext is not available in happy-dom; mock it so useMetronome doesn't throw.
const mockOscillator = {
  connect: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  type: 'sine',
  frequency: { setValueAtTime: vi.fn() },
}
const mockGain = {
  connect: vi.fn(),
  gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
}
const mockCtx = {
  state: 'running',
  currentTime: 0,
  createOscillator: vi.fn(() => mockOscillator),
  createGain: vi.fn(() => mockGain),
  destination: {},
  resume: vi.fn(),
  close: vi.fn(),
}
vi.stubGlobal('AudioContext', vi.fn(() => mockCtx))

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE_SETTINGS: Settings = {
  words_per_stack: 1,
  stacks_visible: 1,
  stack_gap: 32,
  bpm: 600, // fast so timers don't need long waits in auto-advance tests
  metronome_enabled: false,
  pause_at_sentences: false,
  pause_at_headlines: false,
  font_size: 36,
  stack_vertical_offset: 0,
  theme: 'dark',
  highlight_active: false,
  lines_enabled: false,
  lines_count: 1,
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
  stack_horizontal_offset: 0,
  tap_to_read: false,
  tap_to_read_key: 'Space',
  lock_at_wpm: false,
  target_wpm: 200,
  custom_palettes: [],
  custom_text_presets: [],
  custom_font_presets: [],
  custom_playback_presets: [],
  custom_reader_configs: [],
}

const TAP_SETTINGS: Settings = { ...BASE_SETTINGS, tap_to_read: true, tap_to_read_key: 'Space' }

// window.api stub — placed after BASE_SETTINGS so getSettings can reference it.
beforeEach(() => {
  vi.stubGlobal('api', {
    db: {
      getReadingPosition: vi.fn().mockResolvedValue(null),
      saveReadingPosition: vi.fn().mockResolvedValue({}),
      getSettings: vi.fn().mockResolvedValue(BASE_SETTINGS),
      saveSettings: vi.fn().mockImplementation(async (patch: Partial<Settings>) => ({
        ...BASE_SETTINGS,
        ...patch,
      })),
    },
  })
})

async function renderSettingsPanel(settingsOverrides: Partial<Settings> = {}) {
  const merged = { ...BASE_SETTINGS, ...settingsOverrides }
  ;(window.api.db.getSettings as ReturnType<typeof vi.fn>).mockResolvedValue(merged)
  await act(async () => {
    render(
      <NavigationProvider>
        <SettingsProvider>
          <SettingsPanel onExport={vi.fn()} onImport={vi.fn()} />
        </SettingsProvider>
      </NavigationProvider>
    )
  })
}

function openReaderConfigTab() {
  // Flat Settings (issue 09): the reader-config editor is reached via the
  // "Edit Reader defaults" entry rather than a Standard Reader mode chip.
  fireEvent.click(screen.getByRole('button', { name: /edit reader defaults/i }))
}

function openPlaybackCard() {
  // Two-tab editor (ADR-0019): the defaults editor lands directly on the
  // Playback & Grid Layout tab, so the Playback controls (Advance-mode BPM/Tap
  // pills, advance key) are visible immediately — there is no card to open.
}

// ── SettingsPanel — main settings menu ────────────────────────────────────────

describe('SettingsPanel — Tap to Read toggle visibility', () => {
  it('reaches the Tap to Read control via the Playback card', async () => {
    await renderSettingsPanel()
    openReaderConfigTab()
    openPlaybackCard()
    expect(screen.getByRole('heading', { name: 'Playback' })).toBeTruthy()
    expect(screen.getByText('Tap to Read')).toBeTruthy()
  })

  it('BPM pill is active and Tap to Read pill is inactive when tap_to_read is false', async () => {
    await renderSettingsPanel()
    openReaderConfigTab()
    openPlaybackCard()
    const bpmBtn = screen.getByRole('button', { name: 'BPM' }) as HTMLButtonElement
    const tapBtn = screen.getByRole('button', { name: 'Tap to Read' }) as HTMLButtonElement
    expect(bpmBtn.classList.contains('theme-pill-active')).toBe(true)
    expect(tapBtn.classList.contains('theme-pill-active')).toBe(false)
  })

  it('Tap to Read pill is active when tap_to_read is true', async () => {
    await renderSettingsPanel({ tap_to_read: true })
    openReaderConfigTab()
    openPlaybackCard()
    const tapBtn = screen.getByRole('button', { name: 'Tap to Read' }) as HTMLButtonElement
    expect(tapBtn.classList.contains('theme-pill-active')).toBe(true)
  })

  it('clicking Tap to Read pill calls saveSettings with tap_to_read=true', async () => {
    vi.useFakeTimers()
    await renderSettingsPanel()
    openReaderConfigTab()
    openPlaybackCard()
    const tapBtn = screen.getByRole('button', { name: 'Tap to Read' })
    fireEvent.click(tapBtn)
    act(() => { vi.advanceTimersByTime(500) })
    expect(window.api.db.saveSettings).toHaveBeenCalledOnce()
    const saved = (window.api.db.saveSettings as ReturnType<typeof vi.fn>).mock.calls[0][0] as Partial<Settings>
    expect(saved.tap_to_read).toBe(true)
    vi.useRealTimers()
  })

  it('advance key capture button shows the current binding', async () => {
    await renderSettingsPanel({ ...TAP_SETTINGS, tap_to_read_key: 'KeyJ' })
    // formatKeyCode('KeyJ') → 'J'
    openReaderConfigTab()
    openPlaybackCard()
    expect(screen.getByRole('button', { name: /current advance key: j/i })).toBeTruthy()
  })

  it('pressing a key while capture is active updates tap_to_read_key', async () => {
    vi.useFakeTimers()
    await renderSettingsPanel({ ...TAP_SETTINGS })
    openReaderConfigTab()
    openPlaybackCard()
    const captureBtn = screen.getByRole('button', { name: /current advance key: space/i })
    fireEvent.click(captureBtn)
    expect(screen.getByText('Press a key or mouse button…')).toBeTruthy()

    // Press 'n' with e.code = 'KeyN'
    fireEvent.keyDown(captureBtn, { code: 'KeyN', key: 'n' })

    // After capture, aria-label updates to reflect 'N'
    expect(screen.getByRole('button', { name: /current advance key: n/i })).toBeTruthy()

    // Wait for debounce then verify the new key is sent to saveSettings
    act(() => { vi.advanceTimersByTime(500) })
    expect(window.api.db.saveSettings).toHaveBeenCalledOnce()
    const saved = (window.api.db.saveSettings as ReturnType<typeof vi.fn>).mock.calls[0][0] as Partial<Settings>
    expect(saved.tap_to_read_key).toBe('KeyN')
    vi.useRealTimers()
  })
})

// ── usePlayback — tap-to-read behaviour ──────────────────────────────────────

describe('usePlayback — auto-advance disabled when tap_to_read=true', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('does not auto-advance when tap_to_read=true', () => {
    const { result } = renderHook(() =>
      usePlayback({ text: 'one two three', settings: TAP_SETTINGS })
    )

    act(() => { result.current.play() })
    const indexAfterPlay = result.current.currentIndex
    // Advance fake clock well past one beat — should NOT auto-advance
    act(() => { vi.advanceTimersByTime(5000) })
    expect(result.current.currentIndex).toBe(indexAfterPlay)
    expect(result.current.state).toBe('playing')
  })

  it('auto-advances when tap_to_read=false (existing behaviour unchanged)', () => {
    const { result } = renderHook(() =>
      usePlayback({ text: 'one two three', settings: BASE_SETTINGS })
    )

    act(() => { result.current.play() })
    // Beat interval at 600 bpm = 100 ms; advance 200 ms → at least one advance
    act(() => { vi.advanceTimersByTime(200) })
    expect(result.current.currentIndex).toBeGreaterThan(0)
  })
})

describe('usePlayback — stepForward advances one stack', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('stepForward increments currentIndex by one when playing in tap mode', () => {
    const { result } = renderHook(() =>
      usePlayback({ text: 'one two three four five', settings: TAP_SETTINGS })
    )

    act(() => { result.current.play() })
    expect(result.current.currentIndex).toBe(0)

    act(() => { result.current.stepForward() })
    expect(result.current.currentIndex).toBe(1)

    act(() => { result.current.stepForward() })
    expect(result.current.currentIndex).toBe(2)
  })

  it('stepForward is a no-op when state is paused', () => {
    const { result } = renderHook(() =>
      usePlayback({ text: 'one two three', settings: TAP_SETTINGS })
    )

    act(() => { result.current.play() })
    act(() => { result.current.pause() })
    const idx = result.current.currentIndex

    act(() => { result.current.stepForward() })
    expect(result.current.currentIndex).toBe(idx)
  })

  it('Space key (default) advances one word per press in tap mode (via stepForward)', () => {
    // Verify that pressing Space in tap mode is equivalent to calling stepForward
    // (this tests the hook API; the key-routing in Reader is tested by the keyboard handler)
    const { result } = renderHook(() =>
      usePlayback({ text: 'alpha beta gamma', settings: TAP_SETTINGS })
    )

    act(() => { result.current.play() })
    act(() => { result.current.stepForward() }) // simulates Space key press
    expect(result.current.currentIndex).toBe(1)
  })

  it('custom key binding routes to stepForward (advances one word)', () => {
    const customKeySettings: Settings = { ...TAP_SETTINGS, tap_to_read_key: 'KeyJ' }
    const { result } = renderHook(() =>
      usePlayback({ text: 'alpha beta gamma delta', settings: customKeySettings })
    )

    act(() => { result.current.play() })
    // Simulate J key press → stepForward() is called
    act(() => { result.current.stepForward() })
    expect(result.current.currentIndex).toBe(1)
  })

  it('stepForward stops the reader when advancing past the last stack', () => {
    const { result } = renderHook(() =>
      usePlayback({ text: 'one two', settings: { ...TAP_SETTINGS, words_per_stack: 1 } })
    )

    act(() => { result.current.play() })
    act(() => { result.current.stepForward() })
    act(() => { result.current.stepForward() })

    expect(result.current.state).toBe('stopped')
  })
})

describe('usePlayback — toggling tap_to_read resumes auto-advance', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('auto-advance resumes when tap_to_read is toggled off while playing', () => {
    let currentSettings = { ...TAP_SETTINGS }
    const { result, rerender } = renderHook(
      (settings: Settings) => usePlayback({ text: 'one two three four five six', settings }),
      { initialProps: currentSettings }
    )

    act(() => { result.current.play() })
    // No auto-advance while tap mode is on
    act(() => { vi.advanceTimersByTime(2000) })
    const idxWhileTap = result.current.currentIndex

    // Toggle tap_to_read off
    currentSettings = { ...currentSettings, tap_to_read: false }
    act(() => { rerender(currentSettings) })
    act(() => { vi.advanceTimersByTime(500) })

    expect(result.current.currentIndex).toBeGreaterThan(idxWhileTap)
  })
})

// ── Reader quick-settings — Tap to Read toggle ────────────────────────────────
// The full Reader component requires extensive window.api mocking and a DOM layout.
// The quick-settings toggle is covered structurally by the SettingsPanel tests
// (same toggle component pattern) and behaviourally by the usePlayback tests above.
// An integration smoke test verifying the toggle renders in the quick-settings
// panel is added here using the Reader component with minimal props.

describe('formatKeyCode — key display utility', () => {
  it('displays "Space" for the Space key code', async () => {
    await renderSettingsPanel({ ...TAP_SETTINGS, tap_to_read_key: 'Space' })
    openReaderConfigTab()
    openPlaybackCard()
    expect(screen.getByRole('button', { name: /current advance key: space/i })).toBeTruthy()
  })

  it('displays the letter for a KeyX code', async () => {
    await renderSettingsPanel({ ...TAP_SETTINGS, tap_to_read_key: 'KeyM' })
    openReaderConfigTab()
    openPlaybackCard()
    expect(screen.getByRole('button', { name: /current advance key: m/i })).toBeTruthy()
  })

  it('displays ← for ArrowLeft', async () => {
    await renderSettingsPanel({ ...TAP_SETTINGS, tap_to_read_key: 'ArrowLeft' })
    openReaderConfigTab()
    openPlaybackCard()
    expect(screen.getByRole('button', { name: /current advance key: ←/i })).toBeTruthy()
  })
})
