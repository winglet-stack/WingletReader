import { useMemo } from 'react'
import { bookmarkWordOffsetAtIndex } from '../engine/bookmarkDraft'
import type { ReaderWordIndex } from './useWordIndex'

export interface BookmarkSnippets {
  /** The live playhead expressed as a word offset into the text. */
  currentWordOffset: number
  currentSnippet: string
  /** Empty until a Target word has been picked. */
  pickedSnippet: string
}

export interface BookmarkSnippetsOptions {
  wordIndex: ReaderWordIndex
  currentIndex: number
  pickedGoalWordOffset: number | null
}

/**
 * The word offsets and their four-word snippets — what a bookmark label falls
 * back to, and what the label field suggests as a placeholder.
 *
 * Both snippets are read off the shared word index. They used to be cut by a
 * helper that walked the whole book *twice* per call, from a memo keyed on the
 * playhead — so every beat of playback re-tokenized the book, twice, for four
 * words. Now the walk happened once, when the popover was first opened
 * (`architecture-depth/08`).
 */
export function useBookmarkSnippets({
  wordIndex,
  currentIndex,
  pickedGoalWordOffset,
}: BookmarkSnippetsOptions): BookmarkSnippets {
  const currentWordOffset = useMemo(
    () => bookmarkWordOffsetAtIndex(wordIndex.stacks, currentIndex),
    [wordIndex, currentIndex]
  )
  const pickedSnippet = useMemo(
    () =>
      pickedGoalWordOffset == null ? '' : wordIndex.text.snippetAt(pickedGoalWordOffset),
    [wordIndex, pickedGoalWordOffset]
  )
  const currentSnippet = useMemo(
    () => wordIndex.text.snippetAt(currentWordOffset),
    [wordIndex, currentWordOffset]
  )

  return { currentWordOffset, currentSnippet, pickedSnippet }
}
