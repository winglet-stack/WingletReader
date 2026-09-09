/**
 * Unit tests for `useSessionStatsSummary` — the Session dialog's stats block as
 * the Reader assembles it (ADR-0035 §6).
 *
 * The two halves are tested apart: the session's own numbers must be present on
 * the first render (no round-trip), and the baseline ladder must resolve after
 * the fetch, with the finished session excluded from today's list — it is
 * already stored by the time the dialog opens.
 *
 * Environment: happy-dom (vitest.config.ts environmentMatchGlobs).
 */

import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { useSessionStatsSummary } from '../hooks/useSessionStatsSummary'
import type { SessionStatsRecord } from '../types'
import type { DayStatsRecord } from '../../../shared/domainRecords'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

const MINUTE = 60_000
/** A fixed local instant, so `localDateKey` is timezone-agnostic here. */
const TODAY_NOON = new Date(2026, 7, 12, 12, 0, 0).getTime()

function record(overrides: Partial<SessionStatsRecord> = {}): SessionStatsRecord {
  return {
    textId: 7,
    title: 'A Text',
    startedAt: TODAY_NOON,
    endedAt: TODAY_NOON + 8 * MINUTE,
    activeMs: 6 * MINUTE,
    wordsRead: 600,
    pauses: 2,
    rewinds: 1,
    ...overrides,
  }
}

function day(date: string, overrides: Partial<DayStatsRecord> = {}): DayStatsRecord {
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
    ...overrides,
  }
}

function stubApi(sessions: SessionStatsRecord[], days: DayStatsRecord[], overrides = {}) {
  const api = {
    db: {
      getTodaySessionStats: vi.fn().mockResolvedValue(sessions),
      getStatsDays: vi.fn().mockResolvedValue(days),
      ...overrides,
    },
  }
  vi.stubGlobal('api', api)
  return api
}

function Harness({ finished }: { finished: SessionStatsRecord | null }) {
  const summary = useSessionStatsSummary(finished)
  return (
    <div>
      <span data-testid="present">{summary ? 'yes' : 'no'}</span>
      <span data-testid="metrics">{summary ? `${summary.metrics.wordsRead}/${summary.metrics.wpm}` : ''}</span>
      <span data-testid="baseline">
        {summary?.baseline
          ? `${summary.baseline.source}:${summary.baseline.sessionCount}:${summary.baseline.wordsRead}`
          : 'none'}
      </span>
    </div>
  )
}

describe('useSessionStatsSummary', () => {
  it('has the session own numbers before any fetch resolves', () => {
    stubApi([], [])
    render(<Harness finished={record()} />)

    // 600 words over 6 active minutes.
    expect(screen.getByTestId('metrics').textContent).toBe('600/100')
  })

  it("averages today's earlier sessions, excluding the session being reported", async () => {
    stubApi(
      [
        record({ startedAt: TODAY_NOON - 3 * 60 * MINUTE, wordsRead: 400 }),
        record({ startedAt: TODAY_NOON - 2 * 60 * MINUTE, wordsRead: 800 }),
        // The finished session itself, already stored — never its own baseline.
        record(),
      ],
      [day('2026-08-11', { wordsRead: 9999, sessionCount: 1 })],
    )
    render(<Harness finished={record()} />)

    await waitFor(() =>
      expect(screen.getByTestId('baseline').textContent).toBe('today:2:600'),
    )
  })

  it('falls back to the most recent prior active day', async () => {
    stubApi(
      [record()],
      [
        day('2026-08-09', { wordsRead: 100, sessionCount: 1 }),
        day('2026-08-10', { sessionCount: 0 }),
        day('2026-08-11', { wordsRead: 1500, activeMs: 25 * MINUTE, sessionCount: 3 }),
      ],
    )
    render(<Harness finished={record()} />)

    await waitFor(() =>
      expect(screen.getByTestId('baseline').textContent).toBe('prior-day:3:500'),
    )
  })

  it('hides the comparison when there is no earlier history', async () => {
    const api = stubApi([record()], [])
    render(<Harness finished={record()} />)

    await waitFor(() => expect(api.db.getStatsDays).toHaveBeenCalled())
    expect(screen.getByTestId('baseline').textContent).toBe('none')
    expect(screen.getByTestId('present').textContent).toBe('yes')
  })

  it('reports nothing at all when no session was recorded', () => {
    const api = stubApi([record()], [day('2026-08-11', { wordsRead: 100, sessionCount: 1 })])
    render(<Harness finished={null} />)

    expect(screen.getByTestId('present').textContent).toBe('no')
    expect(api.db.getTodaySessionStats).not.toHaveBeenCalled()
  })

  it('still shows the session numbers when the host has no stats channels', () => {
    vi.stubGlobal('api', { db: {} })
    render(<Harness finished={record()} />)

    expect(screen.getByTestId('metrics').textContent).toBe('600/100')
    expect(screen.getByTestId('baseline').textContent).toBe('none')
  })

  it('keeps the numbers when the baseline fetch fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const api = stubApi([], [], {
      getStatsDays: vi.fn().mockRejectedValue(new Error('store unreadable')),
    })
    render(<Harness finished={record()} />)

    await waitFor(() => expect(error).toHaveBeenCalled())
    expect(api.db.getTodaySessionStats).toHaveBeenCalled()
    expect(screen.getByTestId('metrics').textContent).toBe('600/100')
    expect(screen.getByTestId('baseline').textContent).toBe('none')
    error.mockRestore()
  })
})
