import type React from 'react'
import { useCallback } from 'react'
import { bookmarkLabelForDraft } from '../engine/bookmarkDraft'
import type { BookmarkActionIntent } from '../engine/bookmarkPopoverModel'
import type { Bookmark } from '../types'
import type { StackWordIndex } from '../engine/wordIndex'
import type { BookmarkDraft } from './useBookmarkDraft'
import type { BookmarkSnippets } from './useBookmarkSnippets'
import type { NewBookmarkDraft } from './useBookmarkCollection'

export interface BookmarkPopoverActions {
  handleSelectBookmark: (bookmark: Bookmark) => void
  handleLabelKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void
  handleAction: (intent: BookmarkActionIntent) => void
  handlePickAnotherWord: () => void
}

export interface BookmarkPopoverActionsOptions {
  draft: BookmarkDraft
  snippets: BookmarkSnippets
  stackIndex: StackWordIndex
  goalSaveDisabled: boolean
  createBookmark: (draft: NewBookmarkDraft) => Promise<void>
  onSeek: (index: number) => void
  onClose: () => void
  onArmGoalPick: (customLabel: string) => void
  onCancelGoalPick: () => void
  setError: (error: string | null) => void
}

/**
 * The popover's interaction handlers: the glue between the draft, the stored
 * collection, and the Reader callbacks. Presentation reads these; it decides
 * nothing itself.
 */
export function useBookmarkPopoverActions({
  draft,
  snippets,
  stackIndex,
  goalSaveDisabled,
  createBookmark,
  onSeek,
  onClose,
  onArmGoalPick,
  onCancelGoalPick,
  setError,
}: BookmarkPopoverActionsOptions): BookmarkPopoverActions {
  const { kind, label, labelEdited, pickedGoalWordOffset, validateGoalForwardRule } = draft
  const { currentWordOffset, currentSnippet, pickedSnippet } = snippets
  const stackCount = stackIndex.stackCount

  const saveBookmark = useCallback(
    async (wordOffset: number, snippet: string) => {
      if (stackCount === 0) return

      await createBookmark({
        kind,
        wordOffset,
        label: bookmarkLabelForDraft(label, snippet, wordOffset),
        validate: () => validateGoalForwardRule(wordOffset),
      })
    },
    [createBookmark, kind, label, stackCount, validateGoalForwardRule]
  )

  const armGoalPick = useCallback(() => {
    onArmGoalPick(labelEdited ? label : '')
  }, [label, labelEdited, onArmGoalPick])

  const handleSelectBookmark = useCallback(
    (bookmark: Bookmark) => {
      onSeek(stackIndex.stackAtOffset(bookmark.wordOffset))
      onClose()
    },
    [onSeek, onClose, stackIndex]
  )

  const handleLabelKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter') return
      if (kind === 'goal') {
        if (pickedGoalWordOffset == null || goalSaveDisabled) return
        void saveBookmark(pickedGoalWordOffset, pickedSnippet)
        return
      }
      void saveBookmark(currentWordOffset, currentSnippet)
    },
    [
      currentSnippet,
      currentWordOffset,
      goalSaveDisabled,
      kind,
      pickedGoalWordOffset,
      pickedSnippet,
      saveBookmark,
    ]
  )

  const handleAction = useCallback(
    (intent: BookmarkActionIntent) => {
      if (intent === 'save-current') {
        void saveBookmark(currentWordOffset, currentSnippet)
        return
      }
      if (intent === 'cancel-pick') {
        onCancelGoalPick()
        return
      }
      if (intent === 'arm-pick') {
        setError(null)
        armGoalPick()
        return
      }
      if (pickedGoalWordOffset != null) {
        void saveBookmark(pickedGoalWordOffset, pickedSnippet)
      }
    },
    [
      armGoalPick,
      currentSnippet,
      currentWordOffset,
      onCancelGoalPick,
      pickedGoalWordOffset,
      pickedSnippet,
      saveBookmark,
      setError,
    ]
  )

  return {
    handleSelectBookmark,
    handleLabelKeyDown,
    handleAction,
    // The inline recovery from the forward-rule error re-arms without clearing
    // the error; it clears when the next pick is validated.
    handlePickAnotherWord: armGoalPick,
  }
}
