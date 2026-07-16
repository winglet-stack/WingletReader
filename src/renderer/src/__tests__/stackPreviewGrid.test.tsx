/**
 * StackPreviewGrid + ReaderPreview tests.
 * Environment: happy-dom (matched by vitest.config.ts environmentMatchGlobs).
 */
import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import StackPreviewGrid from '../components/StackPreviewGrid'
import type { StackPreviewGridProps } from '../components/StackPreviewGrid'
import ReaderPreview from '../components/ReaderPreview'
import type { Settings } from '../types'

afterEach(cleanup)

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_PROPS: StackPreviewGridProps = {
  fontSize: 36,
  fontFamily: '',
  textColor: '',
  highlightColor: '',
  highlightTextColor: '',
  highlightActive: false,
  bgColor: '',
  showChunkDividers: false,
  stacksVisible: 1,
  stackGap: 32,
  stackVerticalOffset: 0,
  stackHorizontalOffset: 0,
  linesEnabled: false,
  linesCount: 1,
  linesRowGap: 0,
  wordsPerStack: 1,
  stageClassName: 'test-stage',
}

const BASE_SETTINGS: Settings = {
  words_per_stack: 1,
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
  target_wpm: 200,
  custom_palettes: [],
  custom_text_presets: [],
  custom_font_presets: [],
  custom_playback_presets: [],
  custom_reader_configs: [],
}

// ── StackPreviewGrid — stack column count ─────────────────────────────────────

describe('StackPreviewGrid — stack columns', () => {
  it('renders one stack slot when stacksVisible is 1', () => {
    const { container } = render(<StackPreviewGrid {...BASE_PROPS} stacksVisible={1} />)
    expect(container.querySelectorAll('.stack-slot')).toHaveLength(1)
  })

  it('renders the correct number of stack slots', () => {
    const { container } = render(<StackPreviewGrid {...BASE_PROPS} stacksVisible={3} />)
    expect(container.querySelectorAll('.stack-slot')).toHaveLength(3)
  })

  it('caps columns at maxStacks when stacksVisible exceeds it', () => {
    const { container } = render(
      <StackPreviewGrid {...BASE_PROPS} stacksVisible={6} maxStacks={4} />
    )
    expect(container.querySelectorAll('.stack-slot')).toHaveLength(4)
  })

  it('shows overflow indicator when stacks are capped', () => {
    const { container } = render(
      <StackPreviewGrid {...BASE_PROPS} stacksVisible={6} maxStacks={4} />
    )
    const more = container.querySelector('.spg-more')
    expect(more).toBeTruthy()
    expect(more?.textContent).toBe('+ 2 more')
  })

  it('shows no overflow indicator when all stacks fit', () => {
    const { container } = render(
      <StackPreviewGrid {...BASE_PROPS} stacksVisible={3} maxStacks={4} />
    )
    expect(container.querySelector('.spg-more')).toBeNull()
  })
})

// ── StackPreviewGrid — row count ──────────────────────────────────────────────

describe('StackPreviewGrid — rows', () => {
  it('renders 1 row when linesEnabled is false', () => {
    const { container } = render(
      <StackPreviewGrid {...BASE_PROPS} linesEnabled={false} />
    )
    expect(container.querySelectorAll('.reader-stack-row')).toHaveLength(1)
  })

  it('renders multiple rows when linesEnabled is true', () => {
    const { container } = render(
      <StackPreviewGrid {...BASE_PROPS} linesEnabled={true} linesCount={3} />
    )
    expect(container.querySelectorAll('.reader-stack-row')).toHaveLength(3)
  })

  it('caps rows at maxRows', () => {
    const { container } = render(
      <StackPreviewGrid {...BASE_PROPS} linesEnabled={true} linesCount={5} maxRows={3} />
    )
    expect(container.querySelectorAll('.reader-stack-row')).toHaveLength(3)
  })

  it('does not cap rows when maxRows exceeds linesCount', () => {
    const { container } = render(
      <StackPreviewGrid {...BASE_PROPS} linesEnabled={true} linesCount={2} maxRows={5} />
    )
    expect(container.querySelectorAll('.reader-stack-row')).toHaveLength(2)
  })
})

// ── StackPreviewGrid — offset transforms ──────────────────────────────────────

describe('StackPreviewGrid — offset transform', () => {
  it('applies vertical and horizontal offsets to the inner div transform', () => {
    const { container } = render(
      <StackPreviewGrid {...BASE_PROPS} stackVerticalOffset={100} stackHorizontalOffset={50} />
    )
    const inner = container.querySelector('.spg-inner') as HTMLElement
    expect(inner.style.transform).toBe('translateY(100px) translateX(50px)')
  })

  it('renders zero offsets as translateY(0px) translateX(0px)', () => {
    const { container } = render(
      <StackPreviewGrid {...BASE_PROPS} stackVerticalOffset={0} stackHorizontalOffset={0} />
    )
    const inner = container.querySelector('.spg-inner') as HTMLElement
    expect(inner.style.transform).toBe('translateY(0px) translateX(0px)')
  })

  it('applies offsetScale of 0.25 (mini preview)', () => {
    const { container } = render(
      <StackPreviewGrid
        {...BASE_PROPS}
        stackVerticalOffset={200}
        stackHorizontalOffset={100}
        offsetScale={0.25}
      />
    )
    const inner = container.querySelector('.spg-inner') as HTMLElement
    expect(inner.style.transform).toBe('translateY(50px) translateX(25px)')
  })

  it('rounds offset values when scaling produces a fraction', () => {
    const { container } = render(
      <StackPreviewGrid
        {...BASE_PROPS}
        stackVerticalOffset={100}
        stackHorizontalOffset={90}
        offsetScale={0.25}
      />
    )
    const inner = container.querySelector('.spg-inner') as HTMLElement
    // 100 * 0.25 = 25, 90 * 0.25 = 22.5 → rounds to 23
    expect(inner.style.transform).toBe('translateY(25px) translateX(23px)')
  })

  it('live-updates the transform when offset props change', () => {
    const { container, rerender } = render(
      <StackPreviewGrid {...BASE_PROPS} stackVerticalOffset={0} stackHorizontalOffset={0} />
    )
    const inner = container.querySelector('.spg-inner') as HTMLElement
    expect(inner.style.transform).toBe('translateY(0px) translateX(0px)')

    rerender(
      <StackPreviewGrid {...BASE_PROPS} stackVerticalOffset={60} stackHorizontalOffset={30} />
    )
    expect(inner.style.transform).toBe('translateY(60px) translateX(30px)')
  })

  it('applies row gap when linesEnabled is true', () => {
    const { container } = render(
      <StackPreviewGrid {...BASE_PROPS} linesEnabled={true} linesCount={2} linesRowGap={12} />
    )
    const inner = container.querySelector('.spg-inner') as HTMLElement
    expect(inner.style.gap).toBe('12px')
  })

  it('omits gap when linesEnabled is false', () => {
    const { container } = render(
      <StackPreviewGrid {...BASE_PROPS} linesEnabled={false} linesRowGap={12} />
    )
    const inner = container.querySelector('.spg-inner') as HTMLElement
    expect(inner.style.gap).toBe('')
  })
})

// ── StackPreviewGrid — highlight ──────────────────────────────────────────────

describe('StackPreviewGrid — highlight', () => {
  it('marks the first slot active when highlightActive is true', () => {
    const { container } = render(
      <StackPreviewGrid
        {...BASE_PROPS}
        stacksVisible={3}
        highlightActive={true}
        highlightColor="#ff0000"
      />
    )
    const active = container.querySelectorAll('.stack-slot--active')
    expect(active).toHaveLength(1)
  })

  it('does not mark any slot active when highlightActive is false', () => {
    const { container } = render(
      <StackPreviewGrid {...BASE_PROPS} stacksVisible={3} highlightActive={false} />
    )
    expect(container.querySelectorAll('.stack-slot--active')).toHaveLength(0)
  })

  it('live-updates highlight when highlightActive changes', () => {
    const { container, rerender } = render(
      <StackPreviewGrid {...BASE_PROPS} highlightActive={false} />
    )
    expect(container.querySelectorAll('.stack-slot--active')).toHaveLength(0)

    rerender(
      <StackPreviewGrid {...BASE_PROPS} highlightActive={true} highlightColor="#0000ff" />
    )
    expect(container.querySelectorAll('.stack-slot--active')).toHaveLength(1)
  })
})

// ── StackPreviewGrid — dividers ───────────────────────────────────────────────

describe('StackPreviewGrid — chunk dividers', () => {
  it('renders stack-divider elements when showChunkDividers is true', () => {
    const { container } = render(
      <StackPreviewGrid {...BASE_PROPS} stacksVisible={3} showChunkDividers={true} />
    )
    // 2 gaps between 3 stacks
    expect(container.querySelectorAll('.stack-divider')).toHaveLength(2)
  })

  it('renders no stack-divider elements when showChunkDividers is false', () => {
    const { container } = render(
      <StackPreviewGrid {...BASE_PROPS} stacksVisible={3} showChunkDividers={false} />
    )
    expect(container.querySelectorAll('.stack-divider')).toHaveLength(0)
  })
})

// ── StackPreviewGrid — CSS variables ─────────────────────────────────────────

describe('StackPreviewGrid — CSS variables', () => {
  it('sets --rd-stage-bg CSS variable when bgColor is provided', () => {
    const { container } = render(
      <StackPreviewGrid {...BASE_PROPS} bgColor="#123456" />
    )
    const stage = container.querySelector('.test-stage') as HTMLElement
    expect(stage.style.getPropertyValue('--rd-stage-bg')).toBe('#123456')
  })

  it('sets --rd-text CSS variable when textColor is provided', () => {
    const { container } = render(
      <StackPreviewGrid {...BASE_PROPS} textColor="#ffffff" />
    )
    const stage = container.querySelector('.test-stage') as HTMLElement
    expect(stage.style.getPropertyValue('--rd-text')).toBe('#ffffff')
  })

  it('omits --rd-stage-bg when bgColor is empty', () => {
    const { container } = render(
      <StackPreviewGrid {...BASE_PROPS} bgColor="" />
    )
    const stage = container.querySelector('.test-stage') as HTMLElement
    expect(stage.style.getPropertyValue('--rd-stage-bg')).toBe('')
  })

  it('live-updates CSS vars when bgColor prop changes', () => {
    const { container, rerender } = render(
      <StackPreviewGrid {...BASE_PROPS} bgColor="" />
    )
    const stage = container.querySelector('.test-stage') as HTMLElement
    expect(stage.style.getPropertyValue('--rd-stage-bg')).toBe('')

    rerender(<StackPreviewGrid {...BASE_PROPS} bgColor="#abcdef" />)
    expect(stage.style.getPropertyValue('--rd-stage-bg')).toBe('#abcdef')
  })
})

// ── StackPreviewGrid — stageClassName ─────────────────────────────────────────

describe('StackPreviewGrid — stageClassName', () => {
  it('applies the stageClassName to the outer element', () => {
    const { container } = render(
      <StackPreviewGrid {...BASE_PROPS} stageClassName="my-custom-stage" />
    )
    expect(container.querySelector('.my-custom-stage')).toBeTruthy()
  })

  it('uses spg-stage as default when stageClassName is omitted', () => {
    const propsWithoutClass = { ...BASE_PROPS }
    delete (propsWithoutClass as Partial<StackPreviewGridProps>).stageClassName
    const { container } = render(<StackPreviewGrid {...propsWithoutClass} />)
    expect(container.querySelector('.spg-stage')).toBeTruthy()
  })
})

// ── ReaderPreview regressions ─────────────────────────────────────────────────

describe('ReaderPreview', () => {
  it('renders the "Preview" label', () => {
    render(<ReaderPreview settings={BASE_SETTINGS} />)
    expect(screen.getByText('Preview')).toBeTruthy()
  })

  it('renders the rcp-preview wrapper', () => {
    const { container } = render(<ReaderPreview settings={BASE_SETTINGS} />)
    expect(container.querySelector('.rcp-preview')).toBeTruthy()
  })

  it('uses rcp-preview-stage class on the stage element', () => {
    const { container } = render(<ReaderPreview settings={BASE_SETTINGS} />)
    expect(container.querySelector('.rcp-preview-stage')).toBeTruthy()
  })

  it('applies 0.25x offset scale for vertical offset', () => {
    const { container } = render(
      <ReaderPreview settings={{ ...BASE_SETTINGS, stack_vertical_offset: 200 }} />
    )
    const inner = container.querySelector('.spg-inner') as HTMLElement
    expect(inner.style.transform).toBe('translateY(50px) translateX(0px)')
  })

  it('applies 0.25x offset scale for horizontal offset', () => {
    const { container } = render(
      <ReaderPreview settings={{ ...BASE_SETTINGS, stack_horizontal_offset: 100 }} />
    )
    const inner = container.querySelector('.spg-inner') as HTMLElement
    expect(inner.style.transform).toBe('translateY(0px) translateX(25px)')
  })

  it('caps stacks at 4 for compact display', () => {
    const { container } = render(
      <ReaderPreview settings={{ ...BASE_SETTINGS, stacks_visible: 6 }} />
    )
    expect(container.querySelectorAll('.stack-slot')).toHaveLength(4)
  })

  it('shows "+ N more" when stacks are capped', () => {
    const { container } = render(
      <ReaderPreview settings={{ ...BASE_SETTINGS, stacks_visible: 6 }} />
    )
    expect(container.querySelector('.spg-more')?.textContent).toBe('+ 2 more')
  })

  it('caps rows at 3 when linesEnabled', () => {
    const { container } = render(
      <ReaderPreview
        settings={{ ...BASE_SETTINGS, lines_enabled: true, lines_count: 5 }}
      />
    )
    expect(container.querySelectorAll('.reader-stack-row')).toHaveLength(3)
  })

  it('renders 1 row when linesEnabled is false regardless of lines_count', () => {
    const { container } = render(
      <ReaderPreview
        settings={{ ...BASE_SETTINGS, lines_enabled: false, lines_count: 5 }}
      />
    )
    expect(container.querySelectorAll('.reader-stack-row')).toHaveLength(1)
  })

  it('defaults stack_horizontal_offset to 0 when missing from settings', () => {
    // Simulate an older Settings object that may lack this field (backward compat)
    const oldSettings = { ...BASE_SETTINGS } as Settings & { stack_horizontal_offset?: number }
    delete oldSettings.stack_horizontal_offset
    const { container } = render(<ReaderPreview settings={oldSettings as Settings} />)
    const inner = container.querySelector('.spg-inner') as HTMLElement
    expect(inner.style.transform).not.toContain('NaN')
    expect(inner.style.transform).toBe('translateY(0px) translateX(0px)')
  })
})
