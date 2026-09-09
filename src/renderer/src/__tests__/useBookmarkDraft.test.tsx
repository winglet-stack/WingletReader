/**
 * Unit tests for `useBookmarkDraft` (issue 05) — what the popover is about to
 * save. Extracted from `BookmarkPopover`: the tab seed on open, the reopen on a
 * picked word, the label rules, and the ADR-0024 §4 forward rule for Targets.
 *
 * Environment: happy-dom (vitest.config.ts environmentMatchGlobs).
 */

import React, { useState } from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { useBookmarkDraft } from '../hooks/useBookmarkDraft'
import type { WordStack } from '../types'
import { buildStackWordIndex } from '../engine/wordIndex'

afterEach(cleanup)

const STACKS: WordStack[] = [
  { words: ['one', 'two'], type: 'normal' },
  { words: ['three', 'four'], type: 'normal' },
  { words: ['five', 'six'], type: 'normal' },
  { words: ['seven', 'eight'], type: 'normal' },
  { words: ['nine', 'ten'], type: 'normal' },
  { words: ['eleven', 'twelve'], type: 'normal' },
]

/** The word index over that tokenization — what consumers take now. */
const STACK_INDEX = buildStackWordIndex(STACKS)


function stubApi(savedPosition: { stackIndex: number } | null = null) {
  const api = {
    db: { getReadingPosition: vi.fn().mockResolvedValue(savedPosition) },
  }
  vi.stubGlobal('api', api)
  return api
}

interface HarnessProps {
  open?: boolean
  goalPickArmed?: boolean
  pickedGoalWordOffset?: number | null
  customLabel?: string
  validateCandidate?: number
}

function Harness({
  open = true,
  goalPickArmed = false,
  pickedGoalWordOffset = null,
  customLabel = '',
  validateCandidate = 6,
}: HarnessProps) {
  const [error, setError] = useState<string | null>(null)
  const [verdict, setVerdict] = useState<string>('unrun')
  const draft = useBookmarkDraft({
    open,
    textId: 7,
    stackIndex: STACK_INDEX,
    goalPickArmed,
    pickedGoalWordOffset,
    customLabel,
    setError,
  })

  return (
    <div>
      <span data-testid="kind">{draft.kind}</span>
      <span data-testid="label">{draft.label}</span>
      <span data-testid="labelEdited">{String(draft.labelEdited)}</span>
      <span data-testid="picked">{String(draft.pickedGoalWordOffset)}</span>
      <span data-testid="error">{error ?? ''}</span>
      <span data-testid="verdict">{verdict}</span>
      <button onClick={() => draft.handleKindChange('goal')}>to target</button>
      <button onClick={() => draft.handleKindChange('normal')}>to bookmark</button>
      <button onClick={() => draft.handleLabelChange('Typed label')}>type label</button>
      <button
        onClick={() =>
          void draft
            .validateGoalForwardRule(validateCandidate)
            .then((valid) => setVerdict(String(valid)))
        }
      >
        validate
      </button>
    </div>
  )
}

const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const value = (id: string) => screen.getByTestId(id).textContent

describe('useBookmarkDraft - tab and label seed', () => {
  it('opens on the Bookmark tab with a blank label', () => {
    stubApi()
    render(<Harness />)

    expect(value('kind')).toBe('normal')
    expect(value('label')).toBe('')
    expect(value('labelEdited')).toBe('false')
  })

  it('opens on the Target tab while a pick is armed, carrying the custom label', () => {
    stubApi()
    render(<Harness goalPickArmed customLabel="Session goal" />)

    expect(value('kind')).toBe('goal')
    expect(value('label')).toBe('Session goal')
    expect(value('labelEdited')).toBe('true')
  })

  it('switches tabs, keeping the custom label only for Target', () => {
    stubApi()
    render(<Harness customLabel="Session goal" />)

    act(() => { click('to target') })
    expect(value('kind')).toBe('goal')
    expect(value('label')).toBe('Session goal')

    act(() => { click('to bookmark') })
    expect(value('kind')).toBe('normal')
    expect(value('label')).toBe('')
  })

  it('marks the label edited once the user types', () => {
    stubApi()
    render(<Harness />)

    act(() => { click('type label') })
    expect(value('label')).toBe('Typed label')
    expect(value('labelEdited')).toBe('true')
  })

  it('restores the Target draft when the popover reopens on a picked word', async () => {
    stubApi({ stackIndex: 0 })
    const { rerender } = render(<Harness goalPickArmed />)
    expect(value('kind')).toBe('goal')

    act(() => { click('to bookmark') })
    expect(value('kind')).toBe('normal')

    await act(async () => {
      rerender(
        <Harness goalPickArmed={false} pickedGoalWordOffset={6} customLabel="Session goal" />
      )
    })

    expect(value('kind')).toBe('goal')
    expect(value('label')).toBe('Session goal')
    expect(value('picked')).toBe('6')
  })

  it('re-seeds the tab on the next open, not while it stays open', async () => {
    stubApi()
    const { rerender } = render(<Harness open={false} />)
    await act(async () => { rerender(<Harness open goalPickArmed />) })

    expect(value('kind')).toBe('goal')
  })
})

describe('useBookmarkDraft - goal forward rule', () => {
  it('accepts any candidate on the Bookmark tab', async () => {
    const api = stubApi({ stackIndex: 4 })
    render(<Harness validateCandidate={0} />)

    await act(async () => { click('validate') })

    expect(value('verdict')).toBe('true')
    expect(api.db.getReadingPosition).not.toHaveBeenCalled()
    expect(value('error')).toBe('')
  })

  it('refuses a Target at or behind the saved reading position', async () => {
    stubApi({ stackIndex: 2 })
    render(<Harness validateCandidate={4} />)

    act(() => { click('to target') })
    await act(async () => { click('validate') })

    expect(value('verdict')).toBe('false')
    expect(value('error')).toBe('Target must be ahead of your saved reading position.')
  })

  it('accepts a Target ahead of the saved reading position', async () => {
    stubApi({ stackIndex: 2 })
    render(<Harness validateCandidate={6} />)

    act(() => { click('to target') })
    await act(async () => { click('validate') })

    expect(value('verdict')).toBe('true')
    expect(value('error')).toBe('')
  })

  it('treats a never-read text as saved offset zero', async () => {
    stubApi(null)
    render(<Harness validateCandidate={0} />)

    act(() => { click('to target') })
    await act(async () => { click('validate') })

    expect(value('verdict')).toBe('false')
    expect(value('error')).toBe('Target must be ahead of your saved reading position.')
  })

  it('validates a picked Target as soon as the popover shows it', async () => {
    stubApi({ stackIndex: 4 })
    render(<Harness goalPickArmed pickedGoalWordOffset={2} />)
    await act(async () => {})

    expect(value('kind')).toBe('goal')
    expect(value('error')).toBe('Target must be ahead of your saved reading position.')
  })

  it('reports a validation failure rather than a forward-rule refusal', async () => {
    vi.stubGlobal('api', {
      db: { getReadingPosition: vi.fn().mockRejectedValue(new Error('offline')) },
    })
    render(<Harness goalPickArmed pickedGoalWordOffset={2} />)
    await act(async () => {})

    expect(value('error')).toBe('Could not validate goal position.')
  })
})
