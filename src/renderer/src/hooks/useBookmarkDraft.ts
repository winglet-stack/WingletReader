import { useCallback, useEffect, useRef, useState } from 'react'
import { savedReadingPositionWordOffset } from '../engine/bookmarkDraft'
import {
  bookmarkDraftState,
  GOAL_FORWARD_ERROR,
  initialBookmarkKind,
  type BookmarkDraftState,
} from '../engine/bookmarkPopoverModel'
import type { BookmarkKind } from '../types'
import type { StackWordIndex } from '../engine/wordIndex'

export interface GoalPickDraft {
  wordOffset: number | null
  customLabel: string
}

export interface BookmarkDraft {
  kind: BookmarkKind
  label: string
  labelEdited: boolean
  /** The word a Target pick landed on, or `null` while none is held. */
  pickedGoalWordOffset: number | null
  handleKindChange: (kind: BookmarkKind) => void
  handleLabelChange: (label: string) => void
  validateGoalForwardRule: (candidateWordOffset: number) => Promise<boolean>
}

export interface BookmarkDraftOptions {
  open: boolean
  textId: number | null | undefined
  stackIndex: StackWordIndex
  goalPickArmed: boolean
  pickedGoalWordOffset: number | null
  /** The label the Reader carried through a Target pick. */
  customLabel: string
  setError: (error: string | null) => void
}

/**
 * What the popover is about to save: the Bookmark/Target tab, the label draft,
 * and the ADR-0024 §4 forward rule that refuses a Target at or behind the saved
 * reading position.
 */
export function useBookmarkDraft({
  open,
  textId,
  stackIndex,
  goalPickArmed,
  pickedGoalWordOffset,
  customLabel,
  setError,
}: BookmarkDraftOptions): BookmarkDraft {
  const [kind, setKind] = useState<BookmarkKind>('normal')
  const [label, setLabel] = useState('')
  const [labelEdited, setLabelEdited] = useState(false)
  const wasOpenRef = useRef(false)

  const applyDraft = useCallback(
    (state: BookmarkDraftState) => {
      setKind(state.kind)
      // Leave the label empty; the snippet shows as a greyed-out placeholder suggestion.
      setLabel(state.label)
      setLabelEdited(state.labelEdited)
      setError(null)
    },
    [setError]
  )

  const handleKindChange = useCallback(
    (nextKind: BookmarkKind) => {
      applyDraft(bookmarkDraftState(nextKind, customLabel))
    },
    [applyDraft, customLabel]
  )

  const handleLabelChange = useCallback((nextLabel: string) => {
    setLabel(nextLabel)
    setLabelEdited(true)
  }, [])

  const validateGoalForwardRule = useCallback(
    async (candidateWordOffset: number) => {
      if (kind !== 'goal' || textId == null) return true

      const savedPosition =
        typeof window.api.db.getReadingPosition === 'function'
          ? await window.api.db.getReadingPosition(textId)
          : null
      const savedWordOffset = savedReadingPositionWordOffset(stackIndex, savedPosition?.stackIndex)
      if (candidateWordOffset <= savedWordOffset) {
        setError(GOAL_FORWARD_ERROR)
        return false
      }
      return true
    },
    [kind, setError, stackIndex, textId]
  )

  // Opening seeds the tab from the goal-pick state; reopening on a picked word
  // restores the Target draft without disturbing an already-open popover.
  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false
      return
    }

    const openedNow = !wasOpenRef.current
    wasOpenRef.current = true

    if (openedNow) {
      applyDraft(
        bookmarkDraftState(initialBookmarkKind(goalPickArmed, pickedGoalWordOffset), customLabel)
      )
      return
    }

    if (pickedGoalWordOffset != null) {
      applyDraft(bookmarkDraftState('goal', customLabel))
    }
  }, [applyDraft, customLabel, goalPickArmed, open, pickedGoalWordOffset])

  useEffect(() => {
    if (!open || kind !== 'goal' || pickedGoalWordOffset == null) return

    let active = true
    setError(null)
    validateGoalForwardRule(pickedGoalWordOffset)
      .then((valid) => {
        if (active && valid) setError(null)
      })
      .catch(() => {
        if (active) setError('Could not validate goal position.')
      })
    return () => {
      active = false
    }
  }, [kind, open, pickedGoalWordOffset, setError, validateGoalForwardRule])

  return {
    kind,
    label,
    labelEdited,
    pickedGoalWordOffset,
    handleKindChange,
    handleLabelChange,
    validateGoalForwardRule,
  }
}
