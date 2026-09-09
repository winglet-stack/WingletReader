import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent,
  type SetStateAction,
} from 'react'

/** The draft state plus the handlers a numeric entry binds to. */
export interface DraftValueField {
  /** Current draft string — bind to the input's `value`. */
  draft: string
  /** Replace the draft (used by each instrument's own `onChange`). */
  setDraft: Dispatch<SetStateAction<string>>
  /** Marks the box focused so the resync effect stops mirroring `value`. */
  onFocus: () => void
  /** Clears the focus guard, then hands the draft to the caller's commit. */
  onBlur: () => void
  /** Enter commits (via blur); Escape reverts the draft to `value`, then blurs. */
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void
}

/**
 * Controlled-numeric-entry draft state shared by the three numeric instruments
 * (`NumericInput`, `SliderField`, `Stepper`).
 *
 * The draft is mirrored from the live `value` *unless the box is focused*, so an
 * upstream re-render cannot clobber an in-flight edit. Committing is the
 * caller's job: `commit` receives the raw draft string on blur, because parsing
 * and domain mapping differ per instrument (rounding, clamping, the
 * live-preview / persist split) and are deliberately not shared here.
 */
export function useDraftValue(value: number, commit: (raw: string) => void): DraftValueField {
  const [draft, setDraft] = useState(String(value))
  const focusedRef = useRef(false)

  useEffect(() => {
    if (!focusedRef.current) setDraft(String(value))
  }, [value])

  return {
    draft,
    setDraft,
    onFocus: () => {
      focusedRef.current = true
    },
    onBlur: () => {
      focusedRef.current = false
      commit(draft)
    },
    onKeyDown: (e) => {
      if (e.key === 'Enter') e.currentTarget.blur()
      if (e.key === 'Escape') {
        setDraft(String(value))
        e.currentTarget.blur()
      }
    },
  }
}
