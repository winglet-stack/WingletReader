import React, { useState } from 'react'
import Segmented from '../settings/instruments/Segmented'
import { useSettings } from '../../contexts/SettingsContext'
import {
  displayedQuotaPages,
  displayedWeeklyTargetDays,
  effectiveDailyQuotaWords,
  goalPinsFromOverview
} from '../settings/readingGoals'
import { useStatsOverview } from './useStatsOverview'
import { useStatsDays } from './useStatsHistory'
import { deriveDashboard } from './dashboardMetrics'
import StatsDashboard from './StatsDashboard'
import StatsGraphs from './StatsGraphs'
import { localDateKey, quotaWordsFromPages } from '../../../../shared/statsMath'

type StatsTab = 'dashboard' | 'graphs'

const TAB_OPTIONS: ReadonlyArray<{ value: StatsTab; label: string }> = [
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'graphs', label: 'Graphs' },
]

/**
 * The Stats screen (ADR-0035 §6): the `'stats'` route's body and its two tabs.
 * **Dashboard** is the numbers over one overview snapshot; **Graphs** is one
 * metric per screen over the day records, which it reads itself.
 *
 * The overview is read once per mount (`useStatsOverview`) — stats only change
 * at session end, which always navigates — while the editors get their future
 * values from live settings. Once pinned, current-day progress and this week's
 * budget remain on the overview snapshot until the next boundary (§5).
 */
export default function StatsView() {
  const [tab, setTab] = useState<StatsTab>('dashboard')
  const { overview, loaded } = useStatsOverview()
  // Day records feed only the Today card's trend baseline (previous active
  // day); the Dashboard still renders as soon as the overview is in, and the
  // trends light up when this second read lands.
  const { days } = useStatsDays()
  const { settings, saveSettings } = useSettings()

  const todayKey = localDateKey(Date.now())
  const quotaPages = displayedQuotaPages(settings.daily_word_quota)
  const weeklyTargetDays = displayedWeeklyTargetDays(settings.weekly_quota_days)
  const goalPins = goalPinsFromOverview(overview)
  const liveQuotaWords = quotaWordsFromPages(quotaPages)

  return (
    <div className="stats-view">
      <header className="stats-view-header">
        <h1 className="stats-view-title">Stats</h1>
        <Segmented<StatsTab>
          label="Stats tab"
          value={tab}
          options={TAB_OPTIONS}
          onChange={setTab}
        />
      </header>

      {tab === 'graphs' ? (
        <StatsGraphs
          todayKey={todayKey}
          quotaTargetWords={effectiveDailyQuotaWords(overview, liveQuotaWords)}
        />
      ) : !loaded ? (
        <p className="stats-view-hint">Loading…</p>
      ) : (
        <StatsDashboard
          model={deriveDashboard({ overview, quotaPages, weeklyTargetDays, days, todayKey })}
          quotaPages={quotaPages}
          weeklyTargetDays={weeklyTargetDays}
          goalPins={goalPins}
          onGoalChange={(patch) => {
            void saveSettings(patch)
          }}
        />
      )}
    </div>
  )
}
