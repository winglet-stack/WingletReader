import type { DayStatsRecord, SessionStatsRecord } from '../../types'
import {
  QUOTA_PAGE_WORDS,
  collateMonth,
  collateTotal,
  collateWeek,
  fluencyScore,
  interruptionRate,
  measuredWpm
} from '../../../../shared/statsMath'
import type { StatsBucket } from '../../../../shared/statsMath'
import type { ChartDatum } from './charts/chartMath'
import { formatPageCount, formatReadingTime, formatWordCount } from './statsFormat'

/**
 * Everything the Graphs tab derives, in one pure module (ADR-0035 §6).
 *
 * Three rules shape it:
 *
 * - **`statsMath` does the collation.** `collateWeek/Month/Total` already fold
 *   day records into zero-filled buckets; this module only chooses *which
 *   number* of a bucket a metric plots and what to call the bucket on the axis.
 *   Nothing here re-buckets by date.
 * - **A series value is in its display unit.** `BarChart` labels its axis with
 *   the raw series numbers, so "Time" plots **minutes** rather than
 *   milliseconds — an axis reading `0 / 300,000 / 600,000` would be unusable.
 * - **One metric per screen** (§6). Metrics never combine, so a series is one
 *   number per bucket and the timeframe is the only other axis.
 * - **Time means active time** (ADR-0036 §4). The Time series and every rate
 *   with time in its denominator read `activeMs`; a bucket's `wallMs` is
 *   descriptive and is never plotted.
 *
 * Pure on purpose: no React, no store, no `Date.now()` — the caller passes
 * today's date key, exactly as `statsMath` requires.
 */

/** The seven metric tabs, in tab order. */
export type GraphMetricKey =
  | 'words'
  | 'time'
  | 'points'
  | 'fluency'
  | 'rewinds'
  | 'quota'
  | 'speed'

/** The timeframe switch. `today` is the session-level drill-in. */
export type GraphTimeframe = 'today' | 'week' | 'month' | 'total'

/** Per-bucket bars, or the running total as a line — offered per metric. */
export type GraphView = 'buckets' | 'total'

const MS_PER_MINUTE = 60_000
const MS_PER_HOUR = 3_600_000

/** Monday-first, matching `collateWeek`'s bucket order. */
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
] as const

/**
 * How much history a timeframe needs before it says anything. A single day
 * makes no trend, a week-shaped month chart is mostly empty axis, and a
 * lifetime chart with one monthly bucket is a single bar calling itself
 * history. The thresholds are pinned by tests — they are product judgement,
 * not arithmetic.
 */
export const WEEK_MIN_DAYS = 2
export const MONTH_MIN_DAYS = 8
export const TOTAL_MIN_MONTHS = 2

/**
 * One session's numbers as the drill-in reads them. No `wallMs`: the Graphs
 * tab plots active time everywhere (ADR-0036 §4), so the session span is not
 * part of the slice at all — the record still stores `startedAt`/`endedAt`.
 */
interface SessionSlice {
  wordsRead: number
  activeMs: number
  pauses: number
  rewinds: number
}

export interface GraphMetricDefinition {
  key: GraphMetricKey
  /** Tab label — short, because seven of them share one row at 800px. */
  label: string
  /** What the number is, said in words; the chart's `aria-label` builds on it. */
  caption: string
  /** The unit line under the chart. */
  unit: string
  chart: 'bar' | 'donut'
  /** The bucket's number in display units; null for the donut metric. */
  bucketValue: ((bucket: StatsBucket) => number) | null
  /** One session's number, or null when the metric has no session meaning. */
  sessionValue: ((session: SessionSlice) => number) | null
  /** Whether a running total is meaningful (sums accumulate; rates do not). */
  cumulative: boolean
  /** Display form of a series value, for the value column and the caption. */
  format: (value: number) => string
}

/** Round to one decimal — enough precision for a minute or a rate. */
function tenths(value: number): number {
  return Math.round(value * 10) / 10
}

function minutes(ms: number): number {
  return tenths(ms / MS_PER_MINUTE)
}

/** Rewind events per active reading **hour** — per minute reads as 0.2 forever. */
function rewindRate(input: { rewinds: number; activeMs: number }): number {
  if (input.activeMs <= 0) return 0
  return tenths(input.rewinds / (input.activeMs / MS_PER_HOUR))
}

/**
 * Fluency for a bucket or a session, with the inactive case forced to 0.
 *
 * `interruptionRate` reads "nothing counted, no time spent" as a rate of 0,
 * which scores a perfect 100 — correct as arithmetic, wrong as a chart: a day
 * with no reading would plot a full-height bar. `foldSessionsIntoDay` already
 * makes the same exception for `bestSessionFluency`.
 */
function score(input: { pauses: number; rewinds: number; activeMs: number }): number {
  if (input.activeMs <= 0) return 0
  return fluencyScore(interruptionRate(input))
}

/**
 * The metric table. Ordered as the tabs read: the three sums first (the things
 * that grow), then the three quality rates, with the quota donut between them
 * because it is the goal the sums are measured against.
 */
export const GRAPH_METRICS: readonly GraphMetricDefinition[] = [
  {
    key: 'words',
    label: 'Words',
    caption: 'Words read',
    unit: 'words',
    chart: 'bar',
    bucketValue: (bucket) => bucket.wordsRead,
    sessionValue: (session) => session.wordsRead,
    cumulative: true,
    format: formatWordCount
  },
  {
    key: 'time',
    label: 'Time',
    caption: 'Reading time',
    unit: 'minutes',
    chart: 'bar',
    // Active time, not the session span (ADR-0036 §4) — a chart that counted
    // parked-Reader minutes would rank an idle day above a read one.
    bucketValue: (bucket) => minutes(bucket.activeMs),
    sessionValue: (session) => minutes(session.activeMs),
    cumulative: true,
    format: (value) => formatReadingTime(value * MS_PER_MINUTE)
  },
  {
    key: 'points',
    label: 'Points',
    caption: 'Points earned',
    unit: 'points',
    chart: 'bar',
    bucketValue: (bucket) => bucket.points,
    // Points are awarded per *day*, on the day the quota is met — a session has
    // no share of them, so the drill-in offers none rather than inventing one.
    sessionValue: null,
    cumulative: true,
    format: formatWordCount
  },
  {
    key: 'fluency',
    label: 'Fluency',
    caption: 'Reading Fluency',
    unit: 'score, 0–100',
    chart: 'bar',
    bucketValue: (bucket) => score(bucket),
    sessionValue: (session) => score(session),
    cumulative: false,
    format: (value) => String(Math.round(value))
  },
  {
    key: 'rewinds',
    label: 'Rewinds',
    caption: 'Rewind events an hour',
    unit: 'rewinds an hour',
    chart: 'bar',
    bucketValue: (bucket) => rewindRate(bucket),
    sessionValue: (session) => rewindRate(session),
    cumulative: false,
    format: (value) => `${tenths(value)} an hour`
  },
  {
    key: 'quota',
    label: 'Quota',
    caption: 'Quota completion',
    unit: 'of the quota',
    chart: 'donut',
    bucketValue: null,
    sessionValue: null,
    cumulative: false,
    format: (value) => `${Math.round(value * 100)}%`
  },
  {
    key: 'speed',
    label: 'Speed',
    caption: 'Measured reading speed',
    unit: 'words a minute',
    chart: 'bar',
    bucketValue: (bucket) => Math.round(measuredWpm(bucket)),
    sessionValue: (session) => Math.round(measuredWpm(session)),
    cumulative: false,
    format: (value) => `${Math.round(value).toLocaleString()} wpm`
  }
]

export function metricDefinition(key: GraphMetricKey): GraphMetricDefinition {
  return GRAPH_METRICS.find((metric) => metric.key === key) ?? GRAPH_METRICS[0]
}

/** A session record read as the sums the metrics score on (ADR-0036 §4). */
function sessionSlice(session: SessionStatsRecord): SessionSlice {
  return {
    wordsRead: session.wordsRead,
    activeMs: session.activeMs,
    pauses: session.pauses,
    rewinds: session.rewinds
  }
}

/** Whether a timeframe can be shown, and what to say when it cannot. */
export interface TimeframeAvailability {
  timeframe: GraphTimeframe
  label: string
  enabled: boolean
  /** Why it is unavailable — shown under the switch, empty when enabled. */
  hint: string
}

/** Distinct `'YYYY-MM'` months a day-record set touches. */
function monthsCovered(days: readonly DayStatsRecord[]): number {
  return new Set(days.map((day) => day.date.slice(0, 7))).size
}

/**
 * Which timeframes this history supports, in switch order.
 *
 * **Today** gates on the metric, not the history: it lists sessions, and a
 * metric with no session-level meaning (Points) has nothing to list. The other
 * three gate on day records alone — enough of them to make the shape of the
 * chart mean something (see the threshold constants).
 */
export function timeframeAvailability(
  days: readonly DayStatsRecord[],
  metric: GraphMetricDefinition
): TimeframeAvailability[] {
  const dayCount = days.length
  // The quota donut answers "today" without listing sessions at all.
  const todayAvailable = metric.sessionValue !== null || metric.chart === 'donut'
  return [
    {
      timeframe: 'today',
      label: 'Today',
      enabled: todayAvailable,
      hint: todayAvailable ? '' : 'Points are earned per day, not per session.'
    },
    {
      timeframe: 'week',
      label: 'Week',
      enabled: dayCount >= WEEK_MIN_DAYS,
      hint: dayCount >= WEEK_MIN_DAYS ? '' : `Week needs ${WEEK_MIN_DAYS} days of reading.`
    },
    {
      timeframe: 'month',
      label: 'Month',
      enabled: dayCount >= MONTH_MIN_DAYS,
      hint: dayCount >= MONTH_MIN_DAYS ? '' : `Month needs ${MONTH_MIN_DAYS} days of reading.`
    },
    {
      timeframe: 'total',
      label: 'Total',
      enabled: monthsCovered(days) >= TOTAL_MIN_MONTHS,
      hint:
        monthsCovered(days) >= TOTAL_MIN_MONTHS
          ? ''
          : `Total needs ${TOTAL_MIN_MONTHS} months of history.`
    }
  ]
}

/** The first enabled timeframe, so a metric switch never lands on a dead tab. */
export function firstEnabledTimeframe(
  availability: readonly TimeframeAvailability[]
): GraphTimeframe | null {
  return availability.find((entry) => entry.enabled)?.timeframe ?? null
}

/** The buckets a timeframe collates to. `today` has none — it lists sessions. */
function collateTimeframe(
  days: readonly DayStatsRecord[],
  timeframe: GraphTimeframe,
  todayKey: string
): StatsBucket[] {
  if (timeframe === 'week') return collateWeek(days, todayKey)
  if (timeframe === 'month') return collateMonth(days, todayKey)
  if (timeframe === 'total') return collateTotal(days)
  return []
}

/** Monday-first weekday name for a daily bucket key. */
function weekdayLabel(key: string): string {
  const [year, month, day] = key.split('-').map(Number)
  const weekday = new Date(year, month - 1, day).getDay()
  return WEEKDAY_LABELS[(weekday + 6) % 7]
}

/**
 * The axis caption for a bucket. Week says the weekday, Month the day number
 * (30 of them share one axis — `layoutXLabels` thins them), Total the month and
 * a short year, which is the only place two buckets can share a name.
 */
export function bucketLabel(key: string, timeframe: GraphTimeframe): string {
  if (timeframe === 'week') return weekdayLabel(key)
  if (timeframe === 'month') return String(Number(key.slice(8)))
  const [year, month] = key.split('-').map(Number)
  return `${MONTH_LABELS[month - 1]} '${String(year).slice(2)}`
}

/**
 * The metric's series for a timeframe: one datum per bucket, `key` carried
 * through as the highlight anchor (08's convention — today's date key
 * addresses today's bar without matching on a display label).
 */
export function buildSeries(input: {
  days: readonly DayStatsRecord[]
  metric: GraphMetricDefinition
  timeframe: GraphTimeframe
  todayKey: string
  view?: GraphView
}): ChartDatum[] {
  const { metric } = input
  if (!metric.bucketValue) return []
  const buckets = collateTimeframe(input.days, input.timeframe, input.todayKey)
  const series = buckets.map((bucket) => ({
    label: bucketLabel(bucket.key, input.timeframe),
    value: metric.bucketValue!(bucket),
    key: bucket.key
  }))
  return input.view === 'total' && metric.cumulative ? runningTotal(series) : series
}

/** The same series as a running total — the ADR's growth line. */
export function runningTotal(series: readonly ChartDatum[]): ChartDatum[] {
  let sum = 0
  return series.map((datum) => {
    sum += Number.isFinite(datum.value) && datum.value > 0 ? datum.value : 0
    return { ...datum, value: tenths(sum) }
  })
}

/**
 * The bucket key today falls in, so the bar for today can wear the accent.
 * Monthly buckets are keyed `'YYYY-MM'`; daily ones are the date key itself.
 */
export function highlightKey(timeframe: GraphTimeframe, todayKey: string): string {
  return timeframe === 'total' ? todayKey.slice(0, 7) : todayKey
}

/** One row of the today drill-in. */
export interface SessionRow {
  /** Stable within a render: the session's start instant. */
  key: number
  /** Start time, `HH:MM` on a 24-hour clock. */
  time: string
  title: string
  value: number
  display: string
  /** The value as a share of the day's largest, for the row's bar. */
  fraction: number
}

function clockTime(epochMs: number): string {
  const at = new Date(epochMs)
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
}

/**
 * Today's sessions as compact rows for the selected metric — the only place
 * session-level data is shown (§6). Rows keep the store's oldest-first order:
 * the day reads top to bottom.
 */
export function buildSessionRows(
  sessions: readonly SessionStatsRecord[],
  metric: GraphMetricDefinition
): SessionRow[] {
  if (!metric.sessionValue) return []
  const values = sessions.map((session) => metric.sessionValue!(sessionSlice(session)))
  const max = Math.max(0, ...values)
  return sessions.map((session, index) => ({
    key: session.startedAt,
    time: clockTime(session.startedAt),
    title: session.title,
    value: values[index],
    display: metric.format(values[index]),
    fraction: max > 0 ? Math.min(Math.max(values[index] / max, 0), 1) : 0
  }))
}

/** The donut's fraction plus the sentence under it. */
export interface QuotaCompletion {
  /** Null when there is nothing to divide by — the donut shows its empty state. */
  fraction: number | null
  detail: string
}

/** Days of a bucket list that have actually happened (a month is in progress). */
function elapsedDays(buckets: readonly StatsBucket[], todayKey: string): number {
  const todayMonth = todayKey.slice(0, 7)
  return buckets.reduce((total, bucket) => {
    if (bucket.key.length > 7) return total + (bucket.key <= todayKey ? 1 : 0)
    if (bucket.key > todayMonth) return total
    if (bucket.key === todayMonth) return total + Number(todayKey.slice(8))
    const [year, month] = bucket.key.split('-').map(Number)
    return total + new Date(year, month, 0).getDate()
  }, 0)
}

/**
 * Quota completion for the selected timeframe.
 *
 * **Today is words against the effective target** supplied by StatsView — live
 * before the first session, then pinned exactly as the Dashboard is. **Every
 * other timeframe is quota-met days against the days that have elapsed** in it,
 * so a week where four of six passed days met the quota reads 67%, not 100%
 * because only the days you opened the app were counted.
 */
export function quotaCompletion(input: {
  days: readonly DayStatsRecord[]
  timeframe: GraphTimeframe
  todayKey: string
  quotaTargetWords: number
}): QuotaCompletion {
  if (input.timeframe === 'today') {
    const today = input.days.find((day) => day.date === input.todayKey)
    const wordsRead = today?.wordsRead ?? 0
    const target = Math.max(input.quotaTargetWords, 1)
    return {
      fraction: wordsRead / target,
      detail: `${formatPageCount(wordsRead / QUOTA_PAGE_WORDS)} of ${formatPageCount(
        target / QUOTA_PAGE_WORDS
      )} pages today`
    }
  }

  const buckets = collateTimeframe(input.days, input.timeframe, input.todayKey)
  const metDays = buckets.reduce((total, bucket) => total + bucket.quotaMetDays, 0)
  const elapsed = elapsedDays(buckets, input.todayKey)
  if (elapsed <= 0) return { fraction: null, detail: 'No days to measure yet' }
  return {
    fraction: metDays / elapsed,
    detail: `${metDays.toLocaleString()} of ${elapsed.toLocaleString()} days met the quota`
  }
}
