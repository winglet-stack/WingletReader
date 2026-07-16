import React, { useState } from 'react'
import type { TextRecord, TextSegment } from '../types'
import { cleanupImportedText } from '../../../shared/importTextCleanup'
import { usePasteOrFileImportWithAutoTitle } from '../hooks/usePasteOrFileImport'
import { ImportDropZone, ImportDiagnosticsBox, ImportWarnings } from './ImportPanelParts'

interface Props {
  targetBook: TextRecord
  chapterCount: number
  onSaved: (segment: TextSegment) => void
  onCancel: () => void
}

function wordCount(str: string): number {
  return str.trim() === '' ? 0 : str.trim().split(/\s+/).filter(Boolean).length
}

export default function AddChapterPanel({ targetBook, chapterCount, onSaved, onCancel }: Props) {
  const [chapterTitle, setChapterTitle] = useState('')
  const [summaryText, setSummaryText] = useState('')
  const [saving, setSaving] = useState(false)
  const {
    tab,
    setTab,
    pastedText,
    setPastedText,
    fileName,
    fileContent,
    setFileContent,
    fileDiagnostics,
    warnings,
    error,
    setError,
    busy,
    dragging,
    setDragging,
    dropRef,
    openFile,
    handleDrop,
    activeContent,
    wordCount: wc,
    paragraphCount,
  } = usePasteOrFileImportWithAutoTitle(setChapterTitle)

  const handleSave = async () => {
    setError(null)
    const title = chapterTitle.trim()
    const cleaned = cleanupImportedText(activeContent, { preservePageMarkers: true })
    const contentToSave = cleaned.content.trim()
    if (!title) { setError('Please enter a content title.'); return }
    if (!contentToSave) {
      setError(tab === 'paste' ? 'Please paste some text.' : 'No file loaded.')
      return
    }
    if (wordCount(contentToSave) < 3) { setError('Content text is too short (needs at least 3 words).'); return }

    setSaving(true)
    try {
      const newSeg = await window.api.db.appendSegment(targetBook.id!, {
        title,
        content: contentToSave,
        order: chapterCount,
        sourceType: 'detected_heading',
        word_count: wordCount(contentToSave)
      }) as TextSegment

      // Always save a summary record — empty string is a valid placeholder editable later.
      await window.api.db.saveSummary({
        textId: targetBook.id!,
        segmentId: newSeg.id,
        textTitle: targetBook.title,
        chapterTitle: title,
        content: summaryText.trim()
      })

      onSaved(newSeg)
    } catch (err) {
      setError(`Failed to save content: ${(err as Error).message}`)
      setSaving(false)
    }
  }

  return (
    <div className="view-container">
      <header className="view-header">
        <div>
          <h1>Add Content</h1>
          <p className="reflection-subtitle">{targetBook.title}</p>
        </div>
      </header>

      {error && (
        <div className="reflection-error" role="alert">
          {error}
          <button className="reflection-error-close" onClick={() => setError(null)}>✕</button>
        </div>
      )}

      <div className="byb-form">
        <div className="byb-field">
          <label className="byb-label" htmlFor="chapter-title">Content title</label>
          <input
            id="chapter-title"
            className="form-input"
            type="text"
            placeholder="Give this content a title"
            value={chapterTitle}
            onChange={(e) => setChapterTitle(e.target.value)}
            maxLength={200}
            autoFocus
          />
        </div>

        <div className="byb-field">
          <label className="byb-label">
            Content text
            {wc > 0 && <span className="byb-wc">{wc.toLocaleString()} words</span>}
          </label>

          <div className="tab-row" role="tablist">
            <button
              role="tab"
              aria-selected={tab === 'paste'}
              className={`tab-btn ${tab === 'paste' ? 'tab-active' : ''}`}
              onClick={() => setTab('paste')}
            >
              Paste Text
            </button>
            <button
              role="tab"
              aria-selected={tab === 'file'}
              className={`tab-btn ${tab === 'file' ? 'tab-active' : ''}`}
              onClick={() => setTab('file')}
            >
              Upload File
            </button>
          </div>

          {tab === 'paste' && (
            <textarea
              className="form-textarea byb-content-textarea"
              placeholder="Paste or type the content text here…"
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              rows={12}
              spellCheck={false}
            />
          )}

          {tab === 'file' && (
            <ImportDropZone
              fileName={fileName}
              fileContent={fileContent}
              wordCount={wc}
              busy={busy}
              dragging={dragging}
              dropRef={dropRef}
              onOpen={openFile}
              onDrop={handleDrop}
              setDragging={setDragging}
            />
          )}

          {tab === 'file' && fileContent !== null && (
            <div className="form-group">
              <label className="form-label" htmlFor="chapter-file-preview">
                Review extracted text
              </label>
              <textarea
                id="chapter-file-preview"
                className="form-textarea byb-content-textarea"
                value={fileContent}
                onChange={(e) => setFileContent(e.target.value)}
                rows={12}
                spellCheck={false}
              />
            </div>
          )}
        </div>

        <ImportWarnings warnings={warnings} />
        <ImportDiagnosticsBox diagnostics={tab === 'file' ? fileDiagnostics : null} />

        {wc > 0 && (
          <p className="word-count-hint">
            {wc.toLocaleString()} words &middot; {paragraphCount.toLocaleString()} paragraphs
          </p>
        )}

        <div className="byb-field">
          <label className="byb-label" htmlFor="chapter-summary">
            Summary <span className="byb-optional">(optional)</span>
          </label>
          <textarea
            id="chapter-summary"
            className="form-textarea"
            placeholder="A brief summary of this chapter…"
            value={summaryText}
            onChange={(e) => setSummaryText(e.target.value)}
            rows={3}
          />
        </div>
      </div>

      <div className="reflection-actions">
        <button className="btn-ghost" onClick={onCancel}>← Cancel</button>
        <button
          className="btn-primary"
          onClick={handleSave}
          disabled={saving || busy || !chapterTitle.trim() || !activeContent.trim()}
        >
          {saving ? 'Saving…' : 'Save Content'}
        </button>
      </div>
    </div>
  )
}
