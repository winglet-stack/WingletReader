import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act, waitFor, within } from '@testing-library/react'
import App from '../App'
import AppShell from '../AppShell'
import { SettingsProvider } from '../contexts/SettingsContext'
import { NavigationProvider, useNavigation, type SettingsSubview } from '../contexts/NavigationContext'
import { LibraryProvider, useLibrary } from '../contexts/LibraryContext'
import { ReaderProvider } from '../contexts/ReaderContext'
import TemporaryReaderApp from '../components/TemporaryReaderApp'
import Reader from '../components/Reader'
import type { Settings, TextRecord, TextSegment } from '../types'
import type { AppView } from '../appShell/routeTable'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const BASE_SETTINGS: Settings = {
  words_per_stack: 1,
  stacks_visible: 1,
  stack_gap: 32,
  bpm: 600,
  metronome_enabled: false,
  pause_at_sentences: false,
  pause_at_headlines: false,
  font_size: 36,
  stack_vertical_offset: 0,
  stack_horizontal_offset: 0,
  theme: 'dark',
  highlight_active: true,
  lines_count: 1,
  lines_row_gap: 0,
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
  chunk_rule_headlines: false,
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
  custom_palettes: [],
  custom_text_presets: [],
  custom_font_presets: [],
  custom_playback_presets: [],
  custom_reader_configs: [],
}

const statusOff = {
  enabled: false,
  supported: true,
  registered: false,
  shortcut: 'Control+Space',
  exitShortcut: 'Control+Space',
  exitRegistered: false,
  error: null,
  exitError: null
}

const SAMPLE_READER_TEXT: TextRecord = {
  id: 1,
  title: 'Standard Fixture',
  content: 'alpha unique source phrase omega',
  word_count: 5
}

const LIBRARY_CONTENTS_TEXT: TextRecord = {
  id: 42,
  title: 'Library Contents Fixture',
  content: 'alpha beta gamma delta',
  word_count: 4,
  segment_count: 1,
}

const LIBRARY_CONTENTS_SEGMENTS: TextSegment[] = [
  {
    id: 420,
    textId: 42,
    title: 'Chapter One',
    content: 'alpha beta gamma delta',
    order: 0,
    sourceType: 'detected_heading',
    word_count: 4,
  },
]

function stubApi(overrides: Partial<typeof window.api> = {}) {
  const api = {
    app: {
      getVersion: vi.fn().mockResolvedValue('0.1.0-alpha.test'),
      splashReady: vi.fn()
    },
    db: {
      getTexts: vi.fn().mockResolvedValue([]),
      getText: vi.fn(),
      saveText: vi.fn(),
      deleteText: vi.fn(),
      getSettings: vi.fn().mockResolvedValue(BASE_SETTINGS),
      saveSettings: vi.fn().mockResolvedValue(BASE_SETTINGS),
      saveSettingsStore: vi.fn().mockImplementation(async (store) => store),
      getSegments: vi.fn(),
      getSegment: vi.fn(),
      saveSegments: vi.fn(),
      updateSegmentTitle: vi.fn(),
      deleteSegments: vi.fn(),
      deleteSegment: vi.fn(),
      appendSegment: vi.fn(),
      createChapterFromPassage: vi.fn(),
      getSummaries: vi.fn().mockResolvedValue([]),
      saveSummary: vi.fn(),
      deleteSummary: vi.fn(),
      getBookmarks: vi.fn().mockResolvedValue([]),
      getSummaryQuestionsForText: vi.fn(),
      saveSummaryQuestion: vi.fn(),
      deleteSummaryQuestion: vi.fn(),
      getReadingPosition: vi.fn().mockResolvedValue(null),
      getLatestResumeCandidate: vi.fn().mockResolvedValue(null),
      saveReadingPosition: vi.fn()
    },
    file: { open: vi.fn() },
    data: {
      exportAll: vi.fn(),
      importJson: vi.fn()
    },
    video: { save: vi.fn() },
    readWhileWorking: {
      getStatus: vi.fn().mockResolvedValue(statusOff),
      hideToTray: vi.fn().mockResolvedValue({ ...statusOff, enabled: true, registered: true }),
      enableAndHideToTray: vi
        .fn()
        .mockResolvedValue({ ...statusOff, enabled: true, registered: true }),
      getTemporarySession: vi.fn(),
      finishTemporarySession: vi.fn().mockResolvedValue({ ok: true }),
      exit: vi.fn().mockResolvedValue({ ok: true }),
      onExited: vi.fn(() => () => {}),
      onEnableFailed: vi.fn(() => () => {})
    },
    ...overrides
  }
  vi.stubGlobal('api', api)
  return api
}

beforeEach(() => {
  vi.stubGlobal('AudioContext', vi.fn(() => ({
    state: 'running',
    currentTime: 0,
    createOscillator: vi.fn(() => ({
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      type: 'sine',
      frequency: { setValueAtTime: vi.fn() }
    })),
    createGain: vi.fn(() => ({
      connect: vi.fn(),
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }
    })),
    destination: {},
    resume: vi.fn(),
    close: vi.fn()
  })))
})

function ForceView({
  view,
  settingsSubview
}: {
  view: AppView
  settingsSubview?: SettingsSubview
}) {
  const { setView, setSettingsSubview } = useNavigation()
  React.useEffect(() => {
    setView(view)
    if (settingsSubview !== undefined) {
      setSettingsSubview(settingsSubview)
    }
  }, [setSettingsSubview, setView, settingsSubview, view])
  return null
}

function ForceLibraryContents({ text }: { text: TextRecord }) {
  const { openSegments } = useLibrary()
  React.useEffect(() => {
    void openSegments(text)
  }, [openSegments, text])
  return null
}

async function renderAppShellAtView(view: AppView, settingsSubview?: SettingsSubview) {
  await act(async () => {
    render(
      <NavigationProvider>
        <SettingsProvider>
          <LibraryProvider>
            <ReaderProvider>
              <ForceView view={view} settingsSubview={settingsSubview} />
              <AppShell />
            </ReaderProvider>
          </LibraryProvider>
        </SettingsProvider>
      </NavigationProvider>
    )
  })
}

async function renderAppShellAtLibraryContents() {
  await act(async () => {
    render(
      <NavigationProvider>
        <SettingsProvider>
          <LibraryProvider>
            <ReaderProvider>
              <ForceLibraryContents text={LIBRARY_CONTENTS_TEXT} />
              <AppShell />
            </ReaderProvider>
          </LibraryProvider>
        </SettingsProvider>
      </NavigationProvider>
    )
  })
}

/**
 * The readiness/error status line (`.rww-readiness-status`), scoped past the
 * unconditional alpha-notice `role="status"` region now at the top of the
 * subview (PRD D6) so an unscoped `findByRole('status')` no longer matches
 * two elements.
 */
async function findReadinessStatus(): Promise<HTMLElement> {
  return waitFor(() => {
    const el = document.querySelector('.rww-readiness-status')
    expect(el).toBeTruthy()
    return el as HTMLElement
  })
}

describe('Read while working onboarding', () => {
  it('cold starts on the hub instead of showcase or mode choice', async () => {
    const api = stubApi()

    render(<App />)

    // ADR-0011: the console hub is the root chrome, not the Library.
    expect(await screen.findByRole('button', { name: 'Read' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Make Video' })).toBeTruthy()
    expect(document.querySelector('.hub-identity-dove')).toBeTruthy()
    expect(screen.getByText('Alpha')).toBeTruthy()
    expect(screen.getByText('0.1.0-alpha.test')).toBeTruthy()
    expect(screen.queryByRole('tab', { name: 'Library' })).toBeNull()
    expect(screen.queryByRole('button', { name: /continue to library/i })).toBeNull()
    expect(screen.queryByLabelText('Choose reading mode')).toBeNull()
    expect(api.db.saveSettings).not.toHaveBeenCalledWith({ read_while_working_enabled: false })
  })

  it('hub Settings tile opens Settings; the home control returns to the hub', async () => {
    stubApi()

    render(<App />)
    // The hub exposes no global Reader/Transmute destinations.
    const settingsTile = await screen.findByRole('button', { name: 'Settings' })
    expect(screen.queryByRole('button', { name: 'Reader' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Transmute' })).toBeNull()

    fireEvent.click(settingsTile)
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeTruthy()

    const homeBtn = document.querySelector('.home-control') as HTMLButtonElement
    expect(homeBtn).toBeTruthy()
    fireEvent.click(homeBtn)
    expect(await screen.findByRole('button', { name: 'Read' })).toBeTruthy()
    expect(screen.queryByLabelText('Choose reading mode')).toBeNull()
  })

  it('hub RWW tile opens the Overlay Reader Settings subview', async () => {
    stubApi()

    render(<App />)

    // The hub RWW tile is the first-class entry to the Settings subview.
    const rwwTile = await screen.findByRole('button', { name: 'Overlay Reader' })
    expect(rwwTile).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Read While Working' })).toBeNull()

    fireEvent.click(rwwTile)
    expect(await screen.findByRole('region', { name: 'Overlay Reader settings' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Overlay Reader settings' })).toBeNull()
    const overlayPanel = screen.getByRole('tabpanel', { name: 'Overlay' })
    const settingsRegion = screen.getByRole('region', { name: 'Overlay Reader settings' })
    const host = settingsRegion.querySelector('.rww-start-control--embedded')
    expect(host).toBeTruthy()
    expect(settingsRegion.querySelector('.rww-overlay-host-column')).toBeTruthy()
    expect(document.querySelector('.rww-start-control--viewport')).toBeNull()
    expect(screen.getByRole('button', { name: 'Start Overlay Reader' }).textContent).toBe('Start')
    // Shortcut rebinding is rehomed to the Overlay tab body (ADR-0021): the
    // summon/exit recorders live in the tabpanel, not the state/action host square.
    expect(within(overlayPanel).getByRole('button', { name: 'Record Summon shortcut' })).toBeTruthy()
    expect(within(overlayPanel).getByRole('button', { name: 'Record Exit shortcut' })).toBeTruthy()
    expect(host?.querySelector('.key-capture-btn')).toBeNull()
    // A compact state indicator sits directly below the square; ready by default.
    expect(host?.querySelector('.rww-start-control__state-label')?.textContent).toBe('Ready')
    expect(host?.textContent).not.toContain('Summon')
    expect(document.querySelector('.up-level-control')).toBeTruthy()
  })

  it('mounts the viewport Start host on Reader configuration so the 16px inset override applies', async () => {
    // Slice 02: the viewport host's right inset is aligned to the subview body's
    // 16px horizontal padding via `:root:has(.view-container--overlay-reader-subview)
    // .rww-start-control--viewport { right: 16px }`. The Overlay tab uses an
    // embedded in-flow host instead. jsdom does not apply index.css, so assert the
    // scoping precondition rather than the computed pixel value.
    stubApi()
    await renderAppShellAtView('settings', 'overlay-reader')

    expect(document.querySelector('.rww-start-control--embedded')).toBeTruthy()
    expect(document.querySelector('.rww-start-control--viewport')).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: 'Reader configuration' }))

    const host = document.querySelector('.rww-start-control--viewport')
    const subview = document.querySelector('.view-container--overlay-reader-subview')
    expect(host).toBeTruthy()
    expect(subview).toBeTruthy()
    expect(document.querySelector('.rww-start-control--embedded')).toBeNull()
    // The up-level dove keeps its own 10px inset; the override is scoped to the host only.
    expect(document.querySelector('.up-level-control')).toBeTruthy()
  })

  it('hub Import tile opens the Import view', async () => {
    stubApi()

    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Import' }))
    expect(await screen.findByRole('heading', { name: 'Import Text' })).toBeTruthy()
  })

  it('hub Import card shows supported formats in place', async () => {
    stubApi()

    render(<App />)

    // The description caption now lives on the card itself (no shared LCD strip).
    const importTile = await screen.findByRole('button', { name: 'Import' })
    expect(importTile.textContent).toContain(
      'Drop a .txt, .docx, or .pdf — or paste text'
    )
  })

  it('empty Library guides straight to Import', async () => {
    stubApi()

    await renderAppShellAtView('library')

    fireEvent.click(await screen.findByRole('button', { name: 'Import your first text' }))
    expect(await screen.findByRole('heading', { name: 'Import Text' })).toBeTruthy()
  })

  it('Library header has no Read While Working button in the populated library', async () => {
    const api = stubApi()
    api.db.getTexts.mockResolvedValue([
      {
        id: 1,
        title: 'Header Fixture',
        content: 'alpha beta gamma',
        word_count: 3,
        category_id: 1,
        updated_at: new Date().toISOString()
      }
    ])

    await renderAppShellAtView('library')

    // RWW entry is gone from the Library header; Import is still present.
    expect(screen.queryByRole('button', { name: 'Read While Working' })).toBeNull()
    expect(await screen.findByRole('button', { name: '+ Import Text' })).toBeTruthy()
  })

  it('starts Overlay Reader from the Settings subview and routes to Library on success', async () => {
    const api = stubApi()
    let resolveStart: (status: typeof statusOff) => void = () => {}
    ;(api.readWhileWorking.enableAndHideToTray as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((resolve) => {
        resolveStart = resolve
      })
    )

    render(<App />)

    // Navigate to the Settings subview via the hub RWW tile.
    fireEvent.click(await screen.findByRole('button', { name: 'Overlay Reader' }))
    expect(await screen.findByRole('region', { name: 'Overlay Reader settings' })).toBeTruthy()

    // The renderer calls enableAndHideToTray directly (no separate saveSettings call;
    // the main-process path persists the flag behind a single IPC).
    const startButton = screen.getByRole('button', { name: 'Start Overlay Reader' }) as HTMLButtonElement
    fireEvent.click(startButton)

    expect(api.readWhileWorking.enableAndHideToTray).toHaveBeenCalledOnce()
    expect(startButton.disabled).toBe(true)
    expect(startButton.getAttribute('aria-busy')).toBe('true')
    expect(api.db.saveSettings).not.toHaveBeenCalledWith({ read_while_working_enabled: true })

    // A successful start hides to the tray and lands the (now hidden) main window
    // on the Library, so returning via the exit shortcut or tray lands home —
    // matching the existing RWW exit behavior. The Library is now just the text
    // list (no tab bar), so we assert its heading rather than a Library tab.
    await act(async () => {
      resolveStart({ ...statusOff, enabled: true, registered: true, exitRegistered: true })
    })
    expect(await screen.findByRole('heading', { name: 'Library' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Overlay Reader settings' })).toBeNull()
  })

  it('keeps the Overlay Reader subview visible when start reports unsupported status', async () => {
    const api = stubApi()
    api.readWhileWorking.enableAndHideToTray.mockResolvedValue({
      enabled: true,
      supported: false,
      registered: false,
      shortcut: 'Control+Space',
      exitShortcut: 'Control+Space',
      exitRegistered: false,
      error: 'Overlay Reader is supported on Windows in this version.',
      exitError: null
    })

    render(<App />)

    // Navigate to the Settings subview.
    fireEvent.click(await screen.findByRole('button', { name: 'Overlay Reader' }))
    expect(await screen.findByRole('region', { name: 'Overlay Reader settings' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Start Overlay Reader' }))

    expect(api.readWhileWorking.enableAndHideToTray).toHaveBeenCalledOnce()

    expect((await findReadinessStatus()).textContent).toBe(
      'Overlay Reader is supported on Windows in this version.'
    )
    expect(screen.getByRole('region', { name: 'Overlay Reader settings' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Settings' })).toBeNull()
  })

  it('blocks the host Start button when readiness reports an error', async () => {
    const api = stubApi()
    api.readWhileWorking.getStatus.mockResolvedValue({
      enabled: false,
      supported: true,
      registered: false,
      shortcut: 'Control+Space',
      exitShortcut: 'Control+Space',
      exitRegistered: false,
      error: 'Shortcut Control+Space is already in use.',
      exitError: null
    })

    await renderAppShellAtView('settings', 'overlay-reader')

    const startButton = await screen.findByRole('button', { name: 'Start Overlay Reader' })
    expect(startButton.textContent).toBe('Start')
    expect((startButton as HTMLButtonElement).disabled).toBe(true)
    // The state indicator reads Blocked and the host cluster carries the blocked modifier
    // (red dot) while the full error renders below the pinned tab bar.
    const host = document.querySelector('.rww-start-control')
    expect(host?.classList.contains('rww-start-control--blocked')).toBe(true)
    expect(host?.querySelector('.rww-start-control__state-label')?.textContent).toBe('Blocked')
    expect((await findReadinessStatus()).textContent).toBe(
      'Shortcut Control+Space is already in use.'
    )
  })

  it('exits Overlay Reader from the armed host button', async () => {
    const api = stubApi()
    const getStatus = api.readWhileWorking.getStatus as ReturnType<typeof vi.fn>
    getStatus
      .mockResolvedValueOnce({
        ...statusOff,
        enabled: true,
        registered: true,
        exitRegistered: true
      })
      .mockResolvedValueOnce(statusOff)

    await renderAppShellAtView('settings', 'overlay-reader')

    const exitButton = await screen.findByRole('button', { name: 'Exit Overlay Reader' })
    expect(exitButton.textContent).toBe('Exit')
    expect(
      document.querySelector('.rww-start-control__state-label')?.textContent
    ).toBe('Armed')
    fireEvent.click(exitButton)

    expect(api.readWhileWorking.exit).toHaveBeenCalledOnce()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Start Overlay Reader' }).textContent).toBe('Start')
    })
  })

  it('keeps the Overlay Reader subview visible when shortcut registration fails', async () => {
    const api = stubApi()
    api.readWhileWorking.enableAndHideToTray.mockResolvedValue({
      enabled: true,
      supported: true,
      registered: false,
      shortcut: 'Control+Space',
      exitShortcut: 'Control+Space',
      exitRegistered: false,
      error: 'Shortcut Control+Space is already in use.',
      exitError: 'Shortcut Control+Space is already in use.'
    })

    render(<App />)

    // Navigate to the Settings subview.
    fireEvent.click(await screen.findByRole('button', { name: 'Overlay Reader' }))
    expect(await screen.findByRole('region', { name: 'Overlay Reader settings' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Start Overlay Reader' }))

    expect(api.readWhileWorking.enableAndHideToTray).toHaveBeenCalledOnce()

    expect((await findReadinessStatus()).textContent).toBe(
      'Shortcut Control+Space is already in use.'
    )
    expect(screen.getByRole('region', { name: 'Overlay Reader settings' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Settings' })).toBeNull()
  })

  it('refreshes readiness on mount and exposes the Overlay-tab recorders', async () => {
    const api = stubApi()

    await renderAppShellAtView('settings', 'overlay-reader')

    expect(await screen.findByRole('region', { name: 'Overlay Reader settings' })).toBeTruthy()
    expect(api.readWhileWorking.getStatus).toHaveBeenCalled()

    // Shortcut rebinding is rehomed to the Overlay tab body (ADR-0021).
    expect(screen.getByRole('button', { name: 'Record Summon shortcut' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Record Exit shortcut' })).toBeTruthy()
    expect(
      document.querySelector('.rww-start-control__state-label')?.textContent
    ).toBe('Ready')
  })

  it('saves a summon shortcut from the Overlay tab and refreshes readiness', async () => {
    const api = stubApi()
    const getStatus = api.readWhileWorking.getStatus as ReturnType<typeof vi.fn>

    await renderAppShellAtView('settings', 'overlay-reader')
    expect(await screen.findByRole('region', { name: 'Overlay Reader settings' })).toBeTruthy()
    const callsBefore = getStatus.mock.calls.length

    fireEvent.click(screen.getByRole('button', { name: 'Record Summon shortcut' }))
    const capturing = screen.getByRole('button', { name: /Recording Summon shortcut/i })
    await act(async () => {
      fireEvent.keyDown(capturing, {
        key: 'j',
        code: 'KeyJ',
        ctrlKey: true,
        shiftKey: true,
      })
    })

    // handleSaveRwwShortcut persists the top-level chord, then re-checks readiness.
    expect(api.db.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ read_while_working_shortcut: 'Control+Shift+J' })
    )
    expect(getStatus.mock.calls.length).toBeGreaterThan(callsBefore)
  })
})

describe('Read while working settings and temporary reader', () => {
  async function renderOverlaySettingsSubview() {
    await renderAppShellAtView('settings', 'overlay-reader')
  }

  it('renders current Overlay tab controls with a state-only host cluster', async () => {
    const api = stubApi()
    await renderOverlaySettingsSubview()
    expect(api.db.getSettings).toHaveBeenCalled()
    expect(screen.getByRole('tab', { name: 'Overlay' }).getAttribute('aria-selected')).toBe('true')
    const overlayPanel = screen.getByRole('tabpanel', { name: 'Overlay' })
    // Window size is a collapsed fold-down (ADR-0021): the size summary is shown and
    // the width/height sliders stay hidden until the block is expanded.
    expect(within(overlayPanel).getByText('640 × 360')).toBeTruthy()
    expect(within(overlayPanel).queryByRole('slider', { name: 'Overlay width' })).toBeNull()
    fireEvent.click(within(overlayPanel).getByRole('button', { name: /Window size/ }))
    expect(within(overlayPanel).getByRole('slider', { name: 'Overlay width' })).toBeTruthy()
    expect(within(overlayPanel).getByRole('slider', { name: 'Overlay height' })).toBeTruthy()
    expect(within(overlayPanel).getByText('Show standby pill')).toBeTruthy()
    expect(within(overlayPanel).queryByText('Restore clipboard')).toBeNull()
    // Shortcut rebinding lives in the Overlay tab body (ADR-0021): labeled
    // Summon/Exit recorder rows inside the tabpanel.
    expect(within(overlayPanel).getByRole('button', { name: 'Record Summon shortcut' })).toBeTruthy()
    expect(within(overlayPanel).getByRole('button', { name: 'Record Exit shortcut' })).toBeTruthy()
    // The host cluster is state/action chrome only (ADR-0021): a Start square plus a
    // compact state indicator, and no recorders on the square itself.
    expect(screen.getByRole('button', { name: 'Start Overlay Reader' }).textContent).toBe('Start')
    expect(
      document.querySelector('.rww-start-control__state-label')?.textContent
    ).toBe('Ready')
    expect(document.querySelector('.rww-start-control')?.querySelector('.key-capture-btn')).toBeNull()
    // Flat dense panel (ADR-0017, slice 06): every control renders at once — no
    // calm-grid drill-in.
    expect(screen.queryByRole('button', { name: 'Edit Overlay & Shortcuts settings' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Record Overlay Reader shortcut' })).toBeNull()
    expect(screen.queryByRole('spinbutton', { name: 'Temporary reader width' })).toBeNull()
    expect(screen.queryByRole('spinbutton', { name: 'Temporary reader height' })).toBeNull()
  })

  it('auto-saves the Standby pill toggle from the Overlay tab', async () => {
    const api = stubApi()
    await renderOverlaySettingsSubview()

    // Default on → click turns it off, written as an explicit RWW-scoped key.
    const standbyRow = screen.getByText('Show standby pill').closest('.settings-row')
    const standbyToggle = standbyRow?.querySelector('input[type="checkbox"]')
    expect(standbyToggle).toBeTruthy()
    fireEvent.click(standbyToggle!)
    expect(api.db.saveSettings).toHaveBeenCalledWith(expect.objectContaining({
      read_while_working_show_standby_control: expect.any(Boolean)
    }))
  })

  it('exposes summon/exit shortcut recorders in the Overlay tab body, not the host square', async () => {
    stubApi()
    await renderOverlaySettingsSubview()

    // Slice 02 (ADR-0021): shortcut recording is rehomed to the Overlay tab body
    // as the Shortcut settings block, while the host square stays action-only.
    const overlayPanel = screen.getByRole('tabpanel', { name: 'Overlay' })
    expect(within(overlayPanel).getByRole('heading', { name: 'Shortcut settings' })).toBeTruthy()
    expect(within(overlayPanel).getByRole('button', { name: 'Record Summon shortcut' })).toBeTruthy()
    expect(within(overlayPanel).getByRole('button', { name: 'Record Exit shortcut' })).toBeTruthy()
    expect(document.querySelector('.rww-start-control')?.querySelector('.key-capture-btn')).toBeNull()
  })

  it('auto-starts the temporary reader and finishes after playback completes', async () => {
    vi.useFakeTimers()
    const api = stubApi()
    api.readWhileWorking.getTemporarySession.mockResolvedValue({
      session: {
        id: 'session-1',
        title: 'Selected text',
        content: 'hello',
        createdAt: new Date().toISOString()
      },
      settings: BASE_SETTINGS
    })

    render(<TemporaryReaderApp />)
    await act(async () => {})
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Browse library' })).toBeNull()

    for (const ms of [1000, 1000, 1000, 1000, 500]) {
      await act(async () => {
        vi.advanceTimersByTime(ms)
      })
    }
    await act(async () => {})

    expect(api.readWhileWorking.finishTemporarySession).toHaveBeenCalledWith()
    expect(screen.queryByRole('dialog', { name: 'Finished' })).toBeNull()
  })

  it('renders the inherited reader-scope top anchor in the temporary reader', async () => {
    vi.useFakeTimers()
    const api = stubApi()
    api.readWhileWorking.getTemporarySession.mockResolvedValue({
      session: {
        id: 'session-anchor',
        title: 'Top anchored overlay',
        content: 'one two three four five six seven eight nine ten eleven twelve',
        createdAt: new Date().toISOString()
      },
      settings: {
        ...BASE_SETTINGS,
        lines_count: 3,
        lines_anchor: 'top'
      }
    })

    const { container } = render(<TemporaryReaderApp />)
    await act(async () => {})
    for (const ms of [1000, 1000, 1000, 100]) {
      await act(async () => { vi.advanceTimersByTime(ms) })
    }

    expect(container.querySelector('.reader-stack-rows--top')).not.toBeNull()
    expect(container.querySelector('.reader-stack-rows--center')).toBeNull()
  })

  it('does not close the temporary session during React StrictMode effect replay', async () => {
    const api = stubApi()
    api.readWhileWorking.getTemporarySession.mockResolvedValue({
      session: {
        id: 'session-1',
        title: 'Selected text',
        content: 'selected text stays visible',
        createdAt: new Date().toISOString()
      },
      settings: BASE_SETTINGS
    })

    render(
      <React.StrictMode>
        <TemporaryReaderApp />
      </React.StrictMode>
    )

    await act(async () => {})

    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Browse library' })).toBeNull()
    expect(api.readWhileWorking.finishTemporarySession).not.toHaveBeenCalled()
  })
})

describe('Home dove integration', () => {
  it('dove returns to hub from Import', async () => {
    stubApi()

    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Import' }))
    expect(await screen.findByRole('heading', { name: 'Import Text' })).toBeTruthy()

    const homeBtn = document.querySelector('.home-control') as HTMLButtonElement
    expect(homeBtn).toBeTruthy()
    fireEvent.click(homeBtn)

    expect(await screen.findByRole('button', { name: 'Read' })).toBeTruthy()
  })

  it('dove returns to hub from Make Video launchpad', async () => {
    stubApi()

    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Make Video' }))
    expect(await screen.findByRole('heading', { name: 'Make Video' })).toBeTruthy()

    const homeBtn = document.querySelector('.home-control') as HTMLButtonElement
    expect(homeBtn).toBeTruthy()
    fireEvent.click(homeBtn)

    expect(await screen.findByRole('button', { name: 'Read' })).toBeTruthy()
  })

  it('hub Overlay Reader tile opens Overlay Reader settings and corner back returns to the hub', async () => {
    stubApi()

    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Overlay Reader' }))
    expect(await screen.findByRole('region', { name: 'Overlay Reader settings' })).toBeTruthy()
    expect(document.querySelector('.home-control-dove')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Back to home' }))
    expect(await screen.findByRole('button', { name: 'Read' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Overlay Reader settings' })).toBeNull()
  })

  it('Settings landing Overlay Reader card opens the subview and corner back returns to Settings', async () => {
    stubApi()

    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }))
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Open Overlay Reader settings' }))
    expect(await screen.findByRole('region', { name: 'Overlay Reader settings' })).toBeTruthy()
    expect(document.querySelector('.home-control-dove')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Back to Settings' }))
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeTruthy()

    const homeBtn = document.querySelector('.home-control') as HTMLButtonElement
    expect(homeBtn).toBeTruthy()
    fireEvent.click(homeBtn)
    expect(await screen.findByRole('button', { name: 'Read' })).toBeTruthy()
  })

  it('keeps RWW onExited routing the main window to Library', async () => {
    const api = stubApi()
    let onExitedCallback: (() => void) | undefined
    ;(api.readWhileWorking.onExited as ReturnType<typeof vi.fn>).mockImplementation((callback) => {
      onExitedCallback = callback
      return () => {}
    })

    render(<App />)
    expect(await screen.findByRole('button', { name: 'Read' })).toBeTruthy()

    await act(async () => {
      onExitedCallback?.()
    })

    expect(await screen.findByRole('heading', { name: 'Library' })).toBeTruthy()
  })

  it('Reader does not show the home dove', async () => {
    stubApi()

    // AppShell does not mount HomeControl when view === 'reader' (ADR-0011).
    await act(async () => {
      render(
        <NavigationProvider>
          <SettingsProvider>
            <LibraryProvider>
              <ReaderProvider>
                <ForceView view="reader" />
                <AppShell />
              </ReaderProvider>
            </LibraryProvider>
          </SettingsProvider>
        </NavigationProvider>
      )
    })

    expect(document.querySelector('.home-control')).toBeNull()
  })
})

describe('Corner chrome — gear control', () => {
  it('hides the gear control on Library while keeping the dove', async () => {
    stubApi()
    await renderAppShellAtView('library')
    expect(document.querySelector('.gear-control')).toBeNull()
    expect(document.querySelector('.home-control')).toBeTruthy()
    expect(document.querySelector('.home-control-dove')).toBeTruthy()
    expect(document.querySelector('.up-level-control')).toBeNull()
  })

  it('uses the corner up-level control on Library Contents and routes back to the Library list', async () => {
    const api = stubApi()
    ;(api.db.getSegments as ReturnType<typeof vi.fn>).mockResolvedValue(LIBRARY_CONTENTS_SEGMENTS)

    await renderAppShellAtLibraryContents()

    expect(await screen.findByRole('heading', { name: 'Library Contents Fixture' })).toBeTruthy()
    expect(screen.queryByText('← Library')).toBeNull()
    expect(document.querySelector('.gear-control')).toBeNull()
    expect(document.querySelector('.home-control-dove')).toBeNull()
    expect(document.querySelectorAll('.home-control')).toHaveLength(1)
    const upLevel = screen.getByRole('button', { name: 'Back to library' })
    expect(upLevel.className).toContain('up-level-control')

    fireEvent.click(upLevel)

    expect(await screen.findByRole('heading', { name: 'Library' })).toBeTruthy()
    expect(document.querySelector('.up-level-control')).toBeNull()
    expect(document.querySelector('.home-control-dove')).toBeTruthy()
    expect(document.querySelectorAll('.home-control')).toHaveLength(1)
  })

  it('hides the gear control when view is settings; dove remains', async () => {
    stubApi()
    await renderAppShellAtView('settings')
    expect(document.querySelector('.gear-control')).toBeNull()
    expect(document.querySelector('.home-control')).toBeTruthy()
    expect(document.querySelector('.home-control-dove')).toBeTruthy()
    expect(document.querySelector('.up-level-control')).toBeNull()
  })

  it.each([
    ['reader-defaults', 'Reader defaults', 'region'],
    ['overlay-reader', 'Overlay Reader settings', 'region'],
    ['import', 'Import', 'heading'],
    ['data', 'Data', 'heading'],
  ] as const)(
    'shows Settings up-level, not the dove, on the %s sub-page',
    async (settingsSubview, label, role) => {
      stubApi()
      await renderAppShellAtView('settings', settingsSubview)

      expect(await screen.findByRole(role, { name: label })).toBeTruthy()
      expect(document.querySelector('.gear-control')).toBeNull()
      expect(document.querySelector('.home-control-dove')).toBeNull()
      const upLevel = screen.getByRole('button', { name: 'Back to Settings' })
      expect(upLevel.className).toContain('up-level-control')

      fireEvent.click(upLevel)

      expect(await screen.findByRole('heading', { name: 'Settings' })).toBeTruthy()
      expect(screen.getByRole('button', { name: /edit reader defaults/i })).toBeTruthy()
      expect(document.querySelector('.up-level-control')).toBeNull()
      expect(document.querySelector('.home-control-dove')).toBeTruthy()
    }
  )

  // The route table declares the dove on every inner screen that is not the
  // Reader, the hub or a nested sub-page; "dove -> hub" must stay constant.
  it.each(['library', 'import', 'make-video', 'add-chapter', 'transmute', 'settings'] as const)(
    'shows the dove on %s and routes it to the hub',
    async (view) => {
      stubApi()
      await renderAppShellAtView(view)

      expect(document.querySelector('.home-control-dove')).toBeTruthy()
      expect(document.querySelector('.up-level-control')).toBeNull()

      await act(async () => {
        fireEvent.click(document.querySelector('.home-control') as HTMLButtonElement)
      })

      expect(await screen.findByRole('button', { name: 'Read' })).toBeTruthy()
      expect(document.querySelector('.home-control')).toBeNull()
    }
  )

  // The gear is the mirrored corner: present on the plain inner screens, absent
  // wherever the table says so (Library, Settings, Reader, hub).
  it.each(['import', 'make-video', 'add-chapter', 'transmute'] as const)(
    'shows the gear control on %s',
    async (view) => {
      stubApi()
      await renderAppShellAtView(view)
      expect(document.querySelector('.gear-control')).toBeTruthy()
    }
  )

  it('removes the old Import/Data in-flow Settings back control', async () => {
    stubApi()
    await renderAppShellAtView('settings', 'import')

    expect(await screen.findByRole('heading', { name: 'Import' })).toBeTruthy()
    expect(document.querySelector('.rdc-back')).toBeNull()
  })

  it('does not show the gear control in the Reader', async () => {
    stubApi()
    await act(async () => {
      render(
        <NavigationProvider>
          <SettingsProvider>
            <LibraryProvider>
              <ReaderProvider>
                <ForceView view="reader" />
                <AppShell />
              </ReaderProvider>
            </LibraryProvider>
          </SettingsProvider>
        </NavigationProvider>
      )
    })
    expect(document.querySelector('.gear-control')).toBeNull()
  })
})
