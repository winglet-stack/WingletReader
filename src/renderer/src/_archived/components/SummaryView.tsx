import React, { useState, useEffect, useCallback } from 'react'
import type { TextRecord, TextSegment, Summary, SummaryQuestion } from '../../types'
import { extractPassage } from '../../engine/passageExtract'

interface Props {
  text: TextRecord
  onBack: () => void
  onRead: () => void
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  } catch {
    return iso
  }
}

function countWords(str: string): number {
  return str.trim() === '' ? 0 : str.trim().split(/\s+/).length
}

export default function SummaryView({ text, onBack, onRead }: Props) {
  const [summaries, setSummaries] = useState<Summary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Summary editing state
  const [editing, setEditing] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState('')

  // Questions state — keyed by summaryId
  const [questionsBySummary, setQuestionsBySummary] = useState<Record<number, SummaryQuestion[]>>({})
  const [expandedQSection, setExpandedQSection] = useState<number | null>(null)
  const [addingToSummaryId, setAddingToSummaryId] = useState<number | null>(null)
  const [newQText, setNewQText] = useState('')
  const [answeringId, setAnsweringId] = useState<number | null>(null)
  const [answerDraft, setAnswerDraft] = useState('')

  // Source passage state
  const [textContent, setTextContent] = useState<string | null>(null)
  const [segmentContents, setSegmentContents] = useState<Map<number, string>>(new Map())
  const [viewingSource, setViewingSource] = useState<Set<number>>(new Set())
  const [sideBySide, setSideBySide] = useState(false)

  // ── Load on mount ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!text.id) { setLoading(false); return }

    Promise.all([
      window.api.db.getSummaries(text.id),
      window.api.db.getSummaryQuestionsForText(text.id),
      window.api.db.getText(text.id)
    ])
      .then(async ([loadedSummaries, allQuestions, fullText]) => {
        setSummaries(loadedSummaries as Summary[])

        const byId: Record<number, SummaryQuestion[]> = {}
        for (const q of (allQuestions as SummaryQuestion[])) {
          if (!byId[q.summaryId]) byId[q.summaryId] = []
          byId[q.summaryId].push(q)
        }
        setQuestionsBySummary(byId)

        if ((fullText as TextRecord | null)?.content) {
          setTextContent((fullText as TextRecord).content!)
        }

        // Load segment contents if any summary references a segment
        const withSegment = (loadedSummaries as Summary[]).filter((s) => s.segmentId != null)
        if (withSegment.length > 0) {
          const segs = (await window.api.db.getSegments(text.id!)) as TextSegment[]
          const map = new Map<number, string>()
          for (const seg of segs) {
            map.set(seg.id, seg.content)
          }
          setSegmentContents(map)
        }
      })
      .catch((e: Error) => setError(`Failed to load: ${e.message}`))
      .finally(() => setLoading(false))
  }, [text.id])

  // ── Passage helpers ────────────────────────────────────────────────────────

  const getPassage = useCallback((s: Summary): string => {
    if (s.startWordOffset === undefined || s.endWordOffset === undefined) return ''
    const source = s.segmentId != null
      ? (segmentContents.get(s.segmentId) ?? null)
      : textContent
    if (!source) return ''
    return extractPassage(source, s.startWordOffset, s.endWordOffset)
  }, [textContent, segmentContents])

  const hasPassage = (s: Summary) =>
    s.startWordOffset !== undefined && s.endWordOffset !== undefined &&
    s.startWordOffset < s.endWordOffset

  const toggleSource = useCallback((summaryId: number) => {
    setViewingSource((prev) => {
      const next = new Set(prev)
      if (next.has(summaryId)) next.delete(summaryId)
      else next.add(summaryId)
      return next
    })
  }, [])

  // ── Summary CRUD ───────────────────────────────────────────────────────────

  const handleDeleteSummary = useCallback(async (id: number) => {
    if (!window.confirm('Delete this summary and its questions? This cannot be undone.')) return
    try {
      await window.api.db.deleteSummary(id)
      setSummaries((prev) => prev.filter((s) => s.id !== id))
      setQuestionsBySummary((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      setViewingSource((prev) => { const next = new Set(prev); next.delete(id); return next })
      if (expandedQSection === id) setExpandedQSection(null)
      if (addingToSummaryId === id) { setAddingToSummaryId(null); setNewQText('') }
    } catch (e) {
      setError(`Failed to delete: ${(e as Error).message}`)
    }
  }, [expandedQSection, addingToSummaryId])

  const startEditSummary = useCallback((s: Summary) => {
    setEditing(s.id)
    setEditDraft(s.content)
  }, [])

  const saveEditSummary = useCallback(async (s: Summary) => {
    if (!editDraft.trim()) return
    try {
      const updated = await window.api.db.saveSummary({
        id: s.id,
        textId: s.textId,
        segmentId: s.segmentId,
        textTitle: s.textTitle,
        chapterTitle: s.chapterTitle,
        content: editDraft.trim()
      }) as Summary
      setSummaries((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
      setEditing(null)
    } catch (e) {
      setError(`Failed to save: ${(e as Error).message}`)
    }
  }, [editDraft])

  // ── Question CRUD ──────────────────────────────────────────────────────────

  const addQuestion = useCallback(async (summaryId: number, questionText: string) => {
    const trimmed = questionText.trim()
    if (!trimmed) return

    const existing = questionsBySummary[summaryId] ?? []
    if (existing.some((q) => q.text.toLowerCase() === trimmed.toLowerCase())) {
      setError('This question has already been added to this summary.')
      return
    }

    const summary = summaries.find((s) => s.id === summaryId)
    if (!summary) return

    try {
      const saved = await window.api.db.saveSummaryQuestion({
        summaryId,
        textId: summary.textId,
        text: trimmed,
        answer: ''
      }) as SummaryQuestion
      setQuestionsBySummary((prev) => ({
        ...prev,
        [summaryId]: [...(prev[summaryId] ?? []), saved]
      }))
      setNewQText('')
      setAddingToSummaryId(null)
    } catch (e) {
      setError(`Failed to add question: ${(e as Error).message}`)
    }
  }, [questionsBySummary, summaries])

  const saveAnswer = useCallback(async (question: SummaryQuestion) => {
    try {
      const updated = await window.api.db.saveSummaryQuestion({
        id: question.id,
        summaryId: question.summaryId,
        textId: question.textId,
        text: question.text,
        answer: answerDraft
      }) as SummaryQuestion
      setQuestionsBySummary((prev) => ({
        ...prev,
        [question.summaryId]: (prev[question.summaryId] ?? []).map((q) =>
          q.id === updated.id ? updated : q
        )
      }))
      setAnsweringId(null)
      setAnswerDraft('')
    } catch (e) {
      setError(`Failed to save answer: ${(e as Error).message}`)
    }
  }, [answerDraft])

  const deleteQuestion = useCallback(async (question: SummaryQuestion) => {
    if (!window.confirm('Remove this question? This cannot be undone.')) return
    try {
      await window.api.db.deleteSummaryQuestion(question.id)
      setQuestionsBySummary((prev) => ({
        ...prev,
        [question.summaryId]: (prev[question.summaryId] ?? []).filter((q) => q.id !== question.id)
      }))
      if (answeringId === question.id) { setAnsweringId(null); setAnswerDraft('') }
    } catch (e) {
      setError(`Failed to remove question: ${(e as Error).message}`)
    }
  }, [answeringId])

  // ── Helpers ────────────────────────────────────────────────────────────────

  const toggleQSection = useCallback((summaryId: number) => {
    setExpandedQSection((prev) => (prev === summaryId ? null : summaryId))
    setAddingToSummaryId(null)
    setNewQText('')
    setAnsweringId(null)
    setAnswerDraft('')
  }, [])

  const startAddQuestion = useCallback((summaryId: number) => {
    setAddingToSummaryId(summaryId)
    setNewQText('')
  }, [])

  const cancelAdd = useCallback(() => {
    setAddingToSummaryId(null)
    setNewQText('')
  }, [])

  const startAnswer = useCallback((question: SummaryQuestion) => {
    setAnsweringId(question.id)
    setAnswerDraft(question.answer)
  }, [])

  const cancelAnswer = useCallback(() => {
    setAnsweringId(null)
    setAnswerDraft('')
  }, [])

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="view-container">
        <div className="empty-state"><span>Loading…</span></div>
      </div>
    )
  }

  const anySummaryHasPassage = summaries.some(hasPassage)

  return (
    <div className="view-container">
      <header className="view-header">
        <div>
          <h1>Summaries</h1>
          <p className="reflection-subtitle">{text.title}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {anySummaryHasPassage && (
            <button
              className={`btn-ghost ${sideBySide ? 'summary-sbs-toggle--active' : ''}`}
              onClick={() => setSideBySide((v) => !v)}
              title={sideBySide ? 'Switch to list view' : 'Show summary and source side by side'}
            >
              {sideBySide ? '☰ List' : '⊞ Side by Side'}
            </button>
          )}
          <button className="btn-primary" onClick={onRead}>
            &#9654; Read
          </button>
        </div>
      </header>

      {error && (
        <div className="reflection-error" role="alert">
          {error}
          <button className="reflection-error-close" onClick={() => setError(null)} aria-label="Dismiss">✕</button>
        </div>
      )}

      {summaries.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">&#128196;</div>
          <p>No summaries saved yet for this text.</p>
          <p className="empty-sub">After a reading session ends you will be prompted to write one.</p>
          <button className="btn-primary" onClick={onRead}>Start Reading</button>
        </div>
      ) : (
        <ul className="summary-list" role="list">
          {summaries.map((s) => {
            const qs = questionsBySummary[s.id] ?? []
            const qCount = qs.length
            const answeredCount = qs.filter((q) => q.status === 'answered').length
            const isExpanded = expandedQSection === s.id
            const isAdding = addingToSummaryId === s.id
            const passage = getPassage(s)
            const showingSource = viewingSource.has(s.id)
            const canShowSource = hasPassage(s) && passage.length > 0

            return (
              <li key={s.id} className="summary-card" role="listitem">
                {/* Summary header */}
                <div className="summary-card-header">
                  <div className="summary-card-meta">
                    {s.chapterTitle && (
                      <span className="summary-card-chapter">{s.chapterTitle}</span>
                    )}
                    <span className="summary-card-date">{formatDate(s.created_at)}</span>
                    <span className="summary-card-wc">{countWords(s.content)} words</span>
                    {s.startWordOffset !== undefined && s.endWordOffset !== undefined && (
                      <span className="summary-card-range" title="Words covered in this reading session">
                        words {s.startWordOffset.toLocaleString()}–{s.endWordOffset.toLocaleString()}
                      </span>
                    )}
                    {s.updated_at !== s.created_at && (
                      <span className="summary-card-updated">edited {formatDate(s.updated_at)}</span>
                    )}
                  </div>
                  <div className="summary-card-actions">
                    {editing === s.id ? (
                      <>
                        <button className="btn-ghost btn-small" onClick={() => setEditing(null)}>Cancel</button>
                        <button className="btn-primary btn-small" onClick={() => saveEditSummary(s)}>Save</button>
                      </>
                    ) : (
                      <>
                        <button className="btn-ghost btn-small" onClick={() => startEditSummary(s)}>Edit</button>
                        <button
                          className="btn-ghost btn-small summary-delete-btn"
                          onClick={() => handleDeleteSummary(s.id)}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Summary content — list mode or side-by-side */}
                {sideBySide && canShowSource ? (
                  <div className="summary-sbs-grid">
                    <div className="summary-sbs-col">
                      <div className="summary-sbs-col-label">Summary</div>
                      {editing === s.id ? (
                        <textarea
                          className="form-textarea summary-edit-textarea"
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          autoFocus
                          rows={5}
                          aria-label="Edit summary"
                        />
                      ) : (
                        <p className="summary-card-body">{s.content}</p>
                      )}
                    </div>
                    <div className="summary-sbs-col">
                      <div className="summary-sbs-col-label">Source passage</div>
                      <div className="summary-source-text">{passage}</div>
                    </div>
                  </div>
                ) : (
                  <>
                    {editing === s.id ? (
                      <textarea
                        className="form-textarea summary-edit-textarea"
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        autoFocus
                        rows={5}
                        aria-label="Edit summary"
                      />
                    ) : (
                      <p className="summary-card-body">{s.content}</p>
                    )}

                    {/* View Source toggle — list mode only */}
                    {canShowSource && (
                      <div className="summary-source-toggle-row">
                        <button
                          className={`sq-toggle-btn ${showingSource ? 'sq-toggle-btn--active' : ''}`}
                          onClick={() => toggleSource(s.id)}
                          aria-expanded={showingSource}
                        >
                          <span className="sq-toggle-icon">{showingSource ? '▾' : '▸'}</span>
                          Source passage
                        </button>
                      </div>
                    )}

                    {showingSource && canShowSource && (
                      <div className="summary-source-panel">
                        <div className="summary-sbs-col-label">
                          Source passage
                          {s.chapterTitle && (
                            <span style={{ fontWeight: 400, marginLeft: 6 }}>— {s.chapterTitle}</span>
                          )}
                        </div>
                        <div className="summary-source-text">{passage}</div>
                      </div>
                    )}
                  </>
                )}

                {/* Questions toggle */}
                <div className="sq-toggle-row">
                  <button
                    className={`sq-toggle-btn ${isExpanded ? 'sq-toggle-btn--active' : ''}`}
                    onClick={() => toggleQSection(s.id)}
                    aria-expanded={isExpanded}
                  >
                    <span className="sq-toggle-icon">{isExpanded ? '▾' : '▸'}</span>
                    Questions
                    {qCount > 0 && (
                      <span className="sq-count-badge">
                        {answeredCount}/{qCount} answered
                      </span>
                    )}
                  </button>
                  {!isExpanded && (
                    <button
                      className="btn-ghost btn-small sq-add-inline-btn"
                      onClick={() => { setExpandedQSection(s.id); startAddQuestion(s.id) }}
                      title="Add a question to this summary"
                    >
                      + Add Question
                    </button>
                  )}
                </div>

                {/* Questions section (expanded) */}
                {isExpanded && (
                  <div className="sq-section">
                    {qs.length === 0 && !isAdding && (
                      <p className="sq-empty-hint">
                        No questions yet. Add a question you want to explore in context of this summary.
                      </p>
                    )}

                    {qs.length > 0 && (
                      <ul className="sq-list" role="list">
                        {qs.map((q) => (
                          <li key={q.id} className="sq-item" role="listitem">
                            <div className="sq-item-header">
                              <span className={`sq-status-badge sq-status-badge--${q.status}`}>
                                {q.status === 'answered' ? 'Answered' : 'Unanswered'}
                              </span>
                              <p className="sq-question-text">{q.text}</p>
                              <div className="sq-item-actions">
                                {answeringId === q.id ? (
                                  <>
                                    <button className="btn-ghost btn-small" onClick={cancelAnswer}>Cancel</button>
                                    <button className="btn-primary btn-small" onClick={() => saveAnswer(q)}>Save</button>
                                  </>
                                ) : (
                                  <>
                                    <button className="btn-ghost btn-small" onClick={() => startAnswer(q)}>
                                      {q.status === 'answered' ? 'Edit Answer' : 'Answer'}
                                    </button>
                                    <button
                                      className="btn-ghost btn-small sq-delete-btn"
                                      onClick={() => deleteQuestion(q)}
                                      aria-label="Remove question"
                                    >
                                      ✕
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>

                            {answeringId === q.id ? (
                              <textarea
                                className="form-textarea sq-answer-textarea"
                                value={answerDraft}
                                onChange={(e) => setAnswerDraft(e.target.value)}
                                placeholder="Write your answer…"
                                autoFocus
                                rows={3}
                                aria-label={`Answer to: ${q.text}`}
                              />
                            ) : q.answer ? (
                              <p className="sq-answer-text">{q.answer}</p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}

                    {isAdding ? (
                      <div className="sq-add-form">
                        <div className="sq-add-input-row">
                          <input
                            className="form-input sq-add-input"
                            type="text"
                            placeholder="Type your question…"
                            value={newQText}
                            onChange={(e) => setNewQText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && newQText.trim()) addQuestion(s.id, newQText)
                              if (e.key === 'Escape') cancelAdd()
                            }}
                            autoFocus
                            maxLength={300}
                            aria-label="New question"
                          />
                          <button
                            className="btn-primary btn-small"
                            onClick={() => addQuestion(s.id, newQText)}
                            disabled={!newQText.trim()}
                          >
                            Add
                          </button>
                          <button className="btn-ghost btn-small" onClick={cancelAdd}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button
                        className="btn-ghost btn-small sq-add-btn"
                        onClick={() => startAddQuestion(s.id)}
                      >
                        + Add Question
                      </button>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <div className="reflection-actions" style={{ marginTop: '2rem' }}>
        <button className="btn-ghost" onClick={onBack}>← Back</button>
      </div>
    </div>
  )
}
