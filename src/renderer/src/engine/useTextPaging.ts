import { useCallback, useEffect, useMemo, useState } from 'react'
import type { WordPosition } from './wordHighlight'
import type { PageRange } from './textPagination'
import type { TextWordIndex } from './wordIndex'

export interface TextPagingState {
  wordPositions: readonly WordPosition[]
  totalWords: number
  pageStarts: readonly number[]
  totalPages: number
  currentPage: number
  detached: boolean
  canBack: boolean
  canForward: boolean
  currentRange: PageRange
  goPrev: () => void
  goNext: () => void
  locate: () => void
  /**
   * Bumped by every {@link TextPagingState.locate} call. Locate is a *request to
   * scroll*, and the reader can ask for it again from the Page they are already
   * on, so the paging state alone cannot express it — the counter is the event.
   * It lives here rather than in `Reader.tsx` because Locate is a paging move.
   */
  locateRevision: number
}

/**
 * State layer for ADR-0025's paged plain-text view.
 *
 * Paging state only: which Page the playhead is on, whether the user has
 * detached from it, and the moves between Pages. Every lookup comes off the
 * **word index** it is handed (`architecture-depth/08`) — this hook does not
 * walk the text and does not decide when the walk happens. That decision lives
 * in `useWordIndex`, which defers the whole-book walk until a surface needs it
 * (OL-1) and keeps it once made; until then the index is
 * `EMPTY_TEXT_INDEX` and paging reports an empty single Page, exactly as before.
 *
 * Inputs are deliberately limited to the index and the playhead's whole-text
 * word offset, so this hook can be reused outside `TextViewPanel`.
 */
export function useTextPaging(
  index: TextWordIndex,
  currentWordOffset: number
): TextPagingState {
  const { wordPositions, pageStarts, totalWords } = index
  const totalPages = pageStarts.length

  const playheadPage = useMemo(
    () => index.pageAtOffset(currentWordOffset),
    [index, currentWordOffset]
  )

  const [detachedPage, setDetachedPage] = useState<number | null>(null)
  const [locateRevision, setLocateRevision] = useState(0)
  const detached = detachedPage !== null
  const currentPage = detached ? detachedPage : playheadPage

  useEffect(() => {
    setDetachedPage(null)
  }, [index])

  useEffect(() => {
    if (detachedPage !== null && detachedPage === playheadPage) {
      setDetachedPage(null)
    }
  }, [detachedPage, playheadPage])

  const canBack = currentPage > 0
  const canForward = currentPage < totalPages - 1
  const currentRange = useMemo(
    () => index.pageRangeAt(currentPage),
    [index, currentPage]
  )

  const goPrev = useCallback(() => {
    if (canBack) setDetachedPage(currentPage - 1)
  }, [canBack, currentPage])

  const goNext = useCallback(() => {
    if (canForward) setDetachedPage(currentPage + 1)
  }, [canForward, currentPage])

  const locate = useCallback(() => {
    setDetachedPage(null)
    setLocateRevision((revision) => revision + 1)
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
    locateRevision,
  }
}
