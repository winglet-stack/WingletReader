import type { ReadWhileWorkingStatus } from '../../types'
import { readWhileWorkingStatusError } from '../../engine/shortcutCapture'

export interface RwwHostChromeProps {
  status: ReadWhileWorkingStatus | null
  starting: boolean
  exiting: boolean
  onStart: () => void
  onExit: () => void
}

interface Props extends RwwHostChromeProps {
  variant?: 'viewport' | 'embedded'
}

type HostState = 'ready' | 'blocked' | 'armed' | 'starting' | 'exiting'

const STATE_LABEL: Record<HostState, string> = {
  ready: 'Ready',
  blocked: 'Blocked',
  armed: 'Armed',
  starting: 'Starting',
  exiting: 'Exiting',
}

function isBlocked(status: ReadWhileWorkingStatus | null, armed: boolean): boolean {
  return Boolean(
    !armed &&
      status &&
      (!status.supported || readWhileWorkingStatusError(status)),
  )
}

function resolveHostState({
  armed,
  blocked,
  starting,
  exiting,
}: {
  armed: boolean
  blocked: boolean
  starting: boolean
  exiting: boolean
}): HostState {
  if (starting) return 'starting'
  if (exiting) return 'exiting'
  if (armed) return 'armed'
  if (blocked) return 'blocked'
  return 'ready'
}

function hostActionText(hostState: HostState): string {
  if (hostState === 'starting') return 'Starting...'
  if (hostState === 'exiting') return 'Exiting...'
  if (hostState === 'armed') return 'Exit'
  return 'Start'
}

export default function RwwStartControl({
  status,
  starting,
  exiting,
  onStart,
  onExit,
  variant = 'viewport',
}: Props) {
  const armed = Boolean(status?.enabled)
  const blocked = isBlocked(status, armed)
  const busy = starting || exiting
  const hostState = resolveHostState({ armed, blocked, starting, exiting })

  // The square carries only terse action text; the full action stays in the
  // accessibility label (ADR-0021).
  const actionText = hostActionText(hostState)

  return (
    <div
      className={`rww-start-control rww-start-control--${variant} rww-start-control--${hostState}`}
    >
      <button
        type="button"
        className="rww-start-control__square"
        aria-label={armed ? 'Exit Overlay Reader' : 'Start Overlay Reader'}
        aria-busy={busy}
        disabled={busy || blocked}
        onClick={armed ? onExit : onStart}
      >
        {actionText}
      </button>
      <div className="rww-start-control__state">
        <span className="rww-start-control__dot" aria-hidden="true" />
        <span className="rww-start-control__state-label">{STATE_LABEL[hostState]}</span>
      </div>
    </div>
  )
}
