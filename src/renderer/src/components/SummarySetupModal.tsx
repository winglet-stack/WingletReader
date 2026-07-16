import React from 'react'

interface Props {
  onConfirm: () => void
  onSkip: () => void
}

/**
 * First-time overlay shown after a reading session when no summary database
 * exists yet. Lets the user opt in before the summary prompt appears.
 */
export default function SummarySetupModal({ onConfirm, onSkip }: Props) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Create summary database">
      <div className="modal-box">
        <div className="modal-icon">&#128196;</div>
        <h2 className="modal-title">Track Reading Summaries?</h2>
        <p className="modal-body">
          WingletReader can save a brief summary after each reading session to help
          you retain what you read. Would you like to enable summary tracking?
        </p>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onSkip}>
            Not now
          </button>
          <button className="btn-primary" onClick={onConfirm}>
            Create Summary Database
          </button>
        </div>
      </div>
    </div>
  )
}
