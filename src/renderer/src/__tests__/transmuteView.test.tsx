import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import TransmuteView from '../components/TransmuteView'
import type { ReaderConfig, Settings } from '../types'
import { readerConfigFromSettings } from '../engine/reader-configs'
import { alphaChrome } from '../alphaChrome'
import {
  makeDefaultTransmuteConfig,
  transmutePresetFromConfig,
  TRANSMUTE_CONFIG_STORAGE_KEY,
} from '../engine/transmuteConfig'

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

function seedPastedTransmuteState(overrides: Record<string, unknown> = {}) {
  window.localStorage.setItem(PROCESS_KEY, JSON.stringify({
    phase: 'configure',
    wizardStep: 'reader',
    overviewOpen: { scope: true, video: true, reader: true },
    sourceKind: 'pasted',
    textId: null,
    segmentId: null,
    selectedTitle: 'Pasted Text',
    pastedTextInput: 'one two three four five six',
    pasteMode: true,
    maxDurationInput: '',
    ...overrides,
  }))
  window.localStorage.setItem(TRANSMUTE_CONFIG_STORAGE_KEY, JSON.stringify(makeDefaultTransmuteConfig(BASE_SETTINGS)))
}

function renderTransmute(settings: Settings, onSaveSettings = vi.fn()) {
  return {
    onSaveSettings,
    ...render(
      <TransmuteView
        texts={[]}
        settings={settings}
        onSaveSettings={onSaveSettings}
        onOpenReaderSettings={vi.fn()}
      />
    )
  }
}

beforeEach(() => {
  window.localStorage.clear()
  seedPastedTransmuteState()
  vi.stubGlobal('api', {
    db: {
      getText: vi.fn(),
      getSegments: vi.fn(),
    },
    video: {
      save: vi.fn(),
    },
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

describe('TransmuteView alpha banner', () => {
  it('shows a persistent non-dismissible experimental warning across wizard steps', () => {
    const { container } = renderTransmute(BASE_SETTINGS)

    const banner = screen.getByRole('status', { name: 'Transmute experimental warning' })
    expect(banner.textContent).toBe(alphaChrome.transmuteExperimentalBannerCopy)
    expect(banner.querySelector('button')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Browse library' })).toBeNull()

    clickStep(container, 'Overview')
    expect(screen.getByRole('status', { name: 'Transmute experimental warning' }).textContent)
      .toBe(alphaChrome.transmuteExperimentalBannerCopy)
  })

  it('shows the experimental warning on the source selection phase', () => {
    window.localStorage.clear()

    renderTransmute(BASE_SETTINGS)

    expect(screen.getByRole('status', { name: 'Transmute experimental warning' }).textContent)
      .toBe(alphaChrome.transmuteExperimentalBannerCopy)
  })
})

describe('TransmuteView presets', () => {
  it('saves the current transmute config as a settings-backed preset without source ids', () => {
    const onSaveSettings = vi.fn()
    renderTransmute(BASE_SETTINGS, onSaveSettings)

    fireEvent.click(screen.getByText('+ Save current transmute preset'))
    fireEvent.change(screen.getByLabelText('Transmute preset name'), { target: { value: 'Video Setup' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSaveSettings).toHaveBeenCalledTimes(1)
    const patch = onSaveSettings.mock.calls[0][0] as Partial<Settings>
    expect(patch.custom_transmute_presets).toHaveLength(1)
    expect(patch.custom_transmute_presets![0].name).toBe('Video Setup')
    expect('textId' in patch.custom_transmute_presets![0]).toBe(false)
    expect('segmentId' in patch.custom_transmute_presets![0]).toBe(false)
  })

  it('selects a saved transmute preset and persists it as the active render config', () => {
    const preset = transmutePresetFromConfig(
      'Fast Portrait',
      { ...makeDefaultTransmuteConfig(BASE_SETTINGS), bpm: 300, resolution: '1080x1920' }
    )

    renderTransmute({ ...BASE_SETTINGS, custom_transmute_presets: [preset] })
    fireEvent.click(screen.getByTitle('Fast Portrait'))

    const stored = JSON.parse(window.localStorage.getItem(TRANSMUTE_CONFIG_STORAGE_KEY) ?? '{}')
    expect(stored.bpm).toBe(300)
    expect(stored.resolution).toBe('1080x1920')
  })

  it('deletes a saved transmute preset from settings', () => {
    const preset = transmutePresetFromConfig('Delete Me', makeDefaultTransmuteConfig(BASE_SETTINGS))
    const onSaveSettings = vi.fn()

    renderTransmute({ ...BASE_SETTINGS, custom_transmute_presets: [preset] }, onSaveSettings)
    fireEvent.click(screen.getByLabelText('Delete transmute preset Delete Me'))

    expect(onSaveSettings).toHaveBeenCalledWith({ custom_transmute_presets: [] })
  })
})

function stepperItems(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('.transmute-stepper-item'))
}

function activeStepLabel(container: HTMLElement): string | undefined {
  return stepperItems(container)
    .find((el) => el.getAttribute('aria-current') === 'step')
    ?.textContent?.replace(/^\d+/, '')
}

function clickStep(container: HTMLElement, label: string) {
  const item = stepperItems(container).find((el) => el.textContent?.includes(label))
  expect(item).toBeTruthy()
  fireEvent.click(item!)
}

describe('TransmuteView wizard navigation (characterization)', () => {
  it('restores the persisted wizard step on a fresh render', () => {
    const { container } = renderTransmute(BASE_SETTINGS)

    expect(stepperItems(container).map((el) => el.textContent)).toEqual([
      '1Scope and Content',
      '2Video Output',
      '3Reader Settings',
      '4Overview',
    ])
    // Seeded process snapshot has wizardStep: 'reader'
    expect(activeStepLabel(container)).toBe('Reader Settings')
    expect(screen.getByText('Transmute Reader Settings')).toBeTruthy()
  })

  it('navigates freely between steps via the stepper and shows the matching step body', () => {
    const { container } = renderTransmute(BASE_SETTINGS)

    clickStep(container, 'Scope and Content')
    expect(activeStepLabel(container)).toBe('Scope and Content')
    expect(screen.getByRole('button', { name: 'Continue to Video Output' })).toBeTruthy()

    clickStep(container, 'Video Output')
    expect(activeStepLabel(container)).toBe('Video Output')
    expect(screen.getByRole('button', { name: 'Continue to Reader Settings' })).toBeTruthy()

    clickStep(container, 'Overview')
    expect(activeStepLabel(container)).toBe('Overview')
    expect(screen.getByText('▶ Render Video')).toBeTruthy()
  })

  it('advances from scope to video when the scope is valid and persists the step', () => {
    const { container } = renderTransmute(BASE_SETTINGS)

    clickStep(container, 'Scope and Content')
    const continueBtn = screen.getByRole('button', { name: 'Continue to Video Output' }) as HTMLButtonElement
    expect(continueBtn.disabled).toBe(false)
    fireEvent.click(continueBtn)

    expect(activeStepLabel(container)).toBe('Video Output')
    const snapshot = JSON.parse(window.localStorage.getItem(PROCESS_KEY) ?? '{}')
    expect(snapshot.wizardStep).toBe('video')
  })

  it('blocks advancing and rendering when the selection produced no content', () => {
    window.localStorage.clear()
    seedPastedTransmuteState({ pastedTextInput: '', pasteMode: false, wizardStep: 'scope' })
    const { container } = renderTransmute(BASE_SETTINGS)

    const continueBtn = screen.getByRole('button', { name: 'Continue to Video Output' }) as HTMLButtonElement
    expect(continueBtn.disabled).toBe(true)
    expect(screen.getByText('No content found in selection')).toBeTruthy()

    clickStep(container, 'Overview')
    const renderBtn = screen.getByText('▶ Render Video').closest('button') as HTMLButtonElement
    expect(renderBtn.disabled).toBe(true)
  })

  it('blocks advancing and rendering when the estimated duration exceeds the max duration', () => {
    const { container } = renderTransmute(BASE_SETTINGS)

    clickStep(container, 'Scope and Content')
    fireEvent.change(screen.getByLabelText(/Max duration/), { target: { value: '0.001' } })

    expect(screen.getByText(/Estimated duration exceeds the 0.001-minute limit/)).toBeTruthy()
    const continueBtn = screen.getByRole('button', { name: 'Continue to Video Output' }) as HTMLButtonElement
    expect(continueBtn.disabled).toBe(true)

    clickStep(container, 'Overview')
    const renderBtn = screen.getByText('▶ Render Video').closest('button') as HTMLButtonElement
    expect(renderBtn.disabled).toBe(true)
  })

  it('shows the overview summary derived from the current config', () => {
    const { container } = renderTransmute(BASE_SETTINGS)

    clickStep(container, 'Overview')
    expect(screen.getByText('All content')).toBeTruthy()
    expect(screen.getByText('No limit')).toBeTruthy()
    expect(screen.getByText(/16:9 Landscape \(1280x720\)/)).toBeTruthy()
    expect(screen.getByText('Whole book')).toBeTruthy()
    // Header book chip + overview Source row both show the title
    expect(screen.getAllByText('Pasted Text').length).toBeGreaterThanOrEqual(1)
  })
})

describe('TransmuteView reader config reuse', () => {
  it('applies an existing saved reader configuration to the active transmute config', () => {
    const readerConfig: ReaderConfig = {
      id: 'custom:cfg:reader',
      name: 'Reader Favorite',
      ...readerConfigFromSettings({
        ...BASE_SETTINGS,
        bpm: 222,
        words_per_stack: 4,
        highlight_mode: 'progressive-bar',
        highlight_color: '#ffcc00',
      }),
    }

    renderTransmute({ ...BASE_SETTINGS, custom_reader_configs: [readerConfig] })
    fireEvent.click(screen.getByTitle('Reader Favorite'))

    const stored = JSON.parse(window.localStorage.getItem(TRANSMUTE_CONFIG_STORAGE_KEY) ?? '{}')
    expect(stored.bpm).toBe(222)
    expect(stored.wordsPerStack).toBe(4)
    expect(stored.highlightMode).toBe('progressive-bar')
    expect(stored.highlightColor).toBe('#ffcc00')
  })
})
