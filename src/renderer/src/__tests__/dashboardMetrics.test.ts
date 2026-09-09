/**
 * The Stats Dashboard's derivation (ADR-0035 §4/§6): everything the tab shows,
 * computed from one overview snapshot plus the two live goal settings.
 *
 * The two contracts this pins are the ones a UI refactor could quietly break:
 * **averages are derived from raw sums at render** (never stored, §4), and the
 * **quota reads the pinned snapshot after activity** while remaining live
 * before the first session (ADR-0036 §5).
 */

import { describe, expect, it } from 'vitest'
import { deriveDashboard } from '../components/stats/dashboardMetrics'
import type { DayStatsRecord, StatsOverview } from '../types'

const OVERVIEW: StatsOverview = {
  totals: {
    wordsRead: 12_000,
    wallMs: 5_400_000, // 1 h 30 min
    activeMs: 4_800_000, // 80 min
    pauses: 10,
    rewinds: 3,
    sessionCount: 8,
    activeDays: 4,
  },
  today: {
    date: '2026-08-12',
    wordsRead: 800,
    wallMs: 1_080_000, // 18 min
    activeMs: 900_000, // 15 min
    sessionCount: 2,
    quotaTargetWords: 1000,
    quotaPercent: 80,
    quotaMet: false,
    points: 0,
    fluency: 91,
  },
  goals: { dailyPinned: true, weeklyPinned: true, weeklyTargetDays: 5 },
  streak: 3,
  points: 360,
  highscores: {
    bestDayWords: 4200,
    bestSessionFluency: 97,
    longestSessionMs: 1_800_000,
    longestStreak: 5,
  },
}

function derive(overview: StatsOverview | null, quotaPages = 2, weeklyTargetDays = 5) {
  return deriveDashboard({ overview, quotaPages, weeklyTargetDays })
}

describe('Dashboard metrics — lifetime averages', () => {
  it('derives words a day, average session length and Fluency from the raw sums', () => {
    const { lifetime } = derive(OVERVIEW)

    expect(lifetime.wordsPerDay).toBe(12_000 / 4)
    // Active time over sessions, not the 1 h 30 min of session span (§4).
    expect(lifetime.averageSessionMs).toBe(4_800_000 / 8)
    // (2 × 3 rewinds + 10 pauses) ÷ 80 active minutes = 0.2 → round(100 / 1.2).
    expect(lifetime.fluency).toBe(83)
  })

  it('reports both reading-time figures as active time, never wall time', () => {
    const { today, lifetime } = derive(OVERVIEW)

    expect(today.activeMs).toBe(900_000) // 15 min read, not 18 min open
    expect(lifetime.activeMs).toBe(4_800_000) // 80 min read, not 1 h 30 min open
    // The session span is not carried into the view model at all, so no card
    // can quietly go back to reading it.
    expect('wallMs' in today).toBe(false)
    expect('wallMs' in lifetime).toBe(false)
  })

  it('divides by zero nowhere — an empty history averages to 0, not NaN', () => {
    const { lifetime, today } = derive({
      ...OVERVIEW,
      totals: { ...OVERVIEW.totals, wordsRead: 0, wallMs: 0, activeMs: 0, pauses: 0, rewinds: 0, sessionCount: 0, activeDays: 0 },
      today: { ...OVERVIEW.today, wordsRead: 0, wallMs: 0, activeMs: 0, sessionCount: 0 },
    })

    expect(lifetime.wordsPerDay).toBe(0)
    expect(lifetime.averageSessionMs).toBe(0)
    expect(today.wpm).toBe(0)
    // Nothing counted over no time scores the uninterrupted 100; the `active`
    // flag below is what stops the Dashboard from *showing* that as an
    // achievement.
    expect(lifetime.fluency).toBe(100)
    expect(lifetime.active).toBe(false)
  })

  it("derives today's measured WPM from active reading time, not wall time", () => {
    // 800 words ÷ 15 active minutes, not ÷ 18 wall minutes.
    expect(derive(OVERVIEW).today.wpm).toBeCloseTo(800 / 15, 6)
  })
})

describe('Dashboard metrics — quota', () => {
  it('keeps the pinned target and verdict after the live setting changes', () => {
    // Today was judged against 1,000 words; four pages is tomorrow's setting.
    const { quota } = derive(OVERVIEW, 4)

    expect(quota.targetWords).toBe(1000)
    expect(quota.targetPages).toBe(2)
    expect(quota.percent).toBe(80)
    expect(quota.met).toBe(false)
  })

  it('uses the live setting before today has a recorded session', () => {
    const unpinned = {
      ...OVERVIEW,
      goals: { ...OVERVIEW.goals, dailyPinned: false }
    }
    const { quota } = derive(unpinned, 4)

    expect(quota.targetWords).toBe(2000)
    expect(quota.targetPages).toBe(4)
    expect(quota.percent).toBe(40)
  })

  it('keeps the percent and the pages fraction in step', () => {
    const { quota } = derive(OVERVIEW, 2)

    expect(quota.pagesRead).toBe(1.6)
    expect(quota.targetPages).toBe(2)
    expect(quota.percent).toBe(80)
  })

  it('marks a met quota and does not clamp the percent at 100', () => {
    const { quota } = derive(
      { ...OVERVIEW, today: { ...OVERVIEW.today, wordsRead: 2400, quotaMet: true } },
      2
    )

    expect(quota.met).toBe(true)
    expect(quota.percent).toBe(240)
  })

  it('clamps an out-of-range page count through the shared conversion', () => {
    const unpinned = { ...OVERVIEW, goals: { ...OVERVIEW.goals, dailyPinned: false } }
    expect(derive(unpinned, 99).quota.targetPages).toBe(20)
    expect(derive(unpinned, 0).quota.targetPages).toBe(1)
  })

  it('shows an exact odd-word snapshot rather than rounding the scored target', () => {
    const overview = {
      ...OVERVIEW,
      today: { ...OVERVIEW.today, quotaTargetWords: 1200 }
    }
    const { quota } = derive(overview, 8)

    expect(quota.targetWords).toBe(1200)
    expect(quota.targetPages).toBe(2.4)
    expect(quota.percent).toBe(67)
  })
})

function dayRecord(date: string, overrides: Partial<DayStatsRecord> = {}): DayStatsRecord {
  return {
    date,
    wordsRead: 500,
    wallMs: 600_000,
    activeMs: 600_000, // 10 min
    pauses: 0,
    rewinds: 0,
    sessionCount: 1,
    longestSessionMs: 600_000,
    bestSessionFluency: 100,
    quotaTargetWords: 1000,
    weeklyTargetDays: 5,
    quotaMet: false,
    points: 0,
    ...overrides,
  }
}

describe('Dashboard metrics — Today trends', () => {
  // Today (from OVERVIEW): 800 words · 18 min wall · 2 sessions · Fluency 91
  // · 53.3 wpm (800 words over 15 active minutes).
  const TODAY_KEY = '2026-08-12'

  it('judges each figure against the previous active day, skipping rest days', () => {
    const { trends } = deriveDashboard({
      overview: OVERVIEW,
      quotaPages: 2,
      weeklyTargetDays: 5,
      todayKey: TODAY_KEY,
      days: [
        // The stale record: if the baseline picked this, words would read 'up'.
        dayRecord('2026-08-08', { wordsRead: 700 }),
        // The previous active day — Aug 11 was a rest day, so this is it:
        // 1,000 words · 10 min active · 2 sessions · 10 pauses over those 10
        // active minutes (rate 1.0 → Fluency 50) · 100 wpm.
        dayRecord('2026-08-10', {
          wordsRead: 1000,
          wallMs: 900_000,
          activeMs: 600_000,
          sessionCount: 2,
          pauses: 10,
        }),
      ],
    })

    expect(trends.words).toBe('down') // 800 < 1,000
    expect(trends.readingTime).toBe('up') // 15 active min > 10
    expect(trends.sessions).toBe(null) // 2 = 2 — equal stays neutral
    expect(trends.fluency).toBe('up') // 91 > 50
    expect(trends.speed).toBe('down') // 53.3 wpm < 100
  })

  it('codes the reading-time trend on active time, not the session span', () => {
    const { trends } = deriveDashboard({
      overview: OVERVIEW, // today: 18 min open, 15 min read
      quotaPages: 2,
      weeklyTargetDays: 5,
      todayKey: TODAY_KEY,
      // Yesterday the Reader sat open half an hour for ten minutes of reading:
      // wall time would call today a decline, active time calls it a gain.
      days: [dayRecord('2026-08-10', { wallMs: 1_800_000, activeMs: 600_000 })],
    })

    expect(trends.readingTime).toBe('up')
  })

  it("never takes today's own record (or a later one) as the baseline", () => {
    const { trends } = deriveDashboard({
      overview: OVERVIEW,
      quotaPages: 2,
      weeklyTargetDays: 5,
      todayKey: TODAY_KEY,
      days: [dayRecord(TODAY_KEY, { wordsRead: 9999 }), dayRecord('2026-08-13')],
    })

    expect(trends).toEqual({
      words: null,
      readingTime: null,
      sessions: null,
      fluency: null,
      speed: null,
    })
  })

  it('stays neutral when today is inactive, even with history behind it', () => {
    const { trends } = deriveDashboard({
      overview: {
        ...OVERVIEW,
        today: { ...OVERVIEW.today, wordsRead: 0, wallMs: 0, activeMs: 0, sessionCount: 0 },
      },
      quotaPages: 2,
      weeklyTargetDays: 5,
      todayKey: TODAY_KEY,
      days: [dayRecord('2026-08-10')],
    })

    expect(trends.words).toBe(null)
    expect(trends.speed).toBe(null)
  })

  it('stays neutral when no day list is supplied at all', () => {
    expect(derive(OVERVIEW).trends.words).toBe(null)
  })
})

describe('Dashboard metrics — zero history', () => {
  it('marks today and lifetime inactive per section, not globally', () => {
    // History exists, but nothing has been read today.
    const model = derive({
      ...OVERVIEW,
      today: { ...OVERVIEW.today, wordsRead: 0, wallMs: 0, activeMs: 0, sessionCount: 0 },
    })

    expect(model.today.active).toBe(false)
    expect(model.lifetime.active).toBe(true)
    expect(model.highscores.active).toBe(true)
    expect(model.hasHistory).toBe(true)
  })

  it('reads a null overview as no history while keeping the goals', () => {
    const model = derive(null, 3, 6)

    expect(model.hasHistory).toBe(false)
    expect(model.today.active).toBe(false)
    expect(model.highscores.active).toBe(false)
    expect(model.streak).toBe(0)
    expect(model.points).toBe(0)
    // The goals still stand, and the quota is 0% of the target the user set.
    expect(model.quota.targetPages).toBe(3)
    expect(model.quota.percent).toBe(0)
    expect(model.weeklyTargetDays).toBe(6)
  })
})
