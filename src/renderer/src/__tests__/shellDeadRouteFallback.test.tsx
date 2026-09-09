/**
 * Dead-route fallback at the shell.
 *
 * The archived alpha destinations (`mode-choice`, `showcase`, `summaries`,
 * `primer`, `trailer`) are gone from the view union, so no typed caller can
 * reach them. What survives is the single enforcement point: a token the route
 * table does not declare live resolves to the fallback destination when the
 * shell reads the table. RWW entry coverage lives in readWhileWorking.test.tsx
 * through the Library header button.
 *
 * Environment: happy-dom.
 */
import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import AppShell from '../AppShell'
import { NavigationProvider, useNavigation } from '../contexts/NavigationContext'
import { SettingsProvider } from '../contexts/SettingsContext'
import { LibraryProvider } from '../contexts/LibraryContext'
import { ReaderProvider } from '../contexts/ReaderContext'
import type { AppView } from '../appShell/routeTable'

afterEach(cleanup)

const BASE_SETTINGS = {
  words_per_stack: 3, stacks_visible: 1, stack_gap: 32, bpm: 60,
  metronome_enabled: false, pause_at_sentences: true, pause_at_headlines: true,
  font_size: 36, stack_vertical_offset: 0, stack_horizontal_offset: 0,
  theme: 'dark', highlight_active: true,
  lines_count: 1, lines_row_gap: 8,
  segmentation_enabled: true, segmentation_threshold: 5000, segmentation_chunk_size: 1500,
  auto_chapter_detection: true, summaries_initialized: false,
  chunk_rule_long_word: false, chunk_rule_enumerations: false, chunk_rule_bullets: false,
  chunk_rule_commas: false, chunk_rule_names: false, chunk_rule_headlines: true,
  view_style: 'default', show_chunk_dividers: true,
  highlight_color: '', viewport_bg_color: '', text_color: '', font_family: '',
  highlight_text_color: '', highlight_mode: 'default', highlight_panning_chunk_size: 0,
  highlighting_mode: 'default', tap_to_read: false, tap_to_read_key: 'Space',
  lock_at_wpm: false, target_wpm: 200,
  read_while_working_enabled: false, read_while_working_shortcut: 'Control+Space',
  read_while_working_exit_shortcut: 'Control+Space',
  read_while_working_window_width: 640, read_while_working_window_height: 360,
  read_while_working_restore_clipboard: true,
  rww_bpm: 90, rww_words_per_stack: 2, rww_stacks_visible: 1,
  rww_lines_count: 1,
  custom_rww_playback_presets: [], custom_palettes: [], custom_text_presets: [],
  custom_font_presets: [], custom_playback_presets: [], custom_reader_configs: [],
}

let exitedCallback: (() => void) | null

beforeEach(() => {
  exitedCallback = null
  vi.stubGlobal('api', {
    app: {
      getVersion: vi.fn().mockResolvedValue('0.1.0-alpha.test'),
      splashReady: vi.fn()
    },
    db: {
      getTexts: vi.fn().mockResolvedValue([]),
      getText: vi.fn().mockResolvedValue(null),
      getSegments: vi.fn().mockResolvedValue([]),
      getLatestResumeCandidate: vi.fn().mockResolvedValue(null),
      getSettings: vi.fn().mockResolvedValue(BASE_SETTINGS),
      saveSettings: vi.fn().mockResolvedValue(BASE_SETTINGS),
    },
    readWhileWorking: {
      getStatus: vi.fn().mockResolvedValue({
        enabled: false, supported: true, registered: false,
        shortcut: 'Control+Space', exitShortcut: 'Control+Space',
        exitRegistered: false, error: null, exitError: null,
      }),
      hideToTray: vi.fn(),
      onExited: vi.fn((cb: () => void) => {
        exitedCallback = cb
        return () => { exitedCallback = null }
      }),
    },
  })
})

// The retired tokens are no longer part of `AppView`, so reaching one takes a
// cast — which is exactly the untyped arrival the fallback exists to absorb.
const RETIRED_TOKEN = 'mode-choice' as unknown as AppView

function ForceView({ view }: { view: AppView }) {
  const { setView } = useNavigation()
  React.useEffect(() => {
    setView(view)
  }, [setView, view])
  return null
}

async function mountApp(initialView: AppView = 'library') {
  await act(async () => {
    render(
      <NavigationProvider>
        <SettingsProvider>
          <LibraryProvider>
            <ReaderProvider>
              <ForceView view={initialView} />
              <AppShell />
            </ReaderProvider>
          </LibraryProvider>
        </SettingsProvider>
      </NavigationProvider>
    )
  })
}

describe('Shell dead-route fallback', () => {
  it('a retired route token falls back to the Library at the shell', async () => {
    await mountApp(RETIRED_TOKEN)

    expect(screen.queryByLabelText('Choose reading mode')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Library' })).toBeTruthy()
  })

  it('an rww:exited signal returns the view to the Library from anywhere', async () => {
    await mountApp(RETIRED_TOKEN)

    expect(exitedCallback).toBeTypeOf('function')
    await act(async () => {
      exitedCallback!()
    })

    expect(screen.queryByLabelText('Choose reading mode')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Library' })).toBeTruthy()
  })
})
