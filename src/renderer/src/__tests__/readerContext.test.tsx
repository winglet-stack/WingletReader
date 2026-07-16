/**
 * ReaderContext tests.
 * Environment: happy-dom (matched by vitest.config.ts environmentMatchGlobs).
 */
import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, act, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { NavigationProvider, useNavigation } from '../contexts/NavigationContext'
import { SettingsProvider } from '../contexts/SettingsContext'
import { LibraryProvider, useLibrary } from '../contexts/LibraryContext'
import { ReaderProvider, useReader } from '../contexts/ReaderContext'
import type { TextRecord, TextSegment } from '../types'

afterEach(cleanup)

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BOOK: TextRecord = { id: 1, title: 'Source Book', content: '', word_count: 5000 }
const RESUME_TEXT: TextRecord = {
  id: 2,
  title: 'Resume Book',
  content: 'one two three four five six',
  word_count: 6,
}

const SEG: TextSegment = {
  id: 10,
  textId: 1,
  title: 'Chapter 1',
  content: 'hello world',
  order: 0,
  sourceType: 'detected_heading',
  word_count: 2,
}

const BASE_SETTINGS = {
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

beforeEach(() => {
  vi.stubGlobal('api', {
    db: {
      getTexts: vi.fn().mockResolvedValue([BOOK]),
      getText: vi.fn().mockResolvedValue(BOOK),
      getLatestResumeCandidate: vi.fn().mockResolvedValue(null),
      getSegments: vi.fn().mockResolvedValue([SEG]),
      getSettings: vi.fn().mockResolvedValue(BASE_SETTINGS),
      saveSettings: vi.fn().mockResolvedValue(BASE_SETTINGS),
    },
  })
})

async function renderWithProviders(ui: React.ReactElement, settingsOverride?: object) {
  if (settingsOverride) {
    vi.mocked(window.api.db.getSettings).mockResolvedValue({ ...BASE_SETTINGS, ...settingsOverride })
  }
  await act(async () => {
    render(
      <NavigationProvider>
        <SettingsProvider>
          <LibraryProvider>
            <ReaderProvider>
              {ui}
            </ReaderProvider>
          </LibraryProvider>
        </SettingsProvider>
      </NavigationProvider>
    )
  })
}

// ── Consumer helpers ──────────────────────────────────────────────────────────

function ReaderStateDisplay() {
  const { activeSegmentCtx } = useReader()
  const { activeText } = useLibrary()
  return (
    <div>
      <span data-testid="segment-ctx">{activeSegmentCtx ? 'set' : 'unset'}</span>
      <span data-testid="active-text">{activeText?.title ?? 'none'}</span>
    </div>
  )
}

function ReaderActions() {
  const { openSegmentInReader } = useReader()
  const { openSegments } = useLibrary()
  return (
    <div>
      <button data-testid="setup-parent" onClick={() => openSegments(BOOK)}>setup parent</button>
      <button data-testid="open-segment" onClick={() => openSegmentInReader(SEG)}>open segment</button>
    </div>
  )
}

function SummaryFlowDisplay() {
  const { showSummarySetup, showSummaryPrompt, handleReadingComplete } = useReader()
  const { setActiveText } = useLibrary()
  const { view, setView } = useNavigation()
  return (
    <div>
      <span data-testid="show-setup">{String(showSummarySetup)}</span>
      <span data-testid="show-prompt">{String(showSummaryPrompt)}</span>
      <span data-testid="view">{view}</span>
      <button
        data-testid="set-active"
        onClick={() => {
          setActiveText({ id: 1, title: 'Test', content: 'hello world', word_count: 100 })
          setView('reader')
        }}
      >
        set active
      </button>
      <button
        data-testid="complete-reading"
        onClick={() => handleReadingComplete(0, 50, 5)}
      >
        complete reading
      </button>
    </div>
  )
}

function DrawerStateDisplay() {
  const {
    readerConfigDrawerOpen,
    setReaderConfigDrawerOpen,
  } = useReader()
  const { view, setView } = useNavigation()
  return (
    <div>
      <span data-testid="view">{view}</span>
      <span data-testid="drawer-open">{String(readerConfigDrawerOpen)}</span>
      <button data-testid="enter-reader" onClick={() => setView('reader')}>enter reader</button>
      <button data-testid="leave-reader" onClick={() => setView('library')}>leave reader</button>
      <button data-testid="open-drawer" onClick={() => setReaderConfigDrawerOpen(true)}>open drawer</button>
      <button data-testid="close-drawer" onClick={() => setReaderConfigDrawerOpen(false)}>close drawer</button>
    </div>
  )
}

function ResumeFlowDisplay() {
  const {
    activeSegmentCtx,
    readerResumeFrom,
    resumeCandidate,
    resumeReader,
  } = useReader()
  const { activeText } = useLibrary()
  const { view } = useNavigation()
  return (
    <div>
      <span data-testid="resume-candidate">{resumeCandidate?.title ?? 'none'}</span>
      <span data-testid="resume-from">{readerResumeFrom ?? 'none'}</span>
      <span data-testid="active-text">{activeText?.title ?? 'none'}</span>
      <span data-testid="segment-ctx">{activeSegmentCtx ? 'set' : 'unset'}</span>
      <span data-testid="view">{view}</span>
      <button data-testid="resume-reader" onClick={() => resumeReader()}>resume</button>
    </div>
  )
}

function BookmarkOpenDisplay() {
  const { activeSegmentCtx, openTextAtWordOffset, readerResumeFrom } = useReader()
  const { activeText } = useLibrary()
  const { view } = useNavigation()
  return (
    <div>
      <span data-testid="active-text">{activeText?.title ?? 'none'}</span>
      <span data-testid="resume-from">{readerResumeFrom ?? 'none'}</span>
      <span data-testid="segment-ctx">{activeSegmentCtx ? 'set' : 'unset'}</span>
      <span data-testid="view">{view}</span>
      <button data-testid="open-bookmark" onClick={() => openTextAtWordOffset(BOOK, 4)}>
        open bookmark
      </button>
    </div>
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ReaderContext — initial state', () => {
  it('activeSegmentCtx is undefined on init', async () => {
    await renderWithProviders(<ReaderStateDisplay />)
    expect(screen.getByTestId('segment-ctx').textContent).toBe('unset')
  })

  it('activeText is null on init', async () => {
    await renderWithProviders(<ReaderStateDisplay />)
    expect(screen.getByTestId('active-text').textContent).toBe('none')
  })
})

describe('ReaderContext — openSegmentInReader', () => {
  it('updates activeText when called without a parent', async () => {
    await renderWithProviders(
      <>
        <ReaderStateDisplay />
        <ReaderActions />
      </>
    )

    await act(async () => {
      screen.getByTestId('open-segment').click()
    })

    expect(screen.getByTestId('active-text').textContent).toBe(SEG.title)
  })

  it('sets activeSegmentCtx when parentText is loaded', async () => {
    await renderWithProviders(
      <>
        <ReaderStateDisplay />
        <ReaderActions />
      </>
    )

    // First establish parentText via openSegments
    await act(async () => {
      screen.getByTestId('setup-parent').click()
    })

    // Then open the segment
    await act(async () => {
      screen.getByTestId('open-segment').click()
    })

    expect(screen.getByTestId('segment-ctx').textContent).toBe('set')
    expect(screen.getByTestId('active-text').textContent).toBe(SEG.title)
  })
})

describe('ReaderContext - openTextAtWordOffset', () => {
  it('opens the source text and resolves the bookmark word offset to a resume stack', async () => {
    vi.mocked(window.api.db.getText).mockResolvedValue({
      ...BOOK,
      content: 'one two three four five six seven eight',
      word_count: 8,
    })

    await renderWithProviders(<BookmarkOpenDisplay />)

    await act(async () => {
      screen.getByTestId('open-bookmark').click()
    })

    expect(window.api.db.getText).toHaveBeenCalledWith(BOOK.id)
    expect(screen.getByTestId('active-text').textContent).toBe(BOOK.title)
    expect(screen.getByTestId('resume-from').textContent).toBe('2')
    expect(screen.getByTestId('segment-ctx').textContent).toBe('unset')
    expect(screen.getByTestId('view').textContent).toBe('reader')
  })
})

describe('ReaderContext — handleReadingComplete', () => {
  it('keeps summary setup closed while the alpha summary flow is off', async () => {
    await renderWithProviders(
      <SummaryFlowDisplay />,
      { summaries_initialized: false }
    )

    // Set an active text so handleReadingComplete has something to work with
    await act(async () => {
      screen.getByTestId('set-active').click()
    })

    await act(async () => {
      screen.getByTestId('complete-reading').click()
    })

    expect(screen.getByTestId('show-setup').textContent).toBe('false')
    expect(screen.getByTestId('show-prompt').textContent).toBe('false')
    expect(screen.getByTestId('view').textContent).toBe('reader')
  })

  it('keeps summary prompt closed while the alpha summary flow is off', async () => {
    await renderWithProviders(
      <SummaryFlowDisplay />,
      { summaries_initialized: true }
    )

    await act(async () => {
      screen.getByTestId('set-active').click()
    })

    await act(async () => {
      screen.getByTestId('complete-reading').click()
    })

    expect(screen.getByTestId('show-setup').textContent).toBe('false')
    expect(screen.getByTestId('show-prompt').textContent).toBe('false')
    expect(screen.getByTestId('view').textContent).toBe('reader')
  })
})

describe('ReaderContext — global Resume candidate', () => {
  it('loads the latest resume candidate from the bridge', async () => {
    vi.mocked(window.api.db.getLatestResumeCandidate).mockResolvedValue({
      textId: RESUME_TEXT.id!,
      title: RESUME_TEXT.title,
      stackIndex: 4,
      updatedAt: '2026-06-17T10:00:00.000Z',
    })

    await renderWithProviders(<ResumeFlowDisplay />)

    await waitFor(() => {
      expect(screen.getByTestId('resume-candidate').textContent).toBe('Resume Book')
    })
  })

  it('opens the full parent text through readerResumeFrom and clears segment state', async () => {
    vi.mocked(window.api.db.getLatestResumeCandidate).mockResolvedValue({
      textId: RESUME_TEXT.id!,
      title: RESUME_TEXT.title,
      stackIndex: 4,
      updatedAt: '2026-06-17T10:00:00.000Z',
    })
    vi.mocked(window.api.db.getText).mockImplementation(async (id: number) =>
      id === RESUME_TEXT.id ? RESUME_TEXT : BOOK
    )

    await renderWithProviders(
      <>
        <ResumeFlowDisplay />
        <ReaderActions />
      </>
    )

    await act(async () => {
      fireEvent.click(screen.getByTestId('setup-parent'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('open-segment'))
    })
    expect(screen.getByTestId('segment-ctx').textContent).toBe('set')

    await waitFor(() => {
      expect(screen.getByTestId('resume-candidate').textContent).toBe('Resume Book')
    })

    await act(async () => {
      fireEvent.click(screen.getByTestId('resume-reader'))
    })

    expect(screen.getByTestId('active-text').textContent).toBe('Resume Book')
    expect(screen.getByTestId('resume-from').textContent).toBe('4')
    expect(screen.getByTestId('segment-ctx').textContent).toBe('unset')
    expect(screen.getByTestId('view').textContent).toBe('reader')
  })
})

describe('ReaderContext - reader config drawer state', () => {
  // SR-4: the drawer's tab state now lives inside the shared ReaderSettingsEditor,
  // not in ReaderContext — the context only remembers whether the drawer is open.
  it('keeps drawer-open state in ReaderContext without touching the store', async () => {
    await renderWithProviders(<DrawerStateDisplay />)

    await act(async () => {
      fireEvent.click(screen.getByTestId('enter-reader'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('open-drawer'))
    })

    expect(screen.getByTestId('drawer-open').textContent).toBe('true')

    await act(async () => {
      fireEvent.click(screen.getByTestId('close-drawer'))
    })
    expect(screen.getByTestId('drawer-open').textContent).toBe('false')

    await act(async () => {
      fireEvent.click(screen.getByTestId('open-drawer'))
    })
    expect(screen.getByTestId('drawer-open').textContent).toBe('true')
    expect(window.api.db.saveSettings).not.toHaveBeenCalled()
  })

  it('closes the drawer when leaving Reader', async () => {
    await renderWithProviders(<DrawerStateDisplay />)

    await act(async () => {
      fireEvent.click(screen.getByTestId('enter-reader'))
      fireEvent.click(screen.getByTestId('open-drawer'))
    })
    expect(screen.getByTestId('drawer-open').textContent).toBe('true')

    await act(async () => {
      fireEvent.click(screen.getByTestId('leave-reader'))
    })

    expect(screen.getByTestId('view').textContent).toBe('library')
    expect(screen.getByTestId('drawer-open').textContent).toBe('false')
  })
})

describe('ReaderContext — useReader guard', () => {
  it('throws when useReader is called outside ReaderProvider', () => {
    function BadComponent() {
      useReader()
      return null
    }
    expect(() => {
      render(<BadComponent />)
    }).toThrow('useReader must be used within a ReaderProvider')
  })
})
