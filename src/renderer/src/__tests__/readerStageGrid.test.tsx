/**
 * Stage-grid characterization tests (pin-first for RO-7 M1).
 *
 * Pins the rendered DOM contract of the inline slot grid in Reader.tsx (extracted
 * into components/reader/StackGrid.tsx + engine slot-presentation fns):
 *  - one .reader-stack-row per display row; stacksVisible .stack-slot cells
 *  - highlight_active gates .stack-slot--active on the current slot
 *
 * The divider block was retargeted for ADR-0019 §4: view_style + show_chunk_dividers
 * are de-UI'd and no longer honoured by the reader, so dividers always render as
 * hidden bars and focal-points dots never appear, regardless of any stored value.
 * (StackGrid + engine/stackLayout keep the capability, exercised by their own
 * unit tests — the neutralization is at the Reader call site.)
 *
 * Harness copied from readerSession.behavior.test.tsx (provider-stack render of
 * the real Reader, fake timers; usePlayback advances via setTimeout per beat).
 */

import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react'
import Reader from '../components/Reader'
import type { Settings, TextRecord } from '../types'
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
  })
}

function stageRect(width: number, height: number): DOMRect {
  return {
    x: 0,
    y: 0,
    width,
    height,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    toJSON: () => ({}),
  } as DOMRect
}

function installStageSize(width: number, height: number) {
  const rect = stageRect(width, height)
  const originalResizeObserver = globalThis.ResizeObserver
  const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this instanceof HTMLElement && this.classList.contains('reader-stage')) return rect
    return stageRect(0, 0)
  })

  vi.stubGlobal('ResizeObserver', class {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe() {
      this.callback([{ contentRect: rect } as ResizeObserverEntry], this as unknown as ResizeObserver)
    }
    unobserve() {}
    disconnect() {}
  })

  return () => {
    rectSpy.mockRestore()
    vi.stubGlobal('ResizeObserver', originalResizeObserver)
  }
}

function installTextMeasurement(measure: (text: string) => number) {
  const originalOffscreenCanvas = globalThis.OffscreenCanvas

  vi.stubGlobal('OffscreenCanvas', class {
    getContext() {
      return {
        font: '',
        measureText: (text: string) => ({ width: measure(text) }),
      }
    }
  })

  return () => {
    vi.stubGlobal('OffscreenCanvas', originalOffscreenCanvas)
  }
}

const BASE_SETTINGS: Settings = {
  words_per_stack: 2,
  stacks_visible: 3,
  stack_gap: 32,
  bpm: 120,
  metronome_enabled: false,
  pause_at_sentences: false,
  pause_at_headlines: false,
  font_size: 36,
  stack_vertical_offset: 0,
  stack_horizontal_offset: 0,
  theme: 'dark',
  highlight_active: true,
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
  target_wpm: 240,
  custom_palettes: [],
  custom_text_presets: [],
  custom_font_presets: [],
  custom_playback_presets: [],
  custom_reader_configs: [],
}

// 12 words at words_per_stack=2 → 6 stacks → 2 blocks of 3 visible slots
const TWELVE_WORDS = 'one two three four five six seven eight nine ten eleven twelve'

const TEXT: TextRecord = {
  id: 7,
  title: 'Grid Fixture',
  content: TWELVE_WORDS,
  word_count: 12,
}

function renderReader(overrides: Partial<Settings> = {}) {
  const result = render(
    <NavigationProvider>
      <SettingsProvider initialSettings={{ ...BASE_SETTINGS, ...overrides }}>
        <LibraryProvider initialActiveText={TEXT}>
          <ReaderProvider>
            <Reader onBack={vi.fn()} onExitToLibrary={vi.fn()} />
          </ReaderProvider>
        </LibraryProvider>
      </SettingsProvider>
    </NavigationProvider>
  )
  return result.container
}

function renderReaderWithText(text: TextRecord, overrides: Partial<Settings> = {}) {
  const result = render(
    <NavigationProvider>
      <SettingsProvider initialSettings={{ ...BASE_SETTINGS, ...overrides }}>
        <LibraryProvider initialActiveText={text}>
          <ReaderProvider>
            <Reader onBack={vi.fn()} onExitToLibrary={vi.fn()} />
          </ReaderProvider>
        </LibraryProvider>
      </SettingsProvider>
    </NavigationProvider>
  )
  return result.container
}

async function play() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
  })
}

/** Advance n playback beats (bpm 120 → 500ms per beat; pad for safety). */
async function advanceBeats(n: number) {
  for (let i = 0; i < n; i++) {
    await act(async () => { vi.advanceTimersByTime(520) })
  }
}

describe('Reader stage grid — slots and rows', () => {
  it('renders one row with stacksVisible slots after play; only the first is revealed', async () => {
    vi.useFakeTimers()
    stubApi()
    const container = renderReader()
    await play()

    expect(container.querySelectorAll('.reader-stack-row')).toHaveLength(1)
    const slots = container.querySelectorAll('.stack-slot')
    expect(slots).toHaveLength(3)
    expect(slots[0].textContent).toContain('one')
    expect(slots[1].textContent).toBe('')
    expect(slots[2].textContent).toBe('')
  })

  it('reveals subsequent slots as playback advances', async () => {
    vi.useFakeTimers()
    stubApi()
    const container = renderReader()
    await play()
    await advanceBeats(2)

    const slots = container.querySelectorAll('.stack-slot')
    expect(slots[0].textContent).toContain('one')
    expect(slots[1].textContent).toContain('three')
    expect(slots[2].textContent).toContain('five')
  })

  it('renders with solver-reduced line count and gaps when the stage is height constrained', async () => {
    vi.useFakeTimers()
    stubApi()
    const restoreStage = installStageSize(220, 80)
    const restoreMeasure = installTextMeasurement(() => 100)

    try {
      const container = renderReader({
        lines_enabled: true,
        lines_count: 3,
        lines_row_gap: 80,
        stack_gap: 72,
        font_size: 48,
      })
      await play()
      await advanceBeats(3)

      expect(container.querySelectorAll('.reader-stack-row')).toHaveLength(1)
      const rows = container.querySelector('.reader-stack-rows') as HTMLElement
      expect(rows.style.gap).toBe('0px')
      const row = container.querySelector('.reader-stack-row') as HTMLElement
      expect(row.style.gridTemplateColumns).toBe('1fr 0px 1fr 0px 1fr')
    } finally {
      restoreMeasure()
      restoreStage()
    }
  })

  it('sizes against hidden slots in the current block so font size stays stable as they reveal', async () => {
    vi.useFakeTimers()
    stubApi()
    const restoreStage = installStageSize(600, 500)
    const restoreMeasure = installTextMeasurement((text) => (
      text.includes('supercalifragilistic') ? 1000 : 100
    ))
    const wideHiddenText: TextRecord = {
      id: 8,
      title: 'Wide Hidden Slot',
      content: 'short words supercalifragilistic expialidocious tail words',
      word_count: 6,
    }

    try {
      renderReaderWithText(wideHiddenText, {
        words_per_stack: 2,
        stacks_visible: 2,
        stack_gap: 0,
        font_size: 100,
      })
      await play()

      const firstFontSize = (screen.getByText('short words') as HTMLElement).style.fontSize
      expect(firstFontSize).toBe('24px')

      await advanceBeats(1)
      expect((screen.getByText('supercalifragilistic expialidocious') as HTMLElement).style.fontSize)
        .toBe(firstFontSize)
    } finally {
      restoreMeasure()
      restoreStage()
    }
  })

  it('re-solves after document fonts are ready so stale pre-load measurements are not reused', async () => {
    stubApi()
    const restoreStage = installStageSize(500, 500)
    let measuredWidthAt100 = 800
    const restoreMeasure = installTextMeasurement(() => measuredWidthAt100)
    const originalFonts = document.fonts
    let resolveFontsReady: () => void = () => {}
    const fontsReady = new Promise<void>((resolve) => { resolveFontsReady = resolve })
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: fontsReady },
    })

    try {
      renderReaderWithText(
        { id: 9, title: 'Font Ready', content: 'alpha beta gamma delta', word_count: 4 },
        { words_per_stack: 2, stacks_visible: 1, stack_gap: 0, font_size: 100 }
      )
      await play()

      await waitFor(() => {
        expect((screen.getByText('alpha beta') as HTMLElement).style.fontSize).toBe('55px')
      })

      measuredWidthAt100 = 200
      await act(async () => {
        resolveFontsReady()
        await fontsReady
      })

      await waitFor(() => {
        expect((screen.getByText('alpha beta') as HTMLElement).style.fontSize).toBe('100px')
      })
    } finally {
      Object.defineProperty(document, 'fonts', {
        configurable: true,
        value: originalFonts,
      })
      restoreMeasure()
      restoreStage()
    }
  })
})

describe('Reader stage grid — highlight', () => {
  it('marks the current slot active when highlight_active is on, with no connected classes in default mode', async () => {
    vi.useFakeTimers()
    stubApi()
    const container = renderReader()
    await play()

    const active = container.querySelectorAll('.stack-slot--active')
    expect(active).toHaveLength(1)
    expect(active[0].textContent).toContain('one')
    expect(container.querySelectorAll('.stack-slot--connected-left')).toHaveLength(0)
    expect(container.querySelectorAll('.stack-slot--connected-right')).toHaveLength(0)

    await advanceBeats(1)
    const nowActive = container.querySelectorAll('.stack-slot--active')
    expect(nowActive).toHaveLength(1)
    expect(nowActive[0].textContent).toContain('three')
  })

  it('renders no active slot when highlight_active is off', async () => {
    vi.useFakeTimers()
    stubApi()
    const container = renderReader({ highlight_active: false })
    await play()

    expect(container.querySelectorAll('.stack-slot--active')).toHaveLength(0)
  })
})

describe('Reader stage grid — dividers de-UI\'d + neutralized (ADR-0019 §4)', () => {
  it('keeps bar dividers in the DOM but always hidden even when show_chunk_dividers is stored true', async () => {
    vi.useFakeTimers()
    stubApi()
    // BASE_SETTINGS stores show_chunk_dividers: true — the reader must ignore it.
    const container = renderReader()
    await play()

    const dividers = container.querySelectorAll('.stack-divider')
    expect(dividers).toHaveLength(2)
    dividers.forEach((d) => {
      expect(d.classList.contains('stack-divider--dot')).toBe(false)
      expect((d as HTMLElement).style.visibility).toBe('hidden')
    })
  })

  it('renders no focal-points dots even when view_style is stored focal-points', async () => {
    vi.useFakeTimers()
    stubApi()
    // A stored 'focal-points' value is inert — the reader always renders default.
    const container = renderReader({ view_style: 'focal-points', show_chunk_dividers: true })
    await play()
    await advanceBeats(2)

    // All slots revealed, but no dot dividers appear: focal-points is neutralized.
    expect(container.querySelectorAll('.stack-divider--dot')).toHaveLength(0)
    const dividers = container.querySelectorAll('.stack-divider')
    expect(dividers).toHaveLength(2)
    dividers.forEach((d) => {
      expect((d as HTMLElement).style.visibility).toBe('hidden')
    })
  })
})
