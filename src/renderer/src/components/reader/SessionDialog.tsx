import React, { useCallback, useEffect, useMemo, useRef } from 'react'

export type SessionDialogVariant = 'stop' | 'goal' | 'end'

export interface SessionDialogProps {
  variant: SessionDialogVariant
  progressPercent: number
  wordsRead: number
  totalWords?: number
  onSaveExit: () => void
  onExitWithoutSaving: () => void
  onAbort: () => void
  onContinue: () => void
  onSetNewTarget: () => void
  onDismiss: () => void
}

type SessionDialogActionRole = 'primary' | 'secondary' | 'danger' | 'ghost'

interface SessionDialogAction {
  label: string
  role: SessionDialogActionRole
  onClick: () => void
}

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => element.offsetParent !== null || element.tagName === 'BUTTON')
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

export default function SessionDialog({
  variant,
  progressPercent,
  wordsRead,
  totalWords,
  onSaveExit,
  onExitWithoutSaving,
  onAbort,
  onContinue,
  onSetNewTarget,
  onDismiss,
}: SessionDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  const title = useMemo(() => {
    if (variant === 'stop') return 'Stop reading?'
    if (variant === 'goal') return 'Target reached'
    return 'Finished'
  }, [variant])

  const dismiss = useCallback(() => {
    if (variant === 'stop') {
      onAbort()
      return
    }
    onDismiss()
  }, [onAbort, onDismiss, variant])

  const actions = useMemo<SessionDialogAction[]>(() => {
    if (variant === 'stop') {
      return [
        { label: 'Save & Exit', role: 'primary', onClick: onSaveExit },
        { label: 'Exit without saving', role: 'danger', onClick: onExitWithoutSaving },
        { label: 'Abort', role: 'ghost', onClick: onAbort },
      ]
    }

    if (variant === 'goal') {
      return [
        { label: 'Continue reading', role: 'primary', onClick: onContinue },
        { label: 'Set a new target', role: 'secondary', onClick: onSetNewTarget },
        { label: 'Save & Exit', role: 'primary', onClick: onSaveExit },
        { label: 'Exit without saving', role: 'danger', onClick: onExitWithoutSaving },
      ]
    }

    return [
      { label: 'Save & Exit', role: 'primary', onClick: onSaveExit },
      { label: 'Exit without saving', role: 'danger', onClick: onExitWithoutSaving },
    ]
  }, [
    onAbort,
    onContinue,
    onExitWithoutSaving,
    onSaveExit,
    onSetNewTarget,
    variant,
  ])

  useEffect(() => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null

    const dialog = dialogRef.current
    if (!dialog) return

    const focusable = getFocusableElements(dialog)
    ;(focusable[0] ?? dialog).focus()

    return () => {
      const restoreTarget = restoreFocusRef.current
      if (restoreTarget?.isConnected) restoreTarget.focus()
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const dialog = dialogRef.current
      if (!dialog) return

      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        dismiss()
        return
      }

      if (event.key === ' ' || event.code === 'Space' || event.key === 'Spacebar') {
        event.preventDefault()
        event.stopPropagation()
        return
      }

      if (event.key !== 'Tab') return

      const focusable = getFocusableElements(dialog)
      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (!dialog.contains(active)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
        return
      }

      if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
        return
      }

      if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === ' ' || event.code === 'Space' || event.key === 'Spacebar') {
        event.preventDefault()
        event.stopPropagation()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('keyup', handleKeyUp, true)

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('keyup', handleKeyUp, true)
    }
  }, [dismiss])

  const percent = clampPercent(progressPercent)
  const wordsReadLabel = Math.max(0, Math.round(wordsRead)).toLocaleString()
  const wordsLabel =
    totalWords == null
      ? `${wordsReadLabel} words`
      : `${wordsReadLabel} of ${Math.max(0, Math.round(totalWords)).toLocaleString()} words`

  return (
    <div
      className="session-dialog-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) dismiss()
      }}
    >
      <div
        ref={dialogRef}
        className={`session-dialog session-dialog--${variant}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-dialog-title"
        aria-describedby="session-dialog-progress"
        tabIndex={-1}
      >
        <div className="session-dialog-header">
          <h2 id="session-dialog-title" className="session-dialog-title">
            {title}
          </h2>
        </div>

        <div id="session-dialog-progress" className="session-dialog-progress">
          <div className="session-dialog-progress-item">
            <span className="session-dialog-progress-label">Progress</span>
            <span className="session-dialog-progress-value">{percent}%</span>
          </div>
          <div className="session-dialog-progress-item">
            <span className="session-dialog-progress-label">Words read</span>
            <span className="session-dialog-progress-value">{wordsLabel}</span>
          </div>
        </div>

        <div className="session-dialog-actions">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={`session-dialog-action session-dialog-action--${action.role}`}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
