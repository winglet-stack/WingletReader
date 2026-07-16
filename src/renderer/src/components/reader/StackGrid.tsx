import React from 'react'
import StackDisplay from '../StackDisplay'
import { deriveSlotPresentation } from '../../engine/stackLayout'
import type { WordStack } from '../../types'

interface Props {
  displayRows: (WordStack | null)[][]
  gridTemplateColumns: string
  blockStart: number
  stacksVisible: number
  highlightActive: boolean
  focalPointsView: boolean
  showChunkDividers: boolean
  isSlotHighlighted: (rowIdx: number, colIdx: number) => boolean
  fontSize: number
  verticalOffset: number
  horizontalOffset: number
  rowGap: number
}

export default function StackGrid({
  displayRows,
  gridTemplateColumns,
  blockStart,
  stacksVisible,
  highlightActive,
  focalPointsView,
  showChunkDividers,
  isSlotHighlighted,
  fontSize,
  verticalOffset,
  horizontalOffset,
  rowGap,
}: Props) {
  return (
    <div
      className="reader-stack-rows"
      style={{
        transform: `translateY(${verticalOffset}px) translateX(${horizontalOffset}px)`,
        gap: `${rowGap}px`,
      } as React.CSSProperties}
    >
      {displayRows.map((slots, rowIdx) => (
        <div key={rowIdx} className="reader-stack-row" style={{ gridTemplateColumns }}>
          {slots.map((stack, colIdx) => {
            const slot = deriveSlotPresentation({
              rowIdx, colIdx, stack, stacksVisible, blockStart,
              highlightActive, focalPointsView, showChunkDividers, isSlotHighlighted,
            })
            return (
              <React.Fragment key={colIdx}>
                {slot.divider && (
                  <div
                    className={`stack-divider${slot.divider.kind === 'dot' ? ' stack-divider--dot' : ''}${slot.divider.active ? ' stack-divider--active' : ''}`}
                    aria-hidden="true"
                    style={{ visibility: slot.divider.visible ? 'visible' : 'hidden' }}
                  />
                )}
                <div className={slot.slotClass}>
                  {stack !== null && (
                    <StackDisplay
                      key={slot.globalIdx}
                      stack={stack}
                      fontSize={fontSize}
                      isHeadline={stack.type === 'headline'}
                    />
                  )}
                </div>
              </React.Fragment>
            )
          })}
        </div>
      ))}
    </div>
  )
}
