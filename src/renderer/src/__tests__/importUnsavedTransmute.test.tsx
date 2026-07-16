/**
 * Issue 04 — Import → Create Video Without Saving.
 *
 * Acceptance criteria covered:
 *   - Pasted content can open Transmute without calling saveText / creating a Library record.
 *   - Uploaded-file content can open Transmute without calling saveText.
 *   - Missing title / missing content / short content blocks both Save and unsaved-video launch.
 *   - Unsaved source launch persists no Library text or stored segments.
 *   - Unsaved source launch overrides persisted Transmute process state.
 *   - NavigationContext: openTransmuteForUnsavedSource sets view='transmute' + exposes source.
 *   - TransmuteView: launchSource lands in configure phase without creating a Library record.
 *
 * Environment: happy-dom (vitest.config.ts environmentMatchGlobs).
 */
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderHook } from '@testing-library/react'
import ImportPanel from '../components/ImportPanel'
import TransmuteView from '../components/TransmuteView'
import { NavigationProvider, useNavigation } from '../contexts/NavigationContext'
import type { Settings } from '../types'
import { makeDefaultTransmuteConfig, TRANSMUTE_CONFIG_STORAGE_KEY } from '../engine/transmuteConfig'

// ── Shared fixtures ───────────────────────────────────────────────────────────

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
    selectedTitle: 'Old Persisted Text',
    pastedTextInput: 'old persisted content here',
    pasteMode: true,
    maxDurationInput: '',
    ...overrides,
  }))
  window.localStorage.setItem(
    TRANSMUTE_CONFIG_STORAGE_KEY,
    JSON.stringify(makeDefaultTransmuteConfig(BASE_SETTINGS))
  )
}

// ── ImportPanel: validation gates ─────────────────────────────────────────────

describe('ImportPanel — Create Video Without Saving validation', () => {
  afterEach(() => {
    cleanup()
    delete (window as unknown as { api?: unknown }).api
  })

  it('renders the Create Video Without Saving button when handler is provided', () => {
    render(
      <ImportPanel
        settings={{ segmentation_enabled: false, auto_chapter_detection: false, segmentation_threshold: 5000, segmentation_chunk_size: 1500 }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onCreateVideoWithoutSaving={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /create video without saving/i })).toBeTruthy()
  })

  it('does NOT render the button when no handler is provided', () => {
    render(
      <ImportPanel
        settings={{ segmentation_enabled: false, auto_chapter_detection: false, segmentation_threshold: 5000, segmentation_chunk_size: 1500 }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(screen.queryByRole('button', { name: /create video without saving/i })).toBeNull()
  })

  it('blocks unsaved-video launch when title is missing', async () => {
    const user = userEvent.setup()
    const onVideo = vi.fn()
    const onSave = vi.fn()
    render(
      <ImportPanel
        settings={{ segmentation_enabled: false, auto_chapter_detection: false, segmentation_threshold: 5000, segmentation_chunk_size: 1500 }}
        onSave={onSave}
        onCancel={vi.fn()}
        onCreateVideoWithoutSaving={onVideo}
      />
    )
    // Type content but no title
    const body = screen.getByLabelText('Paste your text below')
    await user.type(body, 'This is some content to test')
    await user.click(screen.getByRole('button', { name: /create video without saving/i }))

    expect(onVideo).not.toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('blocks unsaved-video launch when content is empty', async () => {
    const user = userEvent.setup()
    const onVideo = vi.fn()
    render(
      <ImportPanel
        settings={{ segmentation_enabled: false, auto_chapter_detection: false, segmentation_threshold: 5000, segmentation_chunk_size: 1500 }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onCreateVideoWithoutSaving={onVideo}
      />
    )
    const titleInput = screen.getByLabelText('Title')
    await user.type(titleInput, 'My Title')
    // No content typed
    await user.click(screen.getByRole('button', { name: /create video without saving/i }))

    expect(onVideo).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('blocks unsaved-video launch when text is too short (< 3 words)', async () => {
    const user = userEvent.setup()
    const onVideo = vi.fn()
    render(
      <ImportPanel
        settings={{ segmentation_enabled: false, auto_chapter_detection: false, segmentation_threshold: 5000, segmentation_chunk_size: 1500 }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onCreateVideoWithoutSaving={onVideo}
      />
    )
    const titleInput = screen.getByLabelText('Title')
    await user.type(titleInput, 'My Title')
    const body = screen.getByLabelText('Paste your text below')
    await user.type(body, 'one two')  // only 2 words
    await user.click(screen.getByRole('button', { name: /create video without saving/i }))

    expect(onVideo).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('calls onCreateVideoWithoutSaving with title + cleaned content for valid pasted text', async () => {
    const user = userEvent.setup()
    const onVideo = vi.fn()
    const onSave = vi.fn()
    render(
      <ImportPanel
        settings={{ segmentation_enabled: false, auto_chapter_detection: false, segmentation_threshold: 5000, segmentation_chunk_size: 1500 }}
        onSave={onSave}
        onCancel={vi.fn()}
        onCreateVideoWithoutSaving={onVideo}
      />
    )
    await user.type(screen.getByLabelText('Title'), 'My Video Title')
    await user.type(screen.getByLabelText('Paste your text below'), 'Alpha beta gamma delta')
    await user.click(screen.getByRole('button', { name: /create video without saving/i }))

    // onCreateVideoWithoutSaving called with title + cleaned content
    expect(onVideo).toHaveBeenCalledOnce()
    expect(onVideo).toHaveBeenCalledWith('My Video Title', expect.stringContaining('Alpha beta gamma delta'))
    // onSave must NOT have been called (no Library record)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('calls onCreateVideoWithoutSaving for uploaded-file content without calling onSave', async () => {
    const user = userEvent.setup()
    const onVideo = vi.fn()
    const onSave = vi.fn()
    ;(window as unknown as { api: unknown }).api = {
      file: {
        open: vi.fn().mockResolvedValue({
          fileName: 'chapter.txt',
          title: 'Chapter One',
          content: 'Once upon a time in a land far away',
          warnings: [],
          ext: 'txt',
          diagnostics: null,
          blocks: undefined,
          html: null,
        }),
      },
    }

    render(
      <ImportPanel
        settings={{ segmentation_enabled: false, auto_chapter_detection: false, segmentation_threshold: 5000, segmentation_chunk_size: 1500 }}
        onSave={onSave}
        onCancel={vi.fn()}
        onCreateVideoWithoutSaving={onVideo}
      />
    )

    await user.click(screen.getByRole('tab', { name: 'Upload File' }))
    await user.click(screen.getByRole('button', { name: 'Drop file here or click to browse' }))
    await screen.findByLabelText('Review extracted text')

    await user.click(screen.getByRole('button', { name: /create video without saving/i }))

    expect(onVideo).toHaveBeenCalledOnce()
    expect(onVideo).toHaveBeenCalledWith(
      'Chapter One',
      expect.stringContaining('Once upon a time')
    )
    // Confirm no Library save occurred
    expect(onSave).not.toHaveBeenCalled()
  })
})

// ── NavigationContext: openTransmuteForUnsavedSource ─────────────────────────

describe('NavigationContext — openTransmuteForUnsavedSource', () => {
  afterEach(cleanup)

  function wrapper({ children }: { children: React.ReactNode }) {
    return <NavigationProvider>{children}</NavigationProvider>
  }

  it('sets view to "transmute" when openTransmuteForUnsavedSource is called', () => {
    const { result } = renderHook(() => useNavigation(), { wrapper })
    act(() => result.current.openTransmuteForUnsavedSource({ title: 'T', content: 'hello world foo bar' }))
    expect(result.current.view).toBe('transmute')
  })

  it('exposes the pending source via transmuteLaunchSource', () => {
    const { result } = renderHook(() => useNavigation(), { wrapper })
    const source = { title: 'My Video', content: 'hello world foo bar' }
    act(() => result.current.openTransmuteForUnsavedSource(source))
    expect(result.current.transmuteLaunchSource).toEqual(source)
  })

  it('clears transmuteLaunchSource after clearTransmuteLaunchSource is called', () => {
    const { result } = renderHook(() => useNavigation(), { wrapper })
    act(() => result.current.openTransmuteForUnsavedSource({ title: 'T', content: 'hello world foo' }))
    act(() => result.current.clearTransmuteLaunchSource())
    expect(result.current.transmuteLaunchSource).toBeNull()
  })

  it('transmuteLaunchSource starts as null', () => {
    const { result } = renderHook(() => useNavigation(), { wrapper })
    expect(result.current.transmuteLaunchSource).toBeNull()
  })
})

// ── TransmuteView: launchSource one-shot intent ───────────────────────────────

describe('TransmuteView with launchSource — unsaved content, no Library record', () => {
  const UNSAVED_SOURCE = {
    title: 'My Unsaved Video',
    content: 'hello world foo bar baz qux',
  }

  beforeEach(() => {
    window.localStorage.clear()
    vi.stubGlobal('api', {
      db: {
        getText: vi.fn(),
        getSegments: vi.fn(),
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

  it('lands in phase=configure/wizardStep=scope without calling db.getText or db.getSegments', async () => {
    const onConsumed = vi.fn()
    render(
      <TransmuteView
        texts={[]}
        settings={BASE_SETTINGS}
        onSaveSettings={vi.fn()}
        onOpenReaderSettings={vi.fn()}
        launchSource={UNSAVED_SOURCE}
        onLaunchSourceConsumed={onConsumed}
      />
    )

    // Should skip the source selector and land in configure
    await waitFor(() => {
      expect(document.querySelector('.transmute-select')).toBeNull()
    })

    // Stepper visible (configure phase)
    const stepperItems = document.querySelectorAll('.transmute-stepper-item')
    expect(stepperItems.length).toBeGreaterThan(0)

    // Active step = Scope
    const activeStep = Array.from(stepperItems).find(
      (el) => el.getAttribute('aria-current') === 'step'
    )
    expect(activeStep?.textContent).toContain('Scope')

    // Title chip shown
    expect(screen.queryByText('My Unsaved Video')).toBeTruthy()

    // NO db calls — no Library record
    expect((window.api as any).db.getText).not.toHaveBeenCalled()
    expect((window.api as any).db.getSegments).not.toHaveBeenCalled()

    // Consumed callback fired
    expect(onConsumed).toHaveBeenCalledOnce()
  })

  it('overrides persisted Transmute process state for that launch', async () => {
    // Seed a different persisted pasted-text process
    seedProcessInLocalStorage({
      sourceKind: 'pasted',
      selectedTitle: 'Old Persisted Text',
      pastedTextInput: 'old content that must not appear',
      phase: 'configure',
      wizardStep: 'reader',
    })

    render(
      <TransmuteView
        texts={[]}
        settings={BASE_SETTINGS}
        onSaveSettings={vi.fn()}
        onOpenReaderSettings={vi.fn()}
        launchSource={UNSAVED_SOURCE}
        onLaunchSourceConsumed={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.queryByText('My Unsaved Video')).toBeTruthy()
    })

    // Persisted title must NOT appear
    expect(screen.queryByText('Old Persisted Text')).toBeNull()

    // Active step should be Scope (not the persisted 'reader' step)
    const stepperItems = document.querySelectorAll('.transmute-stepper-item')
    const activeStep = Array.from(stepperItems).find(
      (el) => el.getAttribute('aria-current') === 'step'
    )
    expect(activeStep?.textContent).toContain('Scope')
  })

  it('does not create any Library record (no saveText, getText, or getSegments calls)', async () => {
    render(
      <TransmuteView
        texts={[]}
        settings={BASE_SETTINGS}
        onSaveSettings={vi.fn()}
        onOpenReaderSettings={vi.fn()}
        launchSource={UNSAVED_SOURCE}
        onLaunchSourceConsumed={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(document.querySelector('.transmute-select')).toBeNull()
    })

    expect((window.api as any).db.getText).not.toHaveBeenCalled()
    expect((window.api as any).db.getSegments).not.toHaveBeenCalled()
  })
})
