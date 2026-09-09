import React from 'react'
import { useDraftValue } from '../../../hooks/useDraftValue'

/**
 * Optional non-linear mapping between a setting's *domain* value (e.g. a BPM) and
 * the *slider* position. The BPM (`engine/bpmScale.ts`) and Target-WPM
 * (`engine/wpmSolver.ts`) sliders are deliberately non-linear; a SliderField that
 * carries one of these keeps the existing slider feel while the numeric entry,
 * clamp and persisted value stay in the domain space.
 */
export interface SliderTransform {
  /** Map a domain value to a slider position. */
  toSlider: (value: number) => number
  /** Map a slider position back to a (snapped/clamped) domain value. */
  fromSlider: (sliderValue: number) => number
  sliderMin: number
  sliderMax: number
  sliderStep: number
}

interface SliderFieldProps {
  /** Accessible name for the range input (e.g. "Font size"). */
  label: string
  /** Current domain value. */
  value: number
  /** Domain bounds — drive the numeric entry + the default clamp. */
  min: number
  max: number
  /** Domain step (numeric entry + linear range step). Defaults to 1. */
  step?: number
  /**
   * Live preview — fires on every slider drag / numeric keystroke. Must NOT
   * persist: this is the in-Reader live shadow update.
   */
  onLiveSet: (value: number) => void
  /**
   * Persist on release — fires on pointer-up / key-up / blur. Defaults to
   * `onLiveSet` when omitted (editor surfaces that debounce-save on change and
   * flush on blur do not need a separate persist path).
   */
  onPersist?: (value: number) => void
  /** Optional non-linear value↔slider mapping (BPM, Target WPM). */
  transform?: SliderTransform
  /** Override the domain clamp used when committing the numeric entry. */
  clampValue?: (value: number) => number
  /** Optional inline hint shown before the slider (e.g. derived wpm). */
  hint?: React.ReactNode
  /** Forwarded to the range input. */
  id?: string
  /** Numeric entry accessible name; defaults to `${label} value`. */
  numericAriaLabel?: string
  disabled?: boolean
  className?: string
}

function defaultClamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

/**
 * Range slider + numeric entry sharing one domain value, with the
 * live-preview / persist-on-release split lifted out of `QuickSettingsPopover`
 * so every settings surface renders the same instrument. Dragging the slider or
 * typing in the box previews live (`onLiveSet`); releasing / blurring commits
 * (`onPersist`). An optional `transform` keeps the non-linear BPM / Target-WPM
 * mappings intact.
 */
export default function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  onLiveSet,
  onPersist,
  transform,
  clampValue,
  hint,
  id,
  numericAriaLabel,
  disabled = false,
  className = 'settings-control settings-control-wide',
}: SliderFieldProps) {
  const persist = onPersist ?? onLiveSet
  const clamp = clampValue ?? ((v: number) => defaultClamp(v, min, max))

  // Map a raw <input type="range"> value to the domain space.
  const sliderToValue = (raw: number): number =>
    transform ? transform.fromSlider(raw) : raw

  const rangeValue = transform ? transform.toSlider(value) : value
  const rangeMin = transform ? transform.sliderMin : min
  const rangeMax = transform ? transform.sliderMax : max
  const rangeStep = transform ? transform.sliderStep : step

  const parse = (raw: string): number | null => {
    if (raw.trim() === '' || raw === '-') return null
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : null
  }

  const commit = (raw: string) => {
    const parsed = parse(raw)
    const committed = parsed === null ? value : clamp(parsed)
    onLiveSet(committed)
    persist(committed)
    setDraft(String(committed))
  }

  // Numeric draft is mirrored from the live value unless the box is focused, so
  // an in-flight edit isn't clobbered by upstream re-renders.
  const { draft, setDraft, onFocus, onBlur, onKeyDown } = useDraftValue(value, commit)

  return (
    <div className={className}>
      {hint != null && <span className="reader-quickset-hint">{hint}</span>}
      <input
        id={id}
        type="range"
        className="range-slider"
        min={rangeMin}
        max={rangeMax}
        step={rangeStep}
        value={rangeValue}
        aria-label={label}
        disabled={disabled}
        onChange={(e) => {
          const v = sliderToValue(Number(e.target.value))
          setDraft(String(v))
          onLiveSet(v)
        }}
        onMouseUp={(e) => persist(sliderToValue(Number(e.currentTarget.value)))}
        onKeyUp={(e) => persist(sliderToValue(Number(e.currentTarget.value)))}
        onBlur={(e) => persist(sliderToValue(Number(e.currentTarget.value)))}
      />
      <input
        type="number"
        className="form-input form-input-sm"
        min={min}
        max={max}
        step={step}
        value={draft}
        aria-label={numericAriaLabel ?? `${label} value`}
        disabled={disabled}
        onFocus={onFocus}
        onChange={(e) => {
          const next = e.target.value
          setDraft(next)
          const parsed = parse(next)
          // Live-preview only while the value is in range; commit happens on blur.
          if (parsed !== null && parsed >= min && parsed <= max) onLiveSet(clamp(parsed))
        }}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
      />
    </div>
  )
}
