import React, { useState, useEffect, useCallback, useMemo } from 'react'
import type { Bookmark, CategoryRecord, TextRecord, Summary } from '../types'
import { useLibrary } from '../contexts/LibraryContext'
import { useReader } from '../contexts/ReaderContext'
import { resolveTextCategoryId } from '../engine/libraryCategoryPicker'
import { resolveTextSegmentVocabulary } from '../engine/segmentVocabulary'
import BookmarkList from './bookmarks/BookmarkList'

function EditableTitle({
  value,
  onCommit,
  noun,
}: {
  value: string
  onCommit: (val: string) => void
  noun: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== value) onCommit(trimmed)
    else setDraft(value)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        className="segment-title-input"
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') {
            setDraft(value)
            setEditing(false)
          }
        }}
        maxLength={200}
        aria-label={`Edit ${noun} title`}
        onClick={(e) => e.stopPropagation()}
      />
    )
  }

  return (
    <button
      className="segment-title-btn"
      onClick={(e) => {
        e.stopPropagation()
        setDraft(value)
        setEditing(true)
      }}
      title="Click to rename"
      aria-label={`Rename: ${value}`}
    >
      {value}
      <span className="segment-title-edit-hint" aria-hidden="true">
        &#9998;
      </span>
    </button>
  )
}

function formatMinutes(wordCount: number): string {
  const minutes = Math.ceil(wordCount / 200)
  return minutes === 1 ? '~1 min' : `~${minutes} min`
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

function CategorySelector({
  parentText,
  categories,
  onAssignCategory,
  onError,
}: {
  parentText: TextRecord
  categories: CategoryRecord[]
  onAssignCategory: (textId: number, categoryId: number) => Promise<void>
  onError: (message: string) => void
}) {
  const resolvedCategoryId = resolveTextCategoryId(parentText.category_id, categories)
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | undefined>(resolvedCategoryId)
  const [isOpen, setIsOpen] = useState(false)
  const [isAssigning, setIsAssigning] = useState(false)

  useEffect(() => {
    setSelectedCategoryId(resolveTextCategoryId(parentText.category_id, categories))
  }, [categories, parentText.category_id, parentText.id])

  const selectedCategory =
    categories.find((category) => category.id === selectedCategoryId)
    ?? categories[0]

  const handleAssign = useCallback(async (categoryId: number) => {
    if (parentText.id === undefined || isAssigning) return
    setIsOpen(false)

    const previousCategoryId = selectedCategoryId
    if (categoryId === previousCategoryId) return

    setSelectedCategoryId(categoryId)
    setIsAssigning(true)
    try {
      await onAssignCategory(parentText.id, categoryId)
    } catch (e) {
      setSelectedCategoryId(previousCategoryId)
      onError(`Failed to update category: ${(e as Error).message}`)
    } finally {
      setIsAssigning(false)
    }
  }, [isAssigning, onAssignCategory, onError, parentText.id, selectedCategoryId])

  if (!selectedCategory) return null

  return (
    <div
      className="segment-category-selector"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setIsOpen(false)
      }}
    >
      <button
        type="button"
        className="segment-category-trigger"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`Category: ${selectedCategory.name}`}
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setIsOpen(false)
        }}
      >
        <span className="segment-category-kicker">Category</span>
        <span className="segment-category-name">{selectedCategory.name}</span>
      </button>

      {isOpen && (
        <div className="segment-category-menu" role="menu" aria-label="Choose category">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              role="menuitemradio"
              aria-checked={category.id === selectedCategoryId}
              className={`segment-category-menu-item${
                category.id === selectedCategoryId ? ' segment-category-menu-item--active' : ''
              }`}
              disabled={isAssigning}
              onClick={() => {
                void handleAssign(category.id)
              }}
            >
              {category.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SegmentBookmarksSection({
  bookmarks,
  totalWords,
  deletingBookmarkId,
  onSelect,
  onRename,
  onDelete,
}: {
  bookmarks: Bookmark[]
  totalWords: number
  deletingBookmarkId: number | null
  onSelect: (bookmark: Bookmark) => void
  onRename: (bookmark: Bookmark, label: string) => void | Promise<void>
  onDelete: (bookmark: Bookmark) => void
}) {
  const goalBookmark = useMemo(
    () => bookmarks.find((bookmark) => bookmark.kind === 'goal') ?? null,
    [bookmarks]
  )
  const normalBookmarks = useMemo(
    () =>
      bookmarks
        .filter((bookmark) => bookmark.kind === 'normal')
        .sort((a, b) => a.wordOffset - b.wordOffset || a.id - b.id),
    [bookmarks]
  )

  if (bookmarks.length === 0) return null

  return (
    <section className="segment-bookmarks" aria-labelledby="segment-bookmarks-title">
      <div className="segment-bookmarks-header">
        <h2 id="segment-bookmarks-title">Bookmarks</h2>
        <span>{bookmarks.length} saved</span>
      </div>
      <div className="segment-bookmark-groups">
        {goalBookmark && (
          <section
            className="segment-bookmark-group segment-bookmark-group--goal"
            aria-labelledby="segment-bookmark-goal-title"
          >
            <h3 id="segment-bookmark-goal-title">Target</h3>
            <BookmarkList
              bookmarks={[goalBookmark]}
              totalWords={totalWords}
              onSelect={onSelect}
              onRename={onRename}
              onDelete={onDelete}
              selectLabel="Read from"
              deletingId={deletingBookmarkId}
            />
          </section>
        )}
        {normalBookmarks.length > 0 && (
          <section
            className="segment-bookmark-group"
            aria-labelledby="segment-bookmark-saved-title"
          >
            <h3 id="segment-bookmark-saved-title">Saved</h3>
            <BookmarkList
              bookmarks={normalBookmarks}
              totalWords={totalWords}
              onSelect={onSelect}
              onRename={onRename}
              onDelete={onDelete}
              selectLabel="Read from"
              deletingId={deletingBookmarkId}
            />
          </section>
        )}
      </div>
    </section>
  )
}

export default function SegmentPanel() {
  const {
    parentText,
    categories,
    segments,
    assignTextCategory,
    handleSegmentTitleChange: onRenameSegment,
    handleOpenAddChapter,
    handleDeleteSegment: onDeleteSegment,
  } = useLibrary()
  const {
    openReader: onOpenText,
    openSegmentInReader: onOpenSegment,
    openTextAtWordOffset: onOpenTextAtWordOffset,
    handleContinueReadingSource,
    summaryVersion,
  } = useReader()

  const segmentsHaveExtractedChapters = segments.some((s) => s.endWordOffset !== undefined)
  const segmentsMaxEndOffset = segments.reduce(
    (max, s) => (s.endWordOffset !== undefined ? Math.max(max, s.endWordOffset) : max),
    0
  )
  const remainingWords =
    parentText && !parentText.is_manual_book && segmentsHaveExtractedChapters
      ? Math.max(0, (parentText.word_count ?? 0) - segmentsMaxEndOffset)
      : 0
  const onContinueReading = !parentText?.is_manual_book && segmentsHaveExtractedChapters
    ? handleContinueReadingSource
    : undefined
  const onAddChapter = () => parentText && handleOpenAddChapter(parentText)
  const segmentVocabulary = parentText ? resolveTextSegmentVocabulary(parentText) : null
  const label = segmentVocabulary?.noun.plural ?? 'contents'
  const canAddContent = segmentVocabulary !== null && !segmentVocabulary.isSeeded
  const showWholeTextRow = canAddContent && segments.length === 0
  const displayedContentCount = showWholeTextRow ? 1 : segments.length
  const displayedLabel =
    displayedContentCount === 1
      ? segmentVocabulary?.noun.singular ?? 'content'
      : label
  const totalWords = showWholeTextRow
    ? parentText?.word_count ?? 0
    : segments.reduce((sum, s) => sum + s.word_count, 0)

  const [selectedSegmentId, setSelectedSegmentId] = useState<number | null>(null)
  const [summaries, setSummaries] = useState<Summary[]>([])
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [deletingBookmarkId, setDeletingBookmarkId] = useState<number | null>(null)
  const [panelError, setPanelError] = useState<string | null>(null)

  useEffect(() => {
    if (!parentText?.id) return
    let cancelled = false
    window.api.db.getSummaries(parentText.id)
      .then((data) => { if (!cancelled) setSummaries(data) })
      .catch((e: Error) => { if (!cancelled) setPanelError(`Failed to load summaries: ${e.message}`) })
    return () => { cancelled = true }
  }, [parentText?.id, summaryVersion])

  useEffect(() => {
    if (!parentText?.id) {
      setBookmarks([])
      return
    }
    let cancelled = false
    window.api.db
      .getBookmarks(parentText.id)
      .then((data) => {
        if (!cancelled) setBookmarks(data)
      })
      .catch((e: Error) => {
        if (!cancelled) setPanelError(`Failed to load bookmarks: ${e.message}`)
      })
    return () => {
      cancelled = true
    }
  }, [parentText?.id])

  const handleSelectSegment = useCallback((segId: number) => {
    setSelectedSegmentId((prev) => (prev === segId ? null : segId))
  }, [])

  const handleDeleteSummary = useCallback(async (summaryId: number) => {
    if (!window.confirm('Delete this summary and its questions? This cannot be undone.')) return
    try {
      await window.api.db.deleteSummary(summaryId)
      setSummaries((prev) => prev.filter((s) => s.id !== summaryId))
    } catch (e) {
      setPanelError(`Failed to delete summary: ${(e as Error).message}`)
    }
  }, [])

  const handleDeleteSegmentClick = useCallback(async (segmentId: number) => {
    const seg = segments.find((s) => s.id === segmentId)
    const hasSummary = summaries.some((s) => s.segmentId === segmentId)
    const fallback = `this ${segmentVocabulary?.noun.singular ?? 'content'}`
    const msg = hasSummary
      ? `Delete "${seg?.title ?? fallback}" and its summary? This cannot be undone.`
      : `Delete "${seg?.title ?? fallback}"? This cannot be undone.`
    if (!window.confirm(msg)) return
    setSelectedSegmentId(null)
    onDeleteSegment(segmentId)
  }, [segments, summaries, onDeleteSegment, segmentVocabulary?.noun.singular])

  const handleReadFromBookmark = useCallback((bookmark: Bookmark) => {
    if (!parentText) return
    void onOpenTextAtWordOffset(parentText, bookmark.wordOffset)
  }, [onOpenTextAtWordOffset, parentText])

  const handleRenameBookmark = useCallback(async (bookmark: Bookmark, label: string) => {
    try {
      await window.api.db.updateBookmarkLabel(bookmark.id, label)
      setBookmarks((current) =>
        current.map((entry) => (entry.id === bookmark.id ? { ...entry, label } : entry))
      )
    } catch (e) {
      setPanelError(`Failed to rename bookmark: ${(e as Error).message}`)
    }
  }, [])

  const handleDeleteBookmark = useCallback(async (bookmark: Bookmark) => {
    if (deletingBookmarkId !== null) return
    setDeletingBookmarkId(bookmark.id)
    try {
      await window.api.db.deleteBookmark(bookmark.id)
      setBookmarks((current) => current.filter((entry) => entry.id !== bookmark.id))
    } catch (e) {
      setPanelError(`Failed to delete bookmark: ${(e as Error).message}`)
    } finally {
      setDeletingBookmarkId(null)
    }
  }, [deletingBookmarkId])

  if (!parentText) return null

  return (
    <div className="view-container">
      <header className="view-header">
        <div className="view-header-stack">
          <CategorySelector
            parentText={parentText}
            categories={categories}
            onAssignCategory={assignTextCategory}
            onError={setPanelError}
          />
          <h1 className="segment-parent-title">{parentText.title}</h1>
          <p className="segment-meta">
            {displayedContentCount} {displayedLabel} &middot; {totalWords.toLocaleString()} words total
          </p>
        </div>
        {canAddContent && (
          <button className="btn-primary" onClick={onAddChapter}>
            + Add Content
          </button>
        )}
      </header>

      {panelError && (
        <div className="reflection-error" role="alert">
          {panelError}
          <button
            className="reflection-error-close"
            onClick={() => setPanelError(null)}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      <SegmentBookmarksSection
        bookmarks={bookmarks}
        totalWords={parentText.word_count ?? 0}
        deletingBookmarkId={deletingBookmarkId}
        onSelect={handleReadFromBookmark}
        onRename={handleRenameBookmark}
        onDelete={handleDeleteBookmark}
      />

      <ul className="segment-list" role="list">
        {showWholeTextRow && (
          <li key="whole-text" className="segment-card segment-card-whole-text" role="listitem">
            <div className="segment-card-order">1</div>
            <div className="segment-card-body">
              <span className="segment-title-static">{parentText.title}</span>
              <span className="segment-card-meta">
                {totalWords.toLocaleString()} words &middot; {formatMinutes(totalWords)}
              </span>
            </div>
            <button
              className="segment-read-btn"
              onClick={() => { void onOpenText(parentText) }}
              aria-label={`Read: ${parentText.title}`}
            >
              &#9654; Read
            </button>
          </li>
        )}

        {segments.map((seg, idx) => {
          const isSelected = selectedSegmentId === seg.id
          const summary = summaries.find((s) => s.segmentId === seg.id) ?? null

          return (
            <li
              key={seg.id}
              className={`segment-card${isSelected ? ' segment-card--selected' : ''}`}
              role="listitem"
              onClick={() => handleSelectSegment(seg.id)}
              style={{ cursor: 'pointer' }}
            >
              <div className="segment-card-order">{idx + 1}</div>

              <div className="segment-card-body">
                <EditableTitle
                  value={seg.title}
                  noun={segmentVocabulary?.noun.singular ?? 'content'}
                  onCommit={(title) => onRenameSegment(seg.id, title)}
                />
                <span className="segment-card-meta">
                  {seg.word_count.toLocaleString()} words &middot; {formatMinutes(seg.word_count)}
                </span>
              </div>

              <button
                className="segment-read-btn"
                onClick={(e) => { e.stopPropagation(); onOpenSegment(seg) }}
                aria-label={`Read: ${seg.title}`}
              >
                &#9654; Read
              </button>

              {isSelected && (
                <div
                  className="segment-card-panel"
                  onClick={(e) => e.stopPropagation()}
                >
                  {summary ? (
                    <>
                      <div className="segment-panel-summary-header">
                        <span className="segment-panel-label">Summary</span>
                        <span className="segment-panel-date">{formatDate(summary.created_at)}</span>
                      </div>
                      <p className="segment-panel-summary-body">
                        {summary.content || <em>No content yet.</em>}
                      </p>
                    </>
                  ) : (
                    <p className="segment-panel-empty">No summary available.</p>
                  )}
                  <div className="segment-panel-actions">
                    {summary && (
                      <button
                        className="btn-ghost btn-small summary-delete-btn"
                        onClick={() => handleDeleteSummary(summary.id)}
                      >
                        Delete Summary
                      </button>
                    )}
                    <button
                      className="btn-ghost btn-small segment-delete-btn"
                      onClick={() => handleDeleteSegmentClick(seg.id)}
                    >
                      Delete {segmentVocabulary?.noun.singular === 'chapter' ? 'Chapter' : 'Content'}
                    </button>
                  </div>
                </div>
              )}
            </li>
          )
        })}

        {onContinueReading !== undefined && remainingWords > 0 && (
          <li key="continue-reading" className="segment-card segment-card-continue" role="listitem">
            <div className="segment-card-order">&#8942;</div>
            <div className="segment-card-body">
              <span className="segment-continue-label">Continue Reading</span>
              <span className="segment-card-meta">
                {remainingWords.toLocaleString()} words remaining &middot; {formatMinutes(remainingWords)}
                <span className="segment-badge segment-badge-source">source</span>
              </span>
            </div>
            <button
              className="segment-read-btn"
              onClick={onContinueReading}
              aria-label="Continue reading source material"
            >
              &#9654; Read
            </button>
          </li>
        )}
      </ul>
    </div>
  )
}
