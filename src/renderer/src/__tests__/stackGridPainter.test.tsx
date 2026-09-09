/**
 * StackGrid is the DOM painter for the reader frame (architecture-depth 06).
 *
 * These tests drive it with a real frame description rather than through the
 * component, so the painter contract — classes, sizes, gaps, dividers, reserved
 * rows and headline geometry — is pinned without a playback harness. Anything the
 * painter would have to *decide* for itself shows up here as a mismatch against
 * the frame it was handed.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import StackGrid from '../components/reader/StackGrid'
import {
  HEADLINE_FONT_SCALE,
  INITIAL_REVEAL_STATE,
  deriveReaderFrame,
  type ReaderFrameConfig,
} from '../engine/readerFrame'
import type { ReaderTextMeasurer } from '../engine/readerDisplayScale'
import type { WordStack } from '../types'

afterEach(cleanup)

const measureWidth: ReaderTextMeasurer = (text) => text.length * 10

const CONFIG: ReaderFrameConfig = {
  stacksVisible: 3,
  wordsPerStack: 2,
  linesCount: 2,
  linesAnchor: 'top',
  fontSize: 40,
  stackGap: 24,
  rowGap: 12,
  stackVerticalOffset: 6,
  stackHorizontalOffset: -4,
  fontFamily: '',
  fontWeight: 700,
  highlightActive: true,
  highlightMode: 'default',
  highlightPanningChunkSize: 0,
  focalPointsView: false,
  showChunkDividers: false,
}

function stacks(): WordStack[] {
  return [
    { words: ['Chapter', 'One'], type: 'headline' },
    { words: ['alpha', 'beta'], type: 'normal' },
    { words: ['gamma', 'delta'], type: 'normal' },
    { words: ['epsilon', 'zeta'], type: 'normal' },
  ]
}

function paint(currentIndex: number, overrides: Partial<ReaderFrameConfig> = {}) {
  const frame = deriveReaderFrame({
    stacks: stacks(),
    currentIndex,
    config: { ...CONFIG, ...overrides },
    stage: { width: 4000, height: 4000 },
    measureWidth,
    reveal: INITIAL_REVEAL_STATE,
  })
  const { container } = render(<StackGrid frame={frame} />)
  return { frame, container }
}

describe('StackGrid — paints the frame it is given', () => {
  it('takes anchor, offsets and row gap from the frame geometry', () => {
    const { frame, container } = paint(1)
    const rows = container.querySelector('.reader-stack-rows') as HTMLElement

    expect(rows.className).toBe('reader-stack-rows reader-stack-rows--top')
    expect(frame.geometry.anchor).toBe('top')
    expect(rows.style.transform).toBe('translateY(6px) translateX(-4px)')
    expect(rows.style.gap).toBe('12px')
  })

  it('takes the column template and reserved row height from the frame geometry', () => {
    const { frame, container } = paint(1)
    const rows = container.querySelectorAll('.reader-stack-row')

    expect(rows).toHaveLength(frame.geometry.linesCount)
    rows.forEach((row) => {
      expect((row as HTMLElement).style.gridTemplateColumns).toBe(frame.geometry.gridTemplateColumns)
      expect((row as HTMLElement).style.minHeight).toBe(`${frame.geometry.rowHeight}px`)
    })
  })

  it('renders reserved-but-empty slots as empty cells with no divider', () => {
    const { container } = paint(1)
    const rows = container.querySelectorAll('.reader-stack-row')

    // Current row: 3 cells, 2 dividers. Reserved row: 3 cells, no dividers.
    expect(rows[0].querySelectorAll('.stack-slot')).toHaveLength(3)
    expect(rows[0].querySelectorAll('.stack-divider')).toHaveLength(2)
    expect(rows[1].querySelectorAll('.stack-slot')).toHaveLength(3)
    expect(rows[1].querySelectorAll('.stack-divider')).toHaveLength(0)

    const reserved = rows[1].querySelectorAll('.stack-slot')
    reserved.forEach((slot) => expect(slot.textContent).toBe(''))
    // The third cell of the current row is reserved too — not yet reached.
    expect(rows[0].querySelectorAll('.stack-slot')[2].textContent).toBe('')
  })

  it('applies the frame slot class verbatim, including connected-highlight modifiers', () => {
    const { frame, container } = paint(1, { highlightMode: 'progressive-bar' })
    const painted = Array.from(container.querySelectorAll('.stack-slot')).map((slot) => slot.className)
    const described = frame.rows.flatMap((row) => row.slots.map((slot) => slot.slotClass))

    expect(painted).toEqual(described)
    expect(painted[1]).toContain('stack-slot--connected-left')
  })

  it('sizes a headline slot from the frame, not from a rule of its own', () => {
    const { frame, container } = paint(1)
    const headline = container.querySelector('.stack-headline') as HTMLElement

    expect(headline.textContent).toBe('Chapter One')
    expect(headline.style.fontSize).toBe(`${Math.round(frame.geometry.fontSize * HEADLINE_FONT_SCALE)}px`)
    expect(headline.querySelectorAll('.headline-rule')).toHaveLength(2)

    const words = container.querySelector('.stack-words') as HTMLElement
    expect(words.style.fontSize).toBe(`${frame.geometry.fontSize}px`)
  })

  it('hides the dormant divider rather than dropping it', () => {
    const { container } = paint(1)

    container.querySelectorAll('.stack-divider').forEach((divider) => {
      expect((divider as HTMLElement).style.visibility).toBe('hidden')
      expect(divider.classList.contains('stack-divider--dot')).toBe(false)
    })
  })
})
