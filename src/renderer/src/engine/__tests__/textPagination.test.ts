import { describe, it, expect } from 'vitest'
import {
  computePageStarts,
  pageForWordOffset,
  pageRange,
  DEFAULT_TARGET_WORDS,
  DEFAULT_HARD_CAP,
} from '../textPagination'
import { buildWordPositions, buildParagraphWordCounts } from '../wordHighlight'

/** A paragraph of `n` distinct words. */
function para(n: number, prefix = 'w'): string {
  return Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(' ')
}

/** Join paragraphs with a blank-line separator (the \n{2,} paragraph break). */
function doc(...paras: string[]): string {
  return paras.join('\n\n')
}

describe('computePageStarts — accumulation near target', () => {
  it('accumulates whole paragraphs until the target then breaks', () => {
    // Six 100-word paragraphs, target 500 → break after the fifth (500 words),
    // sixth starts a new Page.
    const content = doc(para(100), para(100), para(100), para(100), para(100), para(100))
    const starts = computePageStarts(content, { targetWords: 500, hardCap: 800 })
    expect(starts).toEqual([0, 500])
  })

  it('always begins with 0', () => {
    expect(computePageStarts(doc(para(120), para(120)))[0]).toBe(0)
  })

  it('does not break when the whole text fits under the target', () => {
    const content = doc(para(100), para(100), para(100))
    expect(computePageStarts(content, { targetWords: 500, hardCap: 800 })).toEqual([0])
  })

  it('gives a paragraph equal to the target its own Page', () => {
    // 500-word paragraph fills a Page exactly; the next paragraph would overshoot.
    const content = doc(para(500), para(100))
    expect(computePageStarts(content, { targetWords: 500, hardCap: 800 })).toEqual([0, 500])
  })
})

describe('computePageStarts — never splits a paragraph', () => {
  it('breaks at the paragraph end, overshooting rather than cutting mid-paragraph', () => {
    // 300 + 300 = 600 > 500, but the paragraph is whole: break before the second.
    const content = doc(para(300), para(300))
    const starts = computePageStarts(content, { targetWords: 500, hardCap: 800 })
    expect(starts).toEqual([0, 300])
  })

  it('lands boundaries only on paragraph starts', () => {
    const content = doc(para(200), para(200), para(200), para(200))
    const counts = buildParagraphWordCounts(content)
    // Prefix sums = valid paragraph-start offsets.
    const paragraphStarts = new Set<number>()
    let acc = 0
    for (const c of counts) {
      paragraphStarts.add(acc)
      acc += c
    }
    const starts = computePageStarts(content, { targetWords: 500, hardCap: 800 })
    for (const s of starts) expect(paragraphStarts.has(s)).toBe(true)
    // Page 0 = paras 1+2 (400); para 3 would reach 600>500 → break at 400.
    // Page 1 = paras 3+4 (400). No further break.
    expect(starts).toEqual([0, 400])
  })
})

describe('computePageStarts — runaway guard', () => {
  it('hard-cuts a single paragraph longer than the hard cap', () => {
    const content = para(1000) // one paragraph, no breaks
    const starts = computePageStarts(content, { targetWords: 500, hardCap: 800 })
    // 1000 > 800 → cut at 800; remaining 200 is the tail Page.
    expect(starts).toEqual([0, 800])
  })

  it('hard-cuts a paragraph-less text repeatedly for very long input', () => {
    const content = para(2500)
    const starts = computePageStarts(content, { targetWords: 500, hardCap: 800 })
    expect(starts).toEqual([0, 800, 1600, 2400])
  })

  it('breaks to a fresh Page before hard-cutting a runaway paragraph', () => {
    // Small paragraph, then a runaway one: the runaway starts its own Page,
    // then gets hard-cut.
    const content = doc(para(100), para(1000))
    const starts = computePageStarts(content, { targetWords: 500, hardCap: 800 })
    // 100 on Page 0; runaway breaks to 100, then 100+800=900 → cut at 900.
    expect(starts).toEqual([0, 100, 900])
  })
})

describe('pageForWordOffset — lookup edges', () => {
  const starts = [0, 100, 250, 600]

  it('returns 0 for the first word', () => {
    expect(pageForWordOffset(starts, 0)).toBe(0)
  })

  it('returns the correct Page at a boundary start (inclusive)', () => {
    expect(pageForWordOffset(starts, 100)).toBe(1)
    expect(pageForWordOffset(starts, 250)).toBe(2)
    expect(pageForWordOffset(starts, 600)).toBe(3)
  })

  it('returns the Page for offsets inside a Page', () => {
    expect(pageForWordOffset(starts, 99)).toBe(0)
    expect(pageForWordOffset(starts, 101)).toBe(1)
    expect(pageForWordOffset(starts, 599)).toBe(2)
  })

  it('clamps offsets beyond the final Page start to the last Page', () => {
    expect(pageForWordOffset(starts, 5000)).toBe(3)
  })

  it('clamps negative offsets to the first Page', () => {
    expect(pageForWordOffset(starts, -1)).toBe(0)
  })

  it('resolves the final word of a real text to the last Page', () => {
    const content = doc(para(300), para(300), para(300))
    const starts2 = computePageStarts(content, { targetWords: 500, hardCap: 800 })
    const totalWords = buildWordPositions(content).length
    expect(pageForWordOffset(starts2, totalWords - 1)).toBe(starts2.length - 1)
  })
})

describe('pageRange', () => {
  const starts = [0, 100, 250]
  const total = 400

  it('returns half-open ranges bounded by the next Page start', () => {
    expect(pageRange(starts, 0, total)).toEqual({ startWord: 0, endWord: 100 })
    expect(pageRange(starts, 1, total)).toEqual({ startWord: 100, endWord: 250 })
  })

  it('bounds the last Page at totalWords', () => {
    expect(pageRange(starts, 2, total)).toEqual({ startWord: 250, endWord: 400 })
  })

  it('clamps out-of-range page indices', () => {
    expect(pageRange(starts, 99, total)).toEqual({ startWord: 250, endWord: 400 })
    expect(pageRange(starts, -5, total)).toEqual({ startWord: 0, endWord: 100 })
  })

  it('spans the whole text when contiguous ranges are concatenated', () => {
    const content = doc(para(200), para(200), para(200), para(200))
    const s = computePageStarts(content)
    const total2 = buildWordPositions(content).length
    let cursor = 0
    for (let i = 0; i < s.length; i++) {
      const r = pageRange(s, i, total2)
      expect(r.startWord).toBe(cursor)
      cursor = r.endWord
    }
    expect(cursor).toBe(total2)
  })
})

describe('single-page and empty texts', () => {
  it('yields [0] for a text shorter than one Page', () => {
    expect(computePageStarts('Hello world')).toEqual([0])
  })

  it('yields [0] for empty content', () => {
    expect(computePageStarts('')).toEqual([0])
    expect(computePageStarts('   \n\n   ')).toEqual([0])
  })

  it('yields [0] for a single sub-cap paragraph over the target', () => {
    // 600 words, no breaks, under the 800 cap → one Page (can't split a paragraph).
    expect(computePageStarts(para(600), { targetWords: 500, hardCap: 800 })).toEqual([0])
  })
})

describe('word indexing matches buildWordPositions', () => {
  it('total words across Pages equals buildWordPositions length', () => {
    const content = doc(para(300), para(150), para(400), para(90))
    const totalWords = buildWordPositions(content).length
    const starts = computePageStarts(content)
    let sum = 0
    for (let i = 0; i < starts.length; i++) {
      const { startWord, endWord } = pageRange(starts, i, totalWords)
      sum += endWord - startWord
    }
    expect(sum).toBe(totalWords)
    // Paragraph word counts sum to the same space — no forked tokenizer.
    expect(buildParagraphWordCounts(content).reduce((a, b) => a + b, 0)).toBe(totalWords)
  })

  it('handles markdown headlines the same way as the tokenizer', () => {
    // Headline prefix is stripped by buildWordPositions; pagination must agree.
    const content = doc('# Chapter One', para(120))
    const totalWords = buildWordPositions(content).length
    expect(buildParagraphWordCounts(content).reduce((a, b) => a + b, 0)).toBe(totalWords)
    // "Chapter One" (2 words) + 120 = 122, well under a Page.
    expect(computePageStarts(content)).toEqual([0])
  })
})

describe('module defaults', () => {
  it('exposes the documented target and hard-cap constants', () => {
    expect(DEFAULT_TARGET_WORDS).toBe(500)
    expect(DEFAULT_HARD_CAP).toBe(800)
  })

  it('uses the defaults when no options are given', () => {
    // 6 × 100 with default target 500 → [0, 500].
    expect(computePageStarts(doc(para(100), para(100), para(100), para(100), para(100), para(100)))).toEqual([
      0, 500,
    ])
  })
})
