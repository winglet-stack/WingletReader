import React from 'react'
import type { BookmarkPopoverController } from '../../hooks/useBookmarkPopover'
import BookmarkPopoverPanel from './BookmarkPopoverPanel'
import { BookmarkPopoverToggle, GoalPickCancelStrip } from './BookmarkPopoverParts'

interface Props {
  open: boolean
  controller: BookmarkPopoverController
  onCancelGoalPick: () => void
  onToggle: () => void
}

/** The popover's markup: the toolbar toggle, and the dialog while it is open. */
export default function BookmarkPopoverSurface({
  open,
  controller,
  onCancelGoalPick,
  onToggle,
}: Props) {
  const { collection, draft, view, actions, collapsed } = controller
  const popoverClassName = ['bookmark-popover', collapsed ? 'bookmark-popover--collapsed' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <div className="bookmark-popover-wrap" ref={controller.wrapRef}>
      {open && (
        <div
          className={popoverClassName}
          ref={controller.popoverRef}
          role="dialog"
          aria-label="Bookmarks"
        >
          {collapsed ? (
            <GoalPickCancelStrip onCancel={onCancelGoalPick} />
          ) : (
            <BookmarkPopoverPanel
              bookmarks={collection.bookmarks}
              deletingId={collection.deletingId}
              error={controller.error}
              draft={draft}
              view={view}
              actions={actions}
              onDeleteBookmark={collection.deleteBookmark}
            />
          )}
        </div>
      )}

      <BookmarkPopoverToggle
        open={open}
        hasBookmarks={collection.hasBookmarks}
        disabled={view.toggleDisabled}
        onToggle={onToggle}
      />
    </div>
  )
}
