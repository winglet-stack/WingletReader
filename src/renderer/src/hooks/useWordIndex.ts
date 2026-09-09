import { useMemo, useState } from 'react'
import {
  EMPTY_TEXT_INDEX,
  buildStackWordIndex,
  buildTextWordIndex,
  type StackWordIndex,
  type TextWordIndex
} from '../engine/wordIndex'
import type { WordStack } from '../types'

/** The engaged text's index, both halves, as consumers take it. */
export interface ReaderWordIndex {
  /** Offset ⇄ stack. Cheap, and rebuilt whenever a re-tokenization lands. */
  stacks: StackWordIndex
  /** Offset ⇄ character ⇄ paragraph ⇄ page. Deferred until a surface needs it. */
  text: TextWordIndex
}

/**
 * The **stack half** of the word index (`architecture-depth/08`).
 *
 * Prefix sums over stacks that already exist — microscopic, so it is built as
 * soon as a tokenization lands and needs no gate. Stacks arrive asynchronously
 * from the off-thread builder, so this is simply the empty index until they do;
 * every consumer tolerates that rather than waiting.
 *
 * Built early, and separately from the text half, because the session lifecycle
 * needs offsets long before any surface that needs characters or Pages exists.
 */
export function useStackWordIndex(stacks: WordStack[]): StackWordIndex {
  return useMemo(() => buildStackWordIndex(stacks), [stacks])
}

/**
 * The **text half**: one whole-book walk, and the lookups built on it.
 *
 * The walk must not run on the RSVP engage first-paint frame (OL-1), so
 * `needed` is what a surface that actually wants characters, Pages or paragraphs
 * — the paged plain view, the bookmark popover — raises when it is shown.
 *
 * The latch is **sticky and resolved during render**, never in an effect: an
 * effect fires after the first-paint frame, which is exactly the frame the
 * deferral protects. `computed` is derived rather than read back from state so
 * it is coherent within the render that changes the text — on a text change it
 * resets to `needed` immediately, so a freshly engaged text is never walked
 * while every consumer is still inactive. Once walked it stays walked for that
 * text: leaving the plain view or closing the popover does not throw it away.
 */
export function useTextWordIndex(displayContent: string, needed: boolean): TextWordIndex {
  const [prevContent, setPrevContent] = useState(displayContent)
  const [latched, setLatched] = useState(needed)
  const contentChanged = displayContent !== prevContent
  const computed = contentChanged ? needed : latched || needed

  if (contentChanged) {
    setPrevContent(displayContent)
    setLatched(needed)
  } else if (needed && !latched) {
    setLatched(true)
  }

  return useMemo(
    () => (computed ? buildTextWordIndex(displayContent) : EMPTY_TEXT_INDEX),
    [displayContent, computed]
  )
}

/** Both halves as one value, for consumers that need offsets *and* words. */
export function useWordIndex(
  stackIndex: StackWordIndex,
  textIndex: TextWordIndex
): ReaderWordIndex {
  return useMemo(() => ({ stacks: stackIndex, text: textIndex }), [stackIndex, textIndex])
}
