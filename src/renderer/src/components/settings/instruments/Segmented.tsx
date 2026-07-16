import React from 'react'

export interface SegmentedOption<T extends string | boolean> {
  value: T
  label: string
}

interface SegmentedProps<T extends string | boolean> {
  /** Accessible group name (e.g. "Highlight mode"). */
  label: string
  value: T
  options: ReadonlyArray<SegmentedOption<T>>
  onChange: (value: T) => void
  disabled?: boolean
}

/**
 * Active-pill row for tiny enums (highlight mode, theme, BPM↔Tap). Wraps the
 * existing `theme-pill` pattern so the segmented control matches the chips used
 * elsewhere; the selected option carries `theme-pill-active` + `aria-pressed`.
 */
export default function Segmented<T extends string | boolean>({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: SegmentedProps<T>) {
  return (
    <div className="settings-control settings-control-row" role="group" aria-label={label}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={String(option.value)}
            type="button"
            className={`theme-pill${active ? ' theme-pill-active' : ''}`}
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
