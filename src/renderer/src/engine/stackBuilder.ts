// Scheduler for whole-book `buildStacks` tokenization (Open-Lag OL-3).
//
// The dominant engage pass (~50% of the synchronous cost per the QA-3 diagnosis)
// is the `buildStacks` tokenization run in `usePlayback`'s mount effect. This
// module moves *where* that work runs — onto a Web Worker in production, so it
// never blocks the first-paint frame — while keeping *what* it produces
// byte-identical (the worker calls the same `buildStacks`).
//
// A deterministic **synchronous fallback** is used whenever a Worker cannot be
// used (Node/jsdom/happy-dom test environments, or a worker that fails to
// construct or errors at runtime). In the fallback the result is delivered
// *synchronously, before `requestStacks` returns*, so tests that mount a hook and
// immediately drive playback observe fully-built stacks with no extra ticks.
import type { WordStack } from '../types'
import { buildStacks, type ChunkRules } from './tokenizer'

export interface BuildStacksParams {
  text: string
  wordsPerStack: number
  rules: ChunkRules
}

/** Worker request envelope (main -> worker). */
export interface StackBuildRequest {
  id: number
  params: BuildStacksParams
}

/** Worker response envelope (worker -> main). */
export interface StackBuildResult {
  id: number
  stacks: WordStack[]
}

export interface StackBuildHandle {
  /** Drop this build's result if it has not been delivered yet (stale/unmount). */
  cancel(): void
}

type Deliver = (stacks: WordStack[]) => void

interface PendingEntry {
  deliver: Deliver
  params: BuildStacksParams
}

// Singleton worker reused across engages (spawned lazily on first real use).
let worker: Worker | null = null
let workerDisabled = false
let nextRequestId = 1
const pending = new Map<number, PendingEntry>()

/** Build synchronously on the calling thread — the deterministic fallback. */
function buildSync(params: BuildStacksParams): WordStack[] {
  return buildStacks(params.text, params.wordsPerStack, params.rules)
}

/**
 * Whether the async worker path should be used. Falls back to the synchronous
 * build in test environments and anywhere `Worker` is absent, so the suite stays
 * deterministic and never hangs on an un-bundled worker URL.
 */
function workerSupported(): boolean {
  if (workerDisabled) return false
  if (typeof Worker !== 'function') return false
  // Vitest runs with MODE === 'test'; take the synchronous path there.
  if (import.meta.env.MODE === 'test' || import.meta.env.VITEST) return false
  return true
}

/** Permanently fall back to synchronous builds, resolving anything in flight. */
function disableWorker(): void {
  workerDisabled = true
  if (worker) {
    worker.terminate()
    worker = null
  }
  // Never leave a caller hanging: satisfy in-flight requests synchronously.
  const inFlight = [...pending.values()]
  pending.clear()
  for (const entry of inFlight) entry.deliver(buildSync(entry.params))
}

function ensureWorker(): Worker | null {
  if (worker) return worker
  try {
    worker = new Worker(new URL('./buildStacks.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.addEventListener('message', (event: MessageEvent<StackBuildResult>) => {
      const entry = pending.get(event.data.id)
      if (!entry) return
      pending.delete(event.data.id)
      entry.deliver(event.data.stacks)
    })
    worker.addEventListener('error', () => disableWorker())
    return worker
  } catch {
    disableWorker()
    return null
  }
}

/**
 * Build the stacks for `params` and hand them to `deliver`.
 *
 * - Worker path (production): returns immediately; `deliver` fires later, on the
 *   worker's response, off the main thread.
 * - Synchronous fallback (tests/no worker): `deliver` fires *before* this returns.
 *
 * Either way the delivered `WordStack[]` is identical to `buildStacks(...)`.
 */
export function requestStacks(params: BuildStacksParams, deliver: Deliver): StackBuildHandle {
  if (workerSupported()) {
    const activeWorker = ensureWorker()
    if (activeWorker) {
      const id = nextRequestId++
      pending.set(id, { deliver, params })
      activeWorker.postMessage({ id, params } satisfies StackBuildRequest)
      return {
        cancel() {
          pending.delete(id)
        },
      }
    }
  }
  // Synchronous fallback — deliver in-line so callers observe built stacks at once.
  deliver(buildSync(params))
  return { cancel() {} }
}
