/**
 * Extracts a word-range slice from plain text content.
 * startWord and endWord are word-array indices (exclusive end), matching
 * the startWordOffset / endWordOffset stored on Summary records.
 */
export function extractPassage(content: string, startWord: number, endWord: number): string {
  if (!content || startWord >= endWord) return ''
  const words = content.trim().split(/\s+/).filter(Boolean)
  if (startWord >= words.length) return ''
  return words.slice(startWord, Math.min(endWord, words.length)).join(' ')
}
