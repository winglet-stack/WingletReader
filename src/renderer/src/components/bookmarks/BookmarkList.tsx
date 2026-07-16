import React, { useEffect, useMemo, useState } from 'react'
import type { Bookmark } from '../../types'

interface BookmarkRowProps {
  bookmark: Bookmark
  totalWords: number
  onSelect?: (bookmark: Bookmark) => void
  onRename?: (bookmark: Bookmark, label: string) => void | Promise<void>
  onDelete?: (bookmark: Bookmark) => void
  selectLabel?: string
  deleting?: boolean
}

interface BookmarkListProps {
  bookmarks: Bookmark[]
  totalWords: number
  emptyLabel?: string
  onSelect?: (bookmark: Bookmark) => void
  onRename?: (bookmark: Bookmark, label: string) => void | Promise<void>
  onDelete?: (bookmark: Bookmark) => void
  selectLabel?: string
  deletingId?: number | null
}

function formatBookmarkPosition(wordOffset: number, totalWords: number): string {
  if (totalWords <= 0) return '0%'
  const clamped = Math.max(0, Math.min(wordOffset, totalWords))
  return `${Math.round((clamped / totalWords) * 100)}%`
}

function BookmarkRow({
  bookmark,
  totalWords,
  onSelect,
  onRename,
  onDelete,
  selectLabel,
  deleting = false,
}: BookmarkRowProps) {
  const isGoal = bookmark.kind === 'goal'
  const rowLabel = `Read from bookmark: ${bookmark.label}${isGoal ? ' (Target)' : ''}`
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(bookmark.label)
  const [renaming, setRenaming] = useState(false)

  useEffect(() => {
    if (!editing) setDraft(bookmark.label)
  }, [bookmark.label, editing])

  const commitRename = async () => {
    const label = draft.trim()
    if (!label) {
      setDraft(bookmark.label)
      setEditing(false)
      return
    }
    if (label === bookmark.label || !onRename) {
      setEditing(false)
      return
    }
    setRenaming(true)
    try {
      await onRename(bookmark, label)
      setEditing(false)
    } finally {
      setRenaming(false)
    }
  }
  const rowContent = (
    <>
      <span
        className={`bookmark-row-glyph${isGoal ? ' bookmark-row-glyph--goal' : ''}`}
        aria-hidden="true"
      />
      {editing ? (
        <input
          className="bookmark-row-input"
          value={draft}
          autoFocus
          maxLength={160}
          aria-label={`Edit bookmark label: ${bookmark.label}`}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commitRename()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void commitRename()
            if (e.key === 'Escape') {
              setDraft(bookmark.label)
              setEditing(false)
            }
          }}
          disabled={renaming}
        />
      ) : (
        <span className="bookmark-row-label">{bookmark.label}</span>
      )}
      <span className="bookmark-row-meta">
        {isGoal && <span className="bookmark-row-kind">Target</span>}
        <span className="bookmark-row-position">
          {formatBookmarkPosition(bookmark.wordOffset, totalWords)}
        </span>
      </span>
      {selectLabel && <span className="bookmark-row-select-label">{selectLabel}</span>}
    </>
  )

  return (
    <li className={`bookmark-row${isGoal ? ' bookmark-row--goal' : ''}`}>
      {editing ? (
        <div className="bookmark-row-main bookmark-row-main--editing">{rowContent}</div>
      ) : (
        <button
          type="button"
          className="bookmark-row-main"
          onClick={() => onSelect?.(bookmark)}
          disabled={!onSelect}
          aria-label={rowLabel}
        >
          {rowContent}
        </button>
      )}
      {onRename && !editing && (
        <button
          type="button"
          className="bookmark-row-action bookmark-row-rename"
          onClick={() => {
            setDraft(bookmark.label)
            setEditing(true)
          }}
          aria-label={`Rename bookmark: ${bookmark.label}`}
          title="Rename bookmark"
        >
          Rename
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          className="bookmark-row-action bookmark-row-delete"
          onClick={() => onDelete(bookmark)}
          disabled={deleting}
          aria-label={`Delete bookmark: ${bookmark.label}`}
          title="Delete bookmark"
        >
          {deleting ? '...' : 'Delete'}
        </button>
      )}
    </li>
  )
}

export default function BookmarkList({
  bookmarks,
  totalWords,
  emptyLabel = 'No bookmarks yet.',
  onSelect,
  onRename,
  onDelete,
  selectLabel,
  deletingId = null,
}: BookmarkListProps) {
  const sortedBookmarks = useMemo(
    () =>
      [...bookmarks].sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'goal' ? -1 : 1
        return a.wordOffset - b.wordOffset || a.id - b.id
      }),
    [bookmarks]
  )

  if (sortedBookmarks.length === 0) {
    return <p className="bookmark-list-empty">{emptyLabel}</p>
  }

  return (
    <ul className="bookmark-list" role="list">
      {sortedBookmarks.map((bookmark) => (
        <BookmarkRow
          key={bookmark.id}
          bookmark={bookmark}
          totalWords={totalWords}
          onSelect={onSelect}
          onRename={onRename}
          onDelete={onDelete}
          selectLabel={selectLabel}
          deleting={deletingId === bookmark.id}
        />
      ))}
    </ul>
  )
}
