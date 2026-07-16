import type { TextRecord, WordStack } from '../types'
import { wordOffsetAtIndex } from './readerSession'
import { buildWordPositions, splitContentAtWord } from './wordHighlight'

const SNIPPET_WORD_COUNT = 4

export function displayContentForBookmark(text: Pick<TextRecord, 'content' | 'content_display'>): string {
  return (text.content_display ?? text.content ?? '').replace(/\f/g, '\n\n')
}

export function bookmarkWordOffsetAtIndex(stacks: WordStack[], stackIndex: number): number {
  return wordOffsetAtIndex(stacks, stackIndex)
}

export function savedReadingPositionWordOffset(
  stacks: WordStack[],
  stackIndex: number | null | undefined
): number {
  if (stackIndex == null || stackIndex <= 0) return 0
  return bookmarkWordOffsetAtIndex(stacks, stackIndex)
}

export function bookmarkSnippetAtWordOffset(
  displayContent: string,
  wordOffset: number,
  wordCount = SNIPPET_WORD_COUNT
): string {
  const first = splitContentAtWord(displayContent, wordOffset)
  if (!first) return ''

  const positions = buildWordPositions(displayContent)
  return positions
    .slice(wordOffset, wordOffset + wordCount)
    .map((position) => position.text)
    .join(' ')
    .trim()
}

export function bookmarkFallbackLabel(wordOffset: number): string {
  return `${Math.max(0, wordOffset).toLocaleString()} words`
}

export function bookmarkLabelForDraft(label: string, snippet: string, wordOffset: number): string {
  const trimmed = label.trim()
  if (trimmed) return trimmed
  if (snippet.trim()) return snippet.trim()
  return bookmarkFallbackLabel(wordOffset)
}
