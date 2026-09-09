import React, { useMemo } from 'react'
import { donutArc } from './chartMath'
import { EmptyChart } from './chartChrome'

/**
 * Progress donut for a single completion ratio — today's quota % (ADR-0035
 * §6). Pure props-in/SVG-out, viewBox-scaled to its container. The unfilled
 * track is border-gray, the filled arc is the accent, and the value sits
 * centered in text ink. The arc clamps at a full ring; the label keeps the
 * real percentage, so an over-quota day reads "140%" on a full circle.
 */

/** ViewBox side; the donut is square. */
const SIZE = 120
const CENTER = SIZE / 2
const RADIUS = 44
const RING_WIDTH = 12

interface Props {
  /** Completion fraction, 1 = 100%. `null`/non-finite renders the empty state. */
  fraction: number | null
  /** Accessible description of the chart (`role="img"` — SVG text is not read). */
  ariaLabel: string
  className?: string
}

export default function PieChart({ fraction, ariaLabel, className }: Props) {
  const geometry = useMemo(() => {
    if (fraction === null || !Number.isFinite(fraction)) return null
    return {
      arc: donutArc(fraction, RADIUS),
      label: `${Math.round(Math.max(fraction, 0) * 100)}%`
    }
  }, [fraction])

  if (!geometry) {
    return <EmptyChart ariaLabel={ariaLabel} width={SIZE} height={SIZE} className={className} />
  }

  return (
    <svg
      className={className}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={ariaLabel}
    >
      <circle
        cx={CENTER}
        cy={CENTER}
        r={RADIUS}
        fill="none"
        stroke="var(--border)"
        strokeWidth={RING_WIDTH}
      />
      {geometry.arc.filled > 0 && (
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          stroke="var(--cobalt-accent)"
          strokeWidth={RING_WIDTH}
          strokeDasharray={`${geometry.arc.filled} ${geometry.arc.circumference}`}
          transform={`rotate(-90 ${CENTER} ${CENTER})`}
          data-donut-arc="true"
        />
      )}
      <text
        x={CENTER}
        y={CENTER}
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--text)"
        fontSize={24}
        fontWeight={600}
        fontFamily="var(--font-sans)"
      >
        {geometry.label}
      </text>
    </svg>
  )
}
