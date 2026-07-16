import React from 'react'
import { formatDuration, formatFileSize } from '../../engine/videoRenderer'

interface Props {
  stackCount: number
  estimatedDurationMs: number
  estimatedBytes: number
  overMaxDuration: boolean
  maxDurationMinutes: number | null
}

export default function TransmuteEstimate({
  stackCount,
  estimatedDurationMs,
  estimatedBytes,
  overMaxDuration,
  maxDurationMinutes
}: Props) {
  return (
    <section className="transmute-estimate" aria-label="Current Transmute estimate">
      <div className="transmute-estimate-row">
        <span className="transmute-estimate-label">Estimated duration</span>
        <span className="transmute-estimate-value">
          {stackCount > 0 ? `~${formatDuration(estimatedDurationMs)}` : '-'}
        </span>
      </div>
      <div className="transmute-estimate-row">
        <span className="transmute-estimate-label">Estimated file size</span>
        <span className="transmute-estimate-value transmute-estimate-hint">
          {stackCount > 0 ? `<=${formatFileSize(estimatedBytes)} (upper bound)` : '-'}
        </span>
      </div>
      {overMaxDuration && (
        <p className="transmute-estimate-warning">
          Estimated duration exceeds the {maxDurationMinutes}-minute limit. Reduce content or increase the limit to render.
        </p>
      )}
      {!overMaxDuration && estimatedDurationMs > 2 * 60 * 60 * 1000 && (
        <p className="transmute-estimate-warning">
          This video would be over 2 hours. Consider rendering a single chapter instead.
        </p>
      )}
    </section>
  )
}
