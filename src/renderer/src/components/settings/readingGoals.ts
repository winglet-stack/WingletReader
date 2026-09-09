import type { Settings, StatsOverview } from '../../types'
import {
  DAYS_PER_WEEK,
  DEFAULT_WEEKLY_TARGET_DAYS,
  MAX_QUOTA_PAGES,
  MIN_QUOTA_PAGES,
  MIN_WEEKLY_TARGET_DAYS,
  quotaPagesFromWords,
  quotaWordsFromPages
} from '../../../../shared/statsMath'

/**
 * The two ADR-0035 §5 goal settings as an editing contract: what a stored value
 * *displays* as, what an edit *writes*, and what each reads as in copy.
 *
 * Two surfaces edit these keys — the Settings landing's Reading goals group and
 * the Stats screen's Dashboard — and they must never drift, so the rounding
 * rule, the ranges, the clamping and the labels live here rather than being
 * re-typed at each site. Both surfaces render the same `Stepper` instrument
 * against these values; only the layout around it differs.
 *
 * The quota is **stored in words and set in quota pages**
 * ({@link quotaPagesFromWords} rounds up, deliberately — see its docs). Nothing
 * here writes on render: a legacy or out-of-range stored value displays clamped
 * and is rewritten only by a user edit.
 */

/** Accessible names for the two steppers — also how tests address them. */
export const DAILY_QUOTA_LABEL = 'Daily quota'
export const WEEKLY_TARGET_LABEL = 'Weekly target'

export type ReadingGoalPeriod = 'daily' | 'weekly'

export interface GoalPins {
  daily: boolean
  weekly: boolean
}

/** Copy is shared verbatim by Settings and the Dashboard (ADR-0036 §5). */
export const DAILY_GOAL_PINNED_HINT = 'Takes effect tomorrow'
export const WEEKLY_GOAL_PINNED_HINT = 'Takes effect next Monday'

export function goalPinsFromOverview(overview: StatsOverview | null): GoalPins {
  return {
    daily: overview?.goals.dailyPinned === true,
    weekly: overview?.goals.weeklyPinned === true
  }
}

export function goalEffectivityHint(
  period: ReadingGoalPeriod,
  pins: GoalPins
): string | null {
  if (!pins[period]) return null
  return period === 'daily' ? DAILY_GOAL_PINNED_HINT : WEEKLY_GOAL_PINNED_HINT
}

/** Today's scoring target: pinned snapshot after activity, live before it. */
export function effectiveDailyQuotaWords(
  overview: StatsOverview | null,
  liveQuotaWords: number
): number {
  return overview?.goals.dailyPinned
    ? overview.today.quotaTargetWords
    : liveQuotaWords
}

/** This week's target: first recorded day after pin, live before it. */
export function effectiveWeeklyTargetDays(
  overview: StatsOverview | null,
  liveWeeklyTargetDays: number
): number {
  return overview?.goals.weeklyPinned
    ? overview.goals.weeklyTargetDays
    : liveWeeklyTargetDays
}

export interface GoalRange {
  min: number
  max: number
}

export const QUOTA_PAGES_RANGE: GoalRange = { min: MIN_QUOTA_PAGES, max: MAX_QUOTA_PAGES }
export const WEEKLY_TARGET_RANGE: GoalRange = { min: MIN_WEEKLY_TARGET_DAYS, max: DAYS_PER_WEEK }

/** The quota page count a stored word quota displays as. */
export function displayedQuotaPages(words: number): number {
  return quotaPagesFromWords(words)
}

/** The settings patch a quota edit writes: pages × the page size, clamped. */
export function dailyQuotaPatch(pages: number): Partial<Settings> {
  return { daily_word_quota: quotaWordsFromPages(pages) }
}

/**
 * The weekly target a stored value displays as. `weekly_quota_days` is not a
 * floored key in the store, so a corrupt or hand-edited file can hold 0 or 99;
 * the same "display clamped, rewrite only on edit" rule as the quota applies.
 */
export function displayedWeeklyTargetDays(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_WEEKLY_TARGET_DAYS
  return Math.min(DAYS_PER_WEEK, Math.max(MIN_WEEKLY_TARGET_DAYS, Math.round(value)))
}

/** The settings patch a weekly-target edit writes. */
export function weeklyTargetPatch(days: number): Partial<Settings> {
  return { weekly_quota_days: displayedWeeklyTargetDays(days) }
}

/** This week's rest-day budget: the days a week the target leaves spare. */
function restDaysPerWeek(weeklyTargetDays: number): number {
  return DAYS_PER_WEEK - displayedWeeklyTargetDays(weeklyTargetDays)
}

/** `2 pages · 1,000 words` — the page count is the unit, the words the consequence. */
export function formatQuotaGoal(pages: number): string {
  const words = quotaWordsFromPages(pages)
  return `${pages} ${pages === 1 ? 'page' : 'pages'} · ${words.toLocaleString()} words`
}

/** `5 days a week`. */
export function formatWeeklyTargetGoal(days: number): string {
  return days === 1 ? '1 day a week' : `${days} days a week`
}

/**
 * The rest-day budget in words — what the weekly target buys the streak.
 * A 7-day target buys nothing, and says so rather than reading "0 rest days".
 */
export function formatRestDays(weeklyTargetDays: number): string {
  const rest = restDaysPerWeek(weeklyTargetDays)
  if (rest === 0) return 'no rest days a week'
  return `${rest} rest ${rest === 1 ? 'day' : 'days'} a week`
}
