/**
 * Unit tests for `useBookmarkPopoverActions` (issue 05) — the popover's
 * interaction handlers, extracted from the inline JSX callbacks in
 * `BookmarkPopover`. Presentation dispatches an intent; every decision lives
 * here.
 *
 * Environment: happy-dom (vitest.config.ts environmentMatchGlobs).
 */

import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import {
  useBookmarkPopoverActions,
  type BookmarkPopoverActionsOptions,
} from '../hooks/useBookmarkPopoverActions'
import type { BookmarkDraft } from '../hooks/useBookmarkDraft'
import type { BookmarkSnippets } from '../hooks/useBookmarkSnippets'
import type { Bookmark, WordStack } from '../types'
import { buildStackWordIndex } from '../engine/wordIndex'

afterEach(cleanup)

const STACKS: WordStack[] = [
  { words: ['one', 'two'], type: 'normal' },
  { words: ['three', 'four'], type: 'normal' },
  { words: ['five', 'six'], type: 'normal' },
  { words: ['seven', 'eight'], type: 'normal' },
]

/** The word index over that tokenization — what consumers take now. */
const STACK_INDEX = buildStackWordIndex(STACKS)


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

function snippetsStub(patch: Partial<BookmarkSnippets> = {}): BookmarkSnippets {
  return {
    currentWordOffset: 2,
    currentSnippet: 'three four five six',
    pickedSnippet: '',
    ...patch,
  }
}

type Options = BookmarkPopoverActionsOptions

function optionsStub(patch: Partial<Options> = {}): Options {
  return {
    draft: draftStub(),
    snippets: snippetsStub(),
    stackIndex: STACK_INDEX,
    goalSaveDisabled: false,
    createBookmark: vi.fn().mockResolvedValue(undefined),
    onSeek: vi.fn(),
    onClose: vi.fn(),
    onArmGoalPick: vi.fn(),
    onCancelGoalPick: vi.fn(),
    setError: vi.fn(),
    ...patch,
  }
}

const SELECTED: Bookmark = {
  id: 3,
  textId: 7,
  kind: 'normal',
  wordOffset: 6,
  label: 'Later turn',
  createdAt: '2026-08-11T00:00:00.000Z',
}

function Harness({ options }: { options: Options }) {
  const actions = useBookmarkPopoverActions(options)
  return (
    <div>
      <input aria-label="Label" onKeyDown={actions.handleLabelKeyDown} />
      <button onClick={() => actions.handleSelectBookmark(SELECTED)}>select</button>
      <button onClick={() => actions.handleAction('save-current')}>save current</button>
      <button onClick={() => actions.handleAction('cancel-pick')}>cancel pick</button>
      <button onClick={() => actions.handleAction('arm-pick')}>arm pick</button>
      <button onClick={() => actions.handleAction('save-goal')}>save goal</button>
      <button onClick={actions.handlePickAnotherWord}>pick another</button>
    </div>
  )
}

const click = async (name: string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
  })
}

describe('useBookmarkPopoverActions - selecting', () => {
  it('seeks the stack holding the bookmark and closes the popover', async () => {
    const options = optionsStub()
    render(<Harness options={options} />)

    await click('select')

    expect(options.onSeek).toHaveBeenCalledWith(3)
    expect(options.onClose).toHaveBeenCalledTimes(1)
  })
})

describe('useBookmarkPopoverActions - saving', () => {
  it('writes a Bookmark at the current position', async () => {
    const options = optionsStub()
    render(<Harness options={options} />)

    await click('save current')

    expect(options.createBookmark).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'normal', wordOffset: 2, label: 'three four five six' })
    )
  })

  it('prefers the typed label over the snippet', async () => {
    const options = optionsStub({ draft: draftStub({ label: '  Chapter turn  ' }) })
    render(<Harness options={options} />)

    await click('save current')

    expect(options.createBookmark).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Chapter turn' })
    )
  })

  it('carries the forward rule into the write', async () => {
    const validateGoalForwardRule = vi.fn().mockResolvedValue(true)
    const options = optionsStub({
      draft: draftStub({ kind: 'goal', pickedGoalWordOffset: 6, validateGoalForwardRule }),
      snippets: snippetsStub({ pickedSnippet: 'seven eight' }),
    })
    render(<Harness options={options} />)

    await click('save goal')

    const draft = (options.createBookmark as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(draft).toMatchObject({ kind: 'goal', wordOffset: 6, label: 'seven eight' })
    await draft.validate()
    expect(validateGoalForwardRule).toHaveBeenCalledWith(6)
  })

  it('writes nothing before stacks are built', async () => {
    const options = optionsStub({ stackIndex: buildStackWordIndex([]) })
    render(<Harness options={options} />)

    await click('save current')

    expect(options.createBookmark).not.toHaveBeenCalled()
  })

  it('ignores a Target save with no picked word', async () => {
    const options = optionsStub({ draft: draftStub({ kind: 'goal' }) })
    render(<Harness options={options} />)

    await click('save goal')

    expect(options.createBookmark).not.toHaveBeenCalled()
  })
})

describe('useBookmarkPopoverActions - goal pick', () => {
  it('clears the error and arms a pick with no label when none was typed', async () => {
    const options = optionsStub({ draft: draftStub({ kind: 'goal', label: 'Suggested' }) })
    render(<Harness options={options} />)

    await click('arm pick')

    expect(options.setError).toHaveBeenCalledWith(null)
    expect(options.onArmGoalPick).toHaveBeenCalledWith('')
  })

  it('carries a typed label into the pick', async () => {
    const options = optionsStub({
      draft: draftStub({ kind: 'goal', label: 'Session goal', labelEdited: true }),
    })
    render(<Harness options={options} />)

    await click('arm pick')

    expect(options.onArmGoalPick).toHaveBeenCalledWith('Session goal')
  })

  it('cancels an armed pick', async () => {
    const options = optionsStub({ draft: draftStub({ kind: 'goal' }) })
    render(<Harness options={options} />)

    await click('cancel pick')

    expect(options.onCancelGoalPick).toHaveBeenCalledTimes(1)
  })

  it('re-arms from the forward-rule error without clearing it', async () => {
    const options = optionsStub({
      draft: draftStub({ kind: 'goal', label: 'Session goal', labelEdited: true, pickedGoalWordOffset: 2 }),
    })
    render(<Harness options={options} />)

    await click('pick another')

    expect(options.onArmGoalPick).toHaveBeenCalledWith('Session goal')
    expect(options.setError).not.toHaveBeenCalled()
  })
})

describe('useBookmarkPopoverActions - label field keys', () => {
  const pressEnter = async () => {
    await act(async () => {
      fireEvent.keyDown(screen.getByLabelText('Label'), { key: 'Enter' })
    })
  }

  it('saves the current position on Enter', async () => {
    const options = optionsStub()
    render(<Harness options={options} />)

    await pressEnter()

    expect(options.createBookmark).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'normal', wordOffset: 2 })
    )
  })

  it('ignores other keys', async () => {
    const options = optionsStub()
    render(<Harness options={options} />)

    await act(async () => {
      fireEvent.keyDown(screen.getByLabelText('Label'), { key: 'a' })
    })

    expect(options.createBookmark).not.toHaveBeenCalled()
  })

  it('saves a picked Target on Enter', async () => {
    const options = optionsStub({
      draft: draftStub({ kind: 'goal', pickedGoalWordOffset: 6 }),
      snippets: snippetsStub({ pickedSnippet: 'seven eight' }),
    })
    render(<Harness options={options} />)

    await pressEnter()

    expect(options.createBookmark).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'goal', wordOffset: 6 })
    )
  })

  it('refuses Enter while the Target save is disabled', async () => {
    const options = optionsStub({
      goalSaveDisabled: true,
      draft: draftStub({ kind: 'goal', pickedGoalWordOffset: 6 }),
    })
    render(<Harness options={options} />)

    await pressEnter()

    expect(options.createBookmark).not.toHaveBeenCalled()
  })

  it('refuses Enter on the Target tab before a word is picked', async () => {
    const options = optionsStub({ draft: draftStub({ kind: 'goal' }) })
    render(<Harness options={options} />)

    await pressEnter()

    expect(options.createBookmark).not.toHaveBeenCalled()
  })
})
