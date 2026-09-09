import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  deviationPercent,
  type SessionBaseline,
  type SessionMetrics,
  type SessionStatsSummary,
} from '../../../../shared/statsMath'

export type SessionDialogVariant = 'stop' | 'goal' | 'end'

export interface SessionDialogProps {
  variant: SessionDialogVariant
  progressPercent: number
  wordsRead: number
  totalWords?: number
  /**
   * The finished session's own numbers and the baseline they read against
   * (ADR-0035 §6). Null when nothing was recorded — a zero-word run, an
   * unstored text, or a host that does not raise this dialog at all — and the
   * block is then omitted rather than shown as zeroes.
   */
  sessionStats?: SessionStatsSummary | null
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

/** One metric tile in the session block: a number, and how it compares. */
interface SessionStatRow {
  key: string
  label: string
  value: string
  /**
   * Signed whole-percent deviation against the baseline, or null when there is
   * no baseline, none can be expressed (a zero baseline), or the difference
   * rounds away — a "▲ 0%" is noise, not feedback.
   */
  deviation: number | null
}

/**
 * `1h 4m 30s` / `12m 30s` / `45s`. Deliberately a local formatter: the same
 * shape exists in `engine/videoRenderer.ts`, but that module pulls the MP4
 * muxer in with it, which has no business in a reader dialog.
 */
function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

function roundedDeviation(value: number, baselineValue: number): number | null {
  const percent = deviationPercent(value, baselineValue)
  if (percent === null) return null
  const rounded = Math.round(percent)
  return rounded === 0 ? null : rounded
}

/** The six §2 metrics, in the order they are read: what, how long, how well. */
function buildStatRows({ metrics, baseline }: SessionStatsSummary): SessionStatRow[] {
  const deviationOf = (pick: (source: SessionMetrics) => number): number | null =>
    baseline ? roundedDeviation(pick(metrics), pick(baseline)) : null

  return [
    {
      key: 'words',
      label: 'Words',
      value: Math.round(metrics.wordsRead).toLocaleString(),
      deviation: deviationOf((source) => source.wordsRead),
    },
    {
      key: 'duration',
      label: 'Duration',
      value: formatDuration(metrics.wallMs),
      deviation: deviationOf((source) => source.wallMs),
    },
    {
      key: 'wpm',
      label: 'Speed',
      value: `${Math.round(metrics.wpm).toLocaleString()} wpm`,
      deviation: deviationOf((source) => source.wpm),
    },
    {
      key: 'pauses',
      label: 'Pauses',
      value: Math.round(metrics.pauses).toLocaleString(),
      deviation: deviationOf((source) => source.pauses),
    },
    {
      key: 'rewinds',
      label: 'Rewinds',
      value: Math.round(metrics.rewinds).toLocaleString(),
      deviation: deviationOf((source) => source.rewinds),
    },
    {
      key: 'fluency',
      label: 'Fluency',
      value: String(Math.round(metrics.fluency)),
      deviation: deviationOf((source) => source.fluency),
    },
  ]
}

/** Says what the arrows are measured against, so the block explains itself. */
function baselineCaption(baseline: SessionBaseline): string {
  if (baseline.source === 'today') {
    return baseline.sessionCount === 1
      ? 'vs your earlier session today'
      : `vs your ${baseline.sessionCount} earlier sessions today`
  }
  return 'vs your last reading day'
}

/**
 * The session block (ADR-0035 §6). Deviations are **informational**, never
 * moralizing: more pauses is not a failure and more words is not a victory, so
 * the indicators carry no `--danger`/success role (ADR-0012) — only a direction
 * and a size.
 */
function SessionStatsBlock({ stats }: { stats: SessionStatsSummary | null }) {
  // The nothing-recorded case is answered here rather than in the dialog body:
  // a zero-word run has no session numbers, and zeroes would be a lie.
  if (!stats) return null
  const rows = buildStatRows(stats)

  return (
    <div className="session-dialog-stats">
      <div className="session-dialog-stats-head">
        <span className="session-dialog-stats-title">This session</span>
        {stats.baseline && (
          <span className="session-dialog-stats-baseline">{baselineCaption(stats.baseline)}</span>
        )}
      </div>
      <div className="session-dialog-stats-grid">
        {rows.map((row) => (
          <div key={row.key} className="session-dialog-stat">
            <span className="session-dialog-stat-label">{row.label}</span>
            <span className="session-dialog-stat-value">{row.value}</span>
            {row.deviation !== null && (
              <span
                className="session-dialog-stat-deviation"
                role="img"
                aria-label={`${row.deviation > 0 ? 'up' : 'down'} ${Math.abs(row.deviation)} percent`}
              >
                {`${row.deviation > 0 ? '▲' : '▼'} ${Math.abs(row.deviation)}%`}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function SessionDialog({
  variant,
  progressPercent,
  wordsRead,
  totalWords,
  sessionStats = null,
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

        <SessionStatsBlock stats={sessionStats} />

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
