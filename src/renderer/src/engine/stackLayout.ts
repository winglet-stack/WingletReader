/**
 * Pure stack-grid layout math extracted from Reader.tsx (RO-3).
 * No React imports — decisions only.
 */

import type { WordStack } from '../types'
import type { HighlightMode } from '../../../shared/settings'

export interface BlockPosition {
  blockSize: number
  blockIndex: number
  blockStart: number
  currentLineIdx: number
  currentSlotIdx: number
  lineKey: number
}

/** Derive all block/row/slot indices for the current stack index. */
export function deriveBlockPosition(
  currentIndex: number,
  stacksVisible: number,
  linesCount: number
): BlockPosition {
  const blockSize = linesCount * stacksVisible
  const blockIndex = currentIndex % blockSize
  const blockStart = currentIndex - blockIndex
  const currentLineIdx = Math.floor(blockIndex / stacksVisible)
  const currentSlotIdx = blockIndex % stacksVisible
  const lineKey = blockStart * 100 + currentLineIdx
  return { blockSize, blockIndex, blockStart, currentLineIdx, currentSlotIdx, lineKey }
}

/**
 * In panning-bar mode, pre-reveal up to the first-scan range on a chunk's opening beat.
 * Chunk size falls back to stacksVisible when the configured value is <= 0.
 * In all other modes, returns currentSlotIdx unchanged.
 */
export function panningBarRevealUpToSlot(
  currentSlotIdx: number,
  stacksVisible: number,
  highlightMode: HighlightMode,
  chunkSize: number
): number {
  if (highlightMode !== 'panning-bar') return currentSlotIdx
  const chunkSizeVal = chunkSize > 0 ? chunkSize : stacksVisible
  if (currentSlotIdx % chunkSizeVal !== 0) return currentSlotIdx
  const halfChunk = Math.ceil(chunkSizeVal / 2)
  return Math.min(currentSlotIdx + halfChunk - 1, stacksVisible - 1)
}

export interface RevealState {
  lineKey: number
  revealUpTo: number
}

/**
 * Compute the next sticky-reveal state.
 * When the row resets (new lineKey), starts fresh at revealUpToSlot.
 * Within the same row, keeps the high-water mark so revealed slots stay visible.
 */
export function nextRevealState(
  prev: RevealState,
  lineKey: number,
  revealUpToSlot: number
): RevealState {
  if (prev.lineKey !== lineKey) return { lineKey, revealUpTo: revealUpToSlot }
  return { lineKey, revealUpTo: Math.max(prev.revealUpTo, revealUpToSlot) }
}

/**
 * Build the 2D display grid for the current block.
 * Past rows show all slots; the current row is cut at revealUpToSlot.
 * Out-of-bounds stack positions map to null.
 */
export function buildDisplayRows(
  stacks: WordStack[],
  blockStart: number,
  currentLineIdx: number,
  stacksVisible: number,
  revealUpToSlot: number
): (WordStack | null)[][] {
  return Array.from({ length: currentLineIdx + 1 }, (_, rowIdx) => {
    const rowStart = blockStart + rowIdx * stacksVisible
    const isCurrentRow = rowIdx === currentLineIdx
    return Array.from({ length: stacksVisible }, (_, colIdx) => {
      if (!isCurrentRow || colIdx <= revealUpToSlot) return stacks[rowStart + colIdx] ?? null
      return null
    })
  })
}

export interface SlotPresentation {
  /** Word-stack index into the full stacks array (used as the StackDisplay key). */
  globalIdx: number
  /** Full class string for the slot cell, including connected-highlight modifiers. */
  slotClass: string
  /** null for column 0 (no divider before the first slot). */
  divider: { kind: 'dot' | 'bar'; active: boolean; visible: boolean } | null
}

/**
 * Per-slot presentation decisions for the stage grid.
 * Dot dividers only apply in focal-points view when the slot to the right holds
 * a revealed stack — null (unrevealed) slots fall back to the bar divider.
 */
export function deriveSlotPresentation(params: {
  rowIdx: number
  colIdx: number
  stack: WordStack | null
  stacksVisible: number
  blockStart: number
  highlightActive: boolean
  focalPointsView: boolean
  showChunkDividers: boolean
  isSlotHighlighted: (rowIdx: number, colIdx: number) => boolean
}): SlotPresentation {
  const { rowIdx, colIdx, stack, stacksVisible, blockStart, highlightActive,
    focalPointsView, showChunkDividers, isSlotHighlighted } = params

  const isActive = highlightActive && isSlotHighlighted(rowIdx, colIdx)
  const isLeftActive = highlightActive && colIdx > 0 && isSlotHighlighted(rowIdx, colIdx - 1)
  const isRightActive = highlightActive && colIdx < stacksVisible - 1 && isSlotHighlighted(rowIdx, colIdx + 1)
  const isDividerActive = isLeftActive && isActive

  const slotClass = `stack-slot${isActive ? ' stack-slot--active' : ''}${isActive && isLeftActive ? ' stack-slot--connected-left' : ''}${isActive && isRightActive ? ' stack-slot--connected-right' : ''}`

  let divider: SlotPresentation['divider'] = null
  if (colIdx > 0) {
    divider = focalPointsView && stack !== null
      ? { kind: 'dot', active: false, visible: showChunkDividers }
      : { kind: 'bar', active: isDividerActive, visible: isDividerActive || showChunkDividers }
  }

  return { globalIdx: blockStart + rowIdx * stacksVisible + colIdx, slotClass, divider }
}

/**
 * CSS grid-template-columns for the stack row.
 * Single stack → '1fr'; multiple stacks → gap-px columns interleaved.
 */
export function buildGridTemplateColumns(stacksVisible: number, stackGap: number): string {
  if (stacksVisible <= 1) return '1fr'
  return Array.from({ length: stacksVisible }, (_, i) =>
    i === 0 ? '1fr' : `${stackGap}px 1fr`
  ).join(' ')
}
