import type React from 'react'
import { useCallback, useRef } from 'react'
import {
  deriveBookmarkPopoverView,
  type BookmarkPopoverView,
} from '../engine/bookmarkPopoverModel'
import type { TextRecord } from '../types'
import type { ReaderWordIndex } from './useWordIndex'
import type { BookmarkCollection, NewBookmarkDraft } from './useBookmarkCollection'
import { useBookmarkDraft, type BookmarkDraft, type GoalPickDraft } from './useBookmarkDraft'
import {
  useBookmarkPopoverActions,
  type BookmarkPopoverActions,
} from './useBookmarkPopoverActions'
import { useBookmarkSnippets } from './useBookmarkSnippets'
import { useGoalPickCollapse } from './useGoalPickCollapse'
import { useOutsideDismiss } from './useOutsideDismiss'

export interface BookmarkPopoverOptions {
  open: boolean
  onOpenChange: (open: boolean) => void
  text: TextRecord
  currentIndex: number
  wordIndex: ReaderWordIndex
  /** The Reader's bookmark list — the popover renders it, it does not own it. */
  collection: BookmarkCollection
  goalPickDraft: GoalPickDraft | null
  goalPickArmed: boolean
  plainTextContentRef?: React.MutableRefObject<HTMLPreElement | null>
  onArmGoalPick: (customLabel: string) => void
  onCancelGoalPick: () => void
  onSeek: (index: number) => void
}

export interface BookmarkPopoverController {
  error: string | null
  collection: BookmarkCollection
  draft: BookmarkDraft
  view: BookmarkPopoverView
  actions: BookmarkPopoverActions
  collapsed: boolean
  wrapRef: React.RefObject<HTMLDivElement>
  popoverRef: React.RefObject<HTMLDivElement>
}

/**
 * Composes the popover's four behaviour hooks with its derived view, so the
 * component is left with props in and markup out. Options are read off the
 * object rather than destructured — this is one wiring surface, not a component
 * with fifteen concerns.
 */
export function useBookmarkPopover(options: BookmarkPopoverOptions): BookmarkPopoverController {
  const pickedGoalWordOffset = options.goalPickDraft?.wordOffset ?? null
  const customLabel = options.goalPickDraft?.customLabel ?? ''
  const wrapRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const { collection, onOpenChange } = options
  const { error, setError, createBookmark: writeBookmark } = collection
  const handleClose = useCallback(() => onOpenChange(false), [onOpenChange])

  // A landed write closes the popover; a refused one leaves it open on its
  // error. The collection reports which happened, so the popover keeps its own
  // closing rule instead of handing one down to the list.
  const createBookmark = useCallback(
    async (draft: NewBookmarkDraft) => {
      if (await writeBookmark(draft)) handleClose()
    },
    [writeBookmark, handleClose]
  )

  const snippets = useBookmarkSnippets({
    wordIndex: options.wordIndex,
    currentIndex: options.currentIndex,
    pickedGoalWordOffset,
  })
  const draft = useBookmarkDraft({
    open: options.open,
    textId: options.text.id,
    stackIndex: options.wordIndex.stacks,
    goalPickArmed: options.goalPickArmed,
    pickedGoalWordOffset,
    customLabel,
    setError,
  })
  const view = deriveBookmarkPopoverView({
    kind: draft.kind,
    textId: options.text.id,
    stackIndex: options.wordIndex.stacks,
    wordCount: options.text.word_count,
    saving: collection.saving,
    goalPickArmed: options.goalPickArmed,
    pickedGoalWordOffset,
    currentWordOffset: snippets.currentWordOffset,
    currentSnippet: snippets.currentSnippet,
    pickedSnippet: snippets.pickedSnippet,
    hasGoalBookmark: collection.goalBookmark != null,
    error,
  })
  const actions = useBookmarkPopoverActions({
    draft,
    snippets,
    stackIndex: options.wordIndex.stacks,
    goalSaveDisabled: view.goalSaveDisabled,
    createBookmark,
    onSeek: options.onSeek,
    onClose: handleClose,
    onArmGoalPick: options.onArmGoalPick,
    onCancelGoalPick: options.onCancelGoalPick,
    setError,
  })
  const collapsed = useGoalPickCollapse({
    open: options.open,
    goalAwaitingPick: view.goalAwaitingPick,
    plainTextContentRef: options.plainTextContentRef,
    wrapRef,
    popoverRef,
  })
  // Escape is owned by Reader's cascade; an armed pick suppresses click-away.
  useOutsideDismiss({
    open: options.open,
    containerRef: wrapRef,
    suppressed: options.goalPickArmed,
    onDismiss: handleClose,
  })

  return { error, collection, draft, view, actions, collapsed, wrapRef, popoverRef }
}
