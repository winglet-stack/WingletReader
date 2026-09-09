/**
 * Unit tests for the pure bookmark-popover derivations (issue 05). These pin the
 * branching that used to live inline in the 473-line `BookmarkPopover` body:
 * the draft seed, the disabled ladder, the position sentence, the single action
 * button, and the armed-pick collapse geometry.
 */

import { describe, it, expect } from 'vitest'
import {
  bookmarkDraftState,
  bookmarkTotalWords,
  deriveBookmarkPopoverView,
  GOAL_FORWARD_ERROR,
  initialBookmarkKind,
  shouldCollapseGoalPickPopover,
  type BookmarkPopoverViewInput,
} from '../bookmarkPopoverModel'
import type { WordStack } from '../../types'
import { buildStackWordIndex } from '../wordIndex'

const STACKS: WordStack[] = [
  { words: ['one', 'two'], type: 'normal' },
  { words: ['three', 'four'], type: 'normal' },
  { words: ['five', 'six'], type: 'normal' },
]

/** The word index over that tokenization — what consumers take now. */
const STACK_INDEX = buildStackWordIndex(STACKS)


function viewInput(patch: Partial<BookmarkPopoverViewInput> = {}): BookmarkPopoverViewInput {
  return {
    kind: 'normal',
    textId: 7,
    stackIndex: STACK_INDEX,
    wordCount: 12,
    saving: false,
    goalPickArmed: false,
    pickedGoalWordOffset: null,
    currentWordOffset: 0,
    currentSnippet: 'one two three four',
    pickedSnippet: '',
    hasGoalBookmark: false,
    error: null,
    ...patch,
  }
}

describe('bookmarkDraftState', () => {
  it('starts a Bookmark draft blank so the snippet shows as a placeholder', () => {
    expect(bookmarkDraftState('normal', 'Carried label')).toEqual({
      kind: 'normal',
      label: '',
      labelEdited: true,
    })
  })

  it('carries the custom label into a Target draft', () => {
    expect(bookmarkDraftState('goal', 'Session goal')).toEqual({
      kind: 'goal',
      label: 'Session goal',
      labelEdited: true,
    })
  })

  it('treats a blank custom label as unedited', () => {
    expect(bookmarkDraftState('goal', '   ')).toEqual({
      kind: 'goal',
      label: '   ',
      labelEdited: false,
    })
  })
})

describe('initialBookmarkKind', () => {
  it('opens on Target while a pick is armed', () => {
    expect(initialBookmarkKind(true, null)).toBe('goal')
  })

  it('opens on Target when a word is already picked', () => {
    expect(initialBookmarkKind(false, 6)).toBe('goal')
  })

  it('opens on Bookmark otherwise', () => {
    expect(initialBookmarkKind(false, null)).toBe('normal')
  })
})

describe('bookmarkTotalWords', () => {
  it('prefers the stored word count', () => {
    expect(bookmarkTotalWords(12, STACK_INDEX)).toBe(12)
  })

  it('falls back to the built stacks', () => {
    expect(bookmarkTotalWords(undefined, STACK_INDEX)).toBe(6)
  })

  it('is zero without stacks or a count', () => {
    expect(bookmarkTotalWords(null, buildStackWordIndex([]))).toBe(0)
  })
})

describe('deriveBookmarkPopoverView - availability', () => {
  it('enables the toggle for a saved text with built stacks', () => {
    const view = deriveBookmarkPopoverView(viewInput())
    expect(view.toggleDisabled).toBe(false)
    expect(view.positionDisabled).toBe(false)
  })

  it('disables everything without a text id', () => {
    const view = deriveBookmarkPopoverView(viewInput({ textId: undefined }))
    expect(view.toggleDisabled).toBe(true)
    expect(view.positionDisabled).toBe(true)
  })

  it('disables everything before stacks are built', () => {
    const view = deriveBookmarkPopoverView(viewInput({ stackIndex: buildStackWordIndex([]) }))
    expect(view.toggleDisabled).toBe(true)
  })

  it('disables the position action while saving, but not the toggle', () => {
    const view = deriveBookmarkPopoverView(viewInput({ saving: true }))
    expect(view.toggleDisabled).toBe(false)
    expect(view.positionDisabled).toBe(true)
  })

  it('awaits a pick only on the Target tab while armed with nothing picked', () => {
    expect(
      deriveBookmarkPopoverView(viewInput({ kind: 'goal', goalPickArmed: true })).goalAwaitingPick
    ).toBe(true)
    expect(
      deriveBookmarkPopoverView(viewInput({ kind: 'normal', goalPickArmed: true })).goalAwaitingPick
    ).toBe(false)
    expect(
      deriveBookmarkPopoverView(
        viewInput({ kind: 'goal', goalPickArmed: true, pickedGoalWordOffset: 6 })
      ).goalAwaitingPick
    ).toBe(false)
  })

  it('refuses a goal save while the forward-rule error stands', () => {
    const view = deriveBookmarkPopoverView(
      viewInput({ kind: 'goal', pickedGoalWordOffset: 2, error: GOAL_FORWARD_ERROR })
    )
    expect(view.goalSaveDisabled).toBe(true)
  })

  it('allows a goal save once a word ahead is picked', () => {
    const view = deriveBookmarkPopoverView(
      viewInput({ kind: 'goal', pickedGoalWordOffset: 6, error: null })
    )
    expect(view.goalSaveDisabled).toBe(false)
  })
})

describe('deriveBookmarkPopoverView - snippet and position detail', () => {
  it('suggests the current snippet on the Bookmark tab', () => {
    expect(deriveBookmarkPopoverView(viewInput()).activeSnippet).toBe('one two three four')
  })

  it('suggests the picked snippet once a Target word is chosen', () => {
    const view = deriveBookmarkPopoverView(
      viewInput({ kind: 'goal', pickedGoalWordOffset: 6, pickedSnippet: 'seven eight nine ten' })
    )
    expect(view.activeSnippet).toBe('seven eight nine ten')
  })

  it('falls back to the current snippet on the Target tab before a pick', () => {
    const view = deriveBookmarkPopoverView(viewInput({ kind: 'goal' }))
    expect(view.activeSnippet).toBe('one two three four')
  })

  it('reports the current position as a percentage', () => {
    const view = deriveBookmarkPopoverView(viewInput({ currentWordOffset: 4 }))
    expect(view.positionDetail).toBe('Current position: 33%')
  })

  it('reports a word index when the total is unknown', () => {
    const view = deriveBookmarkPopoverView(
      viewInput({ wordCount: null, stackIndex: buildStackWordIndex([]), currentWordOffset: 1200 })
    )
    expect(view.positionDetail).toBe(`Current position: word ${(1200).toLocaleString()}`)
  })

  it('asks for a pick on the Target tab before a word is chosen', () => {
    const view = deriveBookmarkPopoverView(viewInput({ kind: 'goal', currentWordOffset: 0 }))
    expect(view.positionDetail).toBe(
      'Target position: pick a word in text view; current position: 0%'
    )
  })

  it('spells out the picked Target word, total, and percentage', () => {
    const view = deriveBookmarkPopoverView(
      viewInput({ kind: 'goal', pickedGoalWordOffset: 6, currentWordOffset: 0 })
    )
    expect(view.positionDetail).toBe(
      'Target position: word 7 of 12 (58%); current position: 0%'
    )
  })
})

describe('deriveBookmarkPopoverView - action', () => {
  it('offers Set Bookmark on the Bookmark tab', () => {
    expect(deriveBookmarkPopoverView(viewInput()).action).toEqual({
      intent: 'save-current',
      label: 'Set Bookmark',
      danger: false,
      disabled: false,
      inSelectedWrapper: false,
    })
  })

  it('shows the saving label while a write is in flight', () => {
    expect(deriveBookmarkPopoverView(viewInput({ saving: true })).action.label).toBe('Saving...')
  })

  it('offers Set Target on the Target tab before a pick', () => {
    expect(deriveBookmarkPopoverView(viewInput({ kind: 'goal' })).action).toEqual({
      intent: 'arm-pick',
      label: 'Set Target',
      danger: false,
      disabled: false,
      inSelectedWrapper: true,
    })
  })

  it('turns into a red Cancel while a pick is armed', () => {
    const action = deriveBookmarkPopoverView(
      viewInput({ kind: 'goal', goalPickArmed: true })
    ).action
    expect(action).toEqual({
      intent: 'cancel-pick',
      label: 'Cancel',
      danger: true,
      disabled: false,
      inSelectedWrapper: true,
    })
  })

  it('saves a first Target and replaces an existing one', () => {
    const save = deriveBookmarkPopoverView(
      viewInput({ kind: 'goal', pickedGoalWordOffset: 6 })
    ).action
    expect(save.intent).toBe('save-goal')
    expect(save.label).toBe('Save target')

    const replace = deriveBookmarkPopoverView(
      viewInput({ kind: 'goal', pickedGoalWordOffset: 6, hasGoalBookmark: true })
    ).action
    expect(replace.label).toBe('Replace target')
  })

  it('disables the Target save while the forward-rule error stands', () => {
    const action = deriveBookmarkPopoverView(
      viewInput({ kind: 'goal', pickedGoalWordOffset: 2, error: GOAL_FORWARD_ERROR })
    ).action
    expect(action.disabled).toBe(true)
  })

  it('keeps Cancel live even while a write is in flight', () => {
    const action = deriveBookmarkPopoverView(
      viewInput({ kind: 'goal', goalPickArmed: true, saving: true })
    ).action
    expect(action.disabled).toBe(false)
    expect(action.label).toBe('Saving...')
  })
})

describe('shouldCollapseGoalPickPopover', () => {
  it('collapses when the full popover would cover glyphs', () => {
    expect(
      shouldCollapseGoalPickPopover({
        textRight: 620,
        textPaddingRight: 56,
        wrapRight: 808,
        popoverWidth: 300,
      })
    ).toBe(true)
  })

  it('stays expanded when only the padding gutter overlaps', () => {
    expect(
      shouldCollapseGoalPickPopover({
        textRight: 560,
        textPaddingRight: 80,
        wrapRight: 808,
        popoverWidth: 300,
      })
    ).toBe(false)
  })

  it('treats an exact edge touch as clear of the glyph box', () => {
    expect(
      shouldCollapseGoalPickPopover({
        textRight: 508,
        textPaddingRight: 0,
        wrapRight: 808,
        popoverWidth: 300,
      })
    ).toBe(false)
  })
})
