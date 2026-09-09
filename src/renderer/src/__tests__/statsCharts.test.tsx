/**
 * Stats chart primitives (issue 08, ADR-0035 §6) — LineChart / BarChart /
 * PieChart render tests. The heavy geometry pinning lives in
 * statsChartMath.test.ts; this file covers what only a render shows:
 * fixture series producing the pinned SVG geometry, the explicit empty-data
 * state for each chart, highlight emphasis, accessibility attributes, and
 * that every painted colour is a design token (no hard-coded hex — the
 * theme-correctness half of the acceptance criteria; hue itself is HITL).
 *
 * Environment: happy-dom (matched by vitest.config.ts environmentMatchGlobs).
 */

import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import LineChart from '../components/stats/charts/LineChart'
import BarChart from '../components/stats/charts/BarChart'
import PieChart from '../components/stats/charts/PieChart'
import type { ChartDatum } from '../components/stats/charts/chartMath'

afterEach(cleanup)

const LINE_SERIES: ChartDatum[] = [
  { label: 'Mon', value: 0 },
  { label: 'Tue', value: 250 },
  { label: 'Wed', value: 100 },
  { label: 'Thu', value: 400 }
]

const WEEK_SERIES: ChartDatum[] = [
  { label: 'Mon', value: 1200, key: '2026-08-10' },
  { label: 'Tue', value: 0, key: '2026-08-11' },
  { label: 'Wed', value: 800, key: '2026-08-12' },
  { label: 'Thu', value: 1500, key: '2026-08-13' },
  { label: 'Fri', value: 300, key: '2026-08-14' },
  { label: 'Sat', value: 0, key: '2026-08-15' },
  { label: 'Sun', value: 950, key: '2026-08-16' }
]

/** Every painted fill/stroke must be a token reference or 'none'. */
function expectTokenColorsOnly(root: HTMLElement) {
  for (const el of root.querySelectorAll('*')) {
    for (const attr of ['fill', 'stroke'] as const) {
      const value = el.getAttribute(attr)
      if (value === null) continue
      expect(value, `<${el.tagName.toLowerCase()} ${attr}="${value}">`).toMatch(
        /^(none|var\(--[a-z0-9-]+\))$/
      )
    }
  }
}

describe('LineChart', () => {
  it('renders the pinned line geometry from the fixture series', () => {
    const { container } = render(<LineChart series={LINE_SERIES} ariaLabel="Words per day" />)
    const line = container.querySelector('path[stroke]')
    expect(line?.getAttribute('d')).toBe('M 40 130 L 122.67 56.25 L 205.33 100.5 L 288 12')
    expect(line?.getAttribute('stroke')).toBe('var(--cobalt-accent)')
    expect(line?.getAttribute('stroke-width')).toBe('2')
    // No area wash unless asked for — the line path is the only <path>.
    expect(container.querySelectorAll('path')).toHaveLength(1)
  })

  it('adds the closed area wash when showArea is set', () => {
    const { container } = render(
      <LineChart series={LINE_SERIES} ariaLabel="Words per day" showArea />
    )
    const area = container.querySelector('path[fill-opacity]')
    expect(area?.getAttribute('d')).toBe(
      'M 40 130 L 122.67 56.25 L 205.33 100.5 L 288 12 L 288 130 L 40 130 Z'
    )
    expect(area?.getAttribute('fill')).toBe('var(--cobalt-accent)')
  })

  it('marks the series end with a dot on the last point', () => {
    const { container } = render(<LineChart series={LINE_SERIES} ariaLabel="Words per day" />)
    const dot = container.querySelector('circle')
    expect(dot?.getAttribute('cx')).toBe('288')
    expect(dot?.getAttribute('cy')).toBe('12')
  })

  it('draws a gridline and tick label per axis tick, plus x labels', () => {
    const { container } = render(<LineChart series={LINE_SERIES} ariaLabel="Words per day" />)
    // 400 max → ticks 0..400 by 100.
    expect(container.querySelectorAll('line')).toHaveLength(5)
    const texts = [...container.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toEqual(['0', '100', '200', '300', '400', 'Mon', 'Tue', 'Wed', 'Thu'])
  })

  it('is an accessible image', () => {
    const { container } = render(<LineChart series={LINE_SERIES} ariaLabel="Words per day" />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('role')).toBe('img')
    expect(svg?.getAttribute('aria-label')).toBe('Words per day')
    expect(svg?.getAttribute('viewBox')).toBe('0 0 300 160')
  })

  it('renders the empty state below two points', () => {
    for (const series of [[], [{ label: 'Mon', value: 5 }]]) {
      const { container, unmount } = render(<LineChart series={series} ariaLabel="Words" />)
      const svg = container.querySelector('svg')
      expect(svg?.getAttribute('data-empty')).toBe('true')
      expect(svg?.textContent).toBe('Not enough data yet')
      expect(svg?.getAttribute('aria-label')).toBe('Words')
      unmount()
    }
  })

  it('uses design tokens only', () => {
    const { container } = render(
      <LineChart series={LINE_SERIES} ariaLabel="Words per day" showArea />
    )
    expectTokenColorsOnly(container)
  })
})

describe('BarChart', () => {
  it('renders one rounded-top bar per non-zero bucket with pinned geometry', () => {
    const { container } = render(<BarChart series={WEEK_SERIES} ariaLabel="Words per weekday" />)
    const bars = container.querySelectorAll('path')
    // Two zero-value buckets draw nothing (empty path), five bars remain.
    expect(bars).toHaveLength(5)
    // Max bucket (Thu, 1500 on a 0..1500 axis) spans plot top to baseline.
    const thursday = [...bars].find((bar) => bar.getAttribute('d')?.startsWith('M 152 130'))
    expect(thursday?.getAttribute('d')).toBe(
      'M 152 130 L 152 14 Q 152 12 154 12 L 174 12 Q 176 12 176 14 L 176 130 Z'
    )
  })

  it('paints all bars accent when nothing is highlighted', () => {
    const { container } = render(<BarChart series={WEEK_SERIES} ariaLabel="Words per weekday" />)
    for (const bar of container.querySelectorAll('path')) {
      expect(bar.getAttribute('fill')).toBe('var(--cobalt-accent)')
    }
    expect(container.querySelector('[data-highlighted]')).toBeNull()
  })

  it('emphasises the highlighted bucket by key and recedes the rest', () => {
    const { container } = render(
      <BarChart series={WEEK_SERIES} ariaLabel="Words per weekday" highlightKey="2026-08-12" />
    )
    const highlighted = container.querySelector('path[data-highlighted]')
    expect(highlighted?.getAttribute('fill')).toBe('var(--cobalt-accent)')
    for (const bar of container.querySelectorAll('path:not([data-highlighted])')) {
      expect(bar.getAttribute('fill')).toBe('var(--border)')
    }
    // The highlighted bucket carries the one direct value label.
    const texts = [...container.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toContain('800')
  })

  it('falls back to label matching when buckets have no key', () => {
    const keyless = WEEK_SERIES.map(({ label, value }) => ({ label, value }))
    const { container } = render(
      <BarChart series={keyless} ariaLabel="Words per weekday" highlightKey="Wed" />
    )
    expect(container.querySelector('path[data-highlighted]')).not.toBeNull()
  })

  it('labels the axis with clean ticks and every weekday', () => {
    const { container } = render(<BarChart series={WEEK_SERIES} ariaLabel="Words per weekday" />)
    const texts = [...container.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toEqual([
      '0',
      '500',
      '1,000',
      '1,500',
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun'
    ])
  })

  it('renders the empty state for an empty series', () => {
    const { container } = render(<BarChart series={[]} ariaLabel="Words per weekday" />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('data-empty')).toBe('true')
    expect(svg?.textContent).toBe('Not enough data yet')
  })

  it('uses design tokens only, highlighted or not', () => {
    for (const highlightKey of [undefined, '2026-08-12']) {
      const { container, unmount } = render(
        <BarChart series={WEEK_SERIES} ariaLabel="Words" highlightKey={highlightKey} />
      )
      expectTokenColorsOnly(container)
      unmount()
    }
  })
})

describe('PieChart', () => {
  it('renders the pinned arc and centered percentage', () => {
    const { container } = render(<PieChart fraction={0.64} ariaLabel="Quota progress" />)
    const arc = container.querySelector('[data-donut-arc]')
    expect(arc?.getAttribute('stroke-dasharray')).toBe('176.93 276.46')
    expect(arc?.getAttribute('transform')).toBe('rotate(-90 60 60)')
    expect(arc?.getAttribute('stroke')).toBe('var(--cobalt-accent)')
    const label = [...container.querySelectorAll('text')].find((t) => t.textContent === '64%')
    expect(label?.getAttribute('x')).toBe('60')
    expect(label?.getAttribute('y')).toBe('60')
    expect(label?.getAttribute('fill')).toBe('var(--text)')
  })

  it('clamps an over-quota arc to a full ring but keeps the real label', () => {
    const { container } = render(<PieChart fraction={1.4} ariaLabel="Quota progress" />)
    expect(container.querySelector('[data-donut-arc]')?.getAttribute('stroke-dasharray')).toBe(
      '276.46 276.46'
    )
    expect(container.textContent).toContain('140%')
  })

  it('shows track and 0% with no arc at zero progress', () => {
    const { container } = render(<PieChart fraction={0} ariaLabel="Quota progress" />)
    expect(container.querySelector('[data-donut-arc]')).toBeNull()
    expect(container.querySelectorAll('circle')).toHaveLength(1)
    expect(container.textContent).toContain('0%')
  })

  it('is an accessible image', () => {
    const { container } = render(<PieChart fraction={0.5} ariaLabel="Quota progress" />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('role')).toBe('img')
    expect(svg?.getAttribute('aria-label')).toBe('Quota progress')
    expect(svg?.getAttribute('viewBox')).toBe('0 0 120 120')
  })

  it('renders the empty state for null or non-finite fractions', () => {
    for (const fraction of [null, NaN]) {
      const { container, unmount } = render(
        <PieChart fraction={fraction} ariaLabel="Quota progress" />
      )
      const svg = container.querySelector('svg')
      expect(svg?.getAttribute('data-empty')).toBe('true')
      expect(svg?.textContent).toBe('Not enough data yet')
      unmount()
    }
  })

  it('uses design tokens only', () => {
    const { container } = render(<PieChart fraction={0.75} ariaLabel="Quota progress" />)
    expectTokenColorsOnly(container)
  })
})
