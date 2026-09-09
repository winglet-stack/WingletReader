import { useEffect, useState } from 'react'
import type { DayStatsRecord, SessionStatsRecord } from '../../types'

export interface StatsHistoryState {
  /** Every day record, oldest first; empty while loading or with no bridge. */
  days: DayStatsRecord[]
  /** Today's session records, oldest first — the drill-in's only source. */
  sessions: SessionStatsRecord[]
  /** True once both reads settled (either way) — "loading" vs "no history". */
  loaded: boolean
}

const EMPTY: StatsHistoryState = { days: [], sessions: [], loaded: true }

/**
 * The Graphs tab's history read (ADR-0035 §6): day records plus today's
 * sessions, both fetched once per mount, in parallel.
 *
 * Deliberately **not** part of `useStatsOverview`: this hook lives in the
 * Graphs tab body, so a user who never opens Graphs never pays for the
 * session-list read (the Dashboard reads only the day list, via
 * {@link useStatsDays}). Like the overview, nothing subscribes — stats change
 * only at session end, which always navigates.
 */
export interface StatsDaysState {
  /** Every day record; empty while loading or with no bridge. */
  days: DayStatsRecord[]
  loaded: boolean
}

/**
 * The Dashboard tab's day-record read: the trend baseline (the previous
 * active day) lives in the day list, which the overview snapshot deliberately
 * does not carry. Same discipline as {@link useStatsHistory} — fetched once
 * per mount, no subscription — but without the session-list read the
 * Dashboard has no use for.
 */
export function useStatsDays(): StatsDaysState {
  const [state, setState] = useState<StatsDaysState>({ days: [], loaded: false })

  useEffect(() => {
    let cancelled = false
    const db = window.api?.db
    if (!db?.getStatsDays) {
      setState({ days: [], loaded: true })
      return
    }
    db.getStatsDays()
      .then((days) => {
        if (!cancelled) setState({ days: days ?? [], loaded: true })
      })
      .catch(() => {
        if (!cancelled) setState({ days: [], loaded: true })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return state
}

export function useStatsHistory(): StatsHistoryState {
  const [state, setState] = useState<StatsHistoryState>({
    days: [],
    sessions: [],
    loaded: false
  })

  useEffect(() => {
    let cancelled = false
    const db = window.api?.db
    if (!db?.getStatsDays || !db?.getTodaySessionStats) {
      setState(EMPTY)
      return
    }
    Promise.all([db.getStatsDays(), db.getTodaySessionStats()])
      .then(([days, sessions]) => {
        if (!cancelled) {
          setState({ days: days ?? [], sessions: sessions ?? [], loaded: true })
        }
      })
      .catch(() => {
        if (!cancelled) setState(EMPTY)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return state
}
