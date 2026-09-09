import React from 'react'
import StackDisplay from '../StackDisplay'
import type { ReaderFrame } from '../../engine/readerFrame'

/**
 * DOM painter for the reader frame.
 *
 * Maps the frame description to elements and CSS variables. It makes no geometric
 * decision of its own — every class, size, gap and divider state is read from the
 * frame (see `engine/readerFrame.ts`).
 */
export default function StackGrid({ frame }: { frame: ReaderFrame }) {
  const { geometry } = frame

  return (
    <div
      className={`reader-stack-rows reader-stack-rows--${geometry.anchor}`}
      style={{
        transform: `translateY(${geometry.verticalOffset}px) translateX(${geometry.horizontalOffset}px)`,
        gap: `${geometry.rowGap}px`,
      } as React.CSSProperties}
    >
      {frame.rows.map((row) => (
        <div
          key={row.rowIndex}
          className="reader-stack-row"
          style={{ gridTemplateColumns: geometry.gridTemplateColumns, minHeight: geometry.rowHeight }}
        >
          {row.slots.map((slot) => (
            <React.Fragment key={slot.colIndex}>
              {slot.divider && (
                <div
                  className={`stack-divider${slot.divider.kind === 'dot' ? ' stack-divider--dot' : ''}${slot.divider.active ? ' stack-divider--active' : ''}`}
                  aria-hidden="true"
                  style={{ visibility: slot.divider.visible ? 'visible' : 'hidden' }}
                />
              )}
              <div className={slot.slotClass}>
                {slot.stack !== null && (
                  <StackDisplay
                    key={slot.stackIndex}
                    stack={slot.stack}
                    fontSize={slot.fontSize}
                    isHeadline={slot.isHeadline}
                  />
                )}
              </div>
            </React.Fragment>
          ))}
        </div>
      ))}
    </div>
  )
}
