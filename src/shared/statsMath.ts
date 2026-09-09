/**
 * Stats math — every stats formula in one pure module (ADR-0035).
 *
 * Deliberately pure: no store, no IPC, no React, no Electron, and **no
 * `Date.now()` inside the module** — callers pass epoch milliseconds or local
 * date keys, so every derivation is deterministic and testable. Nothing here
 * mutates its inputs.
 *
 * Two rules govern the whole module:
 * - **Days are local calendar dates** (ADR-0035 §3). All day/week arithmetic
 *   runs on `'YYYY-MM-DD'` keys and local-midnight `Date` construction, never
 *   on UTC offsets or raw millisecond division — that is what keeps DST and
 *   year boundaries honest.
 * - **Durations and counts clamp at zero** (ADR-0035 §2, system-clock skew).
 *   A negative or non-finite input contributes 0 rather than poisoning a sum.
 * - **Active time is the scored currency** (ADR-0036 §4). Every aggregate,
 *   maximum and rate here reads `activeMs`; `wallMs` is carried through the
 *   fold and the buckets as descriptive session-span data and scores nothing.
 *
 * Nothing is ever stored that can be derived: averages, streaks, points and
 * timeframe rollups are all computed here from raw day sums (ADR-0035 §4).
 */

/**
 * Words in one quota page. Deliberately equal to the ADR-0025 Page target so
 * "page" means one thing app-wide — the reading Page and the quota page are
 * the same size, and the quota UI can show pages while the store keeps words.
 */
export const QUOTA_PAGE_WORDS = 500

/**
 * The quota range the settings stepper offers, in quota pages: half a page a
 * day would not be a goal, and 20 pages (10,000 words) is already a long
 * reading day. The store still holds words, so a value outside this range
 * loads and reads fine — it simply displays clamped until the user edits it.
 */
export const MIN_QUOTA_PAGES = 1
export const MAX_QUOTA_PAGES = 20

/** The weekly-target range, in quota-met days per week (ADR-0035 §5). */
export const MIN_WEEKLY_TARGET_DAYS = 1

/** Points awarded for a quota-met day before the streak multiplier. */
export const POINTS_BASE = 100
/** Multiplier gained per streak day beyond the first. */
export const POINTS_STREAK_STEP = 0.1
/** Multiplier ceiling — reached at an 11-day streak. */
export const POINTS_MULTIPLIER_CAP = 2.0

/** Days in a calendar week; the rest-day budget is this minus the weekly target. */
export const DAYS_PER_WEEK = 7

/**
 * Weekly-target fallback (ADR-0035 §5 default) used only when a week has no
 * day record carrying a snapshot and no earlier snapshot exists to carry
 * forward. The settings default lives in the store, not here.
 */
export const DEFAULT_WEEKLY_TARGET_DAYS = 5

const MS_PER_MINUTE = 60_000

/** Safety net for the day-by-day streak walk; ~547 years of history. */
const MAX_STREAK_WALK_DAYS = 200_000

// ── Integrity constants (ADR-0036 §7) ───────────────────────────────────────
//
// The guard constants live together, named and commented, so no call site
// carries a magic number. They are exported for tests.

/**
 * How many nominal beats of silence between two **advancement events** still
 * count as reading (ADR-0036 §3). Four is generous against the things that
 * legitimately stretch a beat — a sentence or headline pause costs a beat or
 * two — while still cutting a stall off quickly.
 */
export const GAP_CLAMP_FACTOR = 4

/**
 * Floor under the gap clamp, in milliseconds. At fast BPM four beats is under
 * two seconds, which would punish tap-to-read at any human pace; ten seconds
 * is the shortest silence we are still willing to call reading.
 */
export const GAP_CLAMP_FLOOR_MS = 10_000

/**
 * How soon the first setup activity must follow an explicit pause intent for
 * that pause to count as setup rather than an interruption (ADR-0036 §6).
 * Later activity cannot launder a pause after this window has elapsed.
 */
export const PAUSE_EXEMPTION_WINDOW_MS = 30_000

/**
 * The most active reading time one gap between advancement events may credit:
 * `max(GAP_CLAMP_FACTOR × nominalBeatMs, GAP_CLAMP_FLOOR_MS)` (ADR-0036 §3),
 * where the nominal beat comes from the BPM in effect during the gap — BPM is
 * live-editable mid-session, so the clamp moves with it.
 *
 * The two regimes meet at 24 BPM: above it the floor governs (at the 650 BPM
 * ceiling four beats is ~369 ms), below it the tempo term does. A BPM that is
 * zero, negative or not finite falls back to the floor rather than producing
 * an infinite or negative clamp.
 */
export function maxCreditedGapMs(bpm: number): number {
  const nominalBeatMs = nonNegative(MS_PER_MINUTE / bpm)
  return Math.max(GAP_CLAMP_FACTOR * nominalBeatMs, GAP_CLAMP_FLOOR_MS)
}

/**
 * The active reading time one gap credits: the elapsed time, clamped at 0
 * below (clock skew) and at {@link maxCreditedGapMs} above.
 */
export function creditedGapMs(elapsedMs: number, bpm: number): number {
  return Math.min(nonNegative(elapsedMs), maxCreditedGapMs(bpm))
}

/**
 * One session's raw sums — the measured half of a session record (ADR-0035
 * §2). Structural on purpose: the store's `SessionStatsRecord` carries
 * identity fields on top of these and still fits.
 */
export interface SessionSums {
  /** High-water words read: furthest offset reached − session-start offset. */
  wordsRead: number
  /**
   * Wall duration: session start → end. **Descriptive only** (ADR-0036 §4) —
   * it says how long the Reader was open, and feeds no score, highscore or
   * aggregate. Every scored time number reads {@link SessionSums.activeMs}.
   */
  wallMs: number
  /**
   * Active reading time: the sum of gaps between advancement events, each one
   * clamped at {@link maxCreditedGapMs} (ADR-0036 §3), so idling never banks
   * reading time.
   */
  activeMs: number
  /** Counted pauses — explicit pause intents only. */
  pauses: number
  /** Rewind events — maximal runs of rewind intents, not raw intents. */
  rewinds: number
}

/**
 * A day's folded sums plus its per-day maxima. Averages are never stored —
 * they are derived from these sums on read (ADR-0035 §4).
 */
export interface DaySums {
  wordsRead: number
  /** Descriptive sum of the day's session spans; nothing scores off it (§4). */
  wallMs: number
  activeMs: number
  pauses: number
  rewinds: number
  sessionCount: number
  /**
   * Highscore feed: longest single session by **active** reading time
   * (ADR-0036 §4). The field name is the pre-guard one on purpose — renaming a
   * persisted field is not worth a normalization cycle — and day records folded
   * before the guards keep their wall-duration value, which is historical fact
   * and never recomputed (ADR-0036 §8). The highscore max therefore mixes
   * old-wall and new-active values.
   */
  longestSessionMs: number
  /** Highscore feed: best single-session {@link fluencyScore} of the day. */
  bestSessionFluency: number
}

/**
 * A stored day record: folded sums, the settings snapshots that were in force,
 * and the quota/points verdict. Seeds the store's `DayStatsRecord` shape (02
 * aligns to this, not the reverse).
 */
export interface DayStats extends DaySums {
  /** Local date key, `'YYYY-MM-DD'`. */
  date: string
  /** Quota in words that this day was judged against. */
  quotaTargetWords: number
  /** Weekly target (quota-met days per week) in force on this day. */
  weeklyTargetDays: number
  quotaMet: boolean
  points: number
}

/** The slice of a day record {@link deriveStreak} needs. */
export type StreakDay = Pick<DayStats, 'date' | 'quotaMet' | 'weeklyTargetDays'>

/** One collated graph bucket: day records summed, maxima maxed. */
export interface StatsBucket {
  /** `'YYYY-MM-DD'` for daily buckets, `'YYYY-MM'` for monthly ones. */
  key: string
  /** Date keys of the day records folded in; empty for a zero-filled bucket. */
  dayKeys: string[]
  wordsRead: number
  /** Descriptive; graph time series plot {@link StatsBucket.activeMs} (§4). */
  wallMs: number
  activeMs: number
  pauses: number
  rewinds: number
  sessionCount: number
  points: number
  /** How many days in this bucket met their quota. */
  quotaMetDays: number
  longestSessionMs: number
  bestSessionFluency: number
}

/** Clamp to a finite, non-negative number (clock skew, `NaN`, `Infinity`). */
function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** Local midnight of a `'YYYY-MM-DD'` key — the anchor for all day arithmetic. */
function dateFromKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/**
 * The local calendar date of an instant, as `'YYYY-MM-DD'`.
 *
 * A session spanning midnight belongs entirely to the day it started
 * (ADR-0035 §3) — callers key on the start instant.
 */
export function localDateKey(epochMs: number): string {
  return formatLocalDate(new Date(epochMs))
}

/**
 * A date key shifted by whole local days. Built from calendar components, so
 * DST transitions and month/year rollovers do not drift.
 */
export function addDaysToKey(key: string, days: number): string {
  const date = dateFromKey(key)
  return formatLocalDate(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days))
}

/** The Monday-start week a date key belongs to, as that Monday's date key. */
export function weekStartKey(key: string): string {
  const date = dateFromKey(key)
  // getDay(): 0 = Sunday. Shift so Monday = 0.
  const offset = (date.getDay() + 6) % DAYS_PER_WEEK
  return addDaysToKey(key, -offset)
}

/**
 * Interruptions per active reading minute: `(2 × rewind events + counted
 * pauses) ÷ active minutes` (ADR-0035 §2). Lower is better; graphs may show
 * this raw rate alongside the {@link fluencyScore} derived from it.
 *
 * With zero active time the rate is `Infinity` when anything was counted and
 * `0` when nothing was — which lands {@link fluencyScore} on 0 and 100
 * respectively.
 */
export function interruptionRate(input: {
  pauses: number
  rewinds: number
  activeMs: number
}): number {
  const interruptions = 2 * nonNegative(input.rewinds) + nonNegative(input.pauses)
  const activeMinutes = nonNegative(input.activeMs) / MS_PER_MINUTE
  if (activeMinutes === 0) return interruptions === 0 ? 0 : Number.POSITIVE_INFINITY
  return interruptions / activeMinutes
}

/**
 * Reading Fluency: `round(100 / (1 + rate))` (ADR-0035 §2). Higher is better —
 * an uninterrupted read scores 100 and the score decays as interruptions per
 * minute rise. An infinite rate scores 0.
 */
export function fluencyScore(rate: number): number {
  if (Number.isNaN(rate)) return 0
  const clamped = rate < 0 ? 0 : rate
  if (clamped === Number.POSITIVE_INFINITY) return 0
  return Math.round(100 / (1 + clamped))
}

/**
 * Measured words per minute — words actually read ÷ active reading minutes,
 * distinct from the nominal `BPM × words_per_stack`. Zero active time reads as
 * 0. Returned unrounded; display surfaces round.
 */
export function measuredWpm(input: { wordsRead: number; activeMs: number }): number {
  const activeMinutes = nonNegative(input.activeMs) / MS_PER_MINUTE
  if (activeMinutes === 0) return 0
  return nonNegative(input.wordsRead) / activeMinutes
}

/**
 * Quota pages for a stored word quota, clamped to the settable range.
 *
 * **Rounds up.** The store keeps words; the UI sets and shows quota pages, so a
 * legacy or hand-edited value that is not a multiple of {@link QUOTA_PAGE_WORDS}
 * has to land on some page count. Rounding up never understates what the user
 * already committed to — 1,200 words reads as 3 pages, not 2. The stored words
 * are left alone; only a user edit rewrites them (via {@link quotaWordsFromPages}).
 */
export function quotaPagesFromWords(words: number): number {
  if (Number.isNaN(words)) return MIN_QUOTA_PAGES
  return clampPages(Math.ceil(words / QUOTA_PAGE_WORDS))
}

/** The word quota a page count writes back — the exact inverse for in-range pages. */
export function quotaWordsFromPages(pages: number): number {
  if (Number.isNaN(pages)) return MIN_QUOTA_PAGES * QUOTA_PAGE_WORDS
  return clampPages(Math.round(pages)) * QUOTA_PAGE_WORDS
}

/** Infinities clamp to an edge like any other out-of-range number; `NaN` never reaches here. */
function clampPages(pages: number): number {
  return Math.min(MAX_QUOTA_PAGES, Math.max(MIN_QUOTA_PAGES, pages))
}

/** A day with nothing in it — the zero element for folding and collation. */
export function emptyDaySums(): DaySums {
  return {
    wordsRead: 0,
    wallMs: 0,
    activeMs: 0,
    pauses: 0,
    rewinds: 0,
    sessionCount: 0,
    longestSessionMs: 0,
    bestSessionFluency: 0
  }
}

/**
 * Fold a day's session records into its day record's raw sums, plus the two
 * per-day maxima the highscores feed on. Every input clamps at 0.
 *
 * `longestSessionMs` maxes on **active** time, not wall duration (ADR-0036 §4):
 * a Reader parked over lunch banks a multi-hour span with no reading in it, and
 * a highscore has to rank what was actually read. `wallMs` still sums — it is
 * descriptive session-span data, exported and shown nowhere that scores.
 *
 * With no sessions, `bestSessionFluency` is 0 rather than the "no
 * interruptions" 100 — an inactive day has no best session to score.
 */
export function foldSessionsIntoDay(sessions: readonly SessionSums[]): DaySums {
  const day = emptyDaySums()
  for (const session of sessions) {
    const wallMs = nonNegative(session.wallMs)
    const activeMs = nonNegative(session.activeMs)
    const pauses = nonNegative(session.pauses)
    const rewinds = nonNegative(session.rewinds)
    day.wordsRead += nonNegative(session.wordsRead)
    day.wallMs += wallMs
    day.activeMs += activeMs
    day.pauses += pauses
    day.rewinds += rewinds
    day.sessionCount += 1
    day.longestSessionMs = Math.max(day.longestSessionMs, activeMs)
    day.bestSessionFluency = Math.max(
      day.bestSessionFluency,
      fluencyScore(interruptionRate({ pauses, rewinds, activeMs }))
    )
  }
  return day
}

// ── The Session dialog's numbers and their baseline (ADR-0035 §6) ────────────

/**
 * What one session shows in the Session dialog: its raw sums plus the two
 * scores derived from them. A {@link SessionBaseline} is the same shape, so a
 * metric and the number it is compared against are always like for like.
 *
 * Nothing here is rounded — display surfaces round, so an average of 1,204.5
 * words is not silently re-rounded on the way through a comparison.
 */
export interface SessionMetrics extends SessionSums {
  /** Measured words per minute over the session's active reading time. */
  wpm: number
  /** Reading Fluency, 0–100. */
  fluency: number
}

/**
 * Which rung of the §6 baseline ladder a comparison came from: the average of
 * today's earlier sessions, or the most recent prior active day's per-session
 * averages. There is no third rung — with neither, there is no baseline and
 * deviations are hidden entirely.
 */
export type SessionBaselineSource = 'today' | 'prior-day'

export interface SessionBaseline extends SessionMetrics {
  source: SessionBaselineSource
  /** How many sessions the averages are taken over. */
  sessionCount: number
  /** The day the averages came from; null on the `today` rung. */
  date: string | null
}

/** One session's numbers beside the baseline they are read against. */
export interface SessionStatsSummary {
  metrics: SessionMetrics
  /** Null when the ladder found nothing to compare against. */
  baseline: SessionBaseline | null
}

/** One session's raw sums promoted to the six displayed numbers. */
export function sessionMetrics(sums: SessionSums): SessionMetrics {
  const wordsRead = nonNegative(sums.wordsRead)
  const wallMs = nonNegative(sums.wallMs)
  const activeMs = nonNegative(sums.activeMs)
  const pauses = nonNegative(sums.pauses)
  const rewinds = nonNegative(sums.rewinds)
  return {
    wordsRead,
    wallMs,
    activeMs,
    pauses,
    rewinds,
    wpm: measuredWpm({ wordsRead, activeMs }),
    fluency: fluencyScore(interruptionRate({ pauses, rewinds, activeMs }))
  }
}

/**
 * Per-session averages over a group of sessions folded into one set of sums.
 * Null for a group with no sessions.
 *
 * The four raw metrics divide by the session count; **the two scores do not** —
 * WPM and Fluency are ratios, so they come off the group's totals, which is
 * both what an average session scored and the only thing a day record (which
 * keeps sums, never averages — §4) can produce.
 */
function averageSessionMetrics(sums: DaySums): SessionMetrics | null {
  const count = nonNegative(sums.sessionCount)
  if (count === 0) return null
  return {
    wordsRead: nonNegative(sums.wordsRead) / count,
    wallMs: nonNegative(sums.wallMs) / count,
    activeMs: nonNegative(sums.activeMs) / count,
    pauses: nonNegative(sums.pauses) / count,
    rewinds: nonNegative(sums.rewinds) / count,
    wpm: measuredWpm(sums),
    fluency: fluencyScore(interruptionRate(sums))
  }
}

/**
 * The §6 baseline ladder for the session that just finished:
 *
 * 1. the average of **today's earlier sessions** — the caller passes them with
 *    the finished session already excluded, since it is one of them;
 * 2. else the most recent **prior active day**'s per-session averages, derived
 *    from that day record's sums (a day with no sessions is not active);
 * 3. else `null` — the first session ever recorded has nothing to deviate from,
 *    and the dialog hides its indicators rather than inventing a comparison.
 *
 * Day records dated `todayKey` or later never serve as the prior day: today's
 * own record already contains the session being reported.
 */
export function deriveSessionBaseline(input: {
  earlierSessions: readonly SessionSums[]
  days: readonly DayStats[]
  todayKey: string
}): SessionBaseline | null {
  const today = averageSessionMetrics(foldSessionsIntoDay(input.earlierSessions))
  if (today) {
    return { ...today, source: 'today', sessionCount: input.earlierSessions.length, date: null }
  }

  const priorDays = input.days
    .filter((day) => day.date < input.todayKey && nonNegative(day.sessionCount) > 0)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
  const priorDay = priorDays[priorDays.length - 1]
  if (!priorDay) return null

  const averages = averageSessionMetrics(priorDay)
  if (!averages) return null
  return {
    ...averages,
    source: 'prior-day',
    sessionCount: nonNegative(priorDay.sessionCount),
    date: priorDay.date
  }
}

/**
 * Percent change of `value` against `baseline`, signed and unrounded — `+25`
 * means a quarter more than the baseline.
 *
 * Null when the baseline is zero or not finite: there is no percentage against
 * nothing, and "▲ ∞%" is not a reward. A metric whose baseline is 0 simply
 * shows no indicator (a first session with no pauses, say).
 */
export function deviationPercent(value: number, baseline: number): number | null {
  if (!Number.isFinite(value) || !Number.isFinite(baseline) || baseline <= 0) return null
  return ((value - baseline) / baseline) * 100
}

/** Weekly target is quota-met days per week, 1–7 (ADR-0035 §5). */
function clampWeeklyTarget(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_WEEKLY_TARGET_DAYS
  return Math.min(DAYS_PER_WEEK, Math.max(1, Math.round(value)))
}

/**
 * Quota-met days since the last break, under the weekly rest-day budget rule
 * (ADR-0035 §5).
 *
 * The walk runs forward from the earliest recorded day to `todayKey`, one
 * local day at a time:
 * - Days absent from `days` are misses; history simply starts at the first
 *   record, so installing mid-week never charges the days before it.
 * - Each Monday-start calendar week gets a budget of `7 − weeklyTargetDays`
 *   rest days, taken from the **first snapshot within that week** (ADR-0036 §5:
 *   a mid-week target change waits for next Monday). A week with no records
 *   carries the last known snapshot forward.
 * - The streak breaks on the miss that takes a week past its budget — misses
 *   equal to the budget keep it alive — and resumes counting from the next
 *   quota-met day. A wholly missed week always breaks it (7 misses exceeds
 *   even the largest budget, 6).
 * - `todayKey` itself never counts as a miss when the quota is not met yet;
 *   the day is still in progress.
 *
 * Records dated after `todayKey` are ignored; duplicates resolve to the last
 * entry for that date.
 */
export function deriveStreak(days: readonly StreakDay[], todayKey: string): number {
  const history = [...days]
    .filter((day) => day.date <= todayKey)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
  if (history.length === 0) return 0

  // A later duplicate wins, so index after sorting.
  const byKey = new Map(history.map((day) => [day.date, day] as const))
  const budgets = restDayBudgets(history, todayKey)
  return walkStreak(byKey, history[0].date, todayKey, budgets)
}

/**
 * Rest-day budget (`7 − weeklyTargetDays`) for every Monday-start week from the
 * first recorded day through `todayKey`. A week with records takes the first
 * snapshot inside it; a week without any carries the previous week's target
 * forward, falling back to {@link DEFAULT_WEEKLY_TARGET_DAYS} before any
 * snapshot exists.
 */
export function restDayBudgets(
  history: readonly StreakDay[],
  todayKey: string
): Map<string, number> {
  // Normalize order here too: direct callers and imported histories need the
  // same first-calendar-day rule. As in `deriveStreak`, the last duplicate for
  // one date is authoritative before the week snapshot is selected.
  const byDate = new Map(history.map((day) => [day.date, day] as const))
  const ordered = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
  const snapshots = new Map<string, number>()
  for (const day of ordered) {
    const week = weekStartKey(day.date)
    if (!snapshots.has(week)) snapshots.set(week, clampWeeklyTarget(day.weeklyTargetDays))
  }

  const budgets = new Map<string, number>()
  const lastWeek = weekStartKey(todayKey)
  let carried = DEFAULT_WEEKLY_TARGET_DAYS
  let week = weekStartKey(history[0].date)
  for (let guard = 0; week <= lastWeek && guard < MAX_STREAK_WALK_DAYS; guard += 1) {
    carried = snapshots.get(week) ?? carried
    budgets.set(week, DAYS_PER_WEEK - carried)
    week = addDaysToKey(week, DAYS_PER_WEEK)
  }
  return budgets
}

/** One local day at a time from `firstKey` to `todayKey`, spending each week's budget. */
function walkStreak(
  byKey: ReadonlyMap<string, StreakDay>,
  firstKey: string,
  todayKey: string,
  budgets: ReadonlyMap<string, number>
): number {
  let streak = 0
  let missesThisWeek = 0
  let currentWeek = ''
  let key = firstKey

  for (let guard = 0; key <= todayKey && guard < MAX_STREAK_WALK_DAYS; guard += 1) {
    const week = weekStartKey(key)
    if (week !== currentWeek) {
      currentWeek = week
      missesThisWeek = 0
    }

    if (byKey.get(key)?.quotaMet) {
      streak += 1
    } else if (key !== todayKey) {
      // Today is still in progress, so only earlier days spend the budget.
      missesThisWeek += 1
      if (missesThisWeek > (budgets.get(week) ?? 0)) streak = 0
    }

    key = addDaysToKey(key, 1)
  }

  return streak
}

/**
 * Points for a quota-met day: `100 × min(1 + 0.1 × (streak − 1), 2.0)`, where
 * `streakIncludingToday` counts the day being scored (ADR-0035 §5). Points
 * come from consistency alone — speed and fluency are rewarded via highscores.
 *
 * Rounded to whole points, both because points are whole and to absorb the
 * float drift in the multiplier.
 */
export function pointsForDay(streakIncludingToday: number): number {
  const streak = Math.max(1, Math.floor(nonNegative(streakIncludingToday)))
  const multiplier = Math.min(1 + POINTS_STREAK_STEP * (streak - 1), POINTS_MULTIPLIER_CAP)
  return Math.round(POINTS_BASE * multiplier)
}

function emptyBucket(key: string): StatsBucket {
  return {
    key,
    dayKeys: [],
    wordsRead: 0,
    wallMs: 0,
    activeMs: 0,
    pauses: 0,
    rewinds: 0,
    sessionCount: 0,
    points: 0,
    quotaMetDays: 0,
    longestSessionMs: 0,
    bestSessionFluency: 0
  }
}

function addDayToBucket(bucket: StatsBucket, day: DayStats): void {
  bucket.dayKeys.push(day.date)
  bucket.wordsRead += nonNegative(day.wordsRead)
  bucket.wallMs += nonNegative(day.wallMs)
  bucket.activeMs += nonNegative(day.activeMs)
  bucket.pauses += nonNegative(day.pauses)
  bucket.rewinds += nonNegative(day.rewinds)
  bucket.sessionCount += nonNegative(day.sessionCount)
  bucket.points += nonNegative(day.points)
  if (day.quotaMet) bucket.quotaMetDays += 1
  bucket.longestSessionMs = Math.max(bucket.longestSessionMs, nonNegative(day.longestSessionMs))
  bucket.bestSessionFluency = Math.max(
    bucket.bestSessionFluency,
    nonNegative(day.bestSessionFluency)
  )
}

/** Index day records by date key; later entries win over earlier duplicates. */
function indexDays(days: readonly DayStats[]): Map<string, DayStats> {
  const byKey = new Map<string, DayStats>()
  for (const day of days) byKey.set(day.date, day)
  return byKey
}

/**
 * Week timeframe: seven daily buckets, Monday → Sunday of the week containing
 * `anchorKey`. Days without a record are present and zero-filled, so graphs
 * always plot a full week.
 */
export function collateWeek(days: readonly DayStats[], anchorKey: string): StatsBucket[] {
  const byKey = indexDays(days)
  const monday = weekStartKey(anchorKey)
  return Array.from({ length: DAYS_PER_WEEK }, (_, index) => {
    const key = addDaysToKey(monday, index)
    const bucket = emptyBucket(key)
    const day = byKey.get(key)
    if (day) addDayToBucket(bucket, day)
    return bucket
  })
}

/**
 * Month timeframe: one daily bucket per day of `anchorKey`'s calendar month,
 * zero-filled where there is no record.
 */
export function collateMonth(days: readonly DayStats[], anchorKey: string): StatsBucket[] {
  const byKey = indexDays(days)
  const anchor = dateFromKey(anchorKey)
  const year = anchor.getFullYear()
  const month = anchor.getMonth()
  // Day 0 of the next month is the last day of this one.
  const dayCount = new Date(year, month + 1, 0).getDate()
  return Array.from({ length: dayCount }, (_, index) => {
    const key = formatLocalDate(new Date(year, month, index + 1))
    const bucket = emptyBucket(key)
    const day = byKey.get(key)
    if (day) addDayToBucket(bucket, day)
    return bucket
  })
}

/**
 * Lifetime timeframe: one monthly bucket (`'YYYY-MM'`) per calendar month from
 * the earliest record to the latest, months without activity included as
 * zero-filled gaps. Empty history collates to no buckets.
 */
export function collateTotal(days: readonly DayStats[]): StatsBucket[] {
  const byKey = indexDays(days)
  const sorted = [...byKey.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
  if (sorted.length === 0) return []

  const first = dateFromKey(sorted[0].date)
  const last = dateFromKey(sorted[sorted.length - 1].date)
  const buckets = new Map<string, StatsBucket>()
  for (
    let cursor = new Date(first.getFullYear(), first.getMonth(), 1);
    cursor.getFullYear() < last.getFullYear() ||
    (cursor.getFullYear() === last.getFullYear() && cursor.getMonth() <= last.getMonth());
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  ) {
    const key = `${cursor.getFullYear()}-${pad2(cursor.getMonth() + 1)}`
    buckets.set(key, emptyBucket(key))
  }

  for (const entry of sorted) {
    const bucket = buckets.get(entry.date.slice(0, 7))
    if (bucket) addDayToBucket(bucket, entry)
  }
  return [...buckets.values()]
}
