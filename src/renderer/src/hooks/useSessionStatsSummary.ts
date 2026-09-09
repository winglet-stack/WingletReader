/**
 * The Session dialog's stats block, assembled for one finished session
 * (ADR-0035 §6).
 *
 * Two halves with deliberately different costs:
 *
 * - **The session's own numbers** are already in hand. The tracker finalizes
 *   the record before the dialog's first render and the session exposes it as
 *   `finishedSessionStats`, so the six metrics need no round-trip and are
 *   present on the frame the dialog appears on.
 * - **The baseline** is history, so it is fetched — once, when the dialog
 *   opens, never while reading. Deviations appear a beat after the numbers do;
 *   that is the whole cost of the comparison.
 *
 * The finished session is already stored by the time this fetch answers (the
 * tracker emits at the session end, before the dialog opens), so today's list
 * comes back containing it. It is filtered out here — a session cannot be its
 * own baseline — by start instant and text, which is unique per session.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  deriveSessionBaseline,
  localDateKey,
  sessionMetrics,
  type SessionBaseline,
  type SessionStatsSummary,
  type SessionSums
} from '../../../shared/statsMath'
import type { SessionStatsRecord } from '../types'

/** Wall duration is derived, never stored (ADR-0035 §4) — the record has instants. */
function toSums(record: SessionStatsRecord): SessionSums {
  return {
    wordsRead: record.wordsRead,
    wallMs: Math.max(0, record.endedAt - record.startedAt),
    activeMs: record.activeMs,
    pauses: record.pauses,
    rewinds: record.rewinds
  }
}

function isSameSession(a: SessionStatsRecord, b: SessionStatsRecord): boolean {
  return a.startedAt === b.startedAt && a.textId === b.textId
}

/**
 * @param record the finished session's record, or null when nothing was
 * recorded (zero words, an unstored text, an RWW host) — in which case the
 * dialog shows no stats block at all.
 */
export function useSessionStatsSummary(
  record: SessionStatsRecord | null
): SessionStatsSummary | null {
  const [baseline, setBaseline] = useState<SessionBaseline | null>(null)

  useEffect(() => {
    setBaseline(null)
    if (!record) return

    const db = window.api?.db
    // A host without the stats channels (a test stub, an older bridge) simply
    // shows the session's own numbers — the block is useful without deviations.
    if (
      typeof db?.getTodaySessionStats !== 'function' ||
      typeof db?.getStatsDays !== 'function'
    ) {
      return
    }

    let cancelled = false
    void (async () => {
      try {
        const [sessions, days] = await Promise.all([
          db.getTodaySessionStats(),
          db.getStatsDays()
        ])
        if (cancelled) return
        setBaseline(
          deriveSessionBaseline({
            earlierSessions: sessions
              .filter((session) => !isSameSession(session, record))
              .map(toSums),
            days,
            // The session's own day: a run that crossed midnight belongs to the
            // day it started (§3), and that is the day it was filed under.
            todayKey: localDateKey(record.startedAt)
          })
        )
      } catch (error) {
        console.error('session stats baseline failed:', error)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [record])

  return useMemo(
    () => (record ? { metrics: sessionMetrics(toSums(record)), baseline } : null),
    [record, baseline]
  )
}
