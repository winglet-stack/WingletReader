import React, { useState } from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import Reader from '../components/Reader'
import { useReadingSessionLifecycle } from '../hooks/useReadingSessionLifecycle'
import type { Bookmark, PlaybackState, Settings, TextRecord, WordStack } from '../types'
import { NavigationProvider } from '../contexts/NavigationContext'
import { SettingsProvider } from '../contexts/SettingsContext'
import { LibraryProvider } from '../contexts/LibraryContext'
import { ReaderProvider } from '../contexts/ReaderContext'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
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

function stubApi(
  savedPosition: { stackIndex: number } | null = null,
  bookmarks: Bookmark[] = []
) {
  let nextBookmarkId = 1
  const api = {
    db: {
      getTexts: vi.fn().mockResolvedValue([]),
      getSettings: vi.fn().mockResolvedValue({}),
      saveSettings: vi.fn().mockResolvedValue({}),
      getReadingPosition: vi.fn().mockResolvedValue(savedPosition),
      getLatestResumeCandidate: vi.fn().mockResolvedValue(null),
      saveReadingPosition: vi.fn().mockResolvedValue({}),
      getBookmarks: vi.fn().mockResolvedValue(bookmarks),
      saveBookmark: vi.fn((textId: number, draft: object) =>
        Promise.resolve({
          ...(draft as object),
          id: nextBookmarkId++,
          textId,
          createdAt: '2026-07-12T00:00:00.000Z',
        })
      ),
      deleteBookmark: vi.fn().mockResolvedValue(undefined),
    },
  }
  vi.stubGlobal('api', api)
  return api
}

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

const TWELVE_WORDS = 'one two three four five six seven eight nine ten eleven twelve'

const SESSION_TEXT: TextRecord = {
  title: 'Session Fixture',
  content: TWELVE_WORDS,
  word_count: 12,
}

const SAVED_TEXT: TextRecord = {
  id: 7,
  title: 'Saved Fixture',
  content: TWELVE_WORDS,
  word_count: 12,
}

function renderReader(
  text: TextRecord,
  resumeFrom: number | null = null,
  opts: {
    onBack?: () => void
    onExitToLibrary?: () => void
    backLabel?: string
    sessionEndEnabled?: boolean
  } = {}
) {
  render(
    <NavigationProvider>
      <SettingsProvider initialSettings={BASE_SETTINGS}>
        <LibraryProvider initialActiveText={text}>
          <ReaderProvider initialResumeFrom={resumeFrom}>
            <Reader
              onBack={opts.onBack ?? vi.fn()}
              onExitToLibrary={opts.onExitToLibrary ?? vi.fn()}
              backLabel={opts.backLabel}
              sessionEndEnabled={opts.sessionEndEnabled}
            />
          </ReaderProvider>
        </LibraryProvider>
      </SettingsProvider>
    </NavigationProvider>
  )
}

const SESSION_STACKS: WordStack[] = [
  { words: ['one', 'two'], type: 'normal' },
  { words: ['three', 'four'], type: 'normal' },
  { words: ['five', 'six'], type: 'normal' },
  { words: ['seven', 'eight'], type: 'normal' },
  { words: ['nine', 'ten'], type: 'normal' },
  { words: ['eleven', 'twelve'], type: 'normal' },
]

function renderLifecycleHarness() {
  function Harness() {
    const [currentIndex, setCurrentIndex] = useState(0)
    const [playState, setPlayState] = useState<PlaybackState>('idle')
    const [manualSeekRevision, setManualSeekRevision] = useState(0)
    const [naturalEndRevision, setNaturalEndRevision] = useState(0)
    const [goalBookmark, setGoalBookmark] = useState<Bookmark | null>(null)
    const lifecycle = useReadingSessionLifecycle({
      text: SAVED_TEXT,
      stacks: SESSION_STACKS,
      currentIndex,
      playState,
      segmentCtx: undefined,
      resumeFromIndex: null,
      rereReadEndIndex: null,
      goalBookmark,
      manualSeekRevision,
      naturalEndRevision,
      play: () => {
        setCurrentIndex(0)
        setPlayState('playing')
      },
      playFrom: (index) => {
        setCurrentIndex(index)
        setPlayState('playing')
      },
      pause: () => setPlayState('paused'),
      stop: () => setPlayState('stopped'),
      pauseAndHold: () => setPlayState('paused'),
      discardToStart: () => {
        setCurrentIndex(0)
        setPlayState('stopped')
      },
      onGoalBookmarkConsumed: (bookmarkId) => {
        setGoalBookmark((current) => current?.id === bookmarkId ? null : current)
      },
      refreshResumeCandidate: () => {},
    })

    return (
      <div>
        <button type="button" onClick={lifecycle.handlePlay}>play</button>
        <button type="button" onClick={lifecycle.handleResume}>resume saved</button>
        <button type="button" onClick={() => setCurrentIndex(4)}>index 4</button>
        <button type="button" onClick={() => setCurrentIndex(5)}>index 5</button>
        <button type="button" onClick={() => setPlayState('paused')}>pause</button>
        <button type="button" onClick={() => setPlayState('playing')}>resume live</button>
        <button type="button" onClick={lifecycle.stopReading}>stop reading</button>
        <button type="button" onClick={() => {
          setCurrentIndex(2)
          setManualSeekRevision((revision) => revision + 1)
        }}>seek index 2</button>
        <button type="button" onClick={() => {
          setCurrentIndex(SESSION_STACKS.length)
          setPlayState('paused')
          setNaturalEndRevision((revision) => revision + 1)
        }}>natural end</button>
        <button type="button" onClick={() => {
          setGoalBookmark({
            id: 44,
            textId: 7,
            kind: 'goal',
            wordOffset: 4,
            label: 'Harness target',
            createdAt: '2026-07-13T00:00:00.000Z',
          })
        }}>set goal</button>
        <button type="button" onClick={() => { void lifecycle.commitCurrentPosition() }}>commit</button>
        <button type="button" onClick={() => { void lifecycle.revertToBaseline() }}>revert</button>
        <span data-testid="play-state">{playState}</span>
        <span data-testid="current-index">{currentIndex}</span>
        <span data-testid="session-end">{lifecycle.sessionEnd?.reason ?? 'none'}</span>
      </div>
    )
  }

  render(<Harness />)
}

describe('Reader session - countdown to playFrom', () => {
  it('counts 3, 2, 1 on a resume intent, then starts playback at the pending index', async () => {
    vi.useFakeTimers()
    stubApi()

    renderReader(SESSION_TEXT, 2)

    expect(screen.getByText('3')).toBeTruthy()

    await act(async () => { vi.advanceTimersByTime(1000) })
    expect(screen.getByText('2')).toBeTruthy()

    await act(async () => { vi.advanceTimersByTime(1000) })
    expect(screen.getByText('1')).toBeTruthy()

    await act(async () => { vi.advanceTimersByTime(1000) })
    expect(document.querySelector('.reader-countdown')).toBeNull()
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy()
    const scrubber = screen.getByRole('slider', { name: 'Reading position' }) as HTMLInputElement
    expect(Number(scrubber.value)).toBe(2)
  })

  it('cancels the countdown when Stop is pressed mid-count', async () => {
    vi.useFakeTimers()
    stubApi()

    renderReader(SESSION_TEXT, 2)
    expect(screen.getByText('3')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(document.querySelector('.reader-countdown')).toBeNull()

    await act(async () => { vi.advanceTimersByTime(5000) })
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull()
  })
})

describe('Reader session - valid saved index', () => {
  it('shows the resume-from-saved button for an in-bounds saved index and resumes from it', async () => {
    stubApi({ stackIndex: 3 })

    renderReader(SAVED_TEXT)

    const resumeBtn = await screen.findByRole('button', { name: 'Resume from saved position' })
    expect(resumeBtn.getAttribute('title')).toBe('Resume from 50% (Space)')

    act(() => { fireEvent.click(resumeBtn) })

    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy()
    const scrubber = screen.getByRole('slider', { name: 'Reading position' }) as HTMLInputElement
    expect(Number(scrubber.value)).toBe(3)
  })

  it('ignores a saved index at or beyond the stacks length and offers plain Play', async () => {
    const api = stubApi({ stackIndex: 100 })

    renderReader(SAVED_TEXT)

    await act(async () => {})
    await act(async () => {})
    expect(api.db.getReadingPosition).toHaveBeenCalledWith(7)

    expect(screen.queryByRole('button', { name: 'Resume from saved position' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy()
  })

  it('ignores a saved index of zero', async () => {
    const api = stubApi({ stackIndex: 0 })

    renderReader(SAVED_TEXT)

    await act(async () => {})
    await act(async () => {})
    expect(api.db.getReadingPosition).toHaveBeenCalledWith(7)

    expect(screen.queryByRole('button', { name: 'Resume from saved position' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy()
  })
})

function openBookmarkPopover() {
  act(() => { fireEvent.click(screen.getByRole('button', { name: /Open bookmarks/ })) })
}

function openGoalTab() {
  openBookmarkPopover()
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: 'Target' }))
  })
}

function domRect({
  left,
  right,
  top = 0,
  bottom = 100,
}: {
  left: number
  right: number
  top?: number
  bottom?: number
}): DOMRect {
  const width = right - left
  const height = bottom - top
  return {
    x: left,
    y: top,
    left,
    right,
    top,
    bottom,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect
}

function installTargetPickLayoutMock({
  textRight,
  paddingRight,
  wrapRight = 808,
  fullPopoverWidth = 300,
  collapsedPopoverWidth = 112,
}: {
  textRight: number
  paddingRight: number
  wrapRight?: number
  fullPopoverWidth?: number
  collapsedPopoverWidth?: number
}) {
  const layout = {
    textRight,
    paddingRight,
    wrapRight,
    fullPopoverWidth,
    collapsedPopoverWidth,
  }
  const rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const el = this
    if (el.classList.contains('plain-text-content')) {
      return domRect({ left: 100, right: layout.textRight, bottom: 420 })
    }
    if (el.classList.contains('bookmark-popover-wrap')) {
      return domRect({ left: layout.wrapRight - 48, right: layout.wrapRight, bottom: 560 })
    }
    if (el.classList.contains('bookmark-popover')) {
      const width = el.classList.contains('bookmark-popover--collapsed')
        ? layout.collapsedPopoverWidth
        : layout.fullPopoverWidth
      return domRect({ left: layout.wrapRight - width, right: layout.wrapRight, bottom: 520 })
    }
    return domRect({ left: 0, right: 0 })
  })
  const realGetComputedStyle = window.getComputedStyle.bind(window)
  const styleSpy = vi.spyOn(window, 'getComputedStyle').mockImplementation((el, pseudoElt) => {
    const style = realGetComputedStyle(el, pseudoElt)
    if (!(el as Element).classList.contains('plain-text-content')) return style

    const paddingRightValue = `${layout.paddingRight}px`
    return new Proxy(style, {
      get(target, prop, receiver) {
        if (prop === 'paddingRight') return paddingRightValue
        if (prop === 'getPropertyValue') {
          return (property: string) =>
            property === 'padding-right'
              ? paddingRightValue
              : target.getPropertyValue(property)
        }
        return Reflect.get(target, prop, receiver)
      },
    })
  })

  return {
    setLayout(patch: Partial<typeof layout>) {
      Object.assign(layout, patch)
    },
    restore() {
      rectSpy.mockRestore()
      styleSpy.mockRestore()
    },
  }
}

describe('Reader session - bookmarks at current position', () => {
  it('creates a normal bookmark at the live playhead word offset with an editable label', async () => {
    vi.useFakeTimers()
    const api = stubApi()

    renderReader(SAVED_TEXT)
    await act(async () => {})

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })
    await act(async () => { vi.advanceTimersByTime(1000) })
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Pause' })) })

    openBookmarkPopover()
    const input = screen.getByLabelText('Label') as HTMLInputElement
    expect(input.value).toBe('')
    expect(input.getAttribute('placeholder')).toBe('five six seven eight')

    act(() => {
      fireEvent.change(input, { target: { value: 'Chapter turn' } })
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Set Bookmark' }))
    })

    expect(api.db.saveBookmark).toHaveBeenCalledWith(7, {
      kind: 'normal',
      wordOffset: 4,
      label: 'Chapter turn',
    })
    expect(screen.getByRole('button', { name: 'Open bookmarks, saved bookmarks exist' })).toBeTruthy()
  })

  it('falls back to the auto-snippet label when the label field is blank', async () => {
    const api = stubApi()

    renderReader(SAVED_TEXT)
    await act(async () => {})

    openBookmarkPopover()
    const input = screen.getByLabelText('Label') as HTMLInputElement
    expect(input.value).toBe('')
    expect(input.getAttribute('placeholder')).toBe('one two three four')

    act(() => {
      fireEvent.change(input, { target: { value: '   ' } })
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Set Bookmark' }))
    })

    expect(api.db.saveBookmark).toHaveBeenCalledWith(7, {
      kind: 'normal',
      wordOffset: 0,
      label: 'one two three four',
    })
  })

  it('closes the bookmark popover through the Escape cascade', async () => {
    stubApi()

    renderReader(SAVED_TEXT)
    await act(async () => {})

    openBookmarkPopover()
    expect(screen.getByRole('dialog', { name: 'Bookmarks' })).toBeTruthy()

    act(() => {
      fireEvent.keyDown(screen.getByLabelText('Label'), { code: 'Escape' })
    })

    expect(screen.queryByRole('dialog', { name: 'Bookmarks' })).toBeNull()
  })

  it('filters bookmark rows and action buttons by Bookmark/Target tab', async () => {
    stubApi(null, [
      {
        id: 2,
        textId: 7,
        kind: 'normal',
        wordOffset: 8,
        label: 'Later turn',
        createdAt: '2026-07-12T00:00:00.000Z',
      },
      {
        id: 1,
        textId: 7,
        kind: 'normal',
        wordOffset: 2,
        label: 'Early turn',
        createdAt: '2026-07-12T00:00:00.000Z',
      },
      {
        id: 3,
        textId: 7,
        kind: 'goal',
        wordOffset: 10,
        label: 'Stop goal',
        createdAt: '2026-07-12T00:00:00.000Z',
      },
    ])

    renderReader(SAVED_TEXT)
    await act(async () => {})

    openBookmarkPopover()

    expect(screen.getByRole('group', { name: 'Bookmark category' })).toBeTruthy()
    expect(document.querySelector('fieldset[aria-label="Bookmark category"]')).toBeNull()
    expect(screen.getByRole('button', { name: 'Bookmark' }).className).toContain('theme-pill-active')
    expect(screen.getByRole('button', { name: 'Set Bookmark' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Set Target' })).toBeNull()

    const early = screen.getByRole('button', { name: 'Read from bookmark: Early turn' })
    const later = screen.getByRole('button', { name: 'Read from bookmark: Later turn' })
    expect(early.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText('17%')).toBeTruthy()
    expect(screen.getByText('67%')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Read from bookmark: Stop goal (Target)' })).toBeNull()

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Target' }))
    })

    expect(screen.getByRole('button', { name: 'Target' }).className).toContain('theme-pill-active')
    expect(screen.queryByRole('button', { name: 'Set Bookmark' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Set Target' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Read from bookmark: Early turn' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Read from bookmark: Later turn' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Read from bookmark: Stop goal (Target)' })).toBeTruthy()
  })

  it('selects a bookmark by jumping the reader to its resolved stack index', async () => {
    stubApi(null, [
      {
        id: 1,
        textId: 7,
        kind: 'normal',
        wordOffset: 8,
        label: 'Later turn',
        createdAt: '2026-07-12T00:00:00.000Z',
      },
    ])

    renderReader(SAVED_TEXT)
    await act(async () => {})

    openBookmarkPopover()
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Read from bookmark: Later turn' }))
    })

    const scrubber = screen.getByRole('slider', { name: 'Reading position' }) as HTMLInputElement
    expect(Number(scrubber.value)).toBe(4)
    expect(screen.queryByRole('dialog', { name: 'Bookmarks' })).toBeNull()
  })

  it('deletes a bookmark row through the bookmark API without reloading', async () => {
    const api = stubApi(null, [
      {
        id: 1,
        textId: 7,
        kind: 'normal',
        wordOffset: 2,
        label: 'Early turn',
        createdAt: '2026-07-12T00:00:00.000Z',
      },
      {
        id: 2,
        textId: 7,
        kind: 'normal',
        wordOffset: 8,
        label: 'Later turn',
        createdAt: '2026-07-12T00:00:00.000Z',
      },
    ])

    renderReader(SAVED_TEXT)
    await act(async () => {})

    openBookmarkPopover()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete bookmark: Early turn' }))
    })

    expect(api.db.deleteBookmark).toHaveBeenCalledWith(1)
    expect(screen.queryByRole('button', { name: 'Read from bookmark: Early turn' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Read from bookmark: Later turn' })).toBeTruthy()
  })

  it('arms a goal pick, reopens on the picked word, replaces the prior goal, and marks the scrubber', async () => {
    const api = stubApi(null, [
      {
        id: 10,
        textId: 7,
        kind: 'goal',
        wordOffset: 10,
        label: 'Old goal',
        createdAt: '2026-07-12T00:00:00.000Z',
      },
      {
        id: 11,
        textId: 7,
        kind: 'normal',
        wordOffset: 8,
        label: 'Later turn',
        createdAt: '2026-07-12T00:00:00.000Z',
      },
    ])

    renderReader(SAVED_TEXT)
    await act(async () => {})

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })
    openGoalTab()
    act(() => {
      fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Session goal' } })
    })
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Set Target' }))
    })

    expect(screen.getByRole('dialog', { name: 'Bookmarks' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancel' }).className).toContain('bookmark-popover-set-btn--danger')
    expect(screen.getByText('Click a word to set your target')).toBeTruthy()

    act(() => { fireEvent.click(screen.getByText('seven')) })

    expect(screen.getByRole('dialog', { name: 'Bookmarks' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Target' }).className).toContain('theme-pill-active')
    expect((screen.getByLabelText('Label') as HTMLInputElement).value).toBe('Session goal')
    expect(screen.getByText('Target position: word 7 of 12 (58%); current position: 0%')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Replace target' }))
    })

    expect(api.db.saveBookmark).toHaveBeenCalledWith(7, {
      kind: 'goal',
      wordOffset: 6,
      label: 'Session goal',
    })
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Back to reader' })) })
    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy()

    const marker = document.querySelector('.reader-target-marker') as HTMLElement
    expect(marker).toBeTruthy()
    expect(marker.style.left).toContain('50')

    openBookmarkPopover()
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Target' }))
    })
    expect(screen.queryByRole('button', { name: 'Read from bookmark: Old goal (Target)' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Read from bookmark: Session goal (Target)' })).toBeTruthy()
    expect(screen.getAllByText('Target').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Read from bookmark: Later turn' })).toBeNull()
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Bookmark' }))
    })
    expect(screen.getByRole('button', { name: 'Read from bookmark: Later turn' })).toBeTruthy()
  })

  it('arms from the Target tab, keeps the popover open, pauses, and cancels in place', async () => {
    stubApi()

    renderReader(SAVED_TEXT)
    await act(async () => {})

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })
    openGoalTab()
    expect(screen.getByRole('button', { name: 'Set Target' })).toBeTruthy()

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Set Target' })) })

    expect(screen.getByRole('dialog', { name: 'Bookmarks' })).toBeTruthy()
    expect(screen.getByText('Click a word to set your target')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Cancel goal pick' })).toBeNull()

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Cancel' })) })
    expect(screen.queryByText('Click a word to set your target')).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Bookmarks' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Set Target' })).toBeTruthy()
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Back to reader' })) })
    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy()
  })

  it('cancels an armed goal pick with first Escape, then closes the popover with second Escape', async () => {
    stubApi()

    renderReader(SAVED_TEXT)
    await act(async () => {})

    openGoalTab()
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Set Target' })) })
    expect(screen.getByText('Click a word to set your target')).toBeTruthy()

    act(() => {
      fireEvent.keyDown(window, { code: 'Escape' })
    })

    expect(screen.queryByText('Click a word to set your target')).toBeNull()
    expect(screen.getByRole('region', { name: 'Text view' })).toBeTruthy()
    expect(screen.getByRole('dialog', { name: 'Bookmarks' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Set Target' })).toBeTruthy()

    act(() => {
      fireEvent.keyDown(window, { code: 'Escape' })
    })

    expect(screen.queryByRole('dialog', { name: 'Bookmarks' })).toBeNull()
  })

  it('closes the popover and cancels an armed goal pick through the toolbar toggle', async () => {
    stubApi()

    renderReader(SAVED_TEXT)
    await act(async () => {})

    openGoalTab()
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Set Target' })) })
    expect(screen.getByText('Click a word to set your target')).toBeTruthy()

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Open bookmarks' })) })
    expect(screen.queryByText('Click a word to set your target')).toBeNull()
    expect(screen.queryByRole('dialog', { name: 'Bookmarks' })).toBeNull()
  })

  it('suppresses outside mousedown while armed and resumes click-away close after a word is picked', async () => {
    stubApi()

    renderReader(SAVED_TEXT)
    await act(async () => {})

    openGoalTab()
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Set Target' })) })
    expect(screen.getByRole('dialog', { name: 'Bookmarks' })).toBeTruthy()

    act(() => { fireEvent.mouseDown(document.body) })
    expect(screen.getByRole('dialog', { name: 'Bookmarks' })).toBeTruthy()

    act(() => { fireEvent.click(screen.getByText('seven')) })
    expect(screen.getByRole('button', { name: 'Save target' })).toBeTruthy()

    act(() => { fireEvent.mouseDown(document.body) })
    expect(screen.queryByRole('dialog', { name: 'Bookmarks' })).toBeNull()
  })

  it('keeps the full popover while armed when only the text padding gutter overlaps', async () => {
    const layout = installTargetPickLayoutMock({
      textRight: 560,
      paddingRight: 80,
    })
    try {
      stubApi()

      renderReader(SAVED_TEXT)
      await act(async () => {})

      openGoalTab()
      act(() => { fireEvent.click(screen.getByRole('button', { name: 'Set Target' })) })

      expect(screen.getByRole('dialog', { name: 'Bookmarks' })).toBeTruthy()
      expect(screen.getByLabelText('Label')).toBeTruthy()
      expect(screen.getByRole('group', { name: 'Bookmark category' })).toBeTruthy()
      expect(document.querySelector('.bookmark-popover--collapsed')).toBeNull()
      expect(screen.getByText('Click a word to set your target')).toBeTruthy()
    } finally {
      layout.restore()
    }
  })

  it('collapses to only the red Cancel strip while armed when the full popover would cover words', async () => {
    const layout = installTargetPickLayoutMock({
      textRight: 620,
      paddingRight: 56,
    })
    try {
      stubApi()

      renderReader(SAVED_TEXT)
      await act(async () => {})

      openGoalTab()
      act(() => { fireEvent.click(screen.getByRole('button', { name: 'Set Target' })) })

      expect(document.querySelector('.bookmark-popover--collapsed')).toBeTruthy()
      expect(screen.getByRole('dialog', { name: 'Bookmarks' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Cancel' }).className).toContain('bookmark-popover-set-btn--danger')
      expect(screen.queryByLabelText('Label')).toBeNull()
      expect(screen.queryByRole('group', { name: 'Bookmark category' })).toBeNull()
      expect(screen.getByText('Click a word to set your target')).toBeTruthy()
    } finally {
      layout.restore()
    }
  })

  it('toggles the armed collapse live on resize and restores the full popover after a word is picked', async () => {
    const layout = installTargetPickLayoutMock({
      textRight: 620,
      paddingRight: 56,
    })
    try {
      stubApi()

      renderReader(SAVED_TEXT)
      await act(async () => {})

      openGoalTab()
      act(() => { fireEvent.click(screen.getByRole('button', { name: 'Set Target' })) })
      expect(document.querySelector('.bookmark-popover--collapsed')).toBeTruthy()

      act(() => {
        layout.setLayout({ textRight: 500 })
        window.dispatchEvent(new Event('resize'))
      })
      expect(document.querySelector('.bookmark-popover--collapsed')).toBeNull()
      expect(screen.getByLabelText('Label')).toBeTruthy()

      act(() => {
        layout.setLayout({ textRight: 620 })
        window.dispatchEvent(new Event('resize'))
      })
      expect(document.querySelector('.bookmark-popover--collapsed')).toBeTruthy()

      act(() => { fireEvent.click(screen.getByText('seven')) })
      expect(document.querySelector('.bookmark-popover--collapsed')).toBeNull()
      expect(screen.getByLabelText('Label')).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Save target' })).toBeTruthy()
    } finally {
      layout.restore()
    }
  })

  it('keeps an unarmed text-view word click out of the Normal tab action', async () => {
    const api = stubApi()

    renderReader(SAVED_TEXT)
    await act(async () => {})

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Plain text view' })) })
    act(() => { fireEvent.click(screen.getByText('seven')) })
    expect(screen.queryByRole('dialog', { name: 'Bookmarks' })).toBeNull()

    const scrubber = screen.getByRole('slider', { name: 'Reading position' }) as HTMLInputElement
    expect(Number(scrubber.value)).toBe(0)

    openBookmarkPopover()
    expect(screen.getByText('Current position: 0%')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Set Bookmark' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Set Target' })).toBeNull()
    act(() => {
      fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Current turn' } })
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Set Bookmark' }))
    })

    expect(api.db.saveBookmark).toHaveBeenCalledWith(7, {
      kind: 'normal',
      wordOffset: 0,
      label: 'Current turn',
    })
  })

  it('creates a goal bookmark from the picked text-view word when it satisfies the forward rule', async () => {
    const api = stubApi(null)

    renderReader(SAVED_TEXT)
    await act(async () => {})

    openGoalTab()
    act(() => {
      fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Selected goal' } })
      fireEvent.click(screen.getByRole('button', { name: 'Set Target' }))
    })
    act(() => { fireEvent.click(screen.getByText('seven')) })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save target' }))
    })

    expect(api.db.saveBookmark).toHaveBeenCalledWith(7, {
      kind: 'goal',
      wordOffset: 6,
      label: 'Selected goal',
    })
  })

  it('suggests the picked goal snippet as a placeholder while the label stays blank', async () => {
    stubApi(null)

    renderReader(SAVED_TEXT)
    await act(async () => {})

    openGoalTab()
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Set Target' })) })
    act(() => { fireEvent.click(screen.getByText('seven')) })

    const input = screen.getByLabelText('Label') as HTMLInputElement
    expect(input.value).toBe('')
    expect(input.getAttribute('placeholder')).toBe('seven eight nine ten')
  })

  it('renders normal bookmarks as passive scrubber ticks with hover labels', async () => {
    stubApi(null, [
      {
        id: 31,
        textId: 7,
        kind: 'normal',
        wordOffset: 2,
        label: 'Early turn',
        createdAt: '2026-07-12T00:00:00.000Z',
      },
      {
        id: 32,
        textId: 7,
        kind: 'normal',
        wordOffset: 8,
        label: 'Later turn',
        createdAt: '2026-07-12T00:00:00.000Z',
      },
      {
        id: 33,
        textId: 7,
        kind: 'goal',
        wordOffset: 10,
        label: 'Session goal',
        createdAt: '2026-07-12T00:00:00.000Z',
      },
    ])

    renderReader(SAVED_TEXT)
    await act(async () => {})

    const ticks = document.querySelectorAll('.reader-bookmark-tick')
    expect(ticks).toHaveLength(2)

    const [earlyTick, laterTick] = Array.from(ticks) as HTMLElement[]
    expect(earlyTick.style.left).toContain('16')
    expect(earlyTick.getAttribute('title')).toBe('Early turn')
    expect(earlyTick.getAttribute('aria-label')).toBe('Bookmark: Early turn')
    expect(laterTick.style.left).toContain('66')
    expect(laterTick.getAttribute('title')).toBe('Later turn')
    expect(document.querySelector('.reader-target-marker')).toBeTruthy()
    expect(screen.queryByText('Early turn')).toBeNull()
    expect(screen.queryByText('Later turn')).toBeNull()
  })

  it('opens the Target dialog on goal crossing and continues in place with no active target', async () => {
    vi.useFakeTimers()
    const api = stubApi(null, [
      {
        id: 20,
        textId: 7,
        kind: 'goal',
        wordOffset: 4,
        label: 'Session goal',
        createdAt: '2026-07-12T00:00:00.000Z',
      },
    ])

    renderReader(SAVED_TEXT)
    await act(async () => {})

    expect(document.querySelector('.reader-target-marker')).toBeTruthy()

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })
    await act(async () => { vi.advanceTimersByTime(1000) })
    await act(async () => {})

    expect(api.db.deleteBookmark).toHaveBeenCalledWith(20)
    expect(screen.getByRole('dialog', { name: 'Target reached' })).toBeTruthy()
    expect(screen.getByText('33%')).toBeTruthy()
    expect(screen.getByText('4 of 12 words')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy()
    const scrubber = screen.getByRole('slider', { name: 'Reading position' }) as HTMLInputElement
    expect(Number(scrubber.value)).toBe(2)
    expect(document.querySelector('.reader-target-marker')).toBeNull()

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Continue reading' }))
    })

    expect(screen.queryByRole('dialog', { name: 'Target reached' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy()
    expect(Number(scrubber.value)).toBe(2)

    openBookmarkPopover()
    expect(screen.queryByRole('button', { name: 'Read from bookmark: Session goal (Target)' })).toBeNull()
  })

  it('starts a new Target pick from the Target dialog and returns to the held position after saving', async () => {
    vi.useFakeTimers()
    const api = stubApi(null, [
      {
        id: 22,
        textId: 7,
        kind: 'goal',
        wordOffset: 4,
        label: 'Session goal',
        createdAt: '2026-07-12T00:00:00.000Z',
      },
    ])

    renderReader(SAVED_TEXT)
    await act(async () => {})

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })
    await act(async () => { vi.advanceTimersByTime(1000) })
    await act(async () => {})

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Set a new target' }))
    })

    expect(screen.queryByRole('dialog', { name: 'Target reached' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Bookmarks' })).toBeTruthy()
    expect(screen.getByText('Click a word to set your target')).toBeTruthy()

    act(() => { fireEvent.click(screen.getByText('nine')) })
    expect(screen.getByRole('button', { name: 'Save target' })).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save target' }))
      await Promise.resolve()
    })

    expect(api.db.saveBookmark).toHaveBeenCalledWith(7, expect.objectContaining({
      kind: 'goal',
      wordOffset: 8,
    }))
    expect(screen.queryByRole('dialog', { name: 'Bookmarks' })).toBeNull()
    expect(screen.queryByText('Click a word to set your target')).toBeNull()
    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy()
    const scrubber = screen.getByRole('slider', { name: 'Reading position' }) as HTMLInputElement
    expect(Number(scrubber.value)).toBe(2)
  })

  it('cancels a new Target pick from the Target dialog and returns to the held position', async () => {
    vi.useFakeTimers()
    stubApi(null, [
      {
        id: 23,
        textId: 7,
        kind: 'goal',
        wordOffset: 4,
        label: 'Session goal',
        createdAt: '2026-07-12T00:00:00.000Z',
      },
    ])

    renderReader(SAVED_TEXT)
    await act(async () => {})

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })
    await act(async () => { vi.advanceTimersByTime(1000) })
    await act(async () => {})

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Set a new target' }))
    })
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    })

    expect(screen.queryByRole('dialog', { name: 'Target reached' })).toBeNull()
    expect(screen.queryByRole('dialog', { name: 'Bookmarks' })).toBeNull()
    expect(screen.queryByText('Click a word to set your target')).toBeNull()
    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy()
    const scrubber = screen.getByRole('slider', { name: 'Reading position' }) as HTMLInputElement
    expect(Number(scrubber.value)).toBe(2)
  })

  it('commits the held Target position on Save & Exit and routes to Library', async () => {
    vi.useFakeTimers()
    const api = stubApi({ stackIndex: 2 }, [
      {
        id: 24,
        textId: 7,
        kind: 'goal',
        wordOffset: 8,
        label: 'Session goal',
        createdAt: '2026-07-12T00:00:00.000Z',
      },
    ])
    const onExitToLibrary = vi.fn()

    renderReader(SAVED_TEXT, null, { onExitToLibrary })
    await act(async () => {})

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Resume from saved position' }))
    })
    await act(async () => { vi.advanceTimersByTime(1000) })
    await act(async () => {})

    expect(screen.getByRole('dialog', { name: 'Target reached' })).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save & Exit' }))
      await Promise.resolve()
    })

    expect(onExitToLibrary).toHaveBeenCalledTimes(1)
    expect(api.db.saveReadingPosition).toHaveBeenLastCalledWith(7, 4, 'text')
  })

  it('reverts to baseline from the Target dialog on Exit without saving and routes to Library', async () => {
    vi.useFakeTimers()
    const api = stubApi({ stackIndex: 2 }, [
      {
        id: 25,
        textId: 7,
        kind: 'goal',
        wordOffset: 8,
        label: 'Session goal',
        createdAt: '2026-07-12T00:00:00.000Z',
      },
    ])
    const onExitToLibrary = vi.fn()

    renderReader(SAVED_TEXT, null, { onExitToLibrary })
    await act(async () => {})

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Resume from saved position' }))
    })
    await act(async () => { vi.advanceTimersByTime(1000) })
    await act(async () => {})

    expect(screen.getByRole('dialog', { name: 'Target reached' })).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Exit without saving' }))
      await Promise.resolve()
    })

    expect(onExitToLibrary).toHaveBeenCalledTimes(1)
    expect(api.db.saveReadingPosition).toHaveBeenLastCalledWith(7, 2, 'text')
    const scrubber = screen.getByRole('slider', { name: 'Reading position' }) as HTMLInputElement
    expect(Number(scrubber.value)).toBe(0)
  })

  it('does not mount the Target dialog when the Reader host disables session ends', async () => {
    vi.useFakeTimers()
    const api = stubApi(null, [
      {
        id: 26,
        textId: 7,
        kind: 'goal',
        wordOffset: 4,
        label: 'Session goal',
        createdAt: '2026-07-12T00:00:00.000Z',
      },
    ])

    renderReader(SAVED_TEXT, null, { sessionEndEnabled: false })
    await act(async () => {})

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })
    await act(async () => { vi.advanceTimersByTime(1000) })
    await act(async () => {})

    expect(api.db.deleteBookmark).toHaveBeenCalledWith(26)
    expect(screen.queryByRole('dialog', { name: 'Target reached' })).toBeNull()
    expect(screen.getByText('Finished.')).toBeTruthy()
  })

  it('does not delete the goal bookmark when the scrubber moves past it manually', async () => {
    vi.useFakeTimers()
    const api = stubApi(null, [
      {
        id: 21,
        textId: 7,
        kind: 'goal',
        wordOffset: 4,
        label: 'Session goal',
        createdAt: '2026-07-12T00:00:00.000Z',
      },
    ])

    renderReader(SAVED_TEXT)
    await act(async () => {})

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })
    const scrubber = screen.getByRole('slider', { name: 'Reading position' }) as HTMLInputElement
    act(() => {
      fireEvent.change(scrubber, { target: { value: '4' } })
    })
    await act(async () => { vi.advanceTimersByTime(500) })

    expect(api.db.deleteBookmark).not.toHaveBeenCalled()
    expect(document.querySelector('.reader-target-marker')).toBeTruthy()
  })

  it('rejects a goal at or behind the saved reading position with an inline error', async () => {
    const api = stubApi({ stackIndex: 2 })

    renderReader(SAVED_TEXT)
    await act(async () => {})

    openGoalTab()
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Set Target' }))
    })
    act(() => { fireEvent.click(screen.getByText('three')) })
    await screen.findByRole('alert')

    expect(api.db.saveBookmark).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain(
      'Target must be ahead of your saved reading position.'
    )
    expect(screen.getByRole('button', { name: 'Pick another word' })).toBeTruthy()

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Pick another word' })) })
    expect(screen.getByText('Click a word to set your target')).toBeTruthy()
  })

  it('treats a never-read text as saved offset zero when validating goals', async () => {
    const api = stubApi(null)

    renderReader(SAVED_TEXT)
    await act(async () => {})

    openGoalTab()
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Set Target' }))
    })
    act(() => { fireEvent.click(screen.getByText('one')) })
    await screen.findByRole('alert')

    expect(api.db.saveBookmark).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain(
      'Target must be ahead of your saved reading position.'
    )
  })
})

describe('Reader session - session baseline actions', () => {
  it('commits the current playhead and reverts to the start baseline for a fresh play session', async () => {
    const api = stubApi(null)

    renderLifecycleHarness()
    await act(async () => {})

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'play' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'index 4' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'commit' }))
    })

    expect(api.db.saveReadingPosition).toHaveBeenLastCalledWith(7, 4, 'text')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'revert' }))
    })

    expect(api.db.saveReadingPosition).toHaveBeenLastCalledWith(7, 0, 'text')
  })

  it('captures the saved baseline on resume-from-saved and does not move it on pause/resume', async () => {
    const api = stubApi({ stackIndex: 2 })

    renderLifecycleHarness()
    await act(async () => {})
    await act(async () => {})

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'resume saved' }))
    })
    expect(screen.getByTestId('current-index').textContent).toBe('2')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'index 4' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'pause' }))
    })
    expect(api.db.saveReadingPosition).toHaveBeenLastCalledWith(7, 4, 'text')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'resume live' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'index 5' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'revert' }))
    })

    expect(api.db.saveReadingPosition).toHaveBeenLastCalledWith(7, 2, 'text')
  })

  it('raises stop sessionEnd, pauses, holds, and clears on resume and seek', async () => {
    stubApi(null)

    renderLifecycleHarness()
    await act(async () => {})

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'play' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'index 4' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'stop reading' }))
    })

    expect(screen.getByTestId('play-state').textContent).toBe('paused')
    expect(screen.getByTestId('current-index').textContent).toBe('4')
    expect(screen.getByTestId('session-end').textContent).toBe('stop')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'resume live' }))
    })
    expect(screen.getByTestId('session-end').textContent).toBe('none')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'stop reading' }))
    })
    expect(screen.getByTestId('session-end').textContent).toBe('stop')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'seek index 2' }))
    })
    expect(screen.getByTestId('current-index').textContent).toBe('2')
    expect(screen.getByTestId('session-end').textContent).toBe('none')
  })

  it('raises goal sessionEnd and preserves goal self-deletion on crossing', async () => {
    const api = stubApi(null)

    renderLifecycleHarness()
    await act(async () => {})

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'set goal' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'play' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'index 4' }))
    })
    await act(async () => {})

    expect(api.db.deleteBookmark).toHaveBeenCalledWith(44)
    expect(screen.getByTestId('play-state').textContent).toBe('paused')
    expect(screen.getByTestId('current-index').textContent).toBe('4')
    expect(screen.getByTestId('session-end').textContent).toBe('goal')
  })

  it('raises end sessionEnd when natural finish reports from playback', async () => {
    stubApi(null)

    renderLifecycleHarness()
    await act(async () => {})

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'play' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'index 5' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'natural end' }))
    })
    await act(async () => {})

    expect(screen.getByTestId('play-state').textContent).toBe('paused')
    expect(screen.getByTestId('current-index').textContent).toBe('6')
    expect(screen.getByTestId('session-end').textContent).toBe('end')
  })
})

describe('Reader session - save-position transitions', () => {
  it('saves the captured end position when the user pauses after playing', async () => {
    vi.useFakeTimers()
    const api = stubApi()

    renderReader(SAVED_TEXT)
    await act(async () => {})

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })
    await act(async () => { vi.advanceTimersByTime(1500) })

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Pause' })) })

    expect(api.db.saveReadingPosition).toHaveBeenCalledTimes(1)
    expect(api.db.saveReadingPosition).toHaveBeenCalledWith(7, 3, 'text')
  })

  it('does not save on a stop transition that was not preceded by playing', async () => {
    vi.useFakeTimers()
    const api = stubApi()

    renderReader(SAVED_TEXT)
    await act(async () => {})

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })
    await act(async () => { vi.advanceTimersByTime(1500) })
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Pause' })) })
    expect(api.db.saveReadingPosition).toHaveBeenCalledTimes(1)

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Stop' })) })

    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy()
    const scrubber = screen.getByRole('slider', { name: 'Reading position' }) as HTMLInputElement
    expect(Number(scrubber.value)).toBe(3)
    expect(api.db.saveReadingPosition).toHaveBeenCalledTimes(1)
  })

  it('saves and holds the current playhead when Stop is pressed while playing', async () => {
    vi.useFakeTimers()
    const api = stubApi()

    renderReader(SAVED_TEXT)
    await act(async () => {})

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })
    await act(async () => { vi.advanceTimersByTime(1500) })
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Stop' })) })

    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy()
    const scrubber = screen.getByRole('slider', { name: 'Reading position' }) as HTMLInputElement
    expect(Number(scrubber.value)).toBe(3)
    expect(api.db.saveReadingPosition).toHaveBeenCalledWith(7, 3, 'text')
  })

  it('opens the Stop dialog, aborts in place, and keeps the held playhead paused', async () => {
    vi.useFakeTimers()
    const onExitToLibrary = vi.fn()
    stubApi()

    renderReader(SAVED_TEXT, null, { onExitToLibrary })
    await act(async () => {})

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })
    await act(async () => { vi.advanceTimersByTime(1500) })
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Stop' })) })

    expect(screen.getByRole('dialog', { name: 'Stop reading?' })).toBeTruthy()
    expect(screen.getByText('50%')).toBeTruthy()
    expect(screen.getByText('6 of 12 words')).toBeTruthy()

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Abort' })) })

    expect(screen.queryByRole('dialog', { name: 'Stop reading?' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy()
    const scrubber = screen.getByRole('slider', { name: 'Reading position' }) as HTMLInputElement
    expect(Number(scrubber.value)).toBe(3)
    expect(onExitToLibrary).not.toHaveBeenCalled()
  })

  it('commits the held Stop position on Save & Exit and routes to Library', async () => {
    vi.useFakeTimers()
    const api = stubApi({ stackIndex: 2 })
    const onExitToLibrary = vi.fn()

    renderReader(SAVED_TEXT, null, { onExitToLibrary })
    await act(async () => {})

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Resume from saved position' }))
    })
    await act(async () => { vi.advanceTimersByTime(1000) })
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Stop' })) })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save & Exit' }))
      await Promise.resolve()
    })

    expect(onExitToLibrary).toHaveBeenCalledTimes(1)
    expect(api.db.saveReadingPosition).toHaveBeenLastCalledWith(7, 4, 'text')
  })

  it('reverts to the session baseline on Stop Exit without saving and routes to Library', async () => {
    vi.useFakeTimers()
    const api = stubApi({ stackIndex: 2 })
    const onExitToLibrary = vi.fn()

    renderReader(SAVED_TEXT, null, { onExitToLibrary })
    await act(async () => {})

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Resume from saved position' }))
    })
    await act(async () => { vi.advanceTimersByTime(1000) })
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Stop' })) })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Exit without saving' }))
      await Promise.resolve()
    })

    expect(onExitToLibrary).toHaveBeenCalledTimes(1)
    expect(api.db.saveReadingPosition).toHaveBeenLastCalledWith(7, 2, 'text')
    const scrubber = screen.getByRole('slider', { name: 'Reading position' }) as HTMLInputElement
    expect(Number(scrubber.value)).toBe(0)
  })

  it('saves and holds the final position at natural end instead of rendering Finished', async () => {
    vi.useFakeTimers()
    const api = stubApi()

    renderReader(SAVED_TEXT)
    await act(async () => {})

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })
    await act(async () => { vi.advanceTimersByTime(3500) })

    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy()
    expect(screen.queryByText('Finished.')).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Finished' })).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100')
    expect(api.db.saveReadingPosition).toHaveBeenCalledWith(7, 6, 'text')
  })

  it('commits the natural-end position on Save & Exit and routes to Library', async () => {
    vi.useFakeTimers()
    const api = stubApi()
    const onExitToLibrary = vi.fn()

    renderReader(SAVED_TEXT, null, { onExitToLibrary })
    await act(async () => {})

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })
    await act(async () => { vi.advanceTimersByTime(3500) })

    expect(screen.getByRole('dialog', { name: 'Finished' })).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save & Exit' }))
      await Promise.resolve()
    })

    expect(onExitToLibrary).toHaveBeenCalledTimes(1)
    expect(api.db.saveReadingPosition).toHaveBeenLastCalledWith(7, 6, 'text')
  })

  it('reverts to baseline from natural end on Exit without saving and routes to Library', async () => {
    vi.useFakeTimers()
    const api = stubApi({ stackIndex: 2 })
    const onExitToLibrary = vi.fn()

    renderReader(SAVED_TEXT, null, { onExitToLibrary })
    await act(async () => {})

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Resume from saved position' }))
    })
    await act(async () => { vi.advanceTimersByTime(2500) })

    expect(screen.getByRole('dialog', { name: 'Finished' })).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Exit without saving' }))
      await Promise.resolve()
    })

    expect(onExitToLibrary).toHaveBeenCalledTimes(1)
    expect(api.db.saveReadingPosition).toHaveBeenLastCalledWith(7, 2, 'text')
  })

  it('dismisses the End dialog without exiting and leaves the finished position paused', async () => {
    vi.useFakeTimers()
    const onExitToLibrary = vi.fn()
    stubApi()

    renderReader(SAVED_TEXT, null, { onExitToLibrary })
    await act(async () => {})

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })
    await act(async () => { vi.advanceTimersByTime(3500) })

    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })

    expect(screen.queryByRole('dialog', { name: 'Finished' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100')
    expect(onExitToLibrary).not.toHaveBeenCalled()
  })

  it('does not mount SessionDialog when the Reader host disables session ends', async () => {
    vi.useFakeTimers()
    stubApi()

    renderReader(SAVED_TEXT, null, { sessionEndEnabled: false })
    await act(async () => {})

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })
    await act(async () => { vi.advanceTimersByTime(3500) })

    expect(screen.queryByRole('dialog', { name: 'Finished' })).toBeNull()
    expect(screen.getByText('Finished.')).toBeTruthy()
  })

  it('saves the current playhead before the top-left Hub leave while playing', async () => {
    vi.useFakeTimers()
    const api = stubApi()
    const onBack = vi.fn()

    renderReader(SAVED_TEXT, null, { onBack, backLabel: 'Hub' })
    await act(async () => {})

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })
    await act(async () => { vi.advanceTimersByTime(1500) })

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Hub' })) })

    expect(api.db.saveReadingPosition).toHaveBeenCalledTimes(1)
    expect(api.db.saveReadingPosition).toHaveBeenCalledWith(7, 3, 'text')
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
