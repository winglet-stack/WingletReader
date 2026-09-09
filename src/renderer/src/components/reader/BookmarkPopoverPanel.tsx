import React, { useMemo } from 'react'
import {
  BOOKMARK_KIND_OPTIONS,
  GOAL_FORWARD_ERROR,
  type BookmarkPopoverView,
} from '../../engine/bookmarkPopoverModel'
import type { BookmarkPopoverActions } from '../../hooks/useBookmarkPopoverActions'
import type { BookmarkDraft } from '../../hooks/useBookmarkDraft'
import type { Bookmark } from '../../types'
import BookmarkList from '../bookmarks/BookmarkList'
import Segmented from '../settings/instruments/Segmented'
import { BookmarkPopoverActionRow } from './BookmarkPopoverParts'

interface Props {
  bookmarks: Bookmark[]
  deletingId: number | null
  error: string | null
  draft: BookmarkDraft
  view: BookmarkPopoverView
  actions: BookmarkPopoverActions
  onDeleteBookmark: (bookmark: Bookmark) => void
}

/** The expanded popover: tabs, the list for the active tab, and the draft form. */
export default function BookmarkPopoverPanel({
  bookmarks,
  deletingId,
  error,
  draft,
  view,
  actions,
  onDeleteBookmark,
}: Props) {
  const activeBookmarks = useMemo(
    () => bookmarks.filter((bookmark) => bookmark.kind === draft.kind),
    [bookmarks, draft.kind]
  )

  return (
    <>
      <div className="bookmark-popover-header">
        <span>Bookmarks</span>
        <span className="bookmark-popover-count">
          {bookmarks.length > 0 ? `${bookmarks.length} saved` : 'None saved'}
        </span>
      </div>

      <div className="bookmark-popover-body">
        <div className="bookmark-popover-tabs">
          <Segmented
            label="Bookmark category"
            value={draft.kind}
            options={BOOKMARK_KIND_OPTIONS}
            onChange={draft.handleKindChange}
          />
        </div>

        <BookmarkList
          bookmarks={activeBookmarks}
          totalWords={view.totalWords}
          emptyLabel={draft.kind === 'goal' ? 'No target set yet.' : 'No bookmarks yet.'}
          onSelect={actions.handleSelectBookmark}
          onDelete={onDeleteBookmark}
          deletingId={deletingId}
        />

        <div className="bookmark-popover-field">
          <label className="bookmark-popover-label" htmlFor="bookmark-label-input">
            Label
          </label>
          <input
            id="bookmark-label-input"
            className="bookmark-popover-input"
            value={draft.label}
            onChange={(e) => draft.handleLabelChange(e.target.value)}
            onKeyDown={actions.handleLabelKeyDown}
            placeholder={view.activeSnippet || 'Optional label'}
            autoFocus
          />
        </div>
        <div className="bookmark-popover-detail">
          {view.positionDetail}
        </div>

        {error && (
          <div className="bookmark-popover-error" role="alert">
            <span>{error}</span>
            {error === GOAL_FORWARD_ERROR && (
              <button
                className="bookmark-popover-inline-action"
                onClick={actions.handlePickAnotherWord}
              >
                Pick another word
              </button>
            )}
          </div>
        )}

        <BookmarkPopoverActionRow action={view.action} onAction={actions.handleAction} />
      </div>
    </>
  )
}
