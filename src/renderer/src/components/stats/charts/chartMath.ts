/**
 * Chart math — pure geometry for the hand-rolled stats SVG charts (ADR-0035 §6).
 *
 * Deliberately pure: no React, no DOM, no tokens — every function maps numbers
 * to numbers (or to SVG path strings) so the components stay thin and all
 * scaling, tick and arc math is pinned by plain unit tests. Mirrors the
 * `statsMath` clamping rule: a negative or non-finite value contributes 0
 * rather than poisoning the geometry.
 */

/**
 * One chart datum. Structural on purpose so issue 10 can feed collated day
 * buckets straight in: `label` is the axis caption, `value` the magnitude,
 * `key` an optional stable anchor (e.g. a `'YYYY-MM-DD'` day key) used to
 * address a bucket — highlighting "today" — without relying on display labels.
 */
export interface ChartDatum {
  label: string
  value: number
  key?: string
}

/** The rectangle marks are drawn into, in viewBox units (axes live outside). */
export interface PlotRect {
  left: number
  top: number
  width: number
  height: number
}

/** A positioned point in viewBox units, paired with its source index. */
export interface PlottedPoint {
  x: number
  y: number
  index: number
}

/** Clamp a datum value: finite and ≥ 0, else 0. */
export function sanitizeValue(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0
}

/**
 * The 1/2/5 "nice step" ladder: the step whose multiples make clean axis
 * ticks (0 / 200 / 400 …, never 0 / 234 / 468). Rounds to the nearest rung
 * rather than up, so a target of 4 intervals lands at 3–6 real ones.
 */
export function niceStep(rawStep: number): number {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 1
  const exponent = Math.floor(Math.log10(rawStep))
  const base = Math.pow(10, exponent)
  const fraction = rawStep / base
  const nice = fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10
  return nice * base
}

/**
 * Y-axis scale for a value range starting at 0 (every stats series is a
 * magnitude, so the baseline is always 0 — a truncated axis would overstate
 * change). Returns the padded axis maximum and the full tick list, 0 and the
 * maximum included. An all-zero series still gets a `0..1` axis so bars and
 * lines have a frame to sit in.
 */
export function computeTicks(
  maxValue: number,
  targetCount = 4
): { max: number; ticks: number[] } {
  const max = sanitizeValue(maxValue)
  if (max === 0) return { max: 1, ticks: [0, 1] }
  const step = niceStep(max / targetCount)
  const axisMax = step * Math.ceil(max / step)
  const ticks: number[] = []
  // Multiply from integers instead of accumulating floats so 0.1-sized steps
  // don't drift (0.30000000000000004 makes an ugly tick label).
  const count = Math.round(axisMax / step)
  for (let i = 0; i <= count; i++) ticks.push(i * step)
  return { max: axisMax, ticks }
}

/** Map a value onto the plot's y pixel (0 sits on the baseline, max on top). */
export function scaleY(value: number, axisMax: number, rect: PlotRect): number {
  const fraction = axisMax > 0 ? sanitizeValue(value) / axisMax : 0
  return rect.top + rect.height * (1 - Math.min(fraction, 1))
}

/** Thousands-comma tick label (937 → "937", 12000 → "12,000"). */
export function formatTick(value: number): string {
  return value.toLocaleString('en-US')
}

/**
 * Which x labels to draw when there are too many buckets to caption them all
 * (a month view has ~30). Picks up to `maxLabels` indices spread evenly,
 * always including the first and last so the axis range stays readable.
 */
export function xLabelIndices(count: number, maxLabels = 7): number[] {
  if (count <= 0) return []
  if (count <= maxLabels) return Array.from({ length: count }, (_, i) => i)
  const indices = new Set<number>()
  const step = (count - 1) / (maxLabels - 1)
  for (let i = 0; i < maxLabels; i++) indices.add(Math.round(i * step))
  return [...indices].sort((a, b) => a - b)
}

/** One x-axis caption the chart should actually draw. */
export interface XLabel {
  /** Index into the series this caption belongs to. */
  index: number
  /** Anchor x in viewBox units. */
  x: number
  anchor: 'start' | 'middle' | 'end'
}

/**
 * Rough rendered width of an axis caption in viewBox units. Sans glyphs
 * average ~0.6em; overestimating slightly is the safe direction — a dropped
 * caption is quieter than two overprinting ones.
 */
function estimateLabelWidth(label: string, fontSize: number): number {
  return label.length * fontSize * 0.6
}

/**
 * Which x captions to draw, where, and with what anchor. Starts from the
 * evenly-spread {@link xLabelIndices} candidates, centers each on its anchor
 * (clamping to `start`/`end` where a centered caption would spill past the
 * viewBox edge), then drops interior captions whose estimated span would
 * collide with an already-kept neighbour or with the always-kept last
 * caption — date captions are wide, and "Aug 11Aug 12" is worse than one
 * fewer tick. First and last always survive so the axis range stays read.
 */
export function layoutXLabels(
  labels: readonly string[],
  positions: readonly number[],
  {
    viewWidth,
    fontSize = 9,
    maxLabels = 7,
    minGap = 4,
    edgePad = 2
  }: { viewWidth: number; fontSize?: number; maxLabels?: number; minGap?: number; edgePad?: number }
): XLabel[] {
  const candidates = xLabelIndices(labels.length, maxLabels).map((index) => {
    const width = estimateLabelWidth(labels[index], fontSize)
    const x = positions[index]
    let anchor: XLabel['anchor'] = 'middle'
    let left = x - width / 2
    if (left < edgePad) {
      anchor = 'start'
      left = x
    } else if (x + width / 2 > viewWidth - edgePad) {
      anchor = 'end'
      left = x - width
    }
    return { index, x, anchor, left, right: left + width }
  })
  if (candidates.length <= 2) {
    return candidates.map(({ index, x, anchor }) => ({ index, x, anchor }))
  }
  const last = candidates[candidates.length - 1]
  const kept = [candidates[0]]
  for (const candidate of candidates.slice(1, -1)) {
    const previous = kept[kept.length - 1]
    if (candidate.left >= previous.right + minGap && candidate.right + minGap <= last.left) {
      kept.push(candidate)
    }
  }
  kept.push(last)
  return kept.map(({ index, x, anchor }) => ({ index, x, anchor }))
}

/** Evenly-spaced line points across the plot (needs ≥ 2 points for spacing). */
export function linePoints(
  series: readonly ChartDatum[],
  axisMax: number,
  rect: PlotRect
): PlottedPoint[] {
  if (series.length < 2) return []
  return series.map((datum, index) => ({
    x: rect.left + (index / (series.length - 1)) * rect.width,
    y: scaleY(datum.value, axisMax, rect),
    index
  }))
}

/** Round to 2 decimals — keeps path strings short and test fixtures exact. */
function px(n: number): number {
  return Math.round(n * 100) / 100
}

/** SVG path through the points: `M x y L x y …`. */
export function linePath(points: readonly PlottedPoint[]): string {
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${px(p.x)} ${px(p.y)}`)
    .join(' ')
}

/** The line path closed down to the baseline, for the optional area wash. */
export function areaPath(points: readonly PlottedPoint[], baselineY: number): string {
  if (points.length === 0) return ''
  const first = points[0]
  const last = points[points.length - 1]
  return `${linePath(points)} L ${px(last.x)} ${px(baselineY)} L ${px(first.x)} ${px(baselineY)} Z`
}

/** One bar's horizontal placement, in viewBox units. */
export interface BarSlot {
  x: number
  width: number
}

/**
 * Band layout for `count` bars: each bar centered in an equal band, capped at
 * `maxBarWidth` so a 3-bucket week doesn't render slabs, with at least a
 * `gap` of surface between neighbours so touching bars stay distinct.
 */
export function barLayout(
  count: number,
  rect: PlotRect,
  { gap = 2, maxBarWidth = 24 }: { gap?: number; maxBarWidth?: number } = {}
): BarSlot[] {
  if (count <= 0) return []
  const band = rect.width / count
  const width = Math.max(Math.min(band - gap, maxBarWidth), 1)
  return Array.from({ length: count }, (_, i) => ({
    x: px(rect.left + band * i + (band - width) / 2),
    width: px(width)
  }))
}

/**
 * A bar as a path: rounded at the data end, square at the baseline (the
 * rounded end marks where the data stops; the baseline is shared ground).
 * The radius collapses when the bar is too short or too thin to carry it.
 */
export function barPath(
  x: number,
  yTop: number,
  width: number,
  baselineY: number,
  radius = 2
): string {
  const height = Math.max(baselineY - yTop, 0)
  const r = Math.min(radius, height, width / 2)
  const left = px(x)
  const right = px(x + width)
  const top = px(yTop)
  const bottom = px(baselineY)
  if (height === 0) return ''
  if (r <= 0) {
    return `M ${left} ${bottom} L ${left} ${top} L ${right} ${top} L ${right} ${bottom} Z`
  }
  return (
    `M ${left} ${bottom} L ${left} ${px(yTop + r)} ` +
    `Q ${left} ${top} ${px(x + r)} ${top} ` +
    `L ${px(x + width - r)} ${top} ` +
    `Q ${right} ${top} ${right} ${px(yTop + r)} ` +
    `L ${right} ${bottom} Z`
  )
}

/**
 * Progress-donut arc via stroke-dasharray on a circle: the filled dash is the
 * fraction of the circumference, the remainder stays unpainted track. The
 * circle is rotated −90° at render time so the arc starts at 12 o'clock.
 * Fractions clamp to [0, 1] — an over-quota day fills the ring and says the
 * rest with its centered label.
 */
export function donutArc(
  fraction: number,
  radius: number
): { circumference: number; filled: number } {
  const circumference = px(2 * Math.PI * radius)
  const clamped = Number.isFinite(fraction) ? Math.min(Math.max(fraction, 0), 1) : 0
  return { circumference, filled: px(clamped * circumference) }
}
