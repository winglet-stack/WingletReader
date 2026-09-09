import React, { useMemo } from 'react'
import {
  ChartDatum,
  computeTicks,
  formatTick,
  linePoints,
  linePath,
  areaPath,
  layoutXLabels,
  scaleY
} from './chartMath'
import { AXIS_TEXT, BASELINE_Y, EmptyChart, FRAME, GRID_STROKE } from './chartChrome'

/**
 * Line chart for growth/total series (ADR-0035 §6) — pure props-in/SVG-out,
 * viewBox-scaled to its container. One series, accent-coloured 2px line with
 * an end-dot and an optional area wash; hairline gridlines; axis text in
 * muted ink. Fewer than two points cannot make a line, so that renders the
 * explicit empty state instead.
 */
interface Props {
  series: ChartDatum[]
  /** Accessible description of the plot (`role="img"` — SVG text is not read). */
  ariaLabel: string
  /** Fill the area under the line with a faint accent wash. */
  showArea?: boolean
  className?: string
}

export default function LineChart({ series, ariaLabel, showArea = false, className }: Props) {
  const geometry = useMemo(() => {
    if (series.length < 2) return null
    const { max, ticks } = computeTicks(Math.max(...series.map((d) => d.value)))
    const points = linePoints(series, max, FRAME.plot)
    return {
      ticks: ticks.map((value) => ({ value, y: scaleY(value, max, FRAME.plot) })),
      points,
      line: linePath(points),
      area: showArea ? areaPath(points, BASELINE_Y) : null,
      xLabels: layoutXLabels(
        series.map((d) => d.label),
        points.map((p) => p.x),
        { viewWidth: FRAME.width }
      )
    }
  }, [series, showArea])

  if (!geometry) {
    return (
      <EmptyChart
        ariaLabel={ariaLabel}
        width={FRAME.width}
        height={FRAME.height}
        className={className}
      />
    )
  }

  const endPoint = geometry.points[geometry.points.length - 1]

  return (
    <svg
      className={className}
      viewBox={`0 0 ${FRAME.width} ${FRAME.height}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={ariaLabel}
    >
      {geometry.ticks.map((tick) => (
        <React.Fragment key={tick.value}>
          <line
            x1={FRAME.plot.left}
            x2={FRAME.plot.left + FRAME.plot.width}
            y1={tick.y}
            y2={tick.y}
            {...GRID_STROKE}
          />
          <text x={FRAME.plot.left - 6} y={tick.y + 3} textAnchor="end" {...AXIS_TEXT}>
            {formatTick(tick.value)}
          </text>
        </React.Fragment>
      ))}
      {geometry.area && (
        <path d={geometry.area} fill="var(--cobalt-accent)" fillOpacity={0.12} stroke="none" />
      )}
      <path
        d={geometry.line}
        fill="none"
        stroke="var(--cobalt-accent)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={endPoint.x} cy={endPoint.y} r={4} fill="var(--cobalt-accent)" stroke="none" />
      {geometry.xLabels.map((label) => (
        <text key={label.index} x={label.x} y={FRAME.height - 6} textAnchor={label.anchor} {...AXIS_TEXT}>
          {series[label.index].label}
        </text>
      ))}
    </svg>
  )
}
