import { describe, expect, it } from 'vitest'
import {
  bookmarkFallbackLabel,
  bookmarkLabelForDraft,
  bookmarkWordOffsetAtIndex,
  savedReadingPositionWordOffset,
} from '../bookmarkDraft'
import { buildStackWordIndex, buildTextWordIndex, displayRenditionOf } from '../wordIndex'
import type { WordStack } from '../../types'

describe('bookmark draft helpers', () => {
  it('converts a live stack index to a stable word offset', () => {
    const stacks: WordStack[] = [
      { words: ['one', 'two'], type: 'normal' },
      { words: ['three', 'four', 'five'], type: 'normal' },
      { words: ['six'], type: 'normal' },
    ]

    expect(bookmarkWordOffsetAtIndex(buildStackWordIndex(stacks), 2)).toBe(5)
  })

  it('converts a saved reading position stack to a forward-rule word offset', () => {
    const stacks: WordStack[] = [
      { words: ['one', 'two'], type: 'normal' },
      { words: ['three', 'four', 'five'], type: 'normal' },
    ]

    const index = buildStackWordIndex(stacks)
    expect(savedReadingPositionWordOffset(index, null)).toBe(0)
    expect(savedReadingPositionWordOffset(index, 0)).toBe(0)
    expect(savedReadingPositionWordOffset(index, 1)).toBe(2)
  })

  it('prefers display content and normalizes form feeds for snippets', () => {
    expect(
      displayRenditionOf({
        content: 'raw text',
        content_display: 'display\ftext',
      })
    ).toBe('display\n\ntext')
  })

  it('builds a short snippet from the word at the bookmark offset', () => {
    // The snippet comes off the word index now, which walked the text once —
    // this used to walk it twice, three lines apart (`architecture-depth/08`).
    expect(buildTextWordIndex('one two three four five six').snippetAt(2)).toBe(
      'three four five six'
    )
  })

  it('falls back from a blank label to snippet, then offset label', () => {
    expect(bookmarkLabelForDraft('  Custom  ', 'snippet', 7)).toBe('Custom')
    expect(bookmarkLabelForDraft('   ', 'snippet', 7)).toBe('snippet')
    expect(bookmarkLabelForDraft('', '', 7)).toBe(bookmarkFallbackLabel(7))
  })
})
