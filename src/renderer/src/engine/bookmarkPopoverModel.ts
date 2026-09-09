/**
 * Pure derivations behind the Reader's bookmark popover (ADR-0024).
 *
 * Everything here is a function of the popover's inputs — no React, no DOM.
 * The popover component composes these; the hooks in `hooks/useBookmark*`
 * own the state that feeds them.
 */

import type { BookmarkKind } from '../types'
import type { StackWordIndex } from './wordIndex'

export const GOAL_FORWARD_ERROR = 'Target must be ahead of your saved reading position.'

export const BOOKMARK_KIND_OPTIONS: ReadonlyArray<{ value: BookmarkKind; label: string }> = [
  { value: 'normal', label: 'Bookmark' },
  { value: 'goal', label: 'Target' },
]

/** The three pieces of draft state that always move together. */
export interface BookmarkDraftState {
  kind: BookmarkKind
  label: string
  labelEdited: boolean
}

/**
 * The draft a tab carries: a Target keeps the caller's custom label, a
 * Bookmark starts blank so the snippet shows through as a placeholder.
 */
export function bookmarkDraftState(kind: BookmarkKind, customLabel: string): BookmarkDraftState {
  return {
    kind,
    label: kind === 'goal' ? customLabel : '',
    labelEdited: customLabel.trim().length > 0,
  }
}

/** The tab the popover opens on: Target whenever a goal pick is in flight. */
export function initialBookmarkKind(
  goalPickArmed: boolean,
  pickedGoalWordOffset: number | null
): BookmarkKind {
  return goalPickArmed || pickedGoalWordOffset != null ? 'goal' : 'normal'
}

export function bookmarkTotalWords(
  wordCount: number | null | undefined,
  stackIndex: StackWordIndex
): number {
  // The stored count when the record carries one; otherwise the tokenization's
  // own total, already summed by the word index (`architecture-depth/08`).
  return wordCount ?? stackIndex.totalWords
}

export type BookmarkActionIntent = 'save-current' | 'arm-pick' | 'cancel-pick' | 'save-goal'

/** The single action button at the foot of the popover, fully resolved. */
export interface BookmarkPopoverAction {
  intent: BookmarkActionIntent
  label: string
  danger: boolean
  disabled: boolean
  /** Target actions render inside the `bookmark-popover-selected-action` wrapper. */
  inSelectedWrapper: boolean
}

export interface BookmarkPopoverViewInput {
  kind: BookmarkKind
  textId: number | null | undefined
  stackIndex: StackWordIndex
  wordCount: number | null | undefined
  saving: boolean
  goalPickArmed: boolean
  pickedGoalWordOffset: number | null
  currentWordOffset: number
  currentSnippet: string
  pickedSnippet: string
  hasGoalBookmark: boolean
  error: string | null
}

export interface BookmarkPopoverView {
  totalWords: number
  /** The toolbar toggle: nothing to bookmark without a text and built stacks. */
  toggleDisabled: boolean
  positionDisabled: boolean
  goalAwaitingPick: boolean
  goalSaveDisabled: boolean
  activeSnippet: string
  positionDetail: string
  action: BookmarkPopoverAction
}

interface BookmarkAvailability {
  toggleDisabled: boolean
  positionDisabled: boolean
  goalAwaitingPick: boolean
  goalSaveDisabled: boolean
}

function bookmarkAvailability(input: BookmarkPopoverViewInput): BookmarkAvailability {
  const toggleDisabled = input.textId == null || input.stackIndex.stackCount === 0
  const positionDisabled = toggleDisabled || input.saving
  return {
    toggleDisabled,
    positionDisabled,
    goalAwaitingPick:
      input.kind === 'goal' && input.goalPickArmed && input.pickedGoalWordOffset == null,
    goalSaveDisabled:
      positionDisabled ||
      input.pickedGoalWordOffset == null ||
      input.error === GOAL_FORWARD_ERROR,
  }
}

function activeBookmarkSnippet(input: BookmarkPopoverViewInput): string {
  return input.kind === 'goal' && input.pickedGoalWordOffset != null
    ? input.pickedSnippet
    : input.currentSnippet
}

function currentPositionLabel(currentWordOffset: number, totalWords: number): string {
  return totalWords > 0
    ? `${Math.round((currentWordOffset / totalWords) * 100)}%`
    : `word ${currentWordOffset.toLocaleString()}`
}

function bookmarkPositionDetail(
  kind: BookmarkKind,
  pickedGoalWordOffset: number | null,
  totalWords: number,
  currentLabel: string
): string {
  if (kind === 'normal') return `Current position: ${currentLabel}`
  if (pickedGoalWordOffset == null) {
    return `Target position: pick a word in text view; current position: ${currentLabel}`
  }
  const percent =
    totalWords <= 0 ? null : Math.round(((pickedGoalWordOffset + 1) / totalWords) * 100)
  return (
    `Target position: word ${(pickedGoalWordOffset + 1).toLocaleString()} of ` +
    `${totalWords.toLocaleString()} (${percent}%); current position: ${currentLabel}`
  )
}

function normalAction(saving: boolean, positionDisabled: boolean): BookmarkPopoverAction {
  return {
    intent: 'save-current',
    label: saving ? 'Saving...' : 'Set Bookmark',
    danger: false,
    disabled: positionDisabled,
    inSelectedWrapper: false,
  }
}

function goalAction(
  input: BookmarkPopoverViewInput,
  availability: BookmarkAvailability
): BookmarkPopoverAction {
  const base = { danger: false, disabled: false, inSelectedWrapper: true }
  if (availability.goalAwaitingPick) {
    return { ...base, intent: 'cancel-pick', label: input.saving ? 'Saving...' : 'Cancel', danger: true }
  }
  if (input.pickedGoalWordOffset == null) {
    return {
      ...base,
      intent: 'arm-pick',
      label: input.saving ? 'Saving...' : 'Set Target',
      disabled: availability.positionDisabled,
    }
  }
  const saveLabel = input.hasGoalBookmark ? 'Replace target' : 'Save target'
  return {
    ...base,
    intent: 'save-goal',
    label: input.saving ? 'Saving...' : saveLabel,
    disabled: availability.goalSaveDisabled,
  }
}

/** Everything the popover renders that is a plain function of its inputs. */
export function deriveBookmarkPopoverView(input: BookmarkPopoverViewInput): BookmarkPopoverView {
  const totalWords = bookmarkTotalWords(input.wordCount, input.stackIndex)
  const availability = bookmarkAvailability(input)
  return {
    ...availability,
    totalWords,
    activeSnippet: activeBookmarkSnippet(input),
    positionDetail: bookmarkPositionDetail(
      input.kind,
      input.pickedGoalWordOffset,
      totalWords,
      currentPositionLabel(input.currentWordOffset, totalWords)
    ),
    action:
      input.kind === 'normal'
        ? normalAction(input.saving, availability.positionDisabled)
        : goalAction(input, availability),
  }
}

/**
 * Goal-pick placement: the popover collapses to its Cancel strip when the full
 * popover would sit over the plain-text glyph box. The text element's padding
 * gutter does not count as covered words.
 */
export interface GoalPickGeometry {
  textRight: number
  textPaddingRight: number
  wrapRight: number
  popoverWidth: number
}

export function shouldCollapseGoalPickPopover(geometry: GoalPickGeometry): boolean {
  const glyphBoxRight = geometry.textRight - geometry.textPaddingRight
  const fullPopoverLeft = geometry.wrapRight - geometry.popoverWidth
  return fullPopoverLeft < glyphBoxRight
}
