import { describe, it, expect } from 'vitest'
import {
  buildStacks,
  isEnumerationMarker,
  isBulletMarker,
  LONG_WORD_CHAR_THRESHOLD,
  MAX_WORDS_PER_STACK,
} from '../tokenizer'
import type { ChunkRules } from '../tokenizer'

// ── Helpers ────────────────────────────────────────────────────────────────

const NO_RULES: ChunkRules = {
  longWord: false,
  enumerations: false,
  bullets: false,
  commas: false,
  names: false,
  headlines: false,
}

const ALL_RULES: ChunkRules = {
  longWord: true,
  enumerations: true,
  bullets: true,
  commas: true,
  names: true,
  headlines: true,
}

function words(stacks: ReturnType<typeof buildStacks>): string[][] {
  return stacks.map((s) => s.words)
}

function allWords(stacks: ReturnType<typeof buildStacks>): string[] {
  return stacks.flatMap((s) => s.words)
}

const LONG_WORD = 'A'.repeat(LONG_WORD_CHAR_THRESHOLD + 1)

it('keeps the legacy exported max words constant for archived tokenizer callers', () => {
  expect(MAX_WORDS_PER_STACK).toBe(7)
})

// ── isEnumerationMarker ────────────────────────────────────────────────────

describe('isEnumerationMarker', () => {
  it('matches single-digit period markers', () => {
    expect(isEnumerationMarker('1.')).toBe(true)
    expect(isEnumerationMarker('9.')).toBe(true)
  })

  it('matches multi-digit period markers', () => {
    expect(isEnumerationMarker('12.')).toBe(true)
    expect(isEnumerationMarker('100.')).toBe(true)
  })

  it('matches single-digit parenthesis markers', () => {
    expect(isEnumerationMarker('1)')).toBe(true)
    expect(isEnumerationMarker('3)')).toBe(true)
  })

  it('matches lowercase letter markers', () => {
    expect(isEnumerationMarker('a.')).toBe(true)
    expect(isEnumerationMarker('a)')).toBe(true)
    expect(isEnumerationMarker('z.')).toBe(true)
  })

  it('matches uppercase letter markers', () => {
    expect(isEnumerationMarker('A.')).toBe(true)
    expect(isEnumerationMarker('A)')).toBe(true)
    expect(isEnumerationMarker('Z.')).toBe(true)
  })

  it('rejects plain words', () => {
    expect(isEnumerationMarker('hello')).toBe(false)
    expect(isEnumerationMarker('abc')).toBe(false)
  })

  it('rejects numbers without punctuation', () => {
    expect(isEnumerationMarker('1')).toBe(false)
    expect(isEnumerationMarker('12')).toBe(false)
  })

  it('rejects four-digit markers (too long to be enumeration)', () => {
    expect(isEnumerationMarker('1000.')).toBe(false)
  })

  it('rejects multi-letter letter markers', () => {
    expect(isEnumerationMarker('ab.')).toBe(false)
  })
})

// ── isBulletMarker ─────────────────────────────────────────────────────────

describe('isBulletMarker', () => {
  it('matches dash', () => expect(isBulletMarker('-')).toBe(true))
  it('matches asterisk', () => expect(isBulletMarker('*')).toBe(true))
  it('matches bullet character', () => expect(isBulletMarker('•')).toBe(true))
  it('matches en-dash', () => expect(isBulletMarker('–')).toBe(true))
  it('rejects regular words', () => expect(isBulletMarker('hello')).toBe(false))
  it('rejects empty string', () => expect(isBulletMarker('')).toBe(false))
})

// ── 1. Long-word early chunk ending ───────────────────────────────────────

describe('chunk rule: longWord', () => {
  it('prefers a break before a long word when it lands in-band (soft, SP-3)', () => {
    // 14 words at N=8, long word at index 6. Pure balance gives [7][7] (long word
    // shares stack 1 with "six"); the soft break before it pulls the split to [6][8].
    const text = `one two three four five six ${LONG_WORD} eight nine ten eleven twelve thirteen fourteen.`
    const withRule = buildStacks(text, 8, { ...NO_RULES, longWord: true })
    const withoutRule = buildStacks(text, 8, { ...NO_RULES, longWord: false })

    const longStackWith = withRule.find((s) => s.words.includes(LONG_WORD))
    expect(longStackWith?.words[0]).toBe(LONG_WORD)

    const longStackWithout = withoutRule.find((s) => s.words.includes(LONG_WORD))
    expect(longStackWithout?.words).toContain('six')
  })

  it('crosses a long word when breaking before it would leave a tiny stack (SP-3)', () => {
    // 8 words at N=8, long word last: a break before it would strand a 1-word stack,
    // so the DP crosses the soft break and keeps a single full stack.
    const text = `alpha beta gamma delta epsilon zeta eta ${LONG_WORD}`
    const stacks = buildStacks(text, 8, { ...NO_RULES, longWord: true })
    expect(stacks).toHaveLength(1)
    expect(stacks[0].words).toHaveLength(8)
  })

  it('does not split the long word itself', () => {
    const text = `prefix ${LONG_WORD} suffix`
    const stacks = buildStacks(text, 5, { ...NO_RULES, longWord: true })
    const longChunk = stacks.find((s) => s.words.includes(LONG_WORD))
    expect(longChunk?.words).toContain(LONG_WORD)
    expect(longChunk?.words.filter((w) => w === LONG_WORD)).toHaveLength(1)
  })

  it('does not flush when the chunk is empty (long word starts fresh)', () => {
    const text = LONG_WORD
    const stacks = buildStacks(text, 3, { ...NO_RULES, longWord: true })
    expect(stacks).toHaveLength(1)
    expect(stacks[0].words).toEqual([LONG_WORD])
  })

  it('preserves all words when rule is disabled', () => {
    const text = `short ${LONG_WORD}`
    const stacks = buildStacks(text, 5, { ...NO_RULES, longWord: false })
    expect(allWords(stacks)).toContain('short')
    expect(allWords(stacks)).toContain(LONG_WORD)
    expect(stacks[0].words).toEqual(['short', LONG_WORD])
  })

  it('preserves all words when rule is enabled', () => {
    const text = `short ${LONG_WORD} end`
    const stacks = buildStacks(text, 5, { ...NO_RULES, longWord: true })
    const all = allWords(stacks)
    expect(all).toContain('short')
    expect(all).toContain(LONG_WORD)
    expect(all).toContain('end')
  })
})

// ── 2. Numbered enumeration markers ───────────────────────────────────────

describe('chunk rule: enumerations — numbered', () => {
  it('places a single-digit period marker in its own chunk', () => {
    const text = '1. First item here.'
    const stacks = buildStacks(text, 3, { ...NO_RULES, enumerations: true })
    expect(stacks[0].words).toEqual(['1.'])
  })

  it('places a multi-digit period marker in its own chunk', () => {
    const text = '12. Twelfth item here.'
    const stacks = buildStacks(text, 3, { ...NO_RULES, enumerations: true })
    expect(stacks[0].words).toEqual(['12.'])
  })

  it('places a parenthesis marker in its own chunk', () => {
    const text = '1) First item.'
    const stacks = buildStacks(text, 3, { ...NO_RULES, enumerations: true })
    expect(stacks[0].words).toEqual(['1)'])
  })

  it('chunks the text after the marker normally', () => {
    const text = '1. Alpha beta gamma delta.'
    const stacks = buildStacks(text, 3, { ...NO_RULES, enumerations: true })
    expect(stacks[0].words).toEqual(['1.'])
    const bodyWords = allWords(stacks.slice(1))
    expect(bodyWords).toEqual(['Alpha', 'beta', 'gamma', 'delta.'])
  })

  it('flushes a preceding chunk before the marker', () => {
    const text = 'intro text 1. item'
    const stacks = buildStacks(text, 5, { ...NO_RULES, enumerations: true })
    const introChunk = stacks.find((s) => s.words.includes('intro'))
    const markerChunk = stacks.find((s) => s.words.includes('1.'))
    expect(introChunk).toBeDefined()
    expect(markerChunk).toBeDefined()
    expect(introChunk).not.toBe(markerChunk)
  })

  it('does not produce empty chunks', () => {
    const text = '1. a 2. b'
    const stacks = buildStacks(text, 3, { ...NO_RULES, enumerations: true })
    stacks.forEach((s) => expect(s.words.length).toBeGreaterThan(0))
  })
})

// ── 3. Alphabetical enumeration markers ───────────────────────────────────

describe('chunk rule: enumerations — alphabetical', () => {
  it('places a lowercase-letter period marker in its own chunk', () => {
    const stacks = buildStacks('a. Option one.', 3, { ...NO_RULES, enumerations: true })
    expect(stacks[0].words).toEqual(['a.'])
  })

  it('places a lowercase-letter parenthesis marker in its own chunk', () => {
    const stacks = buildStacks('a) Option one.', 3, { ...NO_RULES, enumerations: true })
    expect(stacks[0].words).toEqual(['a)'])
  })

  it('places an uppercase-letter period marker in its own chunk', () => {
    const stacks = buildStacks('A. Option one.', 3, { ...NO_RULES, enumerations: true })
    expect(stacks[0].words).toEqual(['A.'])
  })

  it('places an uppercase-letter parenthesis marker in its own chunk', () => {
    const stacks = buildStacks('A) Option one.', 3, { ...NO_RULES, enumerations: true })
    expect(stacks[0].words).toEqual(['A)'])
  })
})

// ── 4. Bullet markers ──────────────────────────────────────────────────────

describe('chunk rule: bullets', () => {
  it('places a dash bullet in its own chunk', () => {
    const stacks = buildStacks('- First point here.', 3, { ...NO_RULES, bullets: true })
    expect(stacks[0].words).toEqual(['-'])
  })

  it('places an asterisk bullet in its own chunk', () => {
    const stacks = buildStacks('* Another point.', 3, { ...NO_RULES, bullets: true })
    expect(stacks[0].words).toEqual(['*'])
  })

  it('places a unicode bullet in its own chunk', () => {
    const stacks = buildStacks('• Key point here.', 3, { ...NO_RULES, bullets: true })
    expect(stacks[0].words).toEqual(['•'])
  })

  it('places an en-dash bullet in its own chunk', () => {
    const stacks = buildStacks('– Another item.', 3, { ...NO_RULES, bullets: true })
    expect(stacks[0].words).toEqual(['–'])
  })

  it('chunks the text after the bullet normally', () => {
    const stacks = buildStacks('- Alpha beta gamma delta.', 3, { ...NO_RULES, bullets: true })
    expect(stacks[0].words).toEqual(['-'])
    const bodyWords = allWords(stacks.slice(1))
    expect(bodyWords).toEqual(['Alpha', 'beta', 'gamma', 'delta.'])
  })

  it('flushes a preceding chunk before the bullet marker', () => {
    const text = 'intro text - item'
    const stacks = buildStacks(text, 5, { ...NO_RULES, bullets: true })
    const introChunk = stacks.find((s) => s.words.includes('intro'))
    const bulletChunk = stacks.find((s) => s.words.includes('-'))
    expect(introChunk).toBeDefined()
    expect(bulletChunk).toBeDefined()
    expect(introChunk).not.toBe(bulletChunk)
  })

  it('does not produce empty chunks', () => {
    const text = '- a • b – c'
    const stacks = buildStacks(text, 3, { ...NO_RULES, bullets: true })
    stacks.forEach((s) => expect(s.words.length).toBeGreaterThan(0))
  })
})

// ── 5. Comma-based chunk endings ───────────────────────────────────────────

describe('chunk rule: commas', () => {
  it('prefers a comma break when it lands in-band (soft, SP-3)', () => {
    // 14 words at N=8, comma after word 6. Pure balance gives [7][7]; the soft comma
    // break pulls the split to [6][8], keeping the trailing comma at a stack boundary.
    const text = 'one two three four five six, seven eight nine ten eleven twelve thirteen fourteen.'
    const withRule = buildStacks(text, 8, { ...NO_RULES, commas: true })
    const withoutRule = buildStacks(text, 8, { ...NO_RULES, commas: false })

    expect(withRule.map((s) => s.words.length)).toEqual([6, 8])
    expect(withRule[0].words[withRule[0].words.length - 1]).toBe('six,')
    expect(withoutRule.map((s) => s.words.length)).toEqual([7, 7])
  })

  it('crosses commas that would strand a tiny stack — no [2][1] stutter (SP-3)', () => {
    // The ADR-0030 worst case: comma-heavy short clause. Hard splitting yields
    // [He ran,][jumped,][…] stutter; the soft packer keeps a single full stack.
    const stacks = buildStacks('He ran, jumped, and fell to the floor.', 8, {
      ...NO_RULES,
      commas: true,
    })
    expect(stacks.map((s) => s.words.length)).toEqual([8])
    expect(stacks[0].words).toContain('ran,')
    expect(stacks[0].words).toContain('jumped,')
  })

  it('does not produce empty chunks', () => {
    const stacks = buildStacks('a, b, c.', 5, { ...NO_RULES, commas: true })
    stacks.forEach((s) => expect(s.words.length).toBeGreaterThan(0))
  })

  it('preserves paragraph-end type when last word has a comma', () => {
    // "last," is the final word of its paragraph, so it should carry paragraph-end type
    const stacks = buildStacks('last,', 5, { ...NO_RULES, commas: true })
    expect(stacks[0].type).toBe('paragraph-end')
  })

  it('does not change behavior when rule is disabled', () => {
    const stacks = buildStacks('Hello, world.', 2, { ...NO_RULES, commas: false })
    // Without comma rule, "Hello," and "world." are chunked by words_per_stack only
    expect(stacks[0].words).toEqual(['Hello,', 'world.'])
  })

  it('preserves all words in original order', () => {
    const text = 'one, two, three, four.'
    const stacks = buildStacks(text, 5, { ...NO_RULES, commas: true })
    expect(allWords(stacks)).toEqual(['one,', 'two,', 'three,', 'four.'])
  })
})

// ── 6. Names kept intact ───────────────────────────────────────────────────

describe('chunk rule: names', () => {
  it('keeps a two-word proper name together in one chunk', () => {
    const stacks = buildStacks('John Smith arrived.', 3, { ...NO_RULES, names: true })
    const nameChunk = stacks.find((s) => s.words.includes('John'))
    expect(nameChunk?.words).toContain('Smith')
  })

  it('keeps a three-word name together when it fits', () => {
    const stacks = buildStacks('Mary Jane Watson smiled.', 4, { ...NO_RULES, names: true })
    const nameChunk = stacks.find((s) => s.words.includes('Mary'))
    expect(nameChunk?.words).toContain('Jane')
    expect(nameChunk?.words).toContain('Watson')
  })

  it('preserves all words in original order', () => {
    const text = 'John Smith arrived here.'
    const stacks = buildStacks(text, 3, { ...NO_RULES, names: true })
    expect(allWords(stacks)).toEqual(['John', 'Smith', 'arrived', 'here.'])
  })

  it('falls back gracefully when name exceeds effectiveWPS', () => {
    // 5-word name with WPS=2: words processed individually/partially
    const text = 'Alpha Beta Gamma Delta Epsilon done.'
    const stacks = buildStacks(text, 2, { ...NO_RULES, names: true })
    stacks.forEach((s) => expect(s.words.length).toBeGreaterThan(0))
    expect(stacks[0].words).toEqual(['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'])
    const all = allWords(stacks)
    expect(all).toContain('Alpha')
    expect(all).toContain('Beta')
    expect(all).toContain('done.')
  })

  it('does not break names that fit across chunk boundaries — flushes and regroups', () => {
    // "The John Smith" — "John Smith" is a name but chunk may fill "The John" first (no name detected for "The")
    // "The" is a non-name word; "John Smith" are detected as a name group
    const stacks = buildStacks('The John Smith left.', 2, { ...NO_RULES, names: true })
    // "John Smith" should be together in some chunk
    const nameChunk = stacks.find((s) => s.words.includes('John'))
    expect(nameChunk?.words).toContain('Smith')
  })

  it('does not produce empty chunks', () => {
    const stacks = buildStacks('John Smith arrived.', 3, { ...NO_RULES, names: true })
    stacks.forEach((s) => expect(s.words.length).toBeGreaterThan(0))
  })
})

// ── 7. Headlines kept intact ───────────────────────────────────────────────

describe('chunk rule: headlines', () => {
  it('groups a detected all-caps headline into a headline-type chunk', () => {
    const text = 'INTRODUCTION\n\nSome body text here.'
    const stacks = buildStacks(text, 3, { ...NO_RULES, headlines: true })
    const headlineStack = stacks.find((s) => s.type === 'headline')
    expect(headlineStack).toBeDefined()
    expect(headlineStack?.words).toEqual(['INTRODUCTION'])
  })

  it('groups a markdown heading into a headline-type chunk', () => {
    const text = '## Chapter One\n\nBody text here.'
    const stacks = buildStacks(text, 3, { ...NO_RULES, headlines: true })
    const headlineStack = stacks.find((s) => s.type === 'headline')
    expect(headlineStack).toBeDefined()
    expect(headlineStack?.words).toEqual(['Chapter', 'One'])
  })

  it('treats headline paragraphs as normal text when rule is off', () => {
    const text = 'INTRODUCTION\n\nSome body text.'
    const stacks = buildStacks(text, 3, NO_RULES)
    const headlineStack = stacks.find((s) => s.type === 'headline')
    expect(headlineStack).toBeUndefined()
  })

  it('splits long headlines at words_per_stack', () => {
    const text = 'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG\n\nbody.'
    const stacks = buildStacks(text, 3, { ...NO_RULES, headlines: true })
    const headlineStacks = stacks.filter((s) => s.type === 'headline')
    expect(headlineStacks.map((s) => s.words)).toEqual([
      ['THE', 'QUICK', 'BROWN'],
      ['FOX', 'JUMPS', 'OVER'],
      ['THE', 'LAZY', 'DOG'],
    ])
  })

  it('preserves all headline words across multiple stacks', () => {
    const headline = 'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG'
    const text = `${headline}\n\nbody.`
    const stacks = buildStacks(text, 3, { ...NO_RULES, headlines: true })
    const headlineWords = stacks.filter((s) => s.type === 'headline').flatMap((s) => s.words)
    expect(headlineWords).toEqual(headline.split(' '))
  })
})

// ── 8. All new rules disabled — existing behavior unchanged ────────────────

describe('all new rules disabled', () => {
  it('produces the same output as calling buildStacks with no rules argument', () => {
    // Default rules = headlines:true, everything else false
    const text = 'The quick brown fox jumps over the lazy dog.'
    const withNoArg = buildStacks(text, 3)
    const withNoRules = buildStacks(text, 3, { ...NO_RULES, headlines: true })
    expect(words(withNoArg)).toEqual(words(withNoRules))
  })

  it('respects words_per_stack limit', () => {
    const text = 'one two three four five six seven eight nine.'
    const stacks = buildStacks(text, 3, NO_RULES)
    stacks.forEach((s) => expect(s.words.length).toBeLessThanOrEqual(3))
  })

  it('honors words_per_stack above the retired 7-word cap', () => {
    const text = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen.'
    const stacks = buildStacks(text, 8, NO_RULES)
    expect(stacks.map((s) => s.words.length)).toEqual([8, 8])
  })

  it('preserves original word order', () => {
    const text = 'Alpha beta gamma delta epsilon zeta.'
    const stacks = buildStacks(text, 3, NO_RULES)
    expect(allWords(stacks)).toEqual(['Alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta.'])
  })

  it('does not produce empty chunks', () => {
    const text = 'Hello world this is a test sentence.'
    const stacks = buildStacks(text, 3, NO_RULES)
    stacks.forEach((s) => expect(s.words.length).toBeGreaterThan(0))
  })

  it('produces no duplicate words', () => {
    const text = 'one two three four five.'
    const stacks = buildStacks(text, 3, NO_RULES)
    const all = allWords(stacks)
    expect(all).toEqual(['one', 'two', 'three', 'four', 'five.'])
  })
})

// ── 8b. SP-5 golden: hard sentence boundaries, opt-in rules off ─────────────

describe('SP-5 golden (hard sentence boundaries, opt-in rules off)', () => {
  const HEADLINES_ONLY: ChunkRules = { ...NO_RULES, headlines: true }

  // Frozen golden for the ADR-0031 hard-boundary behavior: a period always ends a
  // Stack, so the balanced DP runs per sentence. Every sentence end (that survives
  // the abbreviation + lowercase-continuation guards) terminates its Stack; no
  // Stack spans a period. With every opt-in break rule OFF, buildStacks must
  // reproduce this exactly — the opt-in path is unchanged from SP-3.
  const CORPUS = [
    'He nodded. The quick brown fox jumped over every lazy dog nearby today.',
    'INTRODUCTION\n\nSome body text here, with a comma, and a supercalifragilisticexpialidocious word.',
    'One two three four five six. Seven eight nine ten eleven twelve thirteen fourteen fifteen.',
    'John Smith arrived, quickly. Then Mary Jane Watson left the building forever.\n\n- A bullet point here.',
    'Short. Tiny sentences here. A medium length sentence follows this one right now for balance.',
  ]

  const GOLDEN: Record<string, [string, string[]][][]> = {
    'N4-no': [
      [['sentence-end', ['He', 'nodded.']], ['normal', ['The', 'quick', 'brown', 'fox']], ['normal', ['jumped', 'over', 'every', 'lazy']], ['paragraph-end', ['dog', 'nearby', 'today.']]],
      [['paragraph-end', ['INTRODUCTION']], ['normal', ['Some', 'body', 'text', 'here,']], ['normal', ['with', 'a', 'comma,', 'and']], ['paragraph-end', ['a', 'supercalifragilisticexpialidocious', 'word.']]],
      [['normal', ['One', 'two', 'three']], ['sentence-end', ['four', 'five', 'six.']], ['normal', ['Seven', 'eight', 'nine']], ['normal', ['ten', 'eleven', 'twelve']], ['paragraph-end', ['thirteen', 'fourteen', 'fifteen.']]],
      [['sentence-end', ['John', 'Smith', 'arrived,', 'quickly.']], ['normal', ['Then', 'Mary', 'Jane', 'Watson']], ['paragraph-end', ['left', 'the', 'building', 'forever.']], ['normal', ['-', 'A', 'bullet']], ['paragraph-end', ['point', 'here.']]],
      [['sentence-end', ['Short.']], ['sentence-end', ['Tiny', 'sentences', 'here.']], ['normal', ['A', 'medium', 'length', 'sentence']], ['normal', ['follows', 'this', 'one', 'right']], ['paragraph-end', ['now', 'for', 'balance.']]],
    ],
    'N4-hl': [
      [['sentence-end', ['He', 'nodded.']], ['normal', ['The', 'quick', 'brown', 'fox']], ['normal', ['jumped', 'over', 'every', 'lazy']], ['paragraph-end', ['dog', 'nearby', 'today.']]],
      [['headline', ['INTRODUCTION']], ['normal', ['Some', 'body', 'text', 'here,']], ['normal', ['with', 'a', 'comma,', 'and']], ['paragraph-end', ['a', 'supercalifragilisticexpialidocious', 'word.']]],
      [['normal', ['One', 'two', 'three']], ['sentence-end', ['four', 'five', 'six.']], ['normal', ['Seven', 'eight', 'nine']], ['normal', ['ten', 'eleven', 'twelve']], ['paragraph-end', ['thirteen', 'fourteen', 'fifteen.']]],
      [['sentence-end', ['John', 'Smith', 'arrived,', 'quickly.']], ['normal', ['Then', 'Mary', 'Jane', 'Watson']], ['paragraph-end', ['left', 'the', 'building', 'forever.']], ['normal', ['-', 'A', 'bullet']], ['paragraph-end', ['point', 'here.']]],
      [['sentence-end', ['Short.']], ['sentence-end', ['Tiny', 'sentences', 'here.']], ['normal', ['A', 'medium', 'length', 'sentence']], ['normal', ['follows', 'this', 'one', 'right']], ['paragraph-end', ['now', 'for', 'balance.']]],
    ],
    'N8-no': [
      [['sentence-end', ['He', 'nodded.']], ['normal', ['The', 'quick', 'brown', 'fox', 'jumped', 'over']], ['paragraph-end', ['every', 'lazy', 'dog', 'nearby', 'today.']]],
      [['paragraph-end', ['INTRODUCTION']], ['normal', ['Some', 'body', 'text', 'here,', 'with', 'a']], ['paragraph-end', ['comma,', 'and', 'a', 'supercalifragilisticexpialidocious', 'word.']]],
      [['sentence-end', ['One', 'two', 'three', 'four', 'five', 'six.']], ['normal', ['Seven', 'eight', 'nine', 'ten', 'eleven']], ['paragraph-end', ['twelve', 'thirteen', 'fourteen', 'fifteen.']]],
      [['sentence-end', ['John', 'Smith', 'arrived,', 'quickly.']], ['paragraph-end', ['Then', 'Mary', 'Jane', 'Watson', 'left', 'the', 'building', 'forever.']], ['paragraph-end', ['-', 'A', 'bullet', 'point', 'here.']]],
      [['sentence-end', ['Short.']], ['sentence-end', ['Tiny', 'sentences', 'here.']], ['normal', ['A', 'medium', 'length', 'sentence', 'follows', 'this']], ['paragraph-end', ['one', 'right', 'now', 'for', 'balance.']]],
    ],
    'N8-hl': [
      [['sentence-end', ['He', 'nodded.']], ['normal', ['The', 'quick', 'brown', 'fox', 'jumped', 'over']], ['paragraph-end', ['every', 'lazy', 'dog', 'nearby', 'today.']]],
      [['headline', ['INTRODUCTION']], ['normal', ['Some', 'body', 'text', 'here,', 'with', 'a']], ['paragraph-end', ['comma,', 'and', 'a', 'supercalifragilisticexpialidocious', 'word.']]],
      [['sentence-end', ['One', 'two', 'three', 'four', 'five', 'six.']], ['normal', ['Seven', 'eight', 'nine', 'ten', 'eleven']], ['paragraph-end', ['twelve', 'thirteen', 'fourteen', 'fifteen.']]],
      [['sentence-end', ['John', 'Smith', 'arrived,', 'quickly.']], ['paragraph-end', ['Then', 'Mary', 'Jane', 'Watson', 'left', 'the', 'building', 'forever.']], ['paragraph-end', ['-', 'A', 'bullet', 'point', 'here.']]],
      [['sentence-end', ['Short.']], ['sentence-end', ['Tiny', 'sentences', 'here.']], ['normal', ['A', 'medium', 'length', 'sentence', 'follows', 'this']], ['paragraph-end', ['one', 'right', 'now', 'for', 'balance.']]],
    ],
  }

  for (const N of [4, 8]) {
    for (const [label, rules] of [['no', NO_RULES], ['hl', HEADLINES_ONLY]] as const) {
      it(`matches SP-2b golden at N=${N} (${label})`, () => {
        const actual = CORPUS.map((t) =>
          buildStacks(t, N, rules).map((s) => [s.type, s.words])
        )
        expect(actual).toEqual(GOLDEN[`N${N}-${label}`])
      })
    }
  }
})

// ── 9. Multiple rules enabled at once ─────────────────────────────────────

describe('elastic stack packing', () => {
  it('balances an 18-word paragraph at N=8 into three 6-word stacks', () => {
    const text = [
      'one',
      'two',
      'three',
      'four',
      'five',
      'six',
      'seven',
      'eight',
      'nine',
      'ten',
      'eleven',
      'twelve',
      'thirteen',
      'fourteen',
      'fifteen',
      'sixteen',
      'seventeen',
      'eighteen.',
    ].join(' ')
    const stacks = buildStacks(text, 8, NO_RULES)

    expect(stacks.map((s) => s.words.length)).toEqual([6, 6, 6])
  })

  it('ends a Stack on a hard sentence boundary — short sentences get their own Stack (ADR-0031)', () => {
    const text = 'He nodded. The quick brown fox jumped over every lazy dog nearby today.'
    const stacks = buildStacks(text, 8, NO_RULES)
    const firstStack = stacks[0]

    // "He nodded." is its own one-beat Stack (accepted, not merged into the next sentence).
    expect(firstStack.words).toEqual(['He', 'nodded.'])
    expect(firstStack.type).toBe('sentence-end')
    // No Stack spans the period: "The" starts a fresh sentence run.
    expect(stacks.every((s) => !(s.words.includes('nodded.') && s.words.includes('The')))).toBe(true)
  })

  it('keeps paragraphs as hard boundaries', () => {
    const stacks = buildStacks('one two three four.\n\nfive six seven eight.', 8, NO_RULES)

    expect(stacks).toHaveLength(2)
    expect(stacks[0].words).toEqual(['one', 'two', 'three', 'four.'])
    expect(stacks[1].words).toEqual(['five', 'six', 'seven', 'eight.'])
  })

  it('assigns pause type from the last visible token', () => {
    // Capital continuation ("Seven") so the period is a real sentence end; hard
    // boundaries then split it into a sentence-end Stack and a paragraph-end Stack.
    const text = 'one two three four five six. Seven eight nine ten eleven twelve.'
    const stacks = buildStacks(text, 8, NO_RULES)

    expect(stacks.map((s) => s.type)).toEqual(['sentence-end', 'paragraph-end'])
  })
})

// ── 9b. Hard sentence boundaries (ADR-0031 / SP-5) ─────────────────────────

describe('hard sentence boundaries (ADR-0031)', () => {
  it('never lets a Stack span a surviving period', () => {
    const text = 'He walked home. She left the house quietly today.'
    const stacks = buildStacks(text, 8, NO_RULES)
    expect(stacks.map((s) => [s.type, s.words])).toEqual([
      ['sentence-end', ['He', 'walked', 'home.']],
      ['paragraph-end', ['She', 'left', 'the', 'house', 'quietly', 'today.']],
    ])
  })

  it('splits a long sentence evenly via the unchanged DP (11 words @ N=8 → [6,5])', () => {
    const text = 'The quick brown fox jumped over every lazy dog nearby today.'
    const stacks = buildStacks(text, 8, NO_RULES)
    expect(stacks.map((s) => s.words.length)).toEqual([6, 5])
  })

  it('splits a 17-word sentence into [6,6,5] @ N=8', () => {
    const text =
      'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen.'
    const stacks = buildStacks(text, 8, NO_RULES)
    expect(stacks.map((s) => s.words.length)).toEqual([6, 6, 5])
  })

  it('does not split after a title abbreviation (Mr.)', () => {
    const stacks = buildStacks('Mr. Smith went home.', 8, NO_RULES)
    expect(stacks.map((s) => s.words)).toEqual([['Mr.', 'Smith', 'went', 'home.']])
  })

  it('does not split after a latinism abbreviation (e.g.)', () => {
    const stacks = buildStacks('See e.g. the appendix now.', 8, NO_RULES)
    expect(stacks.map((s) => s.words)).toEqual([['See', 'e.g.', 'the', 'appendix', 'now.']])
  })

  it('does not split inside a dotted acronym (U.S.A.)', () => {
    const stacks = buildStacks('I saw the U.S.A. Then I left home.', 8, NO_RULES)
    expect(stacks.map((s) => s.words)).toEqual([
      ['I', 'saw', 'the', 'U.S.A.', 'Then', 'I', 'left', 'home.'],
    ])
  })

  it('does not split before a lowercase dialogue tag (he asked)', () => {
    const stacks = buildStacks('"Are you sure?" he asked. She left.', 8, NO_RULES)
    expect(stacks.map((s) => [s.type, s.words])).toEqual([
      ['sentence-end', ['"Are', 'you', 'sure?"', 'he', 'asked.']],
      ['paragraph-end', ['She', 'left.']],
    ])
  })

  it('still splits at a real boundary followed by a capital (home. She)', () => {
    const stacks = buildStacks('He walked home. She left.', 8, NO_RULES)
    expect(stacks.map((s) => [s.type, s.words])).toEqual([
      ['sentence-end', ['He', 'walked', 'home.']],
      ['paragraph-end', ['She', 'left.']],
    ])
  })

  it('gives a standalone short sentence its own one-beat Stack', () => {
    const text = 'The dog ran fast. He nodded. She left the house quietly.'
    const stacks = buildStacks(text, 8, NO_RULES)
    expect(stacks.map((s) => [s.type, s.words])).toEqual([
      ['sentence-end', ['The', 'dog', 'ran', 'fast.']],
      ['sentence-end', ['He', 'nodded.']],
      ['paragraph-end', ['She', 'left', 'the', 'house', 'quietly.']],
    ])
  })
})

describe('multiple rules enabled simultaneously', () => {
  it('applies enumerations + commas together', () => {
    const text = '1. Hello, world.'
    const stacks = buildStacks(text, 5, { ...NO_RULES, enumerations: true, commas: true })
    // Marker stays standalone (hard); the comma is now soft, so the short body
    // clause packs into one stack instead of stuttering.
    expect(stacks[0].words).toEqual(['1.'])
    const bodyStacks = stacks.slice(1)
    expect(bodyStacks.map((s) => s.words)).toEqual([['Hello,', 'world.']])
  })

  it('applies bullets + longWord together', () => {
    const text = `- ${LONG_WORD} end`
    const stacks = buildStacks(text, 5, { ...NO_RULES, bullets: true, longWord: true })
    expect(stacks[0].words).toEqual(['-'])
    // Long word starts its own chunk (chunk is empty when we reach it)
    const longChunk = stacks.find((s) => s.words[0] === LONG_WORD)
    expect(longChunk).toBeDefined()
  })

  it('applies names + commas together', () => {
    const text = 'John Smith, arrived quickly.'
    const stacks = buildStacks(text, 3, { ...NO_RULES, names: true, commas: true })
    // "John Smith," — "Smith," has a comma so it's not a pure name part; "John" alone won't form a group
    // The important thing: no empty chunks and all words present
    const all = allWords(stacks)
    expect(all).toContain('John')
    expect(all).toContain('Smith,')
    stacks.forEach((s) => expect(s.words.length).toBeGreaterThan(0))
  })

  it('applies all rules without producing empty chunks or duplicates', () => {
    const text = '1. John Smith arrived, quickly.\n\n- Another bullet point.'
    const stacks = buildStacks(text, 3, ALL_RULES)
    const all = allWords(stacks)
    stacks.forEach((s) => expect(s.words.length).toBeGreaterThan(0))
    // No duplicates — every word appears exactly as many times as in the source
    const sourceWords = text.replace(/\n+/g, ' ').trim().split(/\s+/).filter(Boolean)
    expect(all).toEqual(sourceWords)
  })
})

// ── 10. Edge cases ─────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('returns empty array for empty string', () => {
    expect(buildStacks('', 3)).toHaveLength(0)
  })

  it('returns empty array for whitespace-only input', () => {
    expect(buildStacks('   \n\n   \t  ', 3)).toHaveLength(0)
  })

  it('handles very short max chunk size (words_per_stack = 1)', () => {
    const text = 'Hello world foo.'
    const stacks = buildStacks(text, 1, NO_RULES)
    stacks.forEach((s) => expect(s.words.length).toBe(1))
    expect(allWords(stacks)).toEqual(['Hello', 'world', 'foo.'])
  })

  it('handles consecutive commas without producing empty chunks', () => {
    const text = 'a, b, c, d.'
    const stacks = buildStacks(text, 5, { ...NO_RULES, commas: true })
    stacks.forEach((s) => expect(s.words.length).toBeGreaterThan(0))
  })

  it('handles consecutive enumeration markers without empty chunks', () => {
    const text = '1. 2. 3.'
    const stacks = buildStacks(text, 3, { ...NO_RULES, enumerations: true })
    stacks.forEach((s) => expect(s.words.length).toBeGreaterThan(0))
  })

  it('handles consecutive bullet markers without empty chunks', () => {
    const text = '- * •'
    const stacks = buildStacks(text, 3, { ...NO_RULES, bullets: true })
    stacks.forEach((s) => expect(s.words.length).toBeGreaterThan(0))
  })

  it('handles a headline longer than words_per_stack gracefully', () => {
    const text = 'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG HERE NOW\n\nbody.'
    const stacks = buildStacks(text, 4, { ...NO_RULES, headlines: true })
    const headlineStacks = stacks.filter((s) => s.type === 'headline')
    expect(headlineStacks.length).toBeGreaterThan(1)
    headlineStacks.forEach((s) => expect(s.words.length).toBeLessThanOrEqual(4))
    // All headline words are accounted for
    const headlineWords = headlineStacks.flatMap((s) => s.words)
    expect(headlineWords).toEqual(
      'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG HERE NOW'.split(' ')
    )
  })

  it('handles a name longer than effectiveWPS without infinite looping', () => {
    // 8 names words with WPS=2 — exceeds limit, must fall back gracefully
    const text = 'Alpha Beta Gamma Delta Epsilon Zeta Eta Theta done.'
    const stacks = buildStacks(text, 2, { ...NO_RULES, names: true })
    stacks.forEach((s) => expect(s.words.length).toBeGreaterThan(0))
    expect(stacks[0].words).toEqual([
      'Alpha',
      'Beta',
      'Gamma',
      'Delta',
      'Epsilon',
      'Zeta',
      'Eta',
      'Theta',
    ])
    const all = allWords(stacks)
    const sourceWords = text.split(/\s+/)
    expect(all.length).toBe(sourceWords.length)
  })

  it('single word input returns one chunk', () => {
    const stacks = buildStacks('Hello', 3, NO_RULES)
    expect(stacks).toHaveLength(1)
    expect(stacks[0].words).toEqual(['Hello'])
  })

  it('long word at start of empty chunk is still emitted (not dropped)', () => {
    const text = LONG_WORD
    const stacks = buildStacks(text, 3, { ...NO_RULES, longWord: true })
    expect(stacks).toHaveLength(1)
    expect(stacks[0].words).toEqual([LONG_WORD])
  })
})
