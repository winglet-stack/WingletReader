// Web Worker entry: runs the whole-book `buildStacks` tokenization off the main
// thread so engaging a text never blocks the first-paint frame (Open-Lag OL-3).
//
// This is a *when/where* change only — it calls the exact same `buildStacks` the
// synchronous path calls, so the emitted `WordStack[]` is byte-identical. The
// message contract lives in `stackBuilder.ts`; the synchronous fallback there is
// used whenever a Worker is unavailable (tests/jsdom).
import { buildStacks } from './tokenizer'
import type { StackBuildRequest, StackBuildResult } from './stackBuilder'

// The renderer tsconfig ships the DOM lib (not WebWorker); type the worker global
// locally rather than pulling in `lib.webworker`, which collides with DOM globals.
const ctx = self as unknown as {
  postMessage(message: StackBuildResult): void
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<StackBuildRequest>) => void
  ): void
}

ctx.addEventListener('message', (event) => {
  const { id, params } = event.data
  const stacks = buildStacks(params.text, params.wordsPerStack, params.rules)
  ctx.postMessage({ id, stacks })
})
