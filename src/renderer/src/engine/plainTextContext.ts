import type { WordStack, TextRecord } from '../types'

/** Optional context passed when the text being read is a segment of a larger work. */
export interface SegmentContext {
  /** Title of the parent/source text (e.g. "The Great Gatsby") */
  sourceTitle: string
  /** 0-based position of this segment within its parent */
  index: number
  /** Total number of segments in the parent */
  total: number
}

export interface PlainTextContext {
  /**
   * Primary reference label shown in the plain-text view header.
   * For segments: the source (parent) title.
   * For standalone texts: the text title.
   */
  reference: string
  /**
   * Secondary line with position details, synchronized to the current
   * playback position (updates as the user seeks or plays).
   */
  detail: string
  /** How many words precede the current stack in this text (0 when at start). */
  wordOffset: number
  /** Total word count across all stacks. */
  totalWords: number
  /** Playback progress 0–1. */
  progress: number
}

/**
 * Derives a human-readable reference and position context from the current
 * Reader state. All inputs come directly from usePlayback's return values and
 * the text prop — no additional storage or IPC is required.
 */
export function computePlainTextContext(
  text: Pick<TextRecord, 'title'>,
  currentIndex: number,
  stacks: WordStack[],
  segmentCtx?: SegmentContext
): PlainTextContext {
  const totalWords = stacks.reduce((sum, st) => sum + st.words.length, 0)
  // Words already shown = words in stacks 0..(currentIndex-1)
  const wordOffset = stacks.slice(0, Math.max(0, currentIndex)).reduce((sum, st) => sum + st.words.length, 0)
  const progress = stacks.length > 0 ? Math.min(1, currentIndex / stacks.length) : 0
  const progressPct = Math.round(progress * 100)

  const positionStr = totalWords > 0
    ? `word ${wordOffset.toLocaleString()} of ${totalWords.toLocaleString()} (${progressPct}%)`
    : 'no content'

  let reference: string
  let detail: string

  if (segmentCtx) {
    reference = segmentCtx.sourceTitle
    const partLabel = `Part ${segmentCtx.index + 1} of ${segmentCtx.total}: "${text.title}"`
    detail = `${partLabel} · ${positionStr}`
  } else {
    reference = text.title
    detail = positionStr
  }

  return { reference, detail, wordOffset, totalWords, progress }
}
