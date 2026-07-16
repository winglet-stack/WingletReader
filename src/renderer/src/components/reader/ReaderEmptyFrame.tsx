import React from 'react'
import ReaderInertFrame from './ReaderInertFrame'

interface Props {
  onImport: () => void
  onBack: () => void
  backLabel?: string
}

export default function ReaderEmptyFrame({ onImport, onBack, backLabel = 'Hub' }: Props) {
  return (
    <ReaderInertFrame onBack={onBack} backLabel={backLabel} onInertControl={onImport}>
      <div className="reader-stage">
        <div className="reader-empty">
          <p className="reader-empty-heading">Your library is empty</p>
          <p className="reader-empty-sub">Import a text to start speed-reading.</p>
          <button
            type="button"
            className="btn-primary reader-empty-import"
            onClick={onImport}
          >
            Import a text
          </button>
        </div>
      </div>
    </ReaderInertFrame>
  )
}
