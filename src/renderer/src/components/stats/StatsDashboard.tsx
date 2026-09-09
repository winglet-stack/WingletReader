import React from 'react'
import type { Settings } from '../../types'
import Stepper from '../settings/instruments/Stepper'
import {
  DAILY_QUOTA_LABEL,
  QUOTA_PAGES_RANGE,
  WEEKLY_TARGET_LABEL,
  WEEKLY_TARGET_RANGE,
  dailyQuotaPatch,
  formatRestDays,
  goalEffectivityHint,
  type GoalPins,
  weeklyTargetPatch
} from '../settings/readingGoals'
import type {
  DashboardHighscores,
  DashboardLifetime,
  DashboardModel,
  DashboardQuota,
  DashboardToday,
  DashboardTrends,
  Trend
} from './dashboardMetrics'
import {
  formatDayCount,
  formatPageCount,
  formatReadingTime,
  formatWordCount,
  formatWpm
} from './statsFormat'

interface Props {
  model: DashboardModel
  /** The live quota in displayed pages — what the stepper shows. */
  quotaPages: number
  /** Live weekly value shown in the editor; the model carries this week's pin. */
  weeklyTargetDays: number
  goalPins: GoalPins
  /** Auto-save, exactly as the Settings landing does it. */
  onGoalChange: (patch: Partial<Settings>) => void
}

/** What a history cell shows before there is any history to show. */
const PLACEHOLDER = '—'

/**
 * The Dashboard tab (ADR-0035 §6): every stored and derived number in one
 * glance, ordered by what the gamification loop says matters.
 *
 * The 3×2 card grid *is* the spec's ordering: **quota · streak · points** on the
 * top row — points last, so it sits top-right — and the measured history below
 * it. Each goal stepper lives inside the card for the number it governs, so the
 * two ways to change a goal are never far from the progress they move.
 *
 * One screen, no scrolling (the ADR-0021 discipline): the grid is fixed at two
 * rows and every value is a single line, so the page height is a constant, not
 * a function of how much history the user has. A section with nothing to show
 * yet keeps its rows and fills them with {@link PLACEHOLDER} — the layout must
 * not change shape when the first session lands.
 */
export default function StatsDashboard({
  model,
  quotaPages,
  weeklyTargetDays,
  goalPins,
  onGoalChange
}: Props) {
  return (
    <>
      <div className="stats-dashboard">
        <QuotaCard
          quota={model.quota}
          quotaPages={quotaPages}
          pinned={goalPins.daily}
          onGoalChange={onGoalChange}
        />
        <StreakCard
          streak={model.streak}
          effectiveWeeklyTargetDays={model.weeklyTargetDays}
          weeklyTargetDays={weeklyTargetDays}
          pinned={goalPins.weekly}
          onGoalChange={onGoalChange}
        />
        <PointsCard points={model.points} todayPoints={model.today.points} />
        <TodayCard today={model.today} trends={model.trends} />
        <LifetimeCard lifetime={model.lifetime} />
        <HighscoresCard highscores={model.highscores} />
      </div>

      {!model.hasHistory && (
        <p className="stats-invite">
          Your goals are set — finish a reading session and these fill in.
        </p>
      )}
    </>
  )
}

function QuotaCard({
  quota,
  quotaPages,
  pinned,
  onGoalChange
}: {
  quota: DashboardQuota
  quotaPages: number
  pinned: boolean
  onGoalChange: (patch: Partial<Settings>) => void
}) {
  const filled = Math.min(100, Math.max(0, quota.percent))
  return (
    <section className="stats-card" aria-label="Today's quota">
      <h2 className="stats-card-title">Today&rsquo;s quota</h2>
      <p className="stats-metric">{quota.percent}%</p>
      <div
        className="stats-meter"
        role="progressbar"
        aria-label="Daily quota progress"
        aria-valuenow={quota.percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`stats-meter-fill${quota.met ? ' stats-meter-fill--met' : ''}`}
          style={{ width: `${filled}%` }}
        />
      </div>
      <p className="stats-metric-sub">
        {formatPageCount(quota.pagesRead)} of {formatPageCount(quota.targetPages)} pages
        {quota.met ? ' · met' : ''}
      </p>
      <GoalRow
        label={DAILY_QUOTA_LABEL}
        unit="pages a day"
        value={quotaPages}
        range={QUOTA_PAGES_RANGE}
        hint={goalEffectivityHint('daily', { daily: pinned, weekly: false })}
        onChange={(pages) => onGoalChange(dailyQuotaPatch(pages))}
      />
    </section>
  )
}

function StreakCard({
  streak,
  effectiveWeeklyTargetDays,
  weeklyTargetDays,
  pinned,
  onGoalChange
}: {
  streak: number
  effectiveWeeklyTargetDays: number
  weeklyTargetDays: number
  pinned: boolean
  onGoalChange: (patch: Partial<Settings>) => void
}) {
  return (
    <section className="stats-card" aria-label="Streak">
      <h2 className="stats-card-title">Streak</h2>
      <p className="stats-metric">{formatDayCount(streak)}</p>
      <p className="stats-metric-sub">{formatRestDays(effectiveWeeklyTargetDays)}</p>
      <GoalRow
        label={WEEKLY_TARGET_LABEL}
        unit="days a week"
        value={weeklyTargetDays}
        range={WEEKLY_TARGET_RANGE}
        hint={goalEffectivityHint('weekly', { daily: false, weekly: pinned })}
        onChange={(days) => onGoalChange(weeklyTargetPatch(days))}
      />
    </section>
  )
}

function PointsCard({ points, todayPoints }: { points: number; todayPoints: number }) {
  return (
    <section className="stats-card stats-card--points" aria-label="Points">
      <h2 className="stats-card-title">Points</h2>
      <p className="stats-metric">{formatWordCount(points)}</p>
      <p className="stats-metric-sub">
        {todayPoints > 0
          ? `+${formatWordCount(todayPoints)} today`
          : 'Earned on the days you meet your quota'}
      </p>
    </section>
  )
}

function TodayCard({ today, trends }: { today: DashboardToday; trends: DashboardTrends }) {
  const shown = today.active
  return (
    <section className="stats-card" aria-label="Today">
      <h2 className="stats-card-title">Today</h2>
      <StatRow
        label="Words"
        value={`${formatWordCount(today.wordsRead)} · ${formatPageCount(today.pagesRead)} pages`}
        shown={shown}
        trend={trends.words}
      />
      <StatRow
        label="Reading time"
        value={formatReadingTime(today.activeMs)}
        shown={shown}
        trend={trends.readingTime}
      />
      <StatRow
        label="Sessions"
        value={today.sessionCount.toLocaleString()}
        shown={shown}
        trend={trends.sessions}
      />
      <StatRow label="Fluency" value={String(today.fluency)} shown={shown} trend={trends.fluency} />
      <StatRow label="Speed" value={formatWpm(today.wpm)} shown={shown} trend={trends.speed} />
    </section>
  )
}

function LifetimeCard({ lifetime }: { lifetime: DashboardLifetime }) {
  const shown = lifetime.active
  return (
    <section className="stats-card" aria-label="Lifetime">
      <h2 className="stats-card-title">Lifetime</h2>
      <StatRow label="Words" value={formatWordCount(lifetime.wordsRead)} shown={shown} />
      <StatRow label="Reading time" value={formatReadingTime(lifetime.activeMs)} shown={shown} />
      <StatRow label="Words a day" value={formatWordCount(lifetime.wordsPerDay)} shown={shown} />
      <StatRow
        label="Average session"
        value={formatReadingTime(lifetime.averageSessionMs)}
        shown={shown}
      />
      <StatRow label="Fluency" value={String(lifetime.fluency)} shown={shown} />
    </section>
  )
}

function HighscoresCard({ highscores }: { highscores: DashboardHighscores }) {
  const shown = highscores.active
  return (
    <section className="stats-card" aria-label="Highscores">
      <h2 className="stats-card-title">Highscores</h2>
      <StatRow
        label="Best day"
        value={`${formatWordCount(highscores.bestDayWords)} words`}
        shown={shown}
      />
      <StatRow label="Best fluency" value={String(highscores.bestSessionFluency)} shown={shown} />
      <StatRow
        label="Longest session"
        value={formatReadingTime(highscores.longestSessionMs)}
        shown={shown}
      />
      <StatRow label="Longest streak" value={formatDayCount(highscores.longestStreak)} shown={shown} />
    </section>
  )
}

/** One goal stepper, sitting under the number it governs. */
function GoalRow({
  label,
  unit,
  value,
  range,
  hint,
  onChange
}: {
  label: string
  unit: string
  value: number
  range: { min: number; max: number }
  hint: string | null
  onChange: (value: number) => void
}) {
  return (
    <div className="stats-goal">
      <span className="stats-goal-label">{label}</span>
      <div className="stats-goal-control">
        <Stepper label={label} value={value} min={range.min} max={range.max} onChange={onChange} />
        <span className="stats-goal-unit">{unit}</span>
      </div>
      {hint && <span className="stats-goal-hint">{hint}</span>}
    </div>
  )
}

/**
 * A measured figure. `shown` is the section's zero-history verdict: the row
 * keeps its place and shows a placeholder rather than a real-looking zero.
 *
 * `trend` is the Today card's previous-active-day verdict: up tints the value
 * green with a ▲, down red with a ▼. The glyph is the colour-blind-safe
 * redundancy; equal or baseline-less rows pass null and stay neutral.
 */
function StatRow({
  label,
  value,
  shown,
  trend = null
}: {
  label: string
  value: string
  shown: boolean
  trend?: Trend
}) {
  const shownTrend = shown ? trend : null
  const trendClass =
    shownTrend === null ? '' : shownTrend === 'up' ? ' stats-row-value--up' : ' stats-row-value--down'
  return (
    <div className="stats-row">
      <span className="stats-row-label">{label}</span>
      <span className={`stats-row-value${shown ? '' : ' stats-row-value--empty'}${trendClass}`}>
        {shownTrend !== null && (
          <span className="stats-row-trend" aria-hidden="true">
            {shownTrend === 'up' ? '▲' : '▼'}
          </span>
        )}
        {shown ? value : PLACEHOLDER}
      </span>
    </div>
  )
}
