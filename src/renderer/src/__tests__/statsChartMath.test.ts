/**
 * Chart math (issue 08, ADR-0035 §6) — pins the pure geometry the stats SVG
 * charts are built from: axis tick selection, y scaling, line/area paths,
 * bar band layout + rounded-top path, and the progress-donut arc. All plain
 * numbers-in/strings-out, so this runs in the node environment.
 */

import { describe, it, expect } from 'vitest'
import {
  sanitizeValue,
  niceStep,
  computeTicks,
  scaleY,
  formatTick,
  xLabelIndices,
  layoutXLabels,
  linePoints,
  linePath,
  areaPath,
  barLayout,
  barPath,
  donutArc,
  type PlotRect,
  type ChartDatum
} from '../components/stats/charts/chartMath'

/** The frame the components use — mirrored here so pins stay literal. */
const PLOT: PlotRect = { left: 40, top: 12, width: 248, height: 118 }
const BASELINE = PLOT.top + PLOT.height // 130

describe('sanitizeValue', () => {
  it('passes positive finite values through', () => {
    expect(sanitizeValue(5)).toBe(5)
    expect(sanitizeValue(0.25)).toBe(0.25)
  })

  it('clamps negatives, NaN and infinities to 0', () => {
    expect(sanitizeValue(-3)).toBe(0)
    expect(sanitizeValue(NaN)).toBe(0)
    expect(sanitizeValue(Infinity)).toBe(0)
    expect(sanitizeValue(-Infinity)).toBe(0)
  })
})

describe('niceStep', () => {
  it('snaps raw steps to the 1/2/5 ladder', () => {
    expect(niceStep(100)).toBe(100)
    expect(niceStep(234.25)).toBe(200)
    expect(niceStep(375)).toBe(500)
    expect(niceStep(1.4)).toBe(1)
    expect(niceStep(8)).toBe(10)
  })

  it('handles sub-1 steps on the same ladder', () => {
    expect(niceStep(0.037)).toBeCloseTo(0.05)
  })

  it('falls back to 1 for zero/negative/non-finite input', () => {
    expect(niceStep(0)).toBe(1)
    expect(niceStep(-2)).toBe(1)
    expect(niceStep(NaN)).toBe(1)
  })
})

describe('computeTicks', () => {
  it('pads the axis to a clean multiple and includes 0 and the max', () => {
    expect(computeTicks(937)).toEqual({
      max: 1000,
      ticks: [0, 200, 400, 600, 800, 1000]
    })
  })

  it('keeps an already-clean max as-is', () => {
    expect(computeTicks(400)).toEqual({ max: 400, ticks: [0, 100, 200, 300, 400] })
    expect(computeTicks(1500)).toEqual({ max: 1500, ticks: [0, 500, 1000, 1500] })
  })

  it('gives an all-zero series a 0..1 frame', () => {
    expect(computeTicks(0)).toEqual({ max: 1, ticks: [0, 1] })
    expect(computeTicks(-10)).toEqual({ max: 1, ticks: [0, 1] })
    expect(computeTicks(NaN)).toEqual({ max: 1, ticks: [0, 1] })
  })
})

describe('scaleY', () => {
  it('maps 0 to the baseline and the max to the plot top', () => {
    expect(scaleY(0, 400, PLOT)).toBe(BASELINE)
    expect(scaleY(400, 400, PLOT)).toBe(PLOT.top)
    expect(scaleY(100, 400, PLOT)).toBe(100.5)
    expect(scaleY(250, 400, PLOT)).toBe(56.25)
  })

  it('clamps values above the axis max to the plot top', () => {
    expect(scaleY(500, 400, PLOT)).toBe(PLOT.top)
  })

  it('treats bad values as 0 and a zero max as empty', () => {
    expect(scaleY(-5, 400, PLOT)).toBe(BASELINE)
    expect(scaleY(NaN, 400, PLOT)).toBe(BASELINE)
    expect(scaleY(10, 0, PLOT)).toBe(BASELINE)
  })
})

describe('formatTick', () => {
  it('comma-groups thousands', () => {
    expect(formatTick(937)).toBe('937')
    expect(formatTick(12000)).toBe('12,000')
    expect(formatTick(0)).toBe('0')
  })
})

describe('xLabelIndices', () => {
  it('labels every bucket when they all fit', () => {
    expect(xLabelIndices(4)).toEqual([0, 1, 2, 3])
    expect(xLabelIndices(7)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('spreads a month view evenly, keeping first and last', () => {
    expect(xLabelIndices(30, 7)).toEqual([0, 5, 10, 15, 19, 24, 29])
  })

  it('handles empty input', () => {
    expect(xLabelIndices(0)).toEqual([])
  })
})

describe('layoutXLabels', () => {
  /** Evenly spread anchors across the frame's 40..288 plot span. */
  const spread = (n: number) =>
    Array.from({ length: n }, (_, i) => 40 + (i / (n - 1)) * 248)

  it('keeps short labels centered on their anchors', () => {
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const layout = layoutXLabels(labels, spread(7), { viewWidth: 300 })
    expect(layout.map((l) => l.index)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(layout.every((l) => l.anchor === 'middle')).toBe(true)
  })

  it('end-anchors an edge caption and drops the neighbour it would collide with', () => {
    // Wide date captions on a 7-point line: "Aug 12" must clamp inside the
    // viewBox, which squeezes "Aug 11" out — overprinting is never allowed.
    const labels = ['Aug 6', 'Aug 7', 'Aug 8', 'Aug 9', 'Aug 10', 'Aug 11', 'Aug 12']
    const layout = layoutXLabels(labels, spread(7), { viewWidth: 300 })
    expect(layout.map((l) => [l.index, l.anchor])).toEqual([
      [0, 'middle'],
      [1, 'middle'],
      [2, 'middle'],
      [3, 'middle'],
      [4, 'middle'],
      [6, 'end']
    ])
  })

  it('always keeps the first and last caption', () => {
    const labels = Array.from({ length: 30 }, (_, i) => `Aug ${i + 1}`)
    const layout = layoutXLabels(labels, spread(30), { viewWidth: 300 })
    expect(layout[0].index).toBe(0)
    expect(layout[layout.length - 1].index).toBe(29)
    expect(layout.length).toBeLessThanOrEqual(7)
  })

  it('passes tiny inputs through untouched', () => {
    expect(layoutXLabels([], [], { viewWidth: 300 })).toEqual([])
    const two = layoutXLabels(['a', 'b'], [40, 288], { viewWidth: 300 })
    expect(two.map((l) => l.index)).toEqual([0, 1])
  })
})

describe('line geometry', () => {
  const series: ChartDatum[] = [
    { label: 'Mon', value: 0 },
    { label: 'Tue', value: 250 },
    { label: 'Wed', value: 100 },
    { label: 'Thu', value: 400 }
  ]

  it('spaces points evenly and scales y against the axis max', () => {
    const points = linePoints(series, 400, PLOT)
    expect(points.map((p) => [Math.round(p.x * 100) / 100, p.y, p.index])).toEqual([
      [40, 130, 0],
      [122.67, 56.25, 1],
      [205.33, 100.5, 2],
      [288, 12, 3]
    ])
  })

  it('pins the line path string', () => {
    expect(linePath(linePoints(series, 400, PLOT))).toBe(
      'M 40 130 L 122.67 56.25 L 205.33 100.5 L 288 12'
    )
  })

  it('closes the area path down to the baseline', () => {
    expect(areaPath(linePoints(series, 400, PLOT), BASELINE)).toBe(
      'M 40 130 L 122.67 56.25 L 205.33 100.5 L 288 12 L 288 130 L 40 130 Z'
    )
  })

  it('refuses to draw a line from fewer than two points', () => {
    expect(linePoints([{ label: 'Mon', value: 5 }], 400, PLOT)).toEqual([])
    expect(linePath([])).toBe('')
    expect(areaPath([], BASELINE)).toBe('')
  })
})

describe('barLayout', () => {
  it('centers capped-width bars in equal bands', () => {
    const slots = barLayout(7, PLOT)
    expect(slots).toHaveLength(7)
    expect(slots[0]).toEqual({ x: 45.71, width: 24 })
    expect(slots[1]).toEqual({ x: 81.14, width: 24 })
    expect(slots[3]).toEqual({ x: 152, width: 24 })
  })

  it('shrinks below the cap when bands are narrow, keeping the gap', () => {
    const slots = barLayout(31, PLOT)
    // band = 8, width = band − 2px gap
    expect(slots[0].width).toBe(6)
    expect(slots[1].x - slots[0].x).toBe(8)
  })

  it('never collapses a bar below 1 unit wide', () => {
    const slots = barLayout(120, PLOT)
    expect(slots.every((slot) => slot.width >= 1)).toBe(true)
  })

  it('handles empty input', () => {
    expect(barLayout(0, PLOT)).toEqual([])
  })
})

describe('barPath', () => {
  it('rounds the data end and stays square at the baseline', () => {
    expect(barPath(152, 12, 24, 130, 2)).toBe(
      'M 152 130 L 152 14 Q 152 12 154 12 L 174 12 Q 176 12 176 14 L 176 130 Z'
    )
  })

  it('collapses the radius on bars shorter than it', () => {
    expect(barPath(10, 129, 8, 130, 2)).toBe(
      'M 10 130 L 10 130 Q 10 129 11 129 L 17 129 Q 18 129 18 130 L 18 130 Z'
    )
  })

  it('draws a plain rectangle when the radius is 0', () => {
    expect(barPath(10, 100, 8, 130, 0)).toBe('M 10 130 L 10 100 L 18 100 L 18 130 Z')
  })

  it('returns an empty path for a zero-height bar', () => {
    expect(barPath(10, 130, 8, 130)).toBe('')
    expect(barPath(10, 140, 8, 130)).toBe('')
  })
})

describe('donutArc', () => {
  const CIRCUMFERENCE = 276.46 // 2π·44, rounded to 2 decimals

  it('fills the fraction of the circumference', () => {
    expect(donutArc(0.64, 44)).toEqual({ circumference: CIRCUMFERENCE, filled: 176.93 })
    expect(donutArc(0.5, 44)).toEqual({ circumference: CIRCUMFERENCE, filled: 138.23 })
  })

  it('clamps to the full ring and to empty', () => {
    expect(donutArc(1.4, 44).filled).toBe(CIRCUMFERENCE)
    expect(donutArc(1, 44).filled).toBe(CIRCUMFERENCE)
    expect(donutArc(0, 44).filled).toBe(0)
    expect(donutArc(-0.2, 44).filled).toBe(0)
  })

  it('treats non-finite fractions as empty', () => {
    expect(donutArc(NaN, 44).filled).toBe(0)
    expect(donutArc(Infinity, 44).filled).toBe(0)
  })
})
