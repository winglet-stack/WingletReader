import type { HighlightMode } from '../types'

export interface PanningBarConfig {
  /** Number of stacks per chunk. 0 = auto (equals stacksVisible). */
  chunkSize: number
}

/**
 * Returns true when the slot at (rowIdx, colIdx) should be highlighted,
 * given the current playback position and the active highlighting mode.
 *
 * Designed to be called once per render with the current position, producing
 * a closure the rendering loop calls for each slot.
 */
export type IsSlotHighlighted = (rowIdx: number, colIdx: number) => boolean

/**
 * Computes a slot-predicate for the given highlighting mode.
 *
 * @param mode            The active HighlightMode.
 * @param currentLineIdx  Row index of the currently active stack (0-based).
 * @param currentSlotIdx  Column index of the currently active stack (0-based).
 * @param stacksVisible   Number of columns in a row.
 * @param panningConfig   Optional config for the panning-bar mode.
 */
export function computeHighlightedSlots(
  mode: HighlightMode,
  currentLineIdx: number,
  currentSlotIdx: number,
  stacksVisible: number,
  panningConfig?: PanningBarConfig,
): IsSlotHighlighted {
  switch (mode) {
    case 'progressive-bar':
      // Highlight all slots from column 0 up to and including the current slot, on the active row.
      return (rowIdx, colIdx) =>
        rowIdx === currentLineIdx && colIdx <= currentSlotIdx

    case 'panning-bar': {
      const chunkSize = (panningConfig?.chunkSize ?? 0) > 0
        ? panningConfig!.chunkSize
        : stacksVisible

      const halfChunk = Math.ceil(chunkSize / 2)
      const slotWithinChunk = currentSlotIdx % chunkSize
      const chunkStart = currentSlotIdx - slotWithinChunk

      // First scan: first `halfChunk` slots of this chunk.
      if (slotWithinChunk === 0) {
        const lo = chunkStart
        const hi = chunkStart + halfChunk - 1
        return (rowIdx, colIdx) =>
          rowIdx === currentLineIdx && colIdx >= lo && colIdx <= hi
      }

      // Second scan: last `halfChunk` slots of this chunk (with 1-slot overlap at the midpoint).
      if (slotWithinChunk === chunkSize - 1) {
        const lo = chunkStart + halfChunk - 1
        const hi = chunkStart + chunkSize - 1
        return (rowIdx, colIdx) =>
          rowIdx === currentLineIdx && colIdx >= lo && colIdx <= hi
      }

      // Gap beat: nothing highlighted.
      return () => false
    }

    default:
      // 'default': only the single active slot is highlighted.
      return (rowIdx, colIdx) =>
        rowIdx === currentLineIdx && colIdx === currentSlotIdx
  }
}
