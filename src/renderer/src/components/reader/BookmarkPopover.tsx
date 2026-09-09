import React from 'react'
import { useBookmarkPopover } from '../../hooks/useBookmarkPopover'
import type { TextRecord } from '../../types'
import type { BookmarkCollection } from '../../hooks/useBookmarkCollection'
import type { ReaderWordIndex } from '../../hooks/useWordIndex'
import BookmarkPopoverSurface from './BookmarkPopoverSurface'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  text: TextRecord
  currentIndex: number
  wordIndex: ReaderWordIndex
  /** The Reader's bookmark list. The popover renders and mutates it, but the
   *  Reader owns it — nothing about it is pushed back up. */
  collection: BookmarkCollection
  goalPickDraft?: {
    wordOffset: number | null
    customLabel: string
  } | null
  goalPickArmed?: boolean
  plainTextContentRef?: React.MutableRefObject<HTMLPreElement | null>
  onArmGoalPick?: (customLabel: string) => void
  onCancelGoalPick?: () => void
  onSeek: (index: number) => void
  /** When false, only the settings gear shows in the footer (in-frame Library browse). */
  hidden?: boolean
}

/**
 * The Reader's bookmark surface. Behaviour lives in `useBookmarkPopover` and the
 * hooks it composes; markup lives in `BookmarkPopoverSurface`. This component
 * owns the public props and nothing else.
 */
export default function BookmarkPopover({
  open,
  onOpenChange,
  text,
  currentIndex,
  wordIndex,
  collection,
  goalPickDraft = null,
  goalPickArmed = false,
  plainTextContentRef,
  onArmGoalPick = () => {},
  onCancelGoalPick = () => {},
  onSeek,
  hidden = false,
}: Props) {
  const controller = useBookmarkPopover({
    open,
    onOpenChange,
    text,
    currentIndex,
    wordIndex,
    collection,
    goalPickDraft,
    goalPickArmed,
    plainTextContentRef,
    onArmGoalPick,
    onCancelGoalPick,
    onSeek,
  })

  if (hidden) return null

  return (
    <BookmarkPopoverSurface
      open={open}
      controller={controller}
      onCancelGoalPick={onCancelGoalPick}
      onToggle={() => onOpenChange(!open)}
    />
  )
}
