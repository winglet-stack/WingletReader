import { useEffect, useState } from 'react'
import type { StatsOverview } from '../../types'

export interface StatsOverviewState {
  /** The overview snapshot, or null while loading / when the bridge is absent. */
  overview: StatsOverview | null
  /** True once the fetch settled (either way) — distinguishes "loading" from "no data". */
  loaded: boolean
}

/**
 * One overview read per mount (ADR-0035 §6): the hub banner and the Stats
 * screen both take a fresh snapshot when they appear; nothing subscribes to
 * live updates — stats only change at session end, which always navigates.
 */
export function useStatsOverview(): StatsOverviewState {
  const [state, setState] = useState<StatsOverviewState>({ overview: null, loaded: false })

  useEffect(() => {
    let cancelled = false
    const read = window.api?.db?.getStatsOverview
    if (!read) {
      setState({ overview: null, loaded: true })
      return
    }
    read()
      .then((overview) => {
        if (!cancelled) setState({ overview: overview ?? null, loaded: true })
      })
      .catch(() => {
        if (!cancelled) setState({ overview: null, loaded: true })
      })
    return () => { cancelled = true }
  }, [])

  return state
}
