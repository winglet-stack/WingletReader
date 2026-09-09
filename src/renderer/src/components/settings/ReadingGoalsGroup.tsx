import React from 'react'
import type { Settings } from '../../types'
import Stepper from './instruments/Stepper'
import { useStatsOverview } from '../stats/useStatsOverview'
import {
  DAILY_QUOTA_LABEL,
  QUOTA_PAGES_RANGE,
  WEEKLY_TARGET_LABEL,
  WEEKLY_TARGET_RANGE,
  dailyQuotaPatch,
  displayedQuotaPages,
  displayedWeeklyTargetDays,
  formatQuotaGoal,
  formatWeeklyTargetGoal,
  goalEffectivityHint,
  goalPinsFromOverview,
  type GoalPins,
  weeklyTargetPatch
} from './readingGoals'

interface Props {
  local: Settings
  update: (patch: Partial<Settings>) => void
  /** Test/host override; normal Settings reads pins from the stats overview. */
  goalPins?: GoalPins
}

/**
 * Reading goals (ADR-0035 §5–§6): the two goal settings, inline on the Settings
 * landing. Follows the Appearance-pills precedent — the controls live on the
 * landing itself rather than behind a gateway card, because two steppers do not
 * justify a subview and the 5-card grid stays uniform.
 *
 * Every rule about what these values display as and what an edit writes lives in
 * `readingGoals.ts`, which the Stats screen's Dashboard steppers share — the
 * quota's page↔word rounding cannot drift between the two surfaces.
 *
 * Auto-saves through the landing's `update`, like every other control here.
 */
export default function ReadingGoalsGroup({ local, update, goalPins }: Props) {
  const { overview } = useStatsOverview()
  const pins = goalPins ?? goalPinsFromOverview(overview)
  const quotaPages = displayedQuotaPages(local.daily_word_quota)
  const weeklyTargetDays = displayedWeeklyTargetDays(local.weekly_quota_days)
  const dailyHint = goalEffectivityHint('daily', pins)
  const weeklyHint = goalEffectivityHint('weekly', pins)

  return (
    <section className="settings-goals" aria-label="Reading goals">
      <h2 className="settings-heading settings-goals-heading">Reading goals</h2>
      <div className="settings-goals-fields">
        <div className="settings-goals-field">
          <span className="settings-goals-label">{DAILY_QUOTA_LABEL}</span>
          <Stepper
            label={DAILY_QUOTA_LABEL}
            value={quotaPages}
            min={QUOTA_PAGES_RANGE.min}
            max={QUOTA_PAGES_RANGE.max}
            onChange={(pages) => update(dailyQuotaPatch(pages))}
          />
          <span className="settings-goals-copy">
            <span className="settings-goals-value">{formatQuotaGoal(quotaPages)}</span>
            {dailyHint && <span className="settings-goals-hint">{dailyHint}</span>}
          </span>
        </div>
        <div className="settings-goals-field">
          <span className="settings-goals-label">{WEEKLY_TARGET_LABEL}</span>
          <Stepper
            label={WEEKLY_TARGET_LABEL}
            value={weeklyTargetDays}
            min={WEEKLY_TARGET_RANGE.min}
            max={WEEKLY_TARGET_RANGE.max}
            onChange={(days) => update(weeklyTargetPatch(days))}
          />
          <span className="settings-goals-copy">
            <span className="settings-goals-value">
              {formatWeeklyTargetGoal(weeklyTargetDays)}
            </span>
            {weeklyHint && <span className="settings-goals-hint">{weeklyHint}</span>}
          </span>
        </div>
      </div>
    </section>
  )
}
