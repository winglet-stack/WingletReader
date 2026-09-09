/**
 * Reader idle identity — the canonical pixel dove. ADR-0029 hard-wires the
 * logo treatment, so stored logo_style values must not affect the idle mark or
 * body dataset.
 */

import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import Reader from '../components/Reader'
import AppShell from '../AppShell'
import type { Settings, TextRecord } from '../types'
import { NavigationProvider } from '../contexts/NavigationContext'
import { SettingsProvider } from '../contexts/SettingsContext'
import { LibraryProvider } from '../contexts/LibraryContext'
import { ReaderProvider } from '../contexts/ReaderContext'

afterEach(() => {
  cleanup()
  delete document.body.dataset.logoStyle
  delete document.body.dataset.theme
})

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

function stubApi() {
  vi.stubGlobal('api', {
    db: {
      getTexts: vi.fn().mockResolvedValue([]),
      getSettings: vi.fn().mockResolvedValue({}),
      saveSettings: vi.fn().mockResolvedValue({}),
      getReadingPosition: vi.fn().mockResolvedValue(null),
      getLatestResumeCandidate: vi.fn().mockResolvedValue(null),
      saveReadingPosition: vi.fn().mockResolvedValue({}),
    },
    app: { getVersion: vi.fn().mockResolvedValue('0.0.0-test'), splashReady: vi.fn() },
    readWhileWorking: { onEnableFailed: vi.fn(() => () => {}) },
  })
}

function buildSettings(): Settings {
  return {
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
}

const IDLE_TEXT: TextRecord = {
  title: 'Identity Fixture',
  content: 'one two three four',
  word_count: 4,
}

function renderReaderIdle(logoStyle: 'modern' | 'classic') {
  render(
    <NavigationProvider>
      <SettingsProvider initialSettings={{ ...buildSettings(), logo_style: logoStyle } as Settings}>
        <LibraryProvider initialActiveText={IDLE_TEXT}>
          <ReaderProvider>
            <Reader onBack={vi.fn()} onExitToLibrary={vi.fn()} />
          </ReaderProvider>
        </LibraryProvider>
      </SettingsProvider>
    </NavigationProvider>
  )
}

describe('Reader idle identity', () => {
  it('renders the canonical pixel dove logo, ignoring stored logo_style drift', () => {
    stubApi()

    renderReaderIdle('modern')
    const modernLogo = document.querySelector('.reader-idle-logo') as HTMLImageElement | null
    expect(modernLogo).not.toBeNull()
    expect(modernLogo?.className).toBe('reader-idle-logo')
    expect(document.querySelector('.reader-idle-wordmark')).toBeNull()
    const modernSrc = modernLogo?.getAttribute('src')
    cleanup()

    renderReaderIdle('classic')
    const classicLogo = document.querySelector('.reader-idle-logo') as HTMLImageElement | null
    expect(classicLogo).not.toBeNull()
    expect(classicLogo?.className).toBe('reader-idle-logo')
    expect(document.querySelector('.reader-idle-wordmark')).toBeNull()
    expect(classicLogo?.getAttribute('src')).toBe(modernSrc)
  })

  it('offers the control-zone Browse-library toggle on the engaged idle stage', () => {
    stubApi()
    renderReaderIdle('modern')
    // ADR-0027 §1: picking another text is the persistent frame's control-zone
    // Browse-library control (swaps the whole stage to the in-frame library), not
    // a topbar or local in-place picker toggle.
    const browseToggle = screen.getByRole('button', { name: 'Browse library' })
    expect(browseToggle.closest('.reader-controls')).toBeTruthy()
    expect(document.querySelector('.reader-topbar-center')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Pick another text' })).toBeNull()
  })
})

describe('AppShell document effects', () => {
  it('mirrors theme onto body without reintroducing data-logo-style', async () => {
    stubApi()

    await act(async () => {
      render(
        <NavigationProvider>
          <SettingsProvider initialSettings={{ ...buildSettings(), logo_style: 'classic' } as Settings}>
            <LibraryProvider>
              <ReaderProvider>
                <AppShell />
              </ReaderProvider>
            </LibraryProvider>
          </SettingsProvider>
        </NavigationProvider>
      )
    })

    // Default view is the console hub (ADR-0011); its Read tile confirms the shell mounted.
    expect(await screen.findByRole('button', { name: 'Read' })).toBeTruthy()
    expect(document.body.dataset.theme).toBe('dark')
    expect(document.body.dataset.logoStyle).toBeUndefined()
  })
})
