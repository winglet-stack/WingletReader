/**
 * The Graphs tab's pure derivations (ADR-0035 §6, cascade issue 10).
 *
 * What this suite pins: the metric table and its display units (a "Time" series
 * is **minutes**, because the bar chart labels its axis with the raw series
 * numbers), the timeframe thresholds — product judgement, so they are asserted
 * rather than left to drift — the bucket→series mapping over `statsMath`'s
 * collation, and the two derivations that have no chart component behind them:
 * the today drill-in's rows and the quota donut's fraction.
 */

import { describe, expect, it } from 'vitest'
import type { DayStatsRecord, SessionStatsRecord } from '../types'
import {
  GRAPH_METRICS,
  MONTH_MIN_DAYS,
  TOTAL_MIN_MONTHS,
  WEEK_MIN_DAYS,
  bucketLabel,
  buildSeries,
  buildSessionRows,
  firstEnabledTimeframe,
  highlightKey,
  metricDefinition,
  quotaCompletion,
  runningTotal,
  timeframeAvailability
} from '../components/stats/graphsMetrics'
import type { GraphMetricKey, GraphTimeframe } from '../components/stats/graphsMetrics'

/** 2026-08-12 is a Wednesday; its week runs Mon 08-10 → Sun 08-16. */
const TODAY = '2026-08-12'

function day(date: string, patch: Partial<DayStatsRecord> = {}): DayStatsRecord {
  return {
    date,
    wordsRead: 0,
    wallMs: 0,
    activeMs: 0,
    pauses: 0,
    rewinds: 0,
    sessionCount: 0,
    longestSessionMs: 0,
    bestSessionFluency: 0,
    quotaTargetWords: 1000,
    weeklyTargetDays: 5,
    quotaMet: false,
    points: 0,
    ...patch
  }
}

function session(
  startHour: number,
  patch: Partial<SessionStatsRecord> = {}
): SessionStatsRecord {
  const startedAt = new Date(2026, 7, 12, startHour, 5).getTime()
  return {
    textId: 1,
    title: 'Meditations',
    startedAt,
    endedAt: startedAt + 600_000, // 10 minutes
    wordsRead: 600,
    activeMs: 300_000, // 5 minutes
    pauses: 0,
    rewinds: 0,
    ...patch
  }
}

function metric(key: GraphMetricKey) {
  return metricDefinition(key)
}

function series(key: GraphMetricKey, days: DayStatsRecord[], timeframe: GraphTimeframe) {
  return buildSeries({ days, metric: metric(key), timeframe, todayKey: TODAY })
}

const WEEK_DAYS: DayStatsRecord[] = [
  day('2026-08-10', {
    wordsRead: 1200,
    wallMs: 1_800_000,
    activeMs: 1_200_000,
    pauses: 2,
    rewinds: 1,
    sessionCount: 2,
    quotaMet: true,
    points: 110
  }),
  day('2026-08-12', {
    wordsRead: 800,
    wallMs: 900_000,
    activeMs: 600_000,
    pauses: 1,
    rewinds: 0,
    sessionCount: 1,
    quotaMet: false,
    points: 0
  })
]

describe('graphsMetrics — the metric table', () => {
  it('carries the seven §6 metrics in tab order', () => {
    expect(GRAPH_METRICS.map((entry) => entry.key)).toEqual([
      'words',
      'time',
      'points',
      'fluency',
      'rewinds',
      'quota',
      'speed'
    ])
    expect(GRAPH_METRICS.filter((entry) => entry.chart === 'donut').map((e) => e.key)).toEqual([
      'quota'
    ])
    // Only accumulating sums offer a running total; rates never do.
    expect(GRAPH_METRICS.filter((entry) => entry.cumulative).map((e) => e.key)).toEqual([
      'words',
      'time',
      'points'
    ])
  })

  it('falls back to the first metric for an unknown key', () => {
    expect(metricDefinition('nonsense' as GraphMetricKey).key).toBe('words')
  })
})

describe('graphsMetrics — series over collated buckets', () => {
  it('plots a full Monday→Sunday week, zero-filling the days without records', () => {
    const words = series('words', WEEK_DAYS, 'week')

    expect(words.map((datum) => datum.label)).toEqual([
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun'
    ])
    expect(words.map((datum) => datum.value)).toEqual([1200, 0, 800, 0, 0, 0, 0])
    // The bucket key rides along as 08's highlight anchor.
    expect(words[2].key).toBe(TODAY)
  })

  it('plots time in minutes, not milliseconds', () => {
    // Active minutes (20 and 10), not the 30 and 15 minutes of session span —
    // the Time series is a scored figure and reads active time (ADR-0036 §4).
    expect(series('time', WEEK_DAYS, 'week').map((datum) => datum.value)).toEqual([
      20, 0, 10, 0, 0, 0, 0
    ])
    expect(metric('time').format(30)).toBe('30 min')
  })

  it('derives fluency, rewind rate and speed per bucket', () => {
    const fluency = series('fluency', WEEK_DAYS, 'week')
    // Monday: (2 × 1 rewind + 2 pauses) ÷ 20 active minutes = 0.2 → 100/1.2 = 83.
    expect(fluency[0].value).toBe(83)
    // Wednesday: 1 pause ÷ 10 active minutes = 0.1 → 91.
    expect(fluency[2].value).toBe(91)

    // One rewind in 20 active minutes is three an hour.
    expect(series('rewinds', WEEK_DAYS, 'week')[0].value).toBe(3)
    // 1,200 words ÷ 20 active minutes.
    expect(series('speed', WEEK_DAYS, 'week')[0].value).toBe(60)
  })

  it('plots one bucket per day of the anchor month', () => {
    const month = series('words', WEEK_DAYS, 'month')
    expect(month).toHaveLength(31)
    expect(month[0].label).toBe('1')
    expect(month[30].label).toBe('31')
    expect(month[9].value).toBe(1200) // Aug 10
    expect(month[11].value).toBe(800) // Aug 12
  })

  it('plots one bucket per calendar month for Total, gaps included', () => {
    const total = series(
      'words',
      [day('2026-06-30', { wordsRead: 500 }), day('2026-08-10', { wordsRead: 1200 })],
      'total'
    )
    expect(total.map((datum) => datum.label)).toEqual(["Jun '26", "Jul '26", "Aug '26"])
    expect(total.map((datum) => datum.value)).toEqual([500, 0, 1200])
  })

  it('has no series for the donut metric', () => {
    expect(series('quota', WEEK_DAYS, 'week')).toEqual([])
  })

  it('accumulates the running-total view', () => {
    const total = buildSeries({
      days: WEEK_DAYS,
      metric: metric('words'),
      timeframe: 'week',
      todayKey: TODAY,
      view: 'total'
    })
    expect(total.map((datum) => datum.value)).toEqual([1200, 1200, 2000, 2000, 2000, 2000, 2000])

    // A rate metric ignores the view — a running total of a rate means nothing.
    const rates = buildSeries({
      days: WEEK_DAYS,
      metric: metric('fluency'),
      timeframe: 'week',
      todayKey: TODAY,
      view: 'total'
    })
    expect(rates.map((datum) => datum.value)).toEqual([83, 0, 91, 0, 0, 0, 0])
    expect(runningTotal([{ label: 'a', value: -5 }, { label: 'b', value: 2 }])).toEqual([
      { label: 'a', value: 0 },
      { label: 'b', value: 2 }
    ])
  })

  it('addresses today by its bucket key, monthly buckets included', () => {
    expect(highlightKey('week', TODAY)).toBe(TODAY)
    expect(highlightKey('month', TODAY)).toBe(TODAY)
    expect(highlightKey('total', TODAY)).toBe('2026-08')
    expect(bucketLabel('2026-08-16', 'week')).toBe('Sun')
  })
})

describe('graphsMetrics — timeframe gating', () => {
  function states(days: DayStatsRecord[], key: GraphMetricKey = 'words') {
    return Object.fromEntries(
      timeframeAvailability(days, metric(key)).map((entry) => [entry.timeframe, entry.enabled])
    )
  }

  it('pins the thresholds: 2 days for Week, 8 for Month, 2 months for Total', () => {
    expect([WEEK_MIN_DAYS, MONTH_MIN_DAYS, TOTAL_MIN_MONTHS]).toEqual([2, 8, 2])

    // Three days of data: Week is enabled, Month and Total are not.
    const threeDays = ['2026-08-10', '2026-08-11', '2026-08-12'].map((date) => day(date))
    expect(states(threeDays)).toEqual({ today: true, week: true, month: false, total: false })

    // One day is not yet a week.
    expect(states([day(TODAY)]).week).toBe(false)

    // Eight day records open Month; they are all in one month, so not Total.
    const eightDays = Array.from({ length: 8 }, (_, i) =>
      day(`2026-08-${String(i + 1).padStart(2, '0')}`)
    )
    expect(states(eightDays)).toEqual({ today: true, week: true, month: true, total: false })

    // A second calendar month opens Total.
    expect(states([...eightDays, day('2026-07-30')]).total).toBe(true)
  })

  it('explains every unavailable timeframe', () => {
    const hints = timeframeAvailability([day(TODAY)], metric('words'))
    expect(hints.find((entry) => entry.timeframe === 'week')!.hint).toBe(
      'Week needs 2 days of reading.'
    )
    expect(hints.find((entry) => entry.timeframe === 'month')!.hint).toBe(
      'Month needs 8 days of reading.'
    )
    expect(hints.find((entry) => entry.timeframe === 'total')!.hint).toBe(
      'Total needs 2 months of history.'
    )
    // An enabled timeframe has nothing to explain.
    expect(hints[0].hint).toBe('')
  })

  it('closes Today for Points, which are earned per day and not per session', () => {
    const points = timeframeAvailability(WEEK_DAYS, metric('points'))
    expect(points[0]).toMatchObject({
      timeframe: 'today',
      enabled: false,
      hint: 'Points are earned per day, not per session.'
    })
    // The quota donut answers "today" without listing sessions at all.
    expect(timeframeAvailability(WEEK_DAYS, metric('quota'))[0].enabled).toBe(true)
  })

  it('names the first available timeframe, or none at all', () => {
    expect(firstEnabledTimeframe(timeframeAvailability(WEEK_DAYS, metric('points')))).toBe('week')
    expect(firstEnabledTimeframe(timeframeAvailability([], metric('points')))).toBeNull()
  })
})

describe('graphsMetrics — today drill-in', () => {
  const sessions = [
    session(9, { title: 'Meditations', wordsRead: 600 }),
    session(14, { title: 'The Odyssey', wordsRead: 300, rewinds: 2, pauses: 1 })
  ]

  it('renders one row per session, scaled against the day’s largest', () => {
    const rows = buildSessionRows(sessions, metric('words'))
    expect(rows.map((row) => [row.time, row.title, row.display])).toEqual([
      ['09:05', 'Meditations', '600'],
      ['14:05', 'The Odyssey', '300']
    ])
    expect(rows.map((row) => row.fraction)).toEqual([1, 0.5])
  })

  it('derives each metric from the session’s own sums, on active time', () => {
    // 5 active minutes inside a 10-minute session span (ADR-0036 §4).
    expect(buildSessionRows(sessions, metric('time'))[0].display).toBe('5 min')
    // 600 words ÷ 5 active minutes.
    expect(buildSessionRows(sessions, metric('speed'))[0].display).toBe('120 wpm')
    // (2 × 2 rewinds + 1 pause) ÷ 5 active minutes = 1 → 50.
    expect(buildSessionRows(sessions, metric('fluency'))[1].display).toBe('50')
    // 2 rewinds in 5 active minutes is 24 an hour.
    expect(buildSessionRows(sessions, metric('rewinds'))[1].display).toBe('24 an hour')
  })

  it('offers no rows for a metric with no session-level meaning', () => {
    expect(buildSessionRows(sessions, metric('points'))).toEqual([])
    expect(buildSessionRows([], metric('words'))).toEqual([])
  })
})

describe('graphsMetrics — quota donut', () => {
  it('reads today as words against the live target', () => {
    const quota = quotaCompletion({
      days: WEEK_DAYS,
      timeframe: 'today',
      todayKey: TODAY,
      quotaTargetWords: 1000
    })
    expect(quota.fraction).toBe(0.8)
    expect(quota.detail).toBe('1.6 of 2 pages today')

    // Raising the quota moves the donut without touching any stored record.
    expect(
      quotaCompletion({
        days: WEEK_DAYS,
        timeframe: 'today',
        todayKey: TODAY,
        quotaTargetWords: 2000
      }).fraction
    ).toBe(0.4)
  })

  it('reads a week as quota-met days against the days that have elapsed', () => {
    // Mon–Wed have passed; Monday met the quota, Wednesday did not.
    const quota = quotaCompletion({
      days: WEEK_DAYS,
      timeframe: 'week',
      todayKey: TODAY,
      quotaTargetWords: 1000
    })
    expect(quota.fraction).toBeCloseTo(1 / 3, 5)
    expect(quota.detail).toBe('1 of 3 days met the quota')
  })

  it('counts whole past months and the elapsed part of the current one', () => {
    const quota = quotaCompletion({
      days: [day('2026-07-04', { quotaMet: true }), day('2026-08-10', { quotaMet: true })],
      timeframe: 'total',
      todayKey: TODAY,
      quotaTargetWords: 1000
    })
    // All 31 days of July, plus the 12 of August that have happened.
    expect(quota.detail).toBe('2 of 43 days met the quota')
  })

  it('shows no fraction when there is nothing to divide by', () => {
    expect(
      quotaCompletion({ days: [], timeframe: 'total', todayKey: TODAY, quotaTargetWords: 1000 })
    ).toEqual({ fraction: null, detail: 'No days to measure yet' })
  })
})
