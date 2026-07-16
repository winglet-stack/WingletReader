import React from 'react'
import type { TextRecord } from '../../types'

interface Props {
  texts: TextRecord[]
  loadingContent: boolean
  pasteMode: boolean
  pastedTextInput: string
  onTogglePasteMode: () => void
  onChangePastedText: (value: string) => void
  onSelectText: (text: TextRecord) => void
  onUsePastedText: () => void
}

export default function TransmuteSourceSelect({
  texts,
  loadingContent,
  pasteMode,
  pastedTextInput,
  onTogglePasteMode,
  onChangePastedText,
  onSelectText,
  onUsePastedText
}: Props) {
  return (
    <div className="transmute-select">
      {loadingContent && (
        <div className="transmute-loading">Loading…</div>
      )}

      {/* Book list */}
      {texts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">&#127916;</div>
          <p>No texts in your library yet.</p>
          <p className="empty-sub">Import a book first, then come back to transmute it.</p>
        </div>
      ) : (
        <ul className="text-list" role="list">
          {texts.map((t) => (
            <li key={t.id} className="text-card" role="listitem">
              <button
                className="text-card-body"
                onClick={() => onSelectText(t)}
                disabled={loadingContent}
                aria-label={`Transmute "${t.title}"`}
              >
                <span className="text-card-title">{t.title}</span>
                <span className="text-card-meta">
                  {t.word_count?.toLocaleString() ?? 0} words
                  {(t.segment_count ?? 0) > 0 && (
                    <span className="text-card-segments-badge">{t.segment_count} chapters</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Paste text source */}
      <div className="transmute-paste-section">
        <button
          className="transmute-paste-toggle"
          onClick={onTogglePasteMode}
          aria-expanded={pasteMode}
        >
          {pasteMode ? '▾' : '▸'} Or paste text directly
        </button>
        {pasteMode && (
          <div className="transmute-paste-body">
            <textarea
              className="transmute-paste-textarea"
              placeholder="Paste your text here…"
              value={pastedTextInput}
              onChange={(e) => onChangePastedText(e.target.value)}
              rows={8}
            />
            <div className="transmute-paste-actions">
              <span className="settings-hint">
                {pastedTextInput.trim()
                  ? `${pastedTextInput.trim().split(/\s+/).filter(Boolean).length.toLocaleString()} words`
                  : 'No text yet'}
              </span>
              <button
                className="btn-primary"
                onClick={onUsePastedText}
                disabled={loadingContent}
              >
                Use this text →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
