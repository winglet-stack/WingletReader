/**
 * Unit tests for `useBookmarkSnippets` (issue 05) — the word offsets and the
 * four-word snippets the popover suggests as labels, extracted from
 * `BookmarkPopover`'s inline memos.
 *
 * Environment: happy-dom (vitest.config.ts environmentMatchGlobs).
 */

import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { useBookmarkSnippets } from '../hooks/useBookmarkSnippets'
import {
  buildStackWordIndex,
  buildTextWordIndex,
  displayRenditionOf,
} from '../engine/wordIndex'
import type { TextRecord, WordStack } from '../types'

afterEach(cleanup)

const TEXT: TextRecord = {
  id: 7,
  title: 'Snippet Fixture',
  content: 'one two three four five six seven eight nine ten eleven twelve',
  word_count: 12,
}

const STACKS: WordStack[] = [
  { words: ['one', 'two'], type: 'normal' },
  { words: ['three', 'four'], type: 'normal' },
  { words: ['five', 'six'], type: 'normal' },
  { words: ['seven', 'eight'], type: 'normal' },
  { words: ['nine', 'ten'], type: 'normal' },
  { words: ['eleven', 'twelve'], type: 'normal' },
]

function Harness({
  text = TEXT,
  currentIndex = 0,
  pickedGoalWordOffset = null,
}: {
  text?: TextRecord
  currentIndex?: number
  pickedGoalWordOffset?: number | null
}) {
  // The shared word index, as the Reader assembles it: the stack half over the
  // current tokenization, the text half over the display rendition.
  const wordIndex = {
    stacks: buildStackWordIndex(STACKS),
    text: buildTextWordIndex(displayRenditionOf(text)),
  }
  const snippets = useBookmarkSnippets({
    wordIndex,
    currentIndex,
    pickedGoalWordOffset,
  })
  return (
    <div>
      <span data-testid="currentOffset">{String(snippets.currentWordOffset)}</span>
      <span data-testid="currentSnippet">{snippets.currentSnippet}</span>
      <span data-testid="pickedSnippet">{snippets.pickedSnippet}</span>
    </div>
  )
}

const value = (id: string) => screen.getByTestId(id).textContent

describe('useBookmarkSnippets', () => {
  it('derives the current word offset and its snippet from the playhead', () => {
    render(<Harness currentIndex={2} />)

    expect(value('currentOffset')).toBe('4')
    expect(value('currentSnippet')).toBe('five six seven eight')
  })

  it('starts at the first word before any playback', () => {
    render(<Harness />)

    expect(value('currentOffset')).toBe('0')
    expect(value('currentSnippet')).toBe('one two three four')
  })

  it('has no picked snippet before a Target word is chosen', () => {
    render(<Harness />)

    expect(value('pickedSnippet')).toBe('')
  })

  it('derives the picked snippet from the picked word', () => {
    render(<Harness pickedGoalWordOffset={6} />)

    expect(value('pickedSnippet')).toBe('seven eight nine ten')
  })

  it('reads the display rendition when the text carries one', () => {
    render(
      <Harness
        text={{ ...TEXT, content_display: 'alpha beta gamma delta epsilon zeta' }}
        currentIndex={1}
      />
    )

    expect(value('currentSnippet')).toBe('gamma delta epsilon zeta')
  })
})
