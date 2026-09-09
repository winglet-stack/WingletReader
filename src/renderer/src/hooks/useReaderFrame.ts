import { useEffect, useMemo, useState } from 'react'
import { createMeasureWidth } from '../engine/readerDisplayScale'
import {
  INITIAL_REVEAL_STATE,
  composeReaderFrame,
  solveReaderFrameLayout,
  type ReaderFrame,
  type ReaderFrameConfig,
  type ReaderFrameStage,
} from '../engine/readerFrame'
import type { RevealState } from '../engine/stackLayout'
import type { WordStack } from '../types'

export interface UseReaderFrameInput {
  stacks: WordStack[]
  currentIndex: number
  config: ReaderFrameConfig
  stage: ReaderFrameStage
}

/**
 * Home of the reader frame for a live React painter.
 *
 * Owns the two things the frame description cannot own itself: the sticky-reveal
 * high-water mark (held as component state and threaded through the pure module,
 * never mutated while painting) and the text measurer, which is rebuilt when
 * `document.fonts.ready` resolves so late font metrics trigger a re-solve.
 */
export function useReaderFrame({ stacks, currentIndex, config, stage }: UseReaderFrameInput): ReaderFrame {
  const [fontReadyRevision, setFontReadyRevision] = useState(0)
  const [reveal, setReveal] = useState<RevealState>(INITIAL_REVEAL_STATE)

  const { width: stageWidth, height: stageHeight } = stage
  const fontFamily = config.fontFamily

  const measureWidth = useMemo(() => createMeasureWidth(), [fontReadyRevision])

  // Font metrics arrive late: re-measure once the document's fonts are ready so a
  // frame solved against fallback metrics does not stay on screen.
  useEffect(() => {
    const fontReady = document.fonts?.ready
    if (!fontReady || typeof fontReady.then !== 'function') return

    let cancelled = false
    fontReady.then(() => {
      if (!cancelled) setFontReadyRevision((revision) => revision + 1)
    }).catch(() => {})

    return () => { cancelled = true }
  }, [fontFamily])

  const measuredStage = useMemo<ReaderFrameStage>(
    () => ({ width: stageWidth, height: stageHeight }),
    [stageWidth, stageHeight]
  )

  const layout = useMemo(
    () => solveReaderFrameLayout({ stacks, currentIndex, config, stage: measuredStage, measureWidth }),
    [stacks, currentIndex, config, measuredStage, measureWidth]
  )

  const frame = useMemo(
    () => composeReaderFrame({ stacks, currentIndex, config, layout, reveal }),
    [stacks, currentIndex, config, layout, reveal]
  )

  // The frame decides the next reveal state; storing it here is the only thing the
  // painter does with it. `composeReaderFrame` is idempotent in `reveal`, so the
  // re-render this schedules produces the identical frame and then settles.
  if (frame.reveal.lineKey !== reveal.lineKey || frame.reveal.revealUpTo !== reveal.revealUpTo) {
    setReveal(frame.reveal)
  }

  return frame
}
