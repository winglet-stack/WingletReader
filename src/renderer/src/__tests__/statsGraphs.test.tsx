/**
 * The Stats screen's Graphs tab (ADR-0035 §6, cascade issue 10) at the view
 * seam: the real `StatsView` over stubbed `db.getStatsDays()` /
 * `db.getTodaySessionStats()` reads, so what is asserted is what the collation
 * actually puts on screen — one metric per chart, the timeframe gating, and
 * the today drill-in.
 *
 * The clock is pinned to a Wednesday (2026-08-12) because every collation is
 * anchored on today's local date key: the week runs Mon 08-10 → Sun 08-16.
 *
 * Environment: happy-dom (matched by vitest.config.ts environmentMatchGlobs).
 */

import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import StatsView from '../components/stats/StatsView'
import { StatsGraphsBody } from '../components/stats/StatsGraphs'
import { SettingsProvider } from '../contexts/SettingsContext'
import { DEFAULT_SETTINGS } from '../types'
import type { DayStatsRecord, SessionStatsRecord, Settings, StatsOverview } from '../types'

const NOW = new Date(2026, 7, 12, 15, 0).getTime()
const TODAY = '2026-08-12'

const OVERVIEW: StatsOverview = {
  totals: {
    wordsRead: 2000,
    wallMs: 2_700_000,
    activeMs: 1_800_000,
    pauses: 3,
    rewinds: 1,
    sessionCount: 3,
    activeDays: 3,
  },
  today: {
    date: TODAY,
    wordsRead: 800,
    wallMs: 900_000,
    activeMs: 600_000,
    sessionCount: 1,
    quotaTargetWords: 1000,
    quotaPercent: 80,
    quotaMet: false,
    points: 0,
    fluency: 91,
  },
  goals: { dailyPinned: true, weeklyPinned: true, weeklyTargetDays: 5 },
  streak: 1,
  points: 110,
  highscores: { bestDayWords: 1200, bestSessionFluency: 91, longestSessionMs: 900_000, longestStreak: 2 },
}

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
    ...patch,
  }
}

/** Three days of this week — enough for Week, not for Month or Total. */
const THREE_DAYS: DayStatsRecord[] = [
  day('2026-08-10', {
    wordsRead: 1200,
    wallMs: 1_800_000,
    activeMs: 1_200_000,
    pauses: 2,
    rewinds: 1,
    sessionCount: 2,
    quotaMet: true,
    points: 110,
  }),
  day('2026-08-11'),
  day(TODAY, {
    wordsRead: 800,
    wallMs: 900_000,
    activeMs: 600_000,
    pauses: 1,
    sessionCount: 1,
  }),
]

/** Nine days across two calendar months — enough for every timeframe. */
const LONG_HISTORY: DayStatsRecord[] = [
  day('2026-07-30', { wordsRead: 700, activeMs: 600_000, sessionCount: 1, quotaMet: false }),
  ...Array.from({ length: 8 }, (_, index) =>
    day(`2026-08-0${index + 1}`, {
      wordsRead: 500 + index * 100,
      wallMs: 600_000,
      activeMs: 480_000,
      sessionCount: 1,
      quotaMet: index % 2 === 0,
      points: index % 2 === 0 ? 100 : 0,
    })
  ),
]

function session(hour: number, patch: Partial<SessionStatsRecord> = {}): SessionStatsRecord {
  const startedAt = new Date(2026, 7, 12, hour, 5).getTime()
  return {
    textId: 1,
    title: 'Meditations',
    startedAt,
    endedAt: startedAt + 600_000,
    wordsRead: 600,
    activeMs: 300_000,
    pauses: 0,
    rewinds: 0,
    ...patch,
  }
}

const SESSIONS: SessionStatsRecord[] = [
  session(9, { title: 'Meditations', wordsRead: 600 }),
  session(14, { title: 'The Odyssey', wordsRead: 300, pauses: 1, rewinds: 2 }),
]

function stubApi(
  days: DayStatsRecord[],
  sessions: SessionStatsRecord[] = SESSIONS,
  overview: StatsOverview = OVERVIEW
) {
  vi.stubGlobal('api', {
    db: {
      getStatsOverview: vi.fn().mockResolvedValue(overview),
      getStatsDays: vi.fn().mockResolvedValue(days),
      getTodaySessionStats: vi.fn().mockResolvedValue(sessions),
      saveSettings: vi.fn(async (patch: Partial<Settings>) => ({ ...DEFAULT_SETTINGS, ...patch })),
    },
  })
}

/** Mounts the screen and opens the Graphs tab. */
async function openGraphs(settings: Partial<Settings> = {}) {
  const container = { current: null as HTMLElement | null }
  await act(async () => {
    const result = render(
      <SettingsProvider initialSettings={{ ...DEFAULT_SETTINGS, ...settings } as Settings}>
        <StatsView />
      </SettingsProvider>
    )
    container.current = result.container
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Graphs' }))
  })
  return container.current as HTMLElement
}

function pill(group: string, label: string): HTMLButtonElement {
  return within(screen.getByRole('group', { name: group })).getByRole('button', {
    name: label,
  }) as HTMLButtonElement
}

async function click(button: HTMLElement) {
  await act(async () => {
    fireEvent.click(button)
  })
}

function chart(): SVGElement {
  return document.querySelector('.stats-graphs [role="img"]') as SVGElement
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Stats screen — Graphs tab, metric tabs', () => {
  it('plots each metric from the collated day records, one metric per screen', async () => {
    stubApi(LONG_HISTORY)
    await openGraphs()
    await click(pill('Timeframe', 'Week'))

    // Words — the week's seven buckets, Monday first, zero-filled.
    expect(chart().getAttribute('aria-label')).toBe('Words read — week')
    for (const weekday of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      expect(chart().textContent).toContain(weekday)
    }

    const cases: Array<[string, string, string]> = [
      // tab, chart aria-label, a caption phrase that pins the unit
      ['Time', 'Reading time — week', 'minutes'],
      ['Points', 'Points earned — week', 'points'],
      ['Fluency', 'Reading Fluency — week', 'score, 0–100'],
      ['Rewinds', 'Rewind events an hour — week', 'rewinds an hour'],
      ['Speed', 'Measured reading speed — week', 'words a minute'],
    ]
    for (const [tab, label, unit] of cases) {
      await click(pill('Metric', tab))
      expect(chart().getAttribute('aria-label')).toBe(label)
      expect(document.querySelector('.stats-graphs-caption')!.textContent).toContain(unit)
    }
  })

  it('shows today against the pinned target, but stays live before the pin', async () => {
    stubApi(THREE_DAYS)
    await openGraphs()
    await click(pill('Metric', 'Quota'))

    // 800 of today's 1,000-word quota.
    expect(chart().getAttribute('aria-label')).toBe('Quota completion — today')
    expect(chart().textContent).toContain('80%')
    expect(document.querySelector('.stats-graphs-caption')!.textContent).toBe(
      '1.6 of 2 pages today'
    )

    // A different live setting is tomorrow's value after today's pin.
    cleanup()
    stubApi(THREE_DAYS)
    await openGraphs({ daily_word_quota: 2000 })
    await click(pill('Metric', 'Quota'))
    expect(chart().textContent).toContain('80%')

    // Before the first session, the same edit applies immediately.
    cleanup()
    stubApi(THREE_DAYS, SESSIONS, {
      ...OVERVIEW,
      goals: { ...OVERVIEW.goals, dailyPinned: false }
    })
    await openGraphs({ daily_word_quota: 2000 })
    await click(pill('Metric', 'Quota'))
    expect(chart().textContent).toContain('40%')
  })

  it('offers a running total for the sums and switches the chart with it', async () => {
    stubApi(LONG_HISTORY)
    const container = await openGraphs()
    await click(pill('Timeframe', 'Week'))

    await click(pill('Series', 'Running total'))
    expect(chart().getAttribute('aria-label')).toBe('Words read — week, running total')
    // The line chart draws one stroked path; bars are filled.
    expect(container.querySelector('path[stroke="var(--cobalt-accent)"]')).toBeTruthy()

    // A rate has no meaningful running total, so the toggle is not offered.
    await click(pill('Metric', 'Fluency'))
    expect(screen.queryByRole('group', { name: 'Series' })).toBeNull()
  })
})

describe('Stats screen — Graphs tab, timeframe gating', () => {
  it('enables Week on three days and explains what Month and Total still need', async () => {
    stubApi(THREE_DAYS)
    await openGraphs()

    expect(pill('Timeframe', 'Today').disabled).toBe(false)
    expect(pill('Timeframe', 'Week').disabled).toBe(false)
    expect(pill('Timeframe', 'Month').disabled).toBe(true)
    expect(pill('Timeframe', 'Total').disabled).toBe(true)
    expect(document.querySelector('.stats-graphs-hint')!.textContent).toBe(
      'Month needs 8 days of reading.'
    )
  })

  it('opens Month and Total once the history reaches them', async () => {
    stubApi(LONG_HISTORY)
    await openGraphs()

    expect(pill('Timeframe', 'Month').disabled).toBe(false)
    expect(pill('Timeframe', 'Total').disabled).toBe(false)
    expect(document.querySelector('.stats-graphs-hint')!.textContent).toBe('')

    await click(pill('Timeframe', 'Total'))
    // One bucket per calendar month, gaps included.
    expect(chart().textContent).toContain("Jul '26")
    expect(chart().textContent).toContain("Aug '26")
  })

  it('moves off a timeframe the chosen metric cannot show', async () => {
    stubApi(LONG_HISTORY)
    await openGraphs()
    expect(pill('Timeframe', 'Today').getAttribute('aria-pressed')).toBe('true')

    await click(pill('Metric', 'Points'))
    // Points are a per-day award, so Today closes and the week takes over.
    expect(pill('Timeframe', 'Today').disabled).toBe(true)
    expect(pill('Timeframe', 'Week').getAttribute('aria-pressed')).toBe('true')
    expect(chart().getAttribute('aria-label')).toBe('Points earned — week')
    expect(document.querySelector('.stats-graphs-hint')!.textContent).toBe(
      'Points are earned per day, not per session.'
    )
  })

  it('says so plainly when no timeframe has anything to show', async () => {
    stubApi([], [])
    await openGraphs()
    await click(pill('Metric', 'Points'))

    expect(screen.getByRole('status').textContent).toBe('Not enough history yet.')
  })
})

describe('Stats screen — Graphs tab, today drill-in', () => {
  it('lists today’s sessions for the selected metric', async () => {
    stubApi(THREE_DAYS)
    await openGraphs()

    const list = screen.getByRole('list', { name: "Today's sessions — Words read" })
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('09:05')
    expect(rows[0].textContent).toContain('Meditations')
    expect(rows[0].textContent).toContain('600')
    expect(rows[1].textContent).toContain('14:05')
    expect(rows[1].textContent).toContain('The Odyssey')

    // The same rows, re-read for another metric.
    await click(pill('Metric', 'Speed'))
    const speeds = within(
      screen.getByRole('list', { name: "Today's sessions — Measured reading speed" })
    ).getAllByRole('listitem')
    expect(speeds[0].textContent).toContain('120 wpm')
    expect(speeds[1].textContent).toContain('60 wpm')
  })

  it('caps the list so a long reading day cannot grow the page', async () => {
    const many = Array.from({ length: 11 }, (_, index) =>
      session(8 + index, { title: `Session ${index + 1}`, wordsRead: 100 * (index + 1) })
    )
    stubApi(THREE_DAYS, many)
    await openGraphs()

    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(8)
    expect(document.querySelector('.stats-graphs-caption')!.textContent).toContain(
      '3 more sessions today'
    )
  })

  it('invites the first session of the day rather than drawing an empty chart', async () => {
    stubApi(THREE_DAYS, [])
    await openGraphs()

    expect(screen.getByRole('status').textContent).toBe('No sessions recorded today yet.')
  })

  /**
   * The body takes its history as props and reads nothing itself — which is
   * what lets the fit harness render the real markup without a bridge, and
   * what keeps the one store read in the wiring half.
   */
  it('renders from props alone, with no bridge present', () => {
    render(
      <StatsGraphsBody
        days={THREE_DAYS}
        sessions={SESSIONS}
        todayKey={TODAY}
        quotaTargetWords={1000}
      />
    )
    expect(window.api).toBeUndefined()
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(2)
  })

  it('reads the history once per visit to the tab — pill toggles add nothing', async () => {
    stubApi(THREE_DAYS)
    await openGraphs()

    await click(pill('Metric', 'Fluency'))
    await click(pill('Timeframe', 'Week'))
    // Two day-list reads: the Dashboard's trend baseline on mount, then the
    // Graphs tab's own on open. The session list is Graphs-only. Neither is
    // re-read for a metric or timeframe change.
    expect(window.api.db.getStatsDays).toHaveBeenCalledTimes(2)
    expect(window.api.db.getTodaySessionStats).toHaveBeenCalledTimes(1)
  })
})
