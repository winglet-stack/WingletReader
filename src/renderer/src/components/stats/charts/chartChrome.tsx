import React from 'react'

/**
 * Shared chrome for the stats charts (ADR-0035 §6): the common frame the
 * line/bar charts draw into, the axis text styling, and the explicit
 * empty-data state every chart must render instead of a broken plot.
 *
 * All colour is design tokens (`--cobalt-accent`, `--text-muted`, `--border`,
 * surfaces/text) so both themes are correct for free — never hex here.
 */

/** ViewBox frame for the rectangular charts, in viewBox units. */
export const FRAME = {
  width: 300,
  height: 160,
  /** The rectangle marks occupy; y ticks live left of it, x labels below. */
  plot: { left: 40, top: 12, width: 248, height: 118 }
} as const

/** Baseline (value 0) y position inside the frame. */
export const BASELINE_Y = FRAME.plot.top + FRAME.plot.height

/** Axis/tick text — muted ink, never the series colour. */
export const AXIS_TEXT = {
  fill: 'var(--text-muted)',
  fontSize: 9,
  fontFamily: 'var(--font-sans)'
} as const

/** Recessive hairline for gridlines and axis rules. */
export const GRID_STROKE = {
  stroke: 'var(--border)',
  strokeWidth: 1,
  vectorEffect: 'non-scaling-stroke'
} as const

interface EmptyChartProps {
  ariaLabel: string
  width: number
  height: number
  className?: string
}

/** The explicit empty-data state: same footprint, one muted line of copy. */
export function EmptyChart({ ariaLabel, width, height, className }: EmptyChartProps) {
  return (
    <svg
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={ariaLabel}
      data-empty="true"
    >
      <text
        x={width / 2}
        y={height / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--text-muted)"
        fontSize={11}
        fontFamily="var(--font-sans)"
      >
        Not enough data yet
      </text>
    </svg>
  )
}
