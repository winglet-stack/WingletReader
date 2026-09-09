/**
 * Hub stats banner (ADR-0035 §6, cascade issue 07 — the tracer bullet's hub
 * end): a long rectangular button in the hub header row, between the dove and
 * the Alpha/version block.
 *
 * Pins the three behaviours the banner owns — it previews the overview numbers
 * from one `getStatsOverview` snapshot on hub mount, it navigates to the
 * `'stats'` route on activation, and its zero-data state is an invitation, not
 * dead zeros — plus the ADR-0035 hub consequence: the 3×2 tile grid's markup
 * is untouched and the banner stays outside it.
 *
 * Environment: happy-dom (matched by vitest.config.ts environmentMatchGlobs).
 */

import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DEFAULT_SETTINGS } from '../../../shared/settings'
import HubView from '../components/hub/HubView'
import { LibraryProvider } from '../contexts/LibraryContext'
import { NavigationProvider, useNavigation } from '../contexts/NavigationContext'
import { ReaderProvider } from '../contexts/ReaderContext'
import { SettingsProvider } from '../contexts/SettingsContext'
import type { StatsOverview } from '../types'

const OVERVIEW: StatsOverview = {
  totals: {
    wordsRead: 12345,
    wallMs: 5_400_000,
    activeMs: 4_800_000,
    pauses: 10,
    rewinds: 3,
    sessionCount: 9,
    activeDays: 4,
  },
  today: {
    date: '2026-08-12',
    wordsRead: 800,
    wallMs: 1_080_000, // 18 min
    activeMs: 900_000,
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

/** A zero-history overview, as `getStatsOverview` returns it for a fresh store. */
const EMPTY_OVERVIEW: StatsOverview = {
  totals: {
    wordsRead: 0, wallMs: 0, activeMs: 0, pauses: 0, rewinds: 0, sessionCount: 0, activeDays: 0,
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
    fluency: 100,
  },
  goals: { dailyPinned: false, weeklyPinned: false, weeklyTargetDays: 5 },
  streak: 0,
  points: 0,
  highscores: {
    bestDayWords: 0, bestSessionFluency: 0, longestSessionMs: 0, longestStreak: 0,
  },
}

const INVITATION = 'Read your first session to light this up — words, quota, streak'

function stubApi(overview: StatsOverview | null) {
  const db: Record<string, unknown> = {
    getTexts: vi.fn().mockResolvedValue([]),
    getLatestResumeCandidate: vi.fn().mockResolvedValue(null),
    saveSettings: vi.fn().mockResolvedValue(DEFAULT_SETTINGS),
  }
  // `overview === null` models a bridge without the stats channel at all.
  if (overview !== null) db.getStatsOverview = vi.fn().mockResolvedValue(overview)
  vi.stubGlobal('api', { db })
}

/** Exposes the navigation token so activation can be observed from outside. */
function ViewProbe() {
  const { view } = useNavigation()
  return <span data-testid="view-probe">{view}</span>
}

async function mountHub() {
  let container!: HTMLElement
  await act(async () => {
    const result = render(
      <NavigationProvider>
        <SettingsProvider initialSettings={DEFAULT_SETTINGS}>
          <LibraryProvider>
            <ReaderProvider>
              <ViewProbe />
              <HubView appVersion="0.2.0-alpha.test" />
            </ReaderProvider>
          </LibraryProvider>
        </SettingsProvider>
      </NavigationProvider>
    )
    container = result.container
  })
  return container
}

beforeEach(() => {
  sessionStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('hub stats banner — overview preview', () => {
  it('previews total words read · today quota % · today reading time', async () => {
    stubApi(OVERVIEW)
    await mountHub()

    expect(
      await screen.findByText(`${(12345).toLocaleString()} words read`)
    ).toBeTruthy()
    expect(screen.getByText('today 80% of quota')).toBeTruthy()
    // Active time (15 min), not the 18-minute session span (ADR-0036 §4).
    expect(screen.getByText('15 min today')).toBeTruthy()
    expect(screen.queryByText('18 min today')).toBeNull()
  })

  it('reads active time even when the Reader sat open all afternoon', async () => {
    stubApi({
      ...OVERVIEW,
      // A four-hour span with six minutes of reading in it.
      today: { ...OVERVIEW.today, wallMs: 14_400_000, activeMs: 360_000 },
    })
    await mountHub()

    expect(await screen.findByText('6 min today')).toBeTruthy()
    expect(screen.queryByText('4 h 00 min today')).toBeNull()
  })

  it('says "no reading yet today" instead of a dead 0% when history exists but today is idle', async () => {
    stubApi({
      ...OVERVIEW,
      today: { ...EMPTY_OVERVIEW.today },
    })
    await mountHub()

    expect(await screen.findByText('no reading yet today')).toBeTruthy()
    expect(screen.queryByText('today 0% of quota')).toBeNull()
    expect(screen.queryByText('0 min today')).toBeNull()
  })
})

describe('hub stats banner — activation', () => {
  it('is a native button (Enter/Space activate) and opens the stats route on click', async () => {
    stubApi(OVERVIEW)
    await mountHub()

    const banner = await screen.findByRole('button', { name: 'Reading stats' })
    expect(banner.tagName).toBe('BUTTON')
    expect(screen.getByTestId('view-probe').textContent).toBe('hub')

    fireEvent.click(banner)
    expect(screen.getByTestId('view-probe').textContent).toBe('stats')
  })
})

describe('hub stats banner — zero-data state', () => {
  it('shows the invitation, not dead zeros, on a fresh store', async () => {
    stubApi(EMPTY_OVERVIEW)
    await mountHub()

    expect(await screen.findByText(INVITATION)).toBeTruthy()
    expect(screen.queryByText('0 words read')).toBeNull()
    expect(screen.queryByText(/0% of quota/)).toBeNull()
  })

  it('falls back to the invitation when the stats bridge is absent', async () => {
    stubApi(null)
    await mountHub()

    expect(await screen.findByText(INVITATION)).toBeTruthy()
  })
})

describe('hub stats banner — the protected hub surface around it', () => {
  it('sits in the header row, between the dove and the version block', async () => {
    stubApi(OVERVIEW)
    const container = await mountHub()

    // The banner is a child of the header, not a row of its own: that is what
    // keeps it from adding height to the vertically-centred hub face, which
    // would push the logo and the version text up and the tile grid down.
    const face = container.querySelector('.hub-face')!
    expect(Array.from(face.children).map((el) => el.className.split(' ')[0])).toEqual([
      'hub-header',
      'hub-tiles',
    ])

    const header = container.querySelector('.hub-header')!
    expect(Array.from(header.children).map((el) => el.className.split(' ')[0])).toEqual([
      'hub-identity-dove',
      'hub-stats-banner',
      'hub-status',
    ])
  })

  it('leaves the 3×2 tile grid untouched: six tiles, banner outside', async () => {
    stubApi(OVERVIEW)
    const container = await mountHub()

    const grid = container.querySelector('.hub-tiles')!
    expect(grid.children.length).toBe(6)
    expect(Array.from(grid.children).every((el) => el.classList.contains('hub-tile'))).toBe(true)
    expect(grid.querySelector('.hub-stats-banner')).toBeNull()
  })
})
