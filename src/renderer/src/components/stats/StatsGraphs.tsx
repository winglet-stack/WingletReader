import React, { useMemo, useState } from 'react'
import type { DayStatsRecord, SessionStatsRecord } from '../../types'
import Segmented from '../settings/instruments/Segmented'
import type { SegmentedOption } from '../settings/instruments/Segmented'
import BarChart from './charts/BarChart'
import LineChart from './charts/LineChart'
import PieChart from './charts/PieChart'
import { useStatsHistory } from './useStatsHistory'
import {
  GRAPH_METRICS,
  buildSeries,
  buildSessionRows,
  firstEnabledTimeframe,
  highlightKey,
  metricDefinition,
  quotaCompletion,
  timeframeAvailability
} from './graphsMetrics'
import type {
  GraphMetricDefinition,
  GraphMetricKey,
  GraphTimeframe,
  GraphView,
  SessionRow,
  TimeframeAvailability
} from './graphsMetrics'

interface Props {
  /** Today's local date key — the anchor every collation is taken around. */
  todayKey: string
  /** The **live** quota in words (09's rule: the setting, not the snapshot). */
  quotaTargetWords: number
}

/**
 * The Graphs tab (ADR-0035 §6): **one metric per screen**, never combined —
 * a metric tab row over a timeframe switch, and one chart under both.
 *
 * This is the wiring half: one history read when the tab is opened, and the
 * loading state until it lands. Everything the tab decides lives in the pure
 * {@link StatsGraphsBody} below, which is also what the fit harness measures.
 */
export default function StatsGraphs({ todayKey, quotaTargetWords }: Props) {
  const { days, sessions, loaded } = useStatsHistory()
  if (!loaded) return <p className="stats-view-hint">Loading…</p>
  return (
    <StatsGraphsBody
      days={days}
      sessions={sessions}
      todayKey={todayKey}
      quotaTargetWords={quotaTargetWords}
    />
  )
}

/**
 * The tab body — props in, one chart out.
 *
 * Three things it does not do. It never re-buckets: `graphsMetrics` maps
 * `statsMath`'s collated buckets to a series and nothing here touches a date.
 * It never scrolls: the figure box is a fixed height and the today drill-in
 * caps its rows, so the page height is the same with four sessions or forty.
 * And it never lands on a dead tab — the effective timeframe falls back to the
 * first available one, so switching to a metric that has no session view moves
 * off Today instead of showing an empty screen.
 */
export function StatsGraphsBody({
  days,
  sessions,
  todayKey,
  quotaTargetWords
}: Props & { days: readonly DayStatsRecord[]; sessions: readonly SessionStatsRecord[] }) {
  const [metricKey, setMetricKey] = useState<GraphMetricKey>('words')
  const [timeframe, setTimeframe] = useState<GraphTimeframe>('today')
  const [view, setView] = useState<GraphView>('buckets')

  const metric = metricDefinition(metricKey)
  const availability = useMemo(() => timeframeAvailability(days, metric), [days, metric])
  const selected = availability.find((entry) => entry.timeframe === timeframe)
  const effective = selected?.enabled ? timeframe : firstEnabledTimeframe(availability)
  const showTotals = metric.cumulative && effective !== 'today' && effective !== null

  return (
    <div className="stats-graphs">
      <Segmented<GraphMetricKey>
        label="Metric"
        value={metricKey}
        options={GRAPH_METRICS.map((entry) => ({ value: entry.key, label: entry.label }))}
        onChange={setMetricKey}
      />

      <div className="stats-graphs-controls">
        <Segmented<GraphTimeframe>
          label="Timeframe"
          value={effective ?? 'today'}
          options={availability.map(toTimeframeOption)}
          onChange={setTimeframe}
        />
        {showTotals && (
          <Segmented<GraphView>
            label="Series"
            value={view}
            options={[
              { value: 'buckets', label: 'Per day' },
              { value: 'total', label: 'Running total' }
            ]}
            onChange={setView}
          />
        )}
      </div>

      <p className="stats-graphs-hint">{unavailableHint(availability)}</p>

      <GraphFigure
        days={days}
        sessions={sessions}
        metric={metric}
        timeframe={effective}
        todayKey={todayKey}
        quotaTargetWords={quotaTargetWords}
        view={showTotals ? view : 'buckets'}
      />
    </div>
  )
}

function toTimeframeOption(entry: TimeframeAvailability): SegmentedOption<GraphTimeframe> {
  return { value: entry.timeframe, label: entry.label, disabled: !entry.enabled }
}

/**
 * The one line under the switch. A disabled pill cannot be clicked to explain
 * itself, so the nearest unmet threshold is stated outright — it doubles as a
 * progress marker ("Month needs 8 days of reading").
 */
function unavailableHint(availability: readonly TimeframeAvailability[]): string {
  return availability.find((entry) => !entry.enabled)?.hint ?? ''
}

/** How many session rows the fixed-height figure box holds. */
const SESSION_ROW_CAP = 8

function GraphFigure({
  days,
  sessions,
  metric,
  timeframe,
  todayKey,
  quotaTargetWords,
  view
}: {
  days: readonly DayStatsRecord[]
  sessions: readonly SessionStatsRecord[]
  metric: GraphMetricDefinition
  timeframe: GraphTimeframe | null
  todayKey: string
  quotaTargetWords: number
  view: GraphView
}) {
  if (timeframe === null) {
    return (
      <p className="stats-graphs-empty" role="status">
        Not enough history yet.
      </p>
    )
  }

  const label = `${metric.caption} — ${timeframe === 'today' ? 'today' : timeframe}`

  if (metric.chart === 'donut') {
    const quota = quotaCompletion({ days, timeframe, todayKey, quotaTargetWords })
    return (
      <figure className="stats-graphs-figure stats-graphs-figure--donut">
        <PieChart fraction={quota.fraction} ariaLabel={label} className="stats-graphs-donut" />
        <figcaption className="stats-graphs-caption">{quota.detail}</figcaption>
      </figure>
    )
  }

  if (timeframe === 'today') {
    return <SessionList rows={buildSessionRows(sessions, metric)} metric={metric} />
  }

  const series = buildSeries({ days, metric, timeframe, todayKey, view })
  return (
    <figure className="stats-graphs-figure">
      <div className="stats-graphs-plot">
        {view === 'total' ? (
          <LineChart series={series} ariaLabel={`${label}, running total`} showArea />
        ) : (
          <BarChart series={series} ariaLabel={label} highlightKey={highlightKey(timeframe, todayKey)} />
        )}
      </div>
      <figcaption className="stats-graphs-caption">
        {metric.caption} · {metric.unit}
      </figcaption>
    </figure>
  )
}

/**
 * Today's sessions — the only session-level surface in the app (§6). Rows are
 * capped so the page height cannot grow with a long reading day; the remainder
 * is disclosed rather than silently dropped.
 */
function SessionList({ rows, metric }: { rows: SessionRow[]; metric: GraphMetricDefinition }) {
  if (rows.length === 0) {
    return (
      <p className="stats-graphs-empty" role="status">
        No sessions recorded today yet.
      </p>
    )
  }

  const shown = rows.slice(0, SESSION_ROW_CAP)
  return (
    <figure className="stats-graphs-figure">
      <ul className="stats-sessions" aria-label={`Today's sessions — ${metric.caption}`}>
        {shown.map((row) => (
          <li className="stats-session" key={row.key}>
            <span className="stats-session-time">{row.time}</span>
            <span className="stats-session-title">{row.title}</span>
            <span className="stats-session-bar" aria-hidden="true">
              <span
                className="stats-session-bar-fill"
                style={{ width: `${Math.round(row.fraction * 100)}%` }}
              />
            </span>
            <span className="stats-session-value">{row.display}</span>
          </li>
        ))}
      </ul>
      <figcaption className="stats-graphs-caption">
        {rows.length > shown.length
          ? `${rows.length - shown.length} more session${
              rows.length - shown.length === 1 ? '' : 's'
            } today · ${metric.caption}`
          : `${metric.caption} per session today`}
      </figcaption>
    </figure>
  )
}
