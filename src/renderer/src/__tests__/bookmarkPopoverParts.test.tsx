/**
 * Unit tests for the popover's presentation children (issue 05):
 * `BookmarkPopoverPanel` and the three parts in `BookmarkPopoverParts`. These
 * render the same DOM the 473-line `BookmarkPopover` used to render inline —
 * the class names asserted here are the ones `index.css` styles.
 *
 * Environment: happy-dom (vitest.config.ts environmentMatchGlobs).
 */

import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import BookmarkPopoverPanel from '../components/reader/BookmarkPopoverPanel'
import {
  BookmarkPopoverActionRow,
  BookmarkPopoverToggle,
  GoalPickCancelStrip,
} from '../components/reader/BookmarkPopoverParts'
import {
  deriveBookmarkPopoverView,
  GOAL_FORWARD_ERROR,
  type BookmarkPopoverView,
  type BookmarkPopoverViewInput,
} from '../engine/bookmarkPopoverModel'
import type { BookmarkPopoverActions } from '../hooks/useBookmarkPopoverActions'
import type { BookmarkDraft } from '../hooks/useBookmarkDraft'
import type { Bookmark, WordStack } from '../types'
import { buildStackWordIndex } from '../engine/wordIndex'

afterEach(cleanup)

const STACKS: WordStack[] = [
  { words: ['one', 'two'], type: 'normal' },
  { words: ['three', 'four'], type: 'normal' },
]

/** The word index over that tokenization — what consumers take now. */
const STACK_INDEX = buildStackWordIndex(STACKS)


const BOOKMARKS: Bookmark[] = [
  {
    id: 1,
    textId: 7,
    kind: 'normal',
    wordOffset: 2,
    label: 'Early turn',
    createdAt: '2026-08-11T00:00:00.000Z',
  },
  {
    id: 2,
    textId: 7,
    kind: 'goal',
    wordOffset: 8,
    label: 'Session goal',
    createdAt: '2026-08-11T00:00:00.000Z',
  },
]

function draftStub(patch: Partial<BookmarkDraft> = {}): BookmarkDraft {
  return {
    kind: 'normal',
    label: '',
    labelEdited: false,
    pickedGoalWordOffset: null,
    handleKindChange: vi.fn(),
    handleLabelChange: vi.fn(),
    validateGoalForwardRule: vi.fn().mockResolvedValue(true),
    ...patch,
  }
}

function actionsStub(patch: Partial<BookmarkPopoverActions> = {}): BookmarkPopoverActions {
  return {
    handleSelectBookmark: vi.fn(),
    handleLabelKeyDown: vi.fn(),
    handleAction: vi.fn(),
    handlePickAnotherWord: vi.fn(),
    ...patch,
  }
}

function viewFor(patch: Partial<BookmarkPopoverViewInput> = {}): BookmarkPopoverView {
  return deriveBookmarkPopoverView({
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
  })
}

function renderPanel(
  overrides: {
    bookmarks?: Bookmark[]
    error?: string | null
    draft?: BookmarkDraft
    view?: BookmarkPopoverView
    actions?: BookmarkPopoverActions
    onDeleteBookmark?: (bookmark: Bookmark) => void
  } = {}
) {
  const props = {
    bookmarks: overrides.bookmarks ?? BOOKMARKS,
    deletingId: null,
    error: overrides.error ?? null,
    draft: overrides.draft ?? draftStub(),
    view: overrides.view ?? viewFor(),
    actions: overrides.actions ?? actionsStub(),
    onDeleteBookmark: overrides.onDeleteBookmark ?? vi.fn(),
  }
  render(<BookmarkPopoverPanel {...props} />)
  return props
}

describe('BookmarkPopoverPanel', () => {
  it('counts every saved bookmark in the header, not just the active tab', () => {
    renderPanel()
    expect(screen.getByText('2 saved')).toBeTruthy()
  })

  it('says so when nothing is saved', () => {
    renderPanel({ bookmarks: [] })
    expect(screen.getByText('None saved')).toBeTruthy()
  })

  it('lists only the active tab and offers the Bookmark empty state', () => {
    renderPanel({ bookmarks: [BOOKMARKS[1]] })

    expect(screen.queryByRole('button', { name: /Read from bookmark: Session goal/ })).toBeNull()
    expect(screen.getByText('No bookmarks yet.')).toBeTruthy()
  })

  it('lists the Target tab with its own empty state', () => {
    renderPanel({ draft: draftStub({ kind: 'goal' }), bookmarks: [BOOKMARKS[0]] })

    expect(screen.queryByRole('button', { name: /Read from bookmark: Early turn/ })).toBeNull()
    expect(screen.getByText('No target set yet.')).toBeTruthy()
  })

  it('routes a row click to the select handler', () => {
    const actions = actionsStub()
    renderPanel({ actions })

    fireEvent.click(screen.getByRole('button', { name: 'Read from bookmark: Early turn' }))
    expect(actions.handleSelectBookmark).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 })
    )
  })

  it('routes a row delete to the delete handler', () => {
    const onDeleteBookmark = vi.fn()
    renderPanel({ onDeleteBookmark })

    fireEvent.click(screen.getByRole('button', { name: 'Delete bookmark: Early turn' }))
    expect(onDeleteBookmark).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
  })

  it('suggests the active snippet as the label placeholder', () => {
    renderPanel()
    const input = screen.getByLabelText('Label') as HTMLInputElement
    expect(input.getAttribute('placeholder')).toBe('one two three four')
  })

  it('falls back to a generic placeholder without a snippet', () => {
    renderPanel({ view: viewFor({ currentSnippet: '' }) })
    const input = screen.getByLabelText('Label') as HTMLInputElement
    expect(input.getAttribute('placeholder')).toBe('Optional label')
  })

  it('reports typing and key presses to the draft and action handlers', () => {
    const draft = draftStub()
    const actions = actionsStub()
    renderPanel({ draft, actions })

    const input = screen.getByLabelText('Label')
    fireEvent.change(input, { target: { value: 'Chapter turn' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(draft.handleLabelChange).toHaveBeenCalledWith('Chapter turn')
    expect(actions.handleLabelKeyDown).toHaveBeenCalled()
  })

  it('renders the position detail sentence', () => {
    renderPanel()
    expect(screen.getByText('Current position: 0%')).toBeTruthy()
  })

  it('shows an error as an alert with no recovery action', () => {
    renderPanel({ error: 'Could not save bookmark.' })

    expect(screen.getByRole('alert').textContent).toContain('Could not save bookmark.')
    expect(screen.queryByRole('button', { name: 'Pick another word' })).toBeNull()
  })

  it('offers Pick another word only for the forward-rule refusal', () => {
    const actions = actionsStub()
    renderPanel({
      error: GOAL_FORWARD_ERROR,
      draft: draftStub({ kind: 'goal', pickedGoalWordOffset: 2 }),
      view: viewFor({ kind: 'goal', pickedGoalWordOffset: 2, error: GOAL_FORWARD_ERROR }),
      actions,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Pick another word' }))
    expect(actions.handlePickAnotherWord).toHaveBeenCalledTimes(1)
  })

  it('renders the tab selector and reports a tab change', () => {
    const draft = draftStub()
    renderPanel({ draft })

    expect(screen.getByRole('group', { name: 'Bookmark category' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Target' }))
    expect(draft.handleKindChange).toHaveBeenCalledWith('goal')
  })
})

describe('BookmarkPopoverActionRow', () => {
  it('renders the Bookmark action bare inside the actions row', () => {
    const onAction = vi.fn()
    render(<BookmarkPopoverActionRow action={viewFor().action} onAction={onAction} />)

    const button = screen.getByRole('button', { name: 'Set Bookmark' })
    expect(button.className).toBe('bookmark-popover-set-btn')
    expect(document.querySelector('.bookmark-popover-selected-action')).toBeNull()

    fireEvent.click(button)
    expect(onAction).toHaveBeenCalledWith('save-current')
  })

  it('wraps a Target action and marks an armed pick as destructive', () => {
    const onAction = vi.fn()
    render(
      <BookmarkPopoverActionRow
        action={viewFor({ kind: 'goal', goalPickArmed: true }).action}
        onAction={onAction}
      />
    )

    const button = screen.getByRole('button', { name: 'Cancel' })
    expect(button.className).toContain('bookmark-popover-set-btn--danger')
    expect(document.querySelector('.bookmark-popover-selected-action')).toBeTruthy()

    fireEvent.click(button)
    expect(onAction).toHaveBeenCalledWith('cancel-pick')
  })

  it('honours the resolved disabled state', () => {
    render(
      <BookmarkPopoverActionRow
        action={viewFor({ stackIndex: buildStackWordIndex([]) }).action}
        onAction={vi.fn()}
      />
    )

    expect((screen.getByRole('button', { name: 'Set Bookmark' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('BookmarkPopoverToggle', () => {
  it('reads as an empty bookmark control by default', () => {
    render(
      <BookmarkPopoverToggle open={false} hasBookmarks={false} disabled={false} onToggle={vi.fn()} />
    )

    const button = screen.getByRole('button', { name: 'Open bookmarks' })
    expect(button.getAttribute('title')).toBe('Add bookmark')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(button.className).not.toContain('reader-utility-btn--open')
    expect(button.className).not.toContain('reader-utility-btn--bookmark-has-items')
  })

  it('marks saved bookmarks and the open state', () => {
    render(
      <BookmarkPopoverToggle open hasBookmarks disabled={false} onToggle={vi.fn()} />
    )

    const button = screen.getByRole('button', { name: 'Open bookmarks, saved bookmarks exist' })
    expect(button.getAttribute('title')).toBe('Bookmarks saved for this text')
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(button.className).toContain('reader-utility-btn--open')
    expect(button.className).toContain('reader-utility-btn--bookmark-has-items')
  })

  it('toggles and can be disabled', () => {
    const onToggle = vi.fn()
    const { rerender } = render(
      <BookmarkPopoverToggle open={false} hasBookmarks={false} disabled={false} onToggle={onToggle} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open bookmarks' }))
    expect(onToggle).toHaveBeenCalledTimes(1)

    rerender(
      <BookmarkPopoverToggle open={false} hasBookmarks={false} disabled onToggle={onToggle} />
    )
    expect((screen.getByRole('button', { name: 'Open bookmarks' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('GoalPickCancelStrip', () => {
  it('is a single red Cancel button', () => {
    const onCancel = vi.fn()
    render(<GoalPickCancelStrip onCancel={onCancel} />)

    const button = screen.getByRole('button', { name: 'Cancel' })
    expect(button.className).toContain('bookmark-popover-set-btn--danger')
    expect(document.querySelector('.bookmark-popover-collapsed-strip')).toBeTruthy()

    fireEvent.click(button)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
