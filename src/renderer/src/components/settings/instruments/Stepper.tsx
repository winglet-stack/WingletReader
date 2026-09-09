import React from 'react'
import { useDraftValue } from '../../../hooks/useDraftValue'

interface StepperProps {
  /** Accessible name — used for the −/+ buttons and (optionally) the value box. */
  label: string
  value: number
  min: number
  max: number
  /** Increment per −/+ press. Defaults to 1. */
  step?: number
  onChange: (value: number) => void
  /** Allow direct type-in of the value (default true). When false a static span shows. */
  allowTypeIn?: boolean
  disabled?: boolean
  id?: string
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

/**
 * `[− n +]` stepper for small bounded integers (words-per-stack, stacks-visible,
 * lines-count). Clamps to `[min, max]`; the −/+ buttons disable at the edges.
 * With `allowTypeIn` (default) the centre is a numeric box that mirrors the live
 * value unless focused and commits a clamped integer on blur/Enter.
 */
export default function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  allowTypeIn = true,
  disabled = false,
  id,
}: StepperProps) {
  const commit = (raw: string) => {
    const parsed = Number(raw)
    const next = raw.trim() === '' || !Number.isFinite(parsed) ? value : clamp(Math.round(parsed), min, max)
    onChange(next)
    setDraft(String(next))
  }

  const { draft, setDraft, onFocus, onBlur, onKeyDown } = useDraftValue(value, commit)

  const atMin = value <= min
  const atMax = value >= max

  return (
    <div className="settings-stepper" role="group" aria-label={label}>
      <button
        type="button"
        className="settings-stepper-btn"
        aria-label={`Decrease ${label}`}
        disabled={disabled || atMin}
        onClick={() => onChange(clamp(value - step, min, max))}
      >
        −
      </button>
      {allowTypeIn ? (
        <input
          id={id}
          type="number"
          className="form-input form-input-sm settings-stepper-value"
          min={min}
          max={max}
          step={step}
          value={draft}
          aria-label={`${label} value`}
          disabled={disabled}
          onFocus={onFocus}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
        />
      ) : (
        <span className="settings-stepper-value" aria-hidden="true">
          {value}
        </span>
      )}
      <button
        type="button"
        className="settings-stepper-btn"
        aria-label={`Increase ${label}`}
        disabled={disabled || atMax}
        onClick={() => onChange(clamp(value + step, min, max))}
      >
        +
      </button>
    </div>
  )
}
