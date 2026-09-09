/**
 * The Stats screen (ADR-0035 §6, cascade issues 07 + 09): the `'stats'` route's
 * body — the Dashboard/Graphs tab switch on the shared Segmented instrument,
 * and the Dashboard's full layout.
 *
 * What this suite pins beyond "the numbers render": the spec's **ordering**
 * (points top-right, quota/streak/goals ahead of every measured metric), the
 * fact that the Dashboard's two goal steppers write the **same settings patches
 * as the Settings landing group**, and the zero-history state — placeholders and
 * an invitation, with the goals still editable.
 *
 * Environment: happy-dom (matched by vitest.config.ts environmentMatchGlobs).
 */

import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import StatsView from '../components/stats/StatsView'
import ReadingGoalsGroup from '../components/settings/ReadingGoalsGroup'
import {
  DAILY_GOAL_PINNED_HINT,
  WEEKLY_GOAL_PINNED_HINT
} from '../components/settings/readingGoals'
import { SettingsProvider } from '../contexts/SettingsContext'
import { DEFAULT_SETTINGS } from '../types'
import type { Settings, StatsOverview } from '../types'

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
    longestSessionMs: 1_800_000, // 30 min
    longestStreak: 5,
  },
}

const EMPTY_OVERVIEW: StatsOverview = {
  totals: {
    wordsRead: 0,
    wallMs: 0,
    activeMs: 0,
    pauses: 0,
    rewinds: 0,
    sessionCount: 0,
    activeDays: 0,
  },
  today: {
    date: '2026-08-12',
    wordsRead: 0,
    wallMs: 0,
    activeMs: 0,
    sessionCount: 0,
    quotaTargetWords: 1000,
    quotaPercent: 0,
    quotaMet: false,
    points: 0,
    fluency: 0,
  },
  goals: { dailyPinned: false, weeklyPinned: false, weeklyTargetDays: 5 },
  streak: 0,
  points: 0,
  highscores: {
    bestDayWords: 0,
    bestSessionFluency: 0,
    longestSessionMs: 0,
    longestStreak: 0,
  },
}

/** Captures every settings patch the screen auto-saves. */
function stubApi(overview: StatsOverview | null) {
  const saveSettings = vi.fn(async (patch: Partial<Settings>) => ({
    ...DEFAULT_SETTINGS,
    ...patch,
  }))
  vi.stubGlobal('api', {
    db: {
      getStatsOverview: vi.fn().mockResolvedValue(overview),
      saveSettings,
    },
  })
  return saveSettings
}

async function mountStats(settings: Partial<Settings> = {}) {
  const container = { current: null as HTMLElement | null }
  await act(async () => {
    const result = render(
      <SettingsProvider initialSettings={{ ...DEFAULT_SETTINGS, ...settings } as Settings}>
        <StatsView />
      </SettingsProvider>
    )
    container.current = result.container
  })
  return container.current as HTMLElement
}

/** The `[− n +]` group for one goal, addressed by its accessible name. */
function stepper(label: string) {
  const group = screen.getByRole('group', { name: label })
  return {
    input: within(group).getByLabelText(`${label} value`) as HTMLInputElement,
    minus: within(group).getByLabelText(`Decrease ${label}`) as HTMLButtonElement,
    plus: within(group).getByLabelText(`Increase ${label}`) as HTMLButtonElement,
  }
}

function region(name: string) {
  return screen.getByRole('region', { name })
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Stats screen — Dashboard tab', () => {
  it('renders complete from an overview fixture', async () => {
    stubApi(OVERVIEW)
    await mountStats()

    expect(screen.getByRole('heading', { name: 'Stats' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Dashboard' }).getAttribute('aria-pressed')).toBe(
      'true'
    )

    // Quota — today's pinned 1,000-word snapshot.
    const quota = region("Today's quota")
    expect(quota.textContent).toContain('80%')
    expect(quota.textContent).toContain('1.6 of 2 pages')

    // Streak — the count and this week's rest-day budget.
    const streak = region('Streak')
    expect(streak.textContent).toContain('3 days')
    expect(streak.textContent).toContain('2 rest days a week')

    // Points.
    expect(region('Points').textContent).toContain((360).toLocaleString())

    // Today — words with pages, time, sessions, fluency, measured WPM.
    const today = region('Today')
    expect(today.textContent).toContain(`${(800).toLocaleString()} · 1.6 pages`)
    // Active reading time, not the 18-minute session span (ADR-0036 §4).
    expect(today.textContent).toContain('15 min')
    expect(today.textContent).not.toContain('18 min')
    expect(today.textContent).toContain('91')
    // 800 words ÷ 15 active minutes.
    expect(today.textContent).toContain(`${(53).toLocaleString()} wpm`)

    // Lifetime — sums plus the three averages derived at render.
    const lifetime = region('Lifetime')
    expect(lifetime.textContent).toContain((12_000).toLocaleString())
    expect(lifetime.textContent).toContain('1 h 20 min') // 80 active minutes
    expect(lifetime.textContent).not.toContain('1 h 30 min') // never the wall sum
    expect(lifetime.textContent).toContain((3000).toLocaleString()) // 12,000 words ÷ 4 active days
    expect(lifetime.textContent).toContain('10 min') // 4,800,000 active ms ÷ 8 sessions
    expect(lifetime.textContent).toContain('83') // fluency over the lifetime sums

    // Highscores.
    const highscores = region('Highscores')
    expect(highscores.textContent).toContain(`${(4200).toLocaleString()} words`)
    expect(highscores.textContent).toContain('97')
    expect(highscores.textContent).toContain('30 min')
    expect(highscores.textContent).toContain('5 days')
  })

  it('puts Points top-right, with quota, streak and the goals ahead of every metric', async () => {
    stubApi(OVERVIEW)
    const container = await mountStats()

    const cards = Array.from(container.querySelector('.stats-dashboard')!.children)
    expect(cards.map((card) => card.getAttribute('aria-label'))).toEqual([
      "Today's quota",
      'Streak',
      'Points',
      'Today',
      'Lifetime',
      'Highscores',
    ])
    // Three columns, so the third card is the top-right one.
    expect(cards[2].getAttribute('aria-label')).toBe('Points')
    // Both goal steppers live in the quota/streak cards, ahead of Today.
    expect(within(cards[0] as HTMLElement).getByRole('group', { name: 'Daily quota' })).toBeTruthy()
    expect(
      within(cards[1] as HTMLElement).getByRole('group', { name: 'Weekly target' })
    ).toBeTruthy()
  })

  it('keeps pinned quota progress when the editor changes tomorrow\'s value', async () => {
    const saveSettings = stubApi(OVERVIEW)
    await mountStats()

    expect(region("Today's quota").textContent).toContain('80%')

    await act(async () => {
      fireEvent.click(stepper('Daily quota').plus)
    })

    expect(saveSettings).toHaveBeenCalledWith({ daily_word_quota: 1500 })
    // The stepper moved to three, but today's card remains 800 / 1,000.
    expect(stepper('Daily quota').input.value).toBe('3')
    expect(region("Today's quota").textContent).toContain('80%')
    expect(region("Today's quota").textContent).toContain('1.6 of 2 pages')
    expect(region("Today's quota").textContent).toContain(DAILY_GOAL_PINNED_HINT)
    expect(window.api.db.getStatsOverview).toHaveBeenCalledTimes(1)
  })

  it('keeps this week\'s rest-day budget when next week\'s target changes', async () => {
    const saveSettings = stubApi(OVERVIEW)
    await mountStats()

    await act(async () => {
      fireEvent.click(stepper('Weekly target').minus)
    })

    expect(saveSettings).toHaveBeenCalledWith({ weekly_quota_days: 4 })
    expect(stepper('Weekly target').input.value).toBe('4')
    expect(region('Streak').textContent).toContain('2 rest days a week')
    expect(region('Streak').textContent).toContain(WEEKLY_GOAL_PINNED_HINT)
  })
})

describe('Stats screen — goal steppers', () => {
  /**
   * The shared-behaviour check: the Dashboard and the Settings landing edit the
   * same two keys through the same conversion, so a change to one surface's
   * rounding cannot silently diverge from the other's.
   */
  it('writes the same settings patches as the Settings landing group', async () => {
    const saveSettings = stubApi(OVERVIEW)
    await mountStats({ daily_word_quota: 1200, weekly_quota_days: 5 })

    // A legacy 1,200-word quota displays as 3 pages on both surfaces.
    expect(stepper('Daily quota').input.value).toBe('3')
    await act(async () => {
      fireEvent.click(stepper('Daily quota').plus)
    })
    await act(async () => {
      fireEvent.click(stepper('Weekly target').plus)
    })
    expect(screen.getByText(DAILY_GOAL_PINNED_HINT)).toBeTruthy()
    expect(screen.getByText(WEEKLY_GOAL_PINNED_HINT)).toBeTruthy()
    const fromDashboard = saveSettings.mock.calls.map(([patch]) => patch)
    cleanup()

    const update = vi.fn()
    render(
      <ReadingGoalsGroup
        local={{ ...DEFAULT_SETTINGS, daily_word_quota: 1200, weekly_quota_days: 5 } as Settings}
        update={update}
        goalPins={{ daily: true, weekly: true }}
      />
    )
    expect(stepper('Daily quota').input.value).toBe('3')
    fireEvent.click(stepper('Daily quota').plus)
    fireEvent.click(stepper('Weekly target').plus)

    expect(screen.getByText(DAILY_GOAL_PINNED_HINT)).toBeTruthy()
    expect(screen.getByText(WEEKLY_GOAL_PINNED_HINT)).toBeTruthy()
    expect(update.mock.calls.map(([patch]) => patch)).toEqual(fromDashboard)
    expect(fromDashboard).toEqual([{ daily_word_quota: 2000 }, { weekly_quota_days: 6 }])
  })

  it('shows each shared hint exactly when that period is pinned', async () => {
    const mixedPins = {
      ...EMPTY_OVERVIEW,
      goals: { dailyPinned: false, weeklyPinned: true, weeklyTargetDays: 5 }
    }
    stubApi(mixedPins)
    await mountStats()

    expect(screen.queryByText(DAILY_GOAL_PINNED_HINT)).toBeNull()
    expect(screen.getByText(WEEKLY_GOAL_PINNED_HINT)).toBeTruthy()
    cleanup()

    render(
      <ReadingGoalsGroup
        local={DEFAULT_SETTINGS as Settings}
        update={vi.fn()}
        goalPins={{ daily: false, weekly: true }}
      />
    )
    expect(screen.queryByText(DAILY_GOAL_PINNED_HINT)).toBeNull()
    expect(screen.getByText(WEEKLY_GOAL_PINNED_HINT)).toBeTruthy()
  })
})

describe('Stats screen — zero history', () => {
  it('keeps quota, streak and the goals visible behind em-dash placeholders', async () => {
    stubApi(EMPTY_OVERVIEW)
    await mountStats()

    // Goals and their surfaces are live from the first launch.
    expect(region("Today's quota").textContent).toContain('0%')
    expect(region("Today's quota").textContent).toContain('0 of 2 pages')
    expect(region('Streak').textContent).toContain('0 days')
    expect(stepper('Daily quota').input.value).toBe('2')
    expect(stepper('Weekly target').input.value).toBe('5')
    expect(screen.queryByText(DAILY_GOAL_PINNED_HINT)).toBeNull()
    expect(screen.queryByText(WEEKLY_GOAL_PINNED_HINT)).toBeNull()

    // History cells stand in rather than showing dead zeros.
    for (const name of ['Today', 'Lifetime', 'Highscores']) {
      const values = within(region(name)).getAllByText('—')
      expect(values.length).toBeGreaterThan(0)
    }
    expect(
      screen.getByText(/finish a reading session and these fill in/i)
    ).toBeTruthy()
  })

  it('treats an absent bridge as no history rather than failing to render', async () => {
    stubApi(null)
    await mountStats()

    expect(region('Points').textContent).toContain('0')
    expect(screen.getByRole('group', { name: 'Daily quota' })).toBeTruthy()
  })

  it('shows real lifetime numbers beside an em-dashed Today', async () => {
    stubApi({
      ...OVERVIEW,
      today: { ...OVERVIEW.today, wordsRead: 0, wallMs: 0, activeMs: 0, sessionCount: 0 },
    })
    await mountStats()

    expect(within(region('Today')).getAllByText('—').length).toBe(5)
    expect(within(region('Lifetime')).queryAllByText('—').length).toBe(0)
    expect(screen.queryByText(/finish a reading session and these fill in/i)).toBeNull()
  })
})

describe('Stats screen — tab switch', () => {
  /**
   * The tab switch itself. What the Graphs tab *plots* is
   * `statsGraphs.test.tsx`'s subject; here the api stub deliberately offers no
   * history reads, which is also the "bridge absent" case — the tab must still
   * mount and say what it has.
   */
  it('swaps the Dashboard for the Graphs tab and back', async () => {
    stubApi(OVERVIEW)
    await mountStats()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Graphs' }))
    })
    expect(screen.getByRole('group', { name: 'Metric' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Today' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }))
    expect(await screen.findByRole('region', { name: 'Today' })).toBeTruthy()
  })
})
