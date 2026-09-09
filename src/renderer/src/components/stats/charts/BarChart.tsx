import React, { useMemo } from 'react'
import {
  ChartDatum,
  barLayout,
  barPath,
  computeTicks,
  formatTick,
  layoutXLabels,
  sanitizeValue,
  scaleY
} from './chartMath'
import { AXIS_TEXT, BASELINE_Y, EmptyChart, FRAME, GRID_STROKE } from './chartChrome'

/**
 * Bar chart for per-bucket sums (day/week buckets, ADR-0035 §6) — pure
 * props-in/SVG-out, viewBox-scaled to its container. Bars grow from a shared
 * baseline with a rounded data-end; when a bucket is highlighted (e.g.
 * "today") it alone wears the accent and carries a direct value label while
 * the rest recede to border-gray — emphasis, not a palette.
 */
interface Props {
  series: ChartDatum[]
  /** Accessible description of the plot (`role="img"` — SVG text is not read). */
  ariaLabel: string
  /** Anchor of the bucket to emphasise — matches `datum.key`, else `label`. */
  highlightKey?: string
  className?: string
}

export default function BarChart({ series, ariaLabel, highlightKey, className }: Props) {
  const geometry = useMemo(() => {
    if (series.length === 0) return null
    const { max, ticks } = computeTicks(Math.max(...series.map((d) => d.value)))
    const slots = barLayout(series.length, FRAME.plot)
    return {
      ticks: ticks.map((value) => ({ value, y: scaleY(value, max, FRAME.plot) })),
      bars: series.map((datum, index) => {
        const top = scaleY(datum.value, max, FRAME.plot)
        return {
          datum,
          slot: slots[index],
          top,
          path: barPath(slots[index].x, top, slots[index].width, BASELINE_Y),
          highlighted: highlightKey !== undefined && (datum.key ?? datum.label) === highlightKey
        }
      }),
      xLabels: layoutXLabels(
        series.map((d) => d.label),
        slots.map((slot) => slot.x + slot.width / 2),
        { viewWidth: FRAME.width }
      )
    }
  }, [series, highlightKey])

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

  const anyHighlight = geometry.bars.some((bar) => bar.highlighted)

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
      {geometry.bars.map(
        (bar, index) =>
          bar.path && (
            <path
              key={bar.datum.key ?? `${bar.datum.label}-${index}`}
              d={bar.path}
              fill={anyHighlight && !bar.highlighted ? 'var(--border)' : 'var(--cobalt-accent)'}
              stroke="none"
              data-highlighted={bar.highlighted || undefined}
            />
          )
      )}
      {geometry.bars.map(
        (bar, index) =>
          bar.highlighted && (
            <text
              key={`value-${bar.datum.key ?? index}`}
              x={bar.slot.x + bar.slot.width / 2}
              y={bar.top - 4}
              textAnchor="middle"
              fill="var(--text)"
              fontSize={9}
              fontFamily="var(--font-sans)"
            >
              {formatTick(sanitizeValue(bar.datum.value))}
            </text>
          )
      )}
      {geometry.xLabels.map((label) => (
        <text key={label.index} x={label.x} y={FRAME.height - 6} textAnchor={label.anchor} {...AXIS_TEXT}>
          {series[label.index].label}
        </text>
      ))}
    </svg>
  )
}
