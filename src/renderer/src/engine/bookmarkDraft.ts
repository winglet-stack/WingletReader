import type { StackWordIndex } from './wordIndex'

/**
 * What a bookmark draft is made of: the text the snippet is quoted from, the
 * durable word offset it anchors to, and the label that falls out of the two.
 *
 * The offset lookups take a {@link StackWordIndex} rather than the stack array
 * (`architecture-depth/08`) — the conversion is prefix-summed once per
 * tokenization instead of re-walked per bookmark — and the snippet comes off the
 * text index, which walks the book once instead of the two full walks this
 * module used to make three lines apart.
 */
/** The durable `wordOffset` of a stack boundary — how every bookmark is written. */
export function bookmarkWordOffsetAtIndex(index: StackWordIndex, stackIndex: number): number {
  return index.offsetAtStack(stackIndex)
}

/** The saved reading position as a word offset; no save means the start of the text. */
export function savedReadingPositionWordOffset(
  index: StackWordIndex,
  stackIndex: number | null | undefined
): number {
  if (stackIndex == null || stackIndex <= 0) return 0
  return index.offsetAtStack(stackIndex)
}

export function bookmarkFallbackLabel(wordOffset: number): string {
  return `${Math.max(0, wordOffset).toLocaleString()} words`
}

export function bookmarkLabelForDraft(label: string, snippet: string, wordOffset: number): string {
  const trimmed = label.trim()
  if (trimmed) return trimmed
  if (snippet.trim()) return snippet.trim()
  return bookmarkFallbackLabel(wordOffset)
}
