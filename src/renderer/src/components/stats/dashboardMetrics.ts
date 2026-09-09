import type { DayStatsRecord, StatsHighscores, StatsOverview } from '../../types'
import {
  QUOTA_PAGE_WORDS,
  fluencyScore,
  interruptionRate,
  measuredWpm,
  quotaWordsFromPages
} from '../../../../shared/statsMath'
import {
  effectiveDailyQuotaWords,
  effectiveWeeklyTargetDays
} from '../settings/readingGoals'

/**
 * Everything the Dashboard tab shows, derived in one place from the single
 * `getStatsOverview` snapshot plus the two live goal settings (ADR-0035 §6),
 * and — for the Today card's trend coding only — the day-record list.
 *
 * Three rules shape this module:
 *
 * - **Every time figure is active time** (ADR-0036 §4). Today's reading time,
 *   the lifetime total and the average session all read `activeMs`; the
 *   overview's `wallMs` is descriptive session-span data and is not read here.
 *
 * - **Averages are derived here, never stored** (§4). The overview carries raw
 *   sums; words-a-day, average session length and lifetime Fluency are computed
 *   at render from those sums, so nothing can drift out of step with them.
 * - **Goal progress reads the scoring-period snapshot after its pin.** Before
 *   today's first session the live setting applies; afterward the quota card
 *   keeps the exact stored word target and verdict until tomorrow (§5).
 *
 * `active` flags carry the zero-history verdict per section rather than one
 * global one: a user with weeks of history but no reading yet today gets real
 * lifetime numbers beside an em-dashed Today.
 */

/** Today's quota progress, in both the percent and the page unit. */
export interface DashboardQuota {
  /** Whole percent of the displayed target; **not** clamped at 100. */
  percent: number
  /** Words read today — the numerator. */
  wordsRead: number
  /** Quota pages read so far, fractional (1.6 of 2). */
  pagesRead: number
  /** The displayed page target and the words it stands for. */
  targetPages: number
  targetWords: number
  met: boolean
}

/** Today's measured facts. */
export interface DashboardToday {
  /** False when today has no sessions — the section shows placeholders. */
  active: boolean
  wordsRead: number
  pagesRead: number
  /** Today's reading time — **active**, never wall (ADR-0036 §4). */
  activeMs: number
  sessionCount: number
  fluency: number
  /** Measured WPM over today's active reading time. */
  wpm: number
  points: number
}

/** Lifetime sums and the three averages derived from them. */
export interface DashboardLifetime {
  /** False when nothing has ever been recorded. */
  active: boolean
  wordsRead: number
  /** Lifetime reading time — **active**, never wall (ADR-0036 §4). */
  activeMs: number
  activeDays: number
  sessionCount: number
  /** Words read ÷ active days. */
  wordsPerDay: number
  /** Active reading time ÷ session count. */
  averageSessionMs: number
  /** Reading Fluency over the lifetime sums. */
  fluency: number
}

export interface DashboardHighscores extends StatsHighscores {
  /** False when nothing has ever been recorded. */
  active: boolean
}

/** One Today figure against the previous active day: up, down, or no signal. */
export type Trend = 'up' | 'down' | null

/**
 * Green/red verdicts for the Today card's measured rows, each today's figure
 * vs the **previous active day** — the most recent day record before today,
 * skipping rest days, so a day off never turns the whole card green against
 * an empty yesterday. All null when today is inactive, no earlier record
 * exists, or the day list wasn't supplied.
 *
 * Today only: Lifetime and Highscores figures are monotonic (they can only
 * grow), so an increase/decrease verdict would be permanently "up" there.
 */
export interface DashboardTrends {
  words: Trend
  readingTime: Trend
  sessions: Trend
  fluency: Trend
  speed: Trend
}

export interface DashboardModel {
  quota: DashboardQuota
  streak: number
  /** Lifetime points. */
  points: number
  /** The effective target governing this Monday-based week. */
  weeklyTargetDays: number
  today: DashboardToday
  lifetime: DashboardLifetime
  highscores: DashboardHighscores
  /** Today vs the previous active day; all null without a baseline. */
  trends: DashboardTrends
  /** False when no session has ever been recorded. */
  hasHistory: boolean
}

export interface DashboardInput {
  /** Null while the bridge is absent or the read failed — reads as no history. */
  overview: StatsOverview | null
  /** The live quota, in displayed quota pages. */
  quotaPages: number
  /** The live weekly target, in quota-met days per week. */
  weeklyTargetDays: number
  /**
   * Day records for the trend baseline (any order; only dates before
   * `todayKey` are considered). Omit both to skip trend coding entirely —
   * every trend derives as null.
   */
  days?: readonly DayStatsRecord[]
  /** Local date key (`'YYYY-MM-DD'`) the baseline must precede. */
  todayKey?: string
}

/** Clamp to a finite, non-negative number — the same rule `statsMath` applies. */
function nonNegative(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

function ratio(total: number, count: number): number {
  return count > 0 ? total / count : 0
}

function deriveQuota(
  overview: StatsOverview | null,
  wordsRead: number,
  quotaPages: number
): DashboardQuota {
  const targetWords = Math.max(
    effectiveDailyQuotaWords(overview, quotaWordsFromPages(quotaPages)),
    1
  )
  const targetPages = targetWords / QUOTA_PAGE_WORDS
  return {
    percent: Math.round((wordsRead / targetWords) * 100),
    wordsRead,
    pagesRead: wordsRead / QUOTA_PAGE_WORDS,
    targetPages,
    targetWords,
    met: overview?.goals.dailyPinned ? overview.today.quotaMet : wordsRead >= targetWords
  }
}

function deriveToday(overview: StatsOverview | null): DashboardToday {
  const today = overview?.today
  const wordsRead = nonNegative(today?.wordsRead)
  const activeMs = nonNegative(today?.activeMs)
  return {
    active: nonNegative(today?.sessionCount) > 0,
    wordsRead,
    pagesRead: wordsRead / QUOTA_PAGE_WORDS,
    activeMs,
    sessionCount: nonNegative(today?.sessionCount),
    fluency: nonNegative(today?.fluency),
    wpm: measuredWpm({ wordsRead, activeMs }),
    points: nonNegative(today?.points)
  }
}

function deriveLifetime(overview: StatsOverview | null): DashboardLifetime {
  const totals = overview?.totals
  const wordsRead = nonNegative(totals?.wordsRead)
  const activeMs = nonNegative(totals?.activeMs)
  const activeDays = nonNegative(totals?.activeDays)
  const sessionCount = nonNegative(totals?.sessionCount)
  return {
    active: sessionCount > 0,
    wordsRead,
    activeMs,
    activeDays,
    sessionCount,
    wordsPerDay: ratio(wordsRead, activeDays),
    averageSessionMs: ratio(activeMs, sessionCount),
    fluency: fluencyScore(
      interruptionRate({
        pauses: nonNegative(totals?.pauses),
        rewinds: nonNegative(totals?.rewinds),
        activeMs
      })
    )
  }
}

const NO_TRENDS: DashboardTrends = {
  words: null,
  readingTime: null,
  sessions: null,
  fluency: null,
  speed: null
}

/** The most recent day record dated strictly before `todayKey`, if any. */
function previousActiveDay(
  days: readonly DayStatsRecord[],
  todayKey: string
): DayStatsRecord | null {
  let best: DayStatsRecord | null = null
  for (const day of days) {
    if (day.date < todayKey && (best === null || day.date > best.date)) best = day
  }
  return best
}

function trendOf(todayValue: number, baselineValue: number): Trend {
  if (todayValue > baselineValue) return 'up'
  if (todayValue < baselineValue) return 'down'
  return null
}

function deriveTrends(
  today: DashboardToday,
  days: readonly DayStatsRecord[] | undefined,
  todayKey: string | undefined
): DashboardTrends {
  if (!today.active || !days || !todayKey) return NO_TRENDS
  const baseline = previousActiveDay(days, todayKey)
  if (baseline === null) return NO_TRENDS
  // The baseline's Fluency and WPM are derived from its stored sums the same
  // way today's are — the day record stores no averages (§4).
  const baselineFluency = fluencyScore(
    interruptionRate({
      pauses: nonNegative(baseline.pauses),
      rewinds: nonNegative(baseline.rewinds),
      activeMs: nonNegative(baseline.activeMs)
    })
  )
  const baselineWpm = measuredWpm({
    wordsRead: nonNegative(baseline.wordsRead),
    activeMs: nonNegative(baseline.activeMs)
  })
  return {
    words: trendOf(today.wordsRead, nonNegative(baseline.wordsRead)),
    // Active against active: the baseline day's wall span may be hours of
    // parked Reader, which would make any real day look like a decline (§4).
    readingTime: trendOf(today.activeMs, nonNegative(baseline.activeMs)),
    sessions: trendOf(today.sessionCount, nonNegative(baseline.sessionCount)),
    fluency: trendOf(today.fluency, baselineFluency),
    speed: trendOf(today.wpm, baselineWpm)
  }
}

function deriveHighscores(overview: StatsOverview | null, active: boolean): DashboardHighscores {
  const best = overview?.highscores
  return {
    active,
    bestDayWords: nonNegative(best?.bestDayWords),
    bestSessionFluency: nonNegative(best?.bestSessionFluency),
    longestSessionMs: nonNegative(best?.longestSessionMs),
    longestStreak: nonNegative(best?.longestStreak)
  }
}

/** The whole Dashboard, from one overview snapshot and the two live goals. */
export function deriveDashboard(input: DashboardInput): DashboardModel {
  const today = deriveToday(input.overview)
  const lifetime = deriveLifetime(input.overview)
  return {
    quota: deriveQuota(input.overview, today.wordsRead, input.quotaPages),
    streak: nonNegative(input.overview?.streak),
    points: nonNegative(input.overview?.points),
    weeklyTargetDays: effectiveWeeklyTargetDays(input.overview, input.weeklyTargetDays),
    today,
    lifetime,
    highscores: deriveHighscores(input.overview, lifetime.active),
    trends: deriveTrends(today, input.days, input.todayKey),
    hasHistory: lifetime.active
  }
}
