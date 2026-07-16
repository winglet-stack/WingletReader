import { describe, it, expect } from 'vitest'
import { extractPassage } from '../passageExtract'

const SAMPLE = 'one two three four five six seven eight nine ten'

describe('extractPassage', () => {
  it('returns a slice of words for a valid range', () => {
    expect(extractPassage(SAMPLE, 0, 3)).toBe('one two three')
  })

  it('returns words from the middle of the text', () => {
    expect(extractPassage(SAMPLE, 3, 6)).toBe('four five six')
  })

  it('returns the full text when start=0 and end=wordCount', () => {
    expect(extractPassage(SAMPLE, 0, 10)).toBe(SAMPLE)
  })

  it('clamps to the end of content when endWord exceeds word count', () => {
    expect(extractPassage(SAMPLE, 8, 999)).toBe('nine ten')
  })

  it('returns empty string when start >= end', () => {
    expect(extractPassage(SAMPLE, 5, 5)).toBe('')
    expect(extractPassage(SAMPLE, 7, 3)).toBe('')
  })

  it('returns empty string when content is empty', () => {
    expect(extractPassage('', 0, 5)).toBe('')
  })

  it('returns empty string when startWord is beyond the text', () => {
    expect(extractPassage(SAMPLE, 100, 200)).toBe('')
  })

  it('handles single-word extraction', () => {
    expect(extractPassage(SAMPLE, 4, 5)).toBe('five')
  })

  it('handles leading/trailing whitespace in content', () => {
    expect(extractPassage('  hello world  ', 0, 2)).toBe('hello world')
  })

  it('normalises multiple spaces between words', () => {
    expect(extractPassage('a  b   c', 1, 3)).toBe('b c')
  })

  it('preserves punctuation attached to words', () => {
    const content = 'Hello, world. How are you?'
    expect(extractPassage(content, 0, 3)).toBe('Hello, world. How')
  })
})
