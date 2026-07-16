import { useState, useEffect, useRef, useCallback } from 'react'
import type { FocusEvent } from 'react'
import type { Settings } from '../../types'

/**
 * Shared debounce-save plumbing for the reader-config editors.
 *
 * Both the flat editor (`ReaderConfigPanel`, used by the transmute + RWW paths)
 * and the calm-grid editor (`ReaderDefaultsCalm`, the Reader-defaults surface)
 * edit a working copy of `Settings` that:
 *  - resyncs when the committed `settings` prop changes externally,
 *  - coalesces rapid edits into one trailing `onSave(next)` after 400 ms,
 *  - flushes any pending save on unmount and on demand (number/range blur).
 *
 * `onSave` receives the *full* merged settings object (not the lone patch), so a
 * sub-panel save folds cleanly into the host's working state.
 */
export interface ReaderConfigDraft {
  local: Settings
  update: (patch: Partial<Settings>) => void
  /** Commit any debounced edit immediately (e.g. on number/range blur). */
  flushPendingSave: () => void
}

export function useReaderConfigDraft(
  settings: Settings,
  onSave: (updated: Partial<Settings>) => void
): ReaderConfigDraft {
  const [local, setLocal] = useState<Settings>(settings)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSaveRef = useRef<Settings | null>(null)

  // Sync when committed settings change externally (e.g. after a profile apply).
  useEffect(() => {
    setLocal(settings)
  }, [settings])

  const flushPendingSave = useCallback(() => {
    if (!pendingSaveRef.current) return
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    const pending = pendingSaveRef.current
    pendingSaveRef.current = null
    onSave(pending)
  }, [onSave])

  useEffect(() => flushPendingSave, [flushPendingSave])

  const update = useCallback((patch: Partial<Settings>) => {
    setLocal((prev) => {
      const next = { ...prev, ...patch }
      pendingSaveRef.current = next
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        onSave(next)
        if (pendingSaveRef.current === next) pendingSaveRef.current = null
        debounceRef.current = null
      }, 400)
      return next
    })
  }, [onSave])

  return { local, update, flushPendingSave }
}

/**
 * Blur-capture handler that flushes the debounced save when a number/range input
 * loses focus, so a value typed-then-blurred commits without waiting out the
 * 400 ms window. Shared by both editor shells.
 */
export function flushOnNumericBlur(
  e: FocusEvent<HTMLElement>,
  flushPendingSave: () => void
): void {
  if (e.target instanceof HTMLInputElement && ['number', 'range'].includes(e.target.type)) {
    flushPendingSave()
  }
}

/** Settings host debounces; the in-Reader drawer applies edits immediately (SRQ / SR-4). */
export function useReaderSettingsEditorDraft(
  settings: Settings,
  onSave: (updated: Partial<Settings>) => void,
  liveApply: boolean
): ReaderConfigDraft {
  const draft = useReaderConfigDraft(settings, onSave)
  if (liveApply) {
    return { local: settings, update: onSave, flushPendingSave: () => {} }
  }
  return draft
}
