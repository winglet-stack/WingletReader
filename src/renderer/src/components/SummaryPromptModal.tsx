import React, { useState } from 'react'

interface Props {
  textTitle: string
  chapterTitle?: string
  startWordOffset?: number
  endWordOffset?: number
  /** Show the "create chapter and summarize" option (only when reading a full text, not a segment). */
  canCreateChapter?: boolean
  /** Show the "continue reading" option (hidden when the session reached the end of the text). */
  canContinue?: boolean
  onReread: () => void
  /** Empty content is valid — stored as a placeholder to be edited later. */
  onSave: (summaryText: string) => void
  /**
   * Called with the user-supplied chapter title. Returns ok:true on success so the modal
   * can advance to the write-summary screen; ok:false with an error string otherwise.
   */
  onCreateChapterAndSummarize?: (title: string) => Promise<{ ok: boolean; error?: string }>
  onContinue?: () => void
  onExit: () => void
}

type ModalMode = 'prompt' | 'write' | 'create-chapter'

export default function SummaryPromptModal({
  textTitle,
  chapterTitle,
  startWordOffset,
  endWordOffset,
  canCreateChapter,
  canContinue,
  onReread,
  onSave,
  onCreateChapterAndSummarize,
  onContinue,
  onExit
}: Props) {
  const [mode, setMode] = useState<ModalMode>('prompt')
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [newChapterTitle, setNewChapterTitle] = useState('')
  const [chapterError, setChapterError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const label = chapterTitle ? `${textTitle} — ${chapterTitle}` : textTitle

  const passageLabel =
    startWordOffset !== undefined && endWordOffset !== undefined && endWordOffset > startWordOffset
      ? `words ${startWordOffset.toLocaleString()}–${endWordOffset.toLocaleString()}`
      : null

  async function handleSave() {
    setSaving(true)
    try {
      await onSave(draft.trim())
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateChapter() {
    if (!newChapterTitle.trim() || !onCreateChapterAndSummarize) return
    setCreating(true)
    setChapterError(null)
    try {
      const result = await onCreateChapterAndSummarize(newChapterTitle.trim())
      if (!result.ok) {
        setChapterError(result.error ?? 'Failed to create chapter.')
      } else {
        setMode('write')
      }
    } finally {
      setCreating(false)
    }
  }

  if (mode === 'create-chapter') {
    return (
      <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Create chapter">
        <div className="modal-box">
          <h2 className="modal-title">Create Chapter</h2>
          <p className="modal-sub">{label}</p>
          {passageLabel && (
            <p className="modal-passage-range">Passage: {passageLabel}</p>
          )}
          <input
            type="text"
            className="form-input"
            placeholder="Chapter title"
            value={newChapterTitle}
            onChange={(e) => { setNewChapterTitle(e.target.value); setChapterError(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateChapter() }}
            autoFocus
            aria-label="Chapter title"
          />
          {chapterError && (
            <p className="modal-error" role="alert">{chapterError}</p>
          )}
          <div className="modal-actions">
            <button className="btn-ghost" onClick={() => { setMode('prompt'); setChapterError(null) }}>
              ← Back
            </button>
            <button
              className="btn-primary"
              onClick={handleCreateChapter}
              disabled={!newChapterTitle.trim() || creating}
            >
              {creating ? 'Creating…' : 'Create & Summarize'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (mode === 'write') {
    return (
      <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Write summary">
        <div className="modal-box modal-box--wide">
          <h2 className="modal-title">Write a Summary</h2>
          <p className="modal-sub">{label}</p>
          {passageLabel && (
            <p className="modal-passage-range">Passage: {passageLabel}</p>
          )}
          <textarea
            className="form-textarea summary-modal-textarea"
            placeholder="Summarise what you just read…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            rows={6}
            aria-label="Summary text"
          />
          <div className="modal-actions">
            <button className="btn-ghost" onClick={() => setMode('prompt')}>
              ← Back
            </button>
            <button
              className="btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving…' : draft.trim() ? 'Save Summary' : 'Save (empty placeholder)'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Reading complete">
      <div className="modal-box">
        <div className="modal-icon">&#9654;</div>
        <h2 className="modal-title">Reading Session Complete</h2>
        <p className="modal-sub">{label}</p>
        {passageLabel && (
          <p className="modal-passage-range">Passage covered: {passageLabel}</p>
        )}
        <div className="modal-option-list">
          {canContinue && onContinue && (
            <button className="modal-option-btn" onClick={onContinue}>
              <span className="modal-option-icon">&#9654;</span>
              <span className="modal-option-text">
                <strong>Continue Reading</strong>
                <span>Resume from where you stopped</span>
              </span>
            </button>
          )}
          <button className="modal-option-btn" onClick={onReread}>
            <span className="modal-option-icon">&#9198;</span>
            <span className="modal-option-text">
              <strong>Reread</strong>
              <span>Read the same text again from the beginning</span>
            </span>
          </button>
          {canCreateChapter && onCreateChapterAndSummarize && (
            <button className="modal-option-btn" onClick={() => setMode('create-chapter')}>
              <span className="modal-option-icon">&#9776;</span>
              <span className="modal-option-text">
                <strong>create chapter and summarize</strong>
                <span>Mark this passage as a chapter and write a summary</span>
              </span>
            </button>
          )}
          <button className="modal-option-btn" onClick={() => setMode('write')}>
            <span className="modal-option-icon">&#128196;</span>
            <span className="modal-option-text">
              <strong>Write a Summary</strong>
              <span>Save a brief summary of what you read</span>
            </span>
          </button>
          <button className="modal-option-btn modal-option-btn--muted" onClick={onExit}>
            <span className="modal-option-icon">&#10006;</span>
            <span className="modal-option-text">
              <strong>Exit</strong>
              <span>Return to library without saving</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
