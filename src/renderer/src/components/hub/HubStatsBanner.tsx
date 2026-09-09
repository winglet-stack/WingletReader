import React from 'react'
import { useNavigation } from '../../contexts/NavigationContext'
import { useStatsOverview } from '../stats/useStatsOverview'
import { formatReadingTime } from '../stats/statsFormat'

/**
 * Hub stats banner (ADR-0035 §6): a long rectangular button in the hub header
 * row, between the dove and the Alpha/version block. It previews total words
 * read · today's quota % · today's reading time from one overview snapshot on
 * hub mount, and opens the Stats screen.
 *
 * **Why the header row and not a row of its own** (the ADR's original wording):
 * the hub face is vertically centred, so a new row of its own pushed the logo
 * and the version text up and the tile grid down. The header row is already
 * 96px tall because of the dove, so a banner inside it costs the face no
 * height at all and every other element keeps the position it had.
 *
 * It is a plain sibling button in the hub's natural tab order — deliberately
 * outside the 3-column tile roster and its 2-D `moveFocus` math, so the grid's
 * keyboard model (and its markup) stays untouched.
 */
export default function HubStatsBanner() {
  const { setView } = useNavigation()
  const { overview, loaded } = useStatsOverview()

  const hasData = overview !== null && overview.totals.sessionCount > 0

  return (
    <button
      type="button"
      className="hub-stats-banner"
      aria-label="Reading stats"
      onClick={() => setView('stats')}
    >
      <span className="hub-stats-banner-label">Stats</span>
      {!loaded ? null : hasData ? (
        <span className="hub-stats-banner-metrics">
          <span className="hub-stats-banner-metric">
            {overview.totals.wordsRead.toLocaleString()} words read
          </span>
          <span className="hub-stats-banner-sep" aria-hidden="true">·</span>
          {overview.today.sessionCount > 0 ? (
            <>
              <span className="hub-stats-banner-metric">
                today {overview.today.quotaPercent}% of quota
              </span>
              <span className="hub-stats-banner-sep" aria-hidden="true">·</span>
              {/* Active time, not wall time (ADR-0036 §4): a Reader left open
                  over lunch must not read as an afternoon of reading. */}
              <span className="hub-stats-banner-metric">
                {formatReadingTime(overview.today.activeMs)} today
              </span>
            </>
          ) : (
            <span className="hub-stats-banner-metric">no reading yet today</span>
          )}
        </span>
      ) : (
        <span className="hub-stats-banner-metrics hub-stats-banner-metrics--invite">
          Read your first session to light this up — words, quota, streak
        </span>
      )}
    </button>
  )
}
