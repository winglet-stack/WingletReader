/**
 * Read-card routing + the Reader's no-engaged-text stages (ADR-0012 §5, ADR-0013 §4–§5).
 *
 * The hub Read card always opens the Reader. With no engaged text the Reader
 * shows a stage in its persistent frame: when the library is empty (zero texts)
 * the full frame with inert controls + an import disclaimer (every control routes
 * to Import — ADR-0013 §5); when texts exist, the recent-texts picker (issue 04
 * unifies this into in-frame library browse). Reader is still not a global nav
 * destination; it is reached from the hub Read card.
 */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import AppShell from '../AppShell'
import type { Settings, TextRecord } from '../types'
import { NavigationProvider } from '../contexts/NavigationContext'
import { SettingsProvider } from '../contexts/SettingsContext'
import { LibraryProvider } from '../contexts/LibraryContext'
import { ReaderProvider } from '../contexts/ReaderContext'

afterEach(cleanup)

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

function stubApi(texts: TextRecord[]) {
  vi.stubGlobal('api', {
    db: {
      getTexts: vi.fn().mockResolvedValue(texts),
      getText: vi.fn().mockResolvedValue(texts[0] ?? null),
      getSettings: vi.fn().mockResolvedValue({}),
      saveSettings: vi.fn().mockResolvedValue({}),
      getReadingPosition: vi.fn().mockResolvedValue(null),
      getBookResumeTarget: vi.fn().mockResolvedValue(null),
      getLatestResumeCandidate: vi.fn().mockResolvedValue(null),
      saveReadingPosition: vi.fn().mockResolvedValue({}),
    },
    app: { getVersion: vi.fn().mockResolvedValue('0.0.0-test'), splashReady: vi.fn() },
    readWhileWorking: { onEnableFailed: vi.fn(() => () => {}) },
  })
}

async function renderShell() {
  await act(async () => {
    render(
      <NavigationProvider>
        <SettingsProvider initialSettings={buildSettings()}>
          <LibraryProvider>
            <ReaderProvider>
              <AppShell />
            </ReaderProvider>
          </LibraryProvider>
        </SettingsProvider>
      </NavigationProvider>
    )
  })
}

/** Click the hub Read card (no resume candidate → enters the Reader directly). */
async function clickRead() {
  const readBtn = await screen.findByRole('button', { name: 'Read' })
  await act(async () => {
    fireEvent.click(readBtn)
  })
}

describe('Read-card routing → Reader entry idle', () => {
  it('exposes no global Reader nav button on the hub', async () => {
    stubApi([])
    await renderShell()
    // The hub launcher exposes Read as a card, not a "Reader" nav destination.
    expect(screen.queryByRole('button', { name: 'Reader' })).toBeNull()
  })

  it('opens the persistent Reader frame with inert chrome + import disclaimer when the library is empty', async () => {
    stubApi([])
    await renderShell()
    await clickRead()

    // ADR-0013 §5: the full Reader frame is present (Back-to-hub + playback
    // controls), not the old full-screen takeover — with an import disclaimer.
    expect(screen.getByRole('button', { name: 'Hub' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Restart' })).toBeTruthy()
    expect(screen.getByText('Your library is empty')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Import a text' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Browse library' })).toBeNull()
    expect(screen.queryByText('No book selected to read.')).toBeNull()
  })

  it('routes an inert control click to Import (no dead-end) when the library is empty', async () => {
    stubApi([])
    await renderShell()
    await clickRead()

    // Inert controls stay clickable (not natively disabled) and route to Import.
    const playBtn = screen.getByRole('button', { name: 'Play' }) as HTMLButtonElement
    expect(playBtn.disabled).toBe(false)
    await act(async () => {
      fireEvent.click(playBtn)
    })
    expect(screen.getByRole('heading', { name: 'Import Text' })).toBeTruthy()
  })

  it('routes the inert import CTA to Import when the library is empty', async () => {
    stubApi([])
    await renderShell()
    await clickRead()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Import a text' }))
    })
    expect(screen.getByRole('heading', { name: 'Import Text' })).toBeTruthy()
  })

  it('opens the in-frame library browse (chrome present) when texts exist but none is engaged', async () => {
    stubApi([{ id: 1, title: 'My Book', word_count: 2 }])
    await renderShell()
    await clickRead()

    // ADR-0013 §6: the persistent frame's stage hosts the standalone Library list
    // (Back-to-hub chrome present), replacing the old recent-texts picker.
    expect(screen.getByRole('button', { name: 'Hub' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Library' })).toBeTruthy()
    expect(screen.getByText('My Book')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Browse library' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Browse full library' })).toBeNull()
  })

  it('engages a text picked from the in-frame library and toggles Browse ⇄ Back to reading', async () => {
    stubApi([{ id: 1, title: 'My Book', word_count: 2 }])
    await renderShell()
    await clickRead()

    // Select the text from the in-frame library → it engages and the stage reads.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Read "My Book"' }))
    })
    // Reading now: the in-frame Library list is gone, and the control-zone
    // left-slot toggle reads "Browse library".
    expect(screen.queryByRole('heading', { name: 'Library' })).toBeNull()
    const browseToggle = screen.getByRole('button', { name: 'Browse library' })
    expect(browseToggle.classList.contains('reader-browse-btn')).toBe(true)
    expect(browseToggle.closest('.reader-controls')).toBeTruthy()
    expect(document.querySelector('.reader-topbar-center')).toBeNull()
    expect(document.querySelector('.reader-topbar--browse')).toBeNull()

    // Browse library → the in-frame library returns, toggle flips to Back.
    await act(async () => {
      fireEvent.click(browseToggle)
    })
    expect(screen.getByRole('heading', { name: 'Library' })).toBeTruthy()
    const backToggle = screen.getByRole('button', { name: 'Back to reading' })
    expect(backToggle.classList.contains('reader-browse-btn--active')).toBe(true)
    expect(backToggle.getAttribute('aria-pressed')).toBe('true')
    expect(backToggle.closest('.reader-controls')).toBeTruthy()

    // Back to reading → returns to the engaged text.
    await act(async () => {
      fireEvent.click(backToggle)
    })
    expect(screen.queryByRole('heading', { name: 'Library' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Browse library' })).toBeTruthy()
  })

  it('keeps the standalone Library reachable from the hub Library tile', async () => {
    stubApi([{ id: 1, title: 'My Book', word_count: 2 }])
    await renderShell()

    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Library' }))
    })
    // The hub Library tile routes to the standalone management host — the same
    // list, but without the Reader frame chrome around it.
    expect(screen.getByRole('heading', { name: 'Library' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Hub' })).toBeNull()
  })
})
