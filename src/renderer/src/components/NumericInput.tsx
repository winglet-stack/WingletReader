import React from 'react'
import { useDraftValue } from '../hooks/useDraftValue'

interface NumericInputProps {
  value: number
  min: number
  max: number
  onCommit: (value: number) => void
  id?: string
  step?: number
  disabled?: boolean
  ariaLabel?: string
  className?: string
  style?: React.CSSProperties
}

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val))
}

export default function NumericInput({
  value,
  min,
  max,
  onCommit,
  id,
  step = 1,
  disabled = false,
  ariaLabel,
  className = 'form-input form-input-sm',
  style
}: NumericInputProps) {
  const parse = (raw: string) => {
    if (raw.trim() === '' || raw === '-') return null
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : null
  }

  const commit = (raw: string) => {
    const parsed = parse(raw)
    const next = parsed === null ? value : clamp(Math.round(parsed), min, max)
    onCommit(next)
    setDraft(String(next))
  }

  const { draft, setDraft, onFocus, onBlur, onKeyDown } = useDraftValue(value, commit)

  return (
    <input
      id={id}
      type="number"
      className={className}
      min={min}
      max={max}
      step={step}
      value={draft}
      disabled={disabled}
      aria-label={ariaLabel}
      style={style}
      onFocus={onFocus}
      onChange={(e) => {
        const next = e.target.value
        setDraft(next)
        const parsed = parse(next)
        if (parsed !== null && parsed >= min && parsed <= max) {
          onCommit(Math.round(parsed))
        }
      }}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    />
  )
}
