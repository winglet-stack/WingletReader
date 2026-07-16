import React from 'react'
import { resolveHighlightTextColor } from '../engine/highlightColor'
import { buildReaderCssVars } from '../engine/readerCssVars'
import { buildGridTemplateColumns } from '../engine/stackLayout'

const WORDS = [
  ['the', 'quick'], ['brown', 'fox'], ['jumps', 'over'], ['the', 'lazy'],
  ['dog', 'runs'], ['fast', 'and'], ['leaps', 'high'], ['into', 'view'],
]

export interface StackPreviewGridProps {
  fontSize: number
  fontFamily: string
  textColor: string
  highlightColor: string
  highlightTextColor: string
  highlightActive: boolean
  bgColor: string
  showChunkDividers: boolean
  stacksVisible: number
  stackGap: number
  stackVerticalOffset: number
  stackHorizontalOffset: number
  linesEnabled: boolean
  linesCount: number
  linesRowGap: number
  wordsPerStack: number
  /** Scale applied to offset transforms. 1.0 for full-size, 0.25 for mini preview. Default: 1. */
  offsetScale?: number
  /** Cap on rendered stack columns; shows overflow indicator when truncated. Omit for no cap. */
  maxStacks?: number
  /** Cap on rendered rows. Omit for no cap. */
  maxRows?: number
  /** CSS class applied to the outer stage element. Default: 'spg-stage'. */
  stageClassName?: string
}

export default function StackPreviewGrid({
  fontSize,
  fontFamily,
  textColor,
  highlightColor,
  highlightTextColor,
  highlightActive,
  bgColor,
  showChunkDividers,
  stacksVisible,
  stackGap,
  stackVerticalOffset,
  stackHorizontalOffset,
  linesEnabled,
  linesCount,
  linesRowGap,
  wordsPerStack,
  offsetScale = 1,
  maxStacks,
  maxRows,
  stageClassName = 'spg-stage',
}: StackPreviewGridProps) {
  const resolvedHighlightText = highlightActive
    ? resolveHighlightTextColor(highlightColor, highlightTextColor)
    : null

  const cssVars = buildReaderCssVars({
    highlightColor: highlightActive ? highlightColor : '',
    stageBgColor: bgColor,
    textColor,
    fontFamily,
    highlightTextColor: resolvedHighlightText,
  }) as React.CSSProperties

  const colCount = maxStacks !== undefined ? Math.min(stacksVisible, maxStacks) : stacksVisible
  const hasMoreStacks = maxStacks !== undefined && stacksVisible > maxStacks

  const totalRows = linesEnabled ? linesCount : 1
  const rowCount = maxRows !== undefined ? Math.min(totalRows, maxRows) : totalRows

  const gridCols = buildGridTemplateColumns(colCount, stackGap)

  function renderRow(rowIndex: number) {
    const cells: React.ReactNode[] = []
    for (let col = 0; col < colCount; col++) {
      const wordPair = WORDS[(rowIndex * colCount + col) % WORDS.length]
      const label = wordPair.slice(0, Math.min(wordsPerStack, 2)).join(' ')
      const isActive = highlightActive && rowIndex === 0 && col === 0
      cells.push(
        <div
          key={`slot-${col}`}
          className={`stack-slot${isActive ? ' stack-slot--active' : ''}`}
          style={{ padding: '6px 12px' }}
        >
          <span className="stack-words" style={{ fontSize: `${fontSize}px`, whiteSpace: 'nowrap' }}>
            {label}
          </span>
        </div>
      )
      if (col < colCount - 1) {
        cells.push(
          showChunkDividers
            ? <div key={`div-${col}`} className="stack-divider" />
            : <div key={`div-${col}`} />
        )
      }
    }
    return cells
  }

  return (
    <div className={stageClassName} style={cssVars}>
      <div
        className="spg-inner"
        style={{
          transform: `translateY(${Math.round(stackVerticalOffset * offsetScale)}px) translateX(${Math.round(stackHorizontalOffset * offsetScale)}px)`,
          gap: linesEnabled ? `${linesRowGap}px` : undefined,
        }}
      >
        {Array.from({ length: rowCount }, (_, rowIndex) => (
          <div key={rowIndex} className="reader-stack-row" style={{ gridTemplateColumns: gridCols }}>
            {renderRow(rowIndex)}
          </div>
        ))}
        {hasMoreStacks && (
          <div className="spg-more">+ {stacksVisible - colCount} more</div>
        )}
      </div>
    </div>
  )
}
