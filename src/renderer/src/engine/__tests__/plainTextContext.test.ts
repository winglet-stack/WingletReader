import { describe, it, expect } from 'vitest'
import { computePlainTextContext } from '../plainTextContext'
import type { SegmentContext } from '../plainTextContext'
import type { WordStack } from '../../types'

// ── Helpers ────────────────────────────────────────────────────────────────

function makeStacks(wordCounts: number[]): WordStack[] {
  return wordCounts.map((n) => ({
    words: Array.from({ length: n }, (_, i) => `w${i}`),
    type: 'normal' as const
  }))
}

const SAMPLE_TEXT = { title: 'My Article' }

// ── Standalone text (no segment context) ──────────────────────────────────

describe('computePlainTextContext — standalone text', () => {
  it('reference is the text title', () => {
    const stacks = makeStacks([3, 3, 3])
    const ctx = computePlainTextContext(SAMPLE_TEXT, 0, stacks)
    expect(ctx.reference).toBe('My Article')
  })

  it('detail shows word offset and total', () => {
    const stacks = makeStacks([5, 5]) // 10 words total
    const ctx = computePlainTextContext(SAMPLE_TEXT, 0, stacks)
    // At index 0: word offset is 0, total is 10
    expect(ctx.detail).toContain('10')
    expect(ctx.detail).toContain('0')
  })

  it('progress is 0 when currentIndex is 0', () => {
    const stacks = makeStacks([3, 3])
    const ctx = computePlainTextContext(SAMPLE_TEXT, 0, stacks)
    expect(ctx.progress).toBe(0)
    expect(ctx.wordOffset).toBe(0)
  })

  it('progress reaches 1 when currentIndex equals stacks.length', () => {
    const stacks = makeStacks([3, 3])
    const ctx = computePlainTextContext(SAMPLE_TEXT, 2, stacks) // past the end
    expect(ctx.progress).toBe(1)
  })

  it('wordOffset accumulates words from consumed stacks', () => {
    // stacks: [2 words, 3 words, 4 words] → after consuming first 2 stacks = 5 words
    const stacks = makeStacks([2, 3, 4])
    const ctx = computePlainTextContext(SAMPLE_TEXT, 2, stacks)
    expect(ctx.wordOffset).toBe(5)
    expect(ctx.totalWords).toBe(9)
  })

  it('detail includes progress percentage', () => {
    const stacks = makeStacks([1, 1, 1, 1]) // 4 stacks
    const ctx = computePlainTextContext(SAMPLE_TEXT, 2, stacks) // 50%
    expect(ctx.detail).toContain('50%')
  })

  it('detail updates when navigation changes currentIndex', () => {
    const stacks = makeStacks([3, 3, 3, 3]) // 12 words, 4 stacks
    const ctxStart = computePlainTextContext(SAMPLE_TEXT, 0, stacks)
    const ctxMid = computePlainTextContext(SAMPLE_TEXT, 2, stacks)
    // wordOffset should differ
    expect(ctxMid.wordOffset).toBeGreaterThan(ctxStart.wordOffset)
    // detail should differ
    expect(ctxMid.detail).not.toBe(ctxStart.detail)
  })

  it('handles empty stacks gracefully', () => {
    const ctx = computePlainTextContext(SAMPLE_TEXT, 0, [])
    expect(ctx.progress).toBe(0)
    expect(ctx.wordOffset).toBe(0)
    expect(ctx.totalWords).toBe(0)
    expect(ctx.reference).toBe('My Article')
  })

  it('totalWords equals sum of all stack word counts', () => {
    const stacks = makeStacks([2, 4, 1, 3])
    const ctx = computePlainTextContext(SAMPLE_TEXT, 0, stacks)
    expect(ctx.totalWords).toBe(10)
  })
})

// ── Segment context ────────────────────────────────────────────────────────

describe('computePlainTextContext — with segment context', () => {
  const segCtx: SegmentContext = {
    sourceTitle: 'The Great Gatsby',
    index: 2, // 0-based → Part 3
    total: 5
  }

  it('reference is the source (parent) title, not the segment title', () => {
    const stacks = makeStacks([4, 4])
    const ctx = computePlainTextContext({ title: 'Chapter Three' }, 0, stacks, segCtx)
    expect(ctx.reference).toBe('The Great Gatsby')
    expect(ctx.reference).not.toBe('Chapter Three')
  })

  it('detail includes 1-based part number and total', () => {
    const stacks = makeStacks([3, 3])
    const ctx = computePlainTextContext({ title: 'Intro' }, 0, stacks, segCtx)
    // index 2 → Part 3 of 5
    expect(ctx.detail).toContain('Part 3 of 5')
  })

  it('detail includes the segment (chapter) title', () => {
    const stacks = makeStacks([3, 3])
    const ctx = computePlainTextContext({ title: 'The Valley of Ashes' }, 0, stacks, segCtx)
    expect(ctx.detail).toContain('The Valley of Ashes')
  })

  it('detail includes word position', () => {
    const stacks = makeStacks([5, 5])
    const ctx = computePlainTextContext({ title: 'Ch' }, 1, stacks, segCtx)
    // After first stack (5 words consumed)
    expect(ctx.detail).toContain('5')
    expect(ctx.detail).toContain('10')
  })

  it('detail updates after navigation (different currentIndex)', () => {
    const stacks = makeStacks([3, 3, 3]) // 9 words
    const ctx0 = computePlainTextContext({ title: 'Ch' }, 0, stacks, segCtx)
    const ctx2 = computePlainTextContext({ title: 'Ch' }, 2, stacks, segCtx)
    expect(ctx2.wordOffset).toBeGreaterThan(ctx0.wordOffset)
    expect(ctx2.detail).not.toBe(ctx0.detail)
  })

  it('wordOffset and totalWords are unaffected by segment context', () => {
    const stacks = makeStacks([4, 4])
    const ctxWithSeg = computePlainTextContext({ title: 'Ch' }, 1, stacks, segCtx)
    const ctxNoSeg = computePlainTextContext({ title: 'Ch' }, 1, stacks)
    expect(ctxWithSeg.wordOffset).toBe(ctxNoSeg.wordOffset)
    expect(ctxWithSeg.totalWords).toBe(ctxNoSeg.totalWords)
  })

  it('part 1 of 1 when only one segment exists', () => {
    const oneSegCtx: SegmentContext = { sourceTitle: 'Book', index: 0, total: 1 }
    const stacks = makeStacks([3])
    const ctx = computePlainTextContext({ title: 'Only' }, 0, stacks, oneSegCtx)
    expect(ctx.detail).toContain('Part 1 of 1')
  })
})

// ── Plain-text content integrity ───────────────────────────────────────────

describe('plain-text content — text.title appears in reference', () => {
  it('standalone: title is always the reference', () => {
    const titles = ['War and Peace', 'The Metamorphosis', '1984']
    titles.forEach((title) => {
      const ctx = computePlainTextContext({ title }, 0, makeStacks([2]))
      expect(ctx.reference).toBe(title)
    })
  })

  it('with segment context: sourceTitle is the reference for all positions', () => {
    const segCtx: SegmentContext = { sourceTitle: 'Source Book', index: 0, total: 3 }
    const stacks = makeStacks([2, 2, 2])
    for (let i = 0; i <= 3; i++) {
      const ctx = computePlainTextContext({ title: 'Ch' }, i, stacks, segCtx)
      expect(ctx.reference).toBe('Source Book')
    }
  })
})
