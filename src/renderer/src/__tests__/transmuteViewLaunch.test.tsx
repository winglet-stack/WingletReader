/**
 * TransmuteView — one-shot launch intent tests.
 *
 * Acceptance criteria covered:
 *   3. openTransmuteForText(id) sets view='transmute' and preselects:
 *      TransmuteView lands in phase='configure' / wizardStep='scope' for that
 *      text, not the source selector.
 *   4. Override: seed localStorage with a different process, fire a card launch
 *      for text X; assert the view shows text X (not the persisted one).
 *   5. Generic view='transmute' with no launch intent still restores the
 *      persisted process / shows the source selector.
 *
 * Environment: happy-dom (vitest.config.ts environmentMatchGlobs).
 *
 * Re-uses BASE_SETTINGS, PROCESS_KEY, makeMockCtx, and seedPastedTransmuteState
 * patterns from transmuteView.test.tsx.
 */
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import TransmuteView from '../components/TransmuteView'
import type { Settings } from '../types'
import { makeDefaultTransmuteConfig, TRANSMUTE_CONFIG_STORAGE_KEY } from '../engine/transmuteConfig'
import { renderHook } from '@testing-library/react'
import { NavigationProvider, useNavigation } from '../contexts/NavigationContext'

const PROCESS_KEY = 'fasttrack.transmute.process.v1'

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
  lines_count: 1,
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
  custom_palettes: [],
  custom_text_presets: [],
  custom_font_presets: [],
  custom_playback_presets: [],
  custom_reader_configs: [],
  custom_transmute_presets: [],
}

function makeMockCtx() {
  let fillStyle = ''
  let font = ''
  return {
    get fillStyle() { return fillStyle },
    set fillStyle(v: string) { fillStyle = v },
    get font() { return font },
    set font(v: string) { font = v },
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    textAlign: 'center',
    textBaseline: 'alphabetic',
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    measureText: (text: string) => {
      const size = Number(font.match(/(\d+)px/)?.[1] ?? 16)
      return {
        width: text.length * size * 0.6,
        actualBoundingBoxAscent: size * 0.8,
        actualBoundingBoxDescent: size * 0.2,
      }
    },
  }
}

function seedProcessInLocalStorage(overrides: Record<string, unknown> = {}) {
  window.localStorage.setItem(PROCESS_KEY, JSON.stringify({
    phase: 'configure',
    wizardStep: 'reader',
    overviewOpen: { scope: true, video: true, reader: true },
    sourceKind: 'pasted',
    textId: null,
    segmentId: null,
    selectedTitle: 'Old Pasted',
    pastedTextInput: 'old pasted content here',
    pasteMode: true,
    maxDurationInput: '',
    ...overrides,
  }))
  window.localStorage.setItem(
    TRANSMUTE_CONFIG_STORAGE_KEY,
    JSON.stringify(makeDefaultTransmuteConfig(BASE_SETTINGS))
  )
}

const LAUNCH_TEXT = {
  id: 42,
  title: 'Launched Novel',
  content: 'hello world foo bar baz',
  word_count: 5,
  segment_count: 0,
  category_id: 1,
}

beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal('api', {
    db: {
      getText: vi.fn().mockResolvedValue({ ...LAUNCH_TEXT }),
      getSegments: vi.fn().mockResolvedValue([]),
    },
    video: { save: vi.fn() },
  })
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: vi.fn(() => makeMockCtx()),
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

// ── Criterion 3 (NavigationContext half) ──────────────────────────────────────

describe('NavigationContext openTransmuteForText', () => {
  function wrapper({ children }: { children: React.ReactNode }) {
    return <NavigationProvider>{children}</NavigationProvider>
  }

  it('sets view to "transmute" when openTransmuteForText is called', () => {
    const { result } = renderHook(() => useNavigation(), { wrapper })
    act(() => result.current.openTransmuteForText(42))
    expect(result.current.view).toBe('transmute')
  })

  it('exposes the pending launch id via transmuteLaunchTextId', () => {
    const { result } = renderHook(() => useNavigation(), { wrapper })
    act(() => result.current.openTransmuteForText(42))
    expect(result.current.transmuteLaunchTextId).toBe(42)
  })

  it('clears transmuteLaunchTextId after clearTransmuteLaunch is called', () => {
    const { result } = renderHook(() => useNavigation(), { wrapper })
    act(() => result.current.openTransmuteForText(42))
    act(() => result.current.clearTransmuteLaunch())
    expect(result.current.transmuteLaunchTextId).toBeNull()
  })
})

// ── Criterion 3 (TransmuteView half) ─────────────────────────────────────────

describe('TransmuteView with launchTextId — preselects and lands in configure', () => {
  it('lands in phase=configure / wizardStep=scope when launchTextId is provided', async () => {
    const onLaunchConsumed = vi.fn()
    render(
      <TransmuteView
        texts={[LAUNCH_TEXT]}
        settings={BASE_SETTINGS}
        onSaveSettings={vi.fn()}
        onOpenReaderSettings={vi.fn()}
        launchTextId={LAUNCH_TEXT.id}
        onLaunchConsumed={onLaunchConsumed}
      />
    )

    // Wait for the async handleSelectText to complete and source selector to disappear
    await waitFor(() => {
      expect(document.querySelector('.transmute-select')).toBeNull()
      expect(screen.queryByText('Launched Novel')).toBeTruthy()
    })

    // Stepper should be visible (configure phase)
    const stepperItems = document.querySelectorAll('.transmute-stepper-item')
    expect(stepperItems.length).toBeGreaterThan(0)

    // Active step should be Scope (wizardStep='scope')
    const activeStep = Array.from(stepperItems).find(
      (el) => el.getAttribute('aria-current') === 'step'
    )
    expect(activeStep?.textContent).toContain('Scope')

    // Launch was consumed
    expect(onLaunchConsumed).toHaveBeenCalledOnce()
  })

  it('calls window.api.db.getText with the launch text id', async () => {
    render(
      <TransmuteView
        texts={[LAUNCH_TEXT]}
        settings={BASE_SETTINGS}
        onSaveSettings={vi.fn()}
        onOpenReaderSettings={vi.fn()}
        launchTextId={LAUNCH_TEXT.id}
        onLaunchConsumed={vi.fn()}
      />
    )

    await waitFor(() => {
      expect((window.api as any).db.getText).toHaveBeenCalledWith(LAUNCH_TEXT.id)
    })
  })
})

// ── Criterion 4 — launch overrides persisted process ─────────────────────────

describe('TransmuteView launch overrides persisted process', () => {
  it('shows the launched text and NOT the persisted pasted-text process', async () => {
    // Seed a persisted process for a completely different (pasted) source
    seedProcessInLocalStorage({
      sourceKind: 'pasted',
      textId: null,
      selectedTitle: 'Old Pasted',
      pastedTextInput: 'old content that should not appear',
      phase: 'configure',
      wizardStep: 'reader',
    })

    const onLaunchConsumed = vi.fn()
    render(
      <TransmuteView
        texts={[LAUNCH_TEXT]}
        settings={BASE_SETTINGS}
        onSaveSettings={vi.fn()}
        onOpenReaderSettings={vi.fn()}
        launchTextId={LAUNCH_TEXT.id}
        onLaunchConsumed={onLaunchConsumed}
      />
    )

    await waitFor(() => {
      expect(screen.queryByText('Launched Novel')).toBeTruthy()
    })

    // The old pasted title must NOT appear in the header book chip
    expect(screen.queryByText('Old Pasted')).toBeNull()

    // Active step is Scope (not the persisted 'reader' step)
    const stepperItems = document.querySelectorAll('.transmute-stepper-item')
    const activeStep = Array.from(stepperItems).find(
      (el) => el.getAttribute('aria-current') === 'step'
    )
    expect(activeStep?.textContent).toContain('Scope')

    expect(onLaunchConsumed).toHaveBeenCalledOnce()
  })

  it('shows the launched text and NOT the persisted library-source process for a different book', async () => {
    // Seed a persisted process pointing to a different library text (id=99)
    seedProcessInLocalStorage({
      sourceKind: 'library',
      textId: 99,
      selectedTitle: 'Old Library Book',
      phase: 'configure',
      wizardStep: 'video',
    })
    ;(window.api as any).db.getText.mockResolvedValue({ ...LAUNCH_TEXT })

    render(
      <TransmuteView
        texts={[LAUNCH_TEXT]}
        settings={BASE_SETTINGS}
        onSaveSettings={vi.fn()}
        onOpenReaderSettings={vi.fn()}
        launchTextId={LAUNCH_TEXT.id}
        onLaunchConsumed={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.queryByText('Launched Novel')).toBeTruthy()
    })

    expect(screen.queryByText('Old Library Book')).toBeNull()
  })
})

// ── Criterion 5 — generic route restores persisted process ────────────────────

describe('TransmuteView generic route (no launchTextId) restores persisted process', () => {
  it('shows the source selector when there is no persisted state and no launch intent', () => {
    // No localStorage seeded, no launchTextId
    render(
      <TransmuteView
        texts={[]}
        settings={BASE_SETTINGS}
        onSaveSettings={vi.fn()}
        onOpenReaderSettings={vi.fn()}
      />
    )

    // Should be in phase='select', showing source picker (TransmuteSourceSelect)
    expect(document.querySelector('.transmute-select')).toBeTruthy()
  })

  it('restores a persisted pasted-text process without a launch intent', () => {
    seedProcessInLocalStorage({
      sourceKind: 'pasted',
      phase: 'configure',
      wizardStep: 'reader',
      pastedTextInput: 'some old pasted content',
      selectedTitle: 'Pasted Text',
    })

    render(
      <TransmuteView
        texts={[]}
        settings={BASE_SETTINGS}
        onSaveSettings={vi.fn()}
        onOpenReaderSettings={vi.fn()}
      />
    )

    // Stepper should be visible (configure phase restored)
    const stepperItems = document.querySelectorAll('.transmute-stepper-item')
    expect(stepperItems.length).toBeGreaterThan(0)

    // Active step is 'reader' (the persisted step)
    const activeStep = Array.from(stepperItems).find(
      (el) => el.getAttribute('aria-current') === 'step'
    )
    expect(activeStep?.textContent).toContain('Reader')
  })
})
