import React from 'react'
import targetDarkSrc from '../../assets/reader-buttons/target-dark.png'
import targetLightSrc from '../../assets/reader-buttons/target-light.png'
import type { BookmarkActionIntent, BookmarkPopoverAction } from '../../engine/bookmarkPopoverModel'
import ReaderButtonIcon from './ReaderButtonIcon'

/** The Reader toolbar control that opens the popover. */
export function BookmarkPopoverToggle({
  open,
  hasBookmarks,
  disabled,
  onToggle,
}: {
  open: boolean
  hasBookmarks: boolean
  disabled: boolean
  onToggle: () => void
}) {
  return (
    <button
      className={[
        'reader-utility-btn',
        'reader-utility-btn--bookmark',
        open ? 'reader-utility-btn--open' : '',
        hasBookmarks ? 'reader-utility-btn--bookmark-has-items' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onToggle}
      title={hasBookmarks ? 'Bookmarks saved for this text' : 'Add bookmark'}
      aria-label={hasBookmarks ? 'Open bookmarks, saved bookmarks exist' : 'Open bookmarks'}
      aria-expanded={open}
      disabled={disabled}
    >
      <ReaderButtonIcon darkSrc={targetDarkSrc} lightSrc={targetLightSrc} alt="Bookmarks" />
    </button>
  )
}

/** All the popover shows while a Target pick is armed over the glyph box. */
export function GoalPickCancelStrip({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="bookmark-popover-collapsed-strip">
      <button
        className="bookmark-popover-set-btn bookmark-popover-set-btn--danger"
        onClick={onCancel}
      >
        Cancel
      </button>
    </div>
  )
}

/** The popover's single action button, resolved by `deriveBookmarkPopoverView`. */
export function BookmarkPopoverActionRow({
  action,
  onAction,
}: {
  action: BookmarkPopoverAction
  onAction: (intent: BookmarkActionIntent) => void
}) {
  const button = (
    <button
      className={['bookmark-popover-set-btn', action.danger ? 'bookmark-popover-set-btn--danger' : '']
        .filter(Boolean)
        .join(' ')}
      onClick={() => onAction(action.intent)}
      disabled={action.disabled}
    >
      {action.label}
    </button>
  )

  return (
    <div className="bookmark-popover-actions">
      {action.inSelectedWrapper ? (
        <span className="bookmark-popover-selected-action">{button}</span>
      ) : (
        button
      )}
    </div>
  )
}
