import { useCallback, useEffect, useMemo, useState } from 'react'
import { scanText } from './wordHighlight'
import type { WordPosition } from './wordHighlight'
import { computePageStartsFromCounts, pageForWordOffset, pageRange } from './textPagination'
import type { PageRange } from './textPagination'

export interface TextPagingState {
  wordPositions: WordPosition[]
  totalWords: number
  pageStarts: number[]
  totalPages: number
  currentPage: number
  detached: boolean
  canBack: boolean
  canForward: boolean
  currentRange: PageRange
  goPrev: () => void
  goNext: () => void
  locate: () => void
}

/** Paging shape for a text whose scan has been deferred (OL-1): no words yet, one Page. */
const DEFERRED_PAGING: { wordPositions: WordPosition[]; pageStarts: number[] } = {
  wordPositions: [],
  pageStarts: [0],
}

/**
 * State layer for ADR-0025's paged plain-text view.
 *
 * Inputs are deliberately limited to the rendered text and the playhead's
 * whole-text word offset so this hook can be reused outside TextViewPanel.
 *
 * `active` gates the heavy whole-book scan (OL-1): the two Text-view passes
 * serve only the plain paged view, so they must not run on the RSVP engage
 * first-paint frame. The scan is deferred until the view is entered — until
 * then paging reports an empty single Page — and once computed it stays
 * computed for the current text (toggling back to RSVP does not re-scan). The
 * scan is unified into one `scanText` pass so the book tokenizes once, not
 * twice. Callers that always show the view (default) get eager computation.
 */
export function useTextPaging(
  displayContent: string,
  currentWordOffset: number,
  active = true
): TextPagingState {
  // Sticky compute latch, resolved during render (never in an effect, so a text
  // engaged straight into RSVP never scans on its first-paint frame — an effect
  // would fire too late, after that frame). `computed` is derived, not read from
  // state, so it is coherent within the render that changes the text: on a text
  // change it resets to `active` immediately, so the scan memo never tokenizes a
  // freshly-engaged text while the view is inactive. The latch state only carries
  // "was ever active for this text" across renders. Keeps the scan memo keyed on
  // displayContent + this flag only, never `currentWordOffset` (ADR-0025 §1).
  const [prevContent, setPrevContent] = useState(displayContent)
  const [latched, setLatched] = useState(active)
  const contentChanged = displayContent !== prevContent
  const computed = contentChanged ? active : latched || active

  if (contentChanged) {
    setPrevContent(displayContent)
    setLatched(active)
  } else if (active && !latched) {
    setLatched(true)
  }

  const { wordPositions, pageStarts } = useMemo(() => {
    if (!computed) return DEFERRED_PAGING
    const { wordPositions, paragraphWordCounts } = scanText(displayContent)
    return { wordPositions, pageStarts: computePageStartsFromCounts(paragraphWordCounts) }
  }, [displayContent, computed])

  const totalWords = wordPositions.length
  const totalPages = pageStarts.length

  const playheadPage = useMemo(
    () => pageForWordOffset(pageStarts, currentWordOffset),
    [pageStarts, currentWordOffset]
  )

  const [detachedPage, setDetachedPage] = useState<number | null>(null)
  const detached = detachedPage !== null
  const currentPage = detached ? detachedPage : playheadPage

  useEffect(() => {
    setDetachedPage(null)
  }, [displayContent])

  useEffect(() => {
    if (detachedPage !== null && detachedPage === playheadPage) {
      setDetachedPage(null)
    }
  }, [detachedPage, playheadPage])

  const canBack = currentPage > 0
  const canForward = currentPage < totalPages - 1
  const currentRange = useMemo(
    () => pageRange(pageStarts, currentPage, totalWords),
    [pageStarts, currentPage, totalWords]
  )

  const goPrev = useCallback(() => {
    if (canBack) setDetachedPage(currentPage - 1)
  }, [canBack, currentPage])

  const goNext = useCallback(() => {
    if (canForward) setDetachedPage(currentPage + 1)
  }, [canForward, currentPage])

  const locate = useCallback(() => {
    setDetachedPage(null)
  }, [])

  return {
    wordPositions,
    totalWords,
    pageStarts,
    totalPages,
    currentPage,
    detached,
    canBack,
    canForward,
    currentRange,
    goPrev,
    goNext,
    locate,
  }
}
