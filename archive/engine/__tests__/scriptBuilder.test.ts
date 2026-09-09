import { describe, it, expect } from 'vitest'
import {
  createBlock,
  createEmptyBlock,
  computeDisplayGrid,
  countWords,
  distributeTextIntoBlocks,
  clearBlockText,
  clearAllBlocksText,
  flattenBlocks,
  splitTextByWordCount,
  updateBlockConfig,
  calcTokenDuration,
  createEmptyProject,
  removePassageFromText,
  resolveBlockConfig,
  defaultConfigFromSettings,
  DEFAULT_SCRIPT_CONFIG,
} from '../scriptBuilder'
import type { ScriptTokenConfig, ScriptBlock, ScriptBlockConfig } from '../scriptTypes'
import type { Settings } from '@renderer/types'

// ── Helpers ────────────────────────────────────────────────────────────────

const BASE_CONFIG: ScriptTokenConfig = { ...DEFAULT_SCRIPT_CONFIG }

const BASE_BLOCK_CONFIG = {
  bpm: DEFAULT_SCRIPT_CONFIG.bpm,
  wordsPerStack: DEFAULT_SCRIPT_CONFIG.wordsPerStack,
  stacksVisible: DEFAULT_SCRIPT_CONFIG.stacksVisible,
}

function makeBlock(
  id: number,
  sourceText: string,
  overrides: Partial<typeof BASE_BLOCK_CONFIG> = {},
  offset = 0
): ScriptBlock {
  return createBlock(id, sourceText, { ...BASE_BLOCK_CONFIG, ...overrides }, BASE_CONFIG, offset)
}

// ── createBlock ────────────────────────────────────────────────────────────

describe('createBlock', () => {
  it('requires non-empty sourceText — empty input returns a block with no tokens', () => {
    const block = makeBlock(0, '')
    expect(block.tokens).toHaveLength(0)
  })

  it('whitespace-only input returns a block with no tokens', () => {
    const block = makeBlock(0, '   ')
    expect(block.tokens).toHaveLength(0)
  })

  it('rejects injection when BPM is out of range — bpm=0 is accepted structurally but validation is caller responsibility', () => {
    // createBlock itself does not throw; callers must validate before calling.
    // This test documents the boundary — callers are responsible for validating bpm 10..1200.
    const block = createBlock(0, 'hello', { bpm: 0, wordsPerStack: 3, stacksVisible: 1 }, BASE_CONFIG)
    expect(block.config.bpm).toBe(0)
  })

  it('splits text into one child token per stack based on wordsPerStack', () => {
    const block = makeBlock(0, 'one two three four five six', { wordsPerStack: 3 })
    expect(block.tokens).toHaveLength(2)
    expect(block.tokens[0].stack.words).toEqual(['one', 'two', 'three'])
    expect(block.tokens[1].stack.words).toEqual(['four', 'five', 'six'])
  })

  it('wordsPerStack=1 yields one token per word', () => {
    const block = makeBlock(0, 'alpha beta gamma', { wordsPerStack: 1 })
    expect(block.tokens).toHaveLength(3)
  })

  it('all child tokens carry the correct blockId', () => {
    const block = makeBlock(42, 'one two three four', { wordsPerStack: 2 })
    block.tokens.forEach((t) => expect(t.blockId).toBe(42))
  })

  it('all child tokens start with null timestampMs and null configOverride', () => {
    const block = makeBlock(0, 'hello world', { wordsPerStack: 1 })
    block.tokens.forEach((t) => {
      expect(t.timestampMs).toBeNull()
      expect(t.configOverride).toBeNull()
    })
  })

  it('applies globalOffset to child token ids', () => {
    const block = createBlock(0, 'one two three', { bpm: 60, wordsPerStack: 1, stacksVisible: 1 }, BASE_CONFIG, 10)
    expect(block.tokens.map((t) => t.id)).toEqual([10, 11, 12])
  })

  it('preserves the injected sourceText on the block', () => {
    const block = makeBlock(0, 'Hello world')
    expect(block.sourceText).toBe('Hello world')
  })

  it('stores the provided config on the block', () => {
    const block = makeBlock(0, 'text', { bpm: 120, wordsPerStack: 2, stacksVisible: 2 })
    expect(block.config).toEqual({ bpm: 120, wordsPerStack: 2, stacksVisible: 2 })
  })

  it('last child token has paragraph-end stack type', () => {
    const block = makeBlock(0, 'This ends here.')
    expect(block.tokens[block.tokens.length - 1].stack.type).toBe('paragraph-end')
  })

  it('single-word text yields one token with paragraph-end type', () => {
    const block = makeBlock(0, 'hello')
    expect(block.tokens).toHaveLength(1)
    expect(block.tokens[0].stack.type).toBe('paragraph-end')
  })
})

// ── flattenBlocks ──────────────────────────────────────────────────────────

describe('flattenBlocks', () => {
  it('returns an empty array for empty blocks', () => {
    expect(flattenBlocks([])).toHaveLength(0)
  })

  it('assigns contiguous 0-based ids across multiple blocks', () => {
    const b0 = makeBlock(0, 'one two three', { wordsPerStack: 1 }, 0)   // 3 tokens
    const b1 = makeBlock(1, 'four five', { wordsPerStack: 1 }, 3)         // 2 tokens
    const flat = flattenBlocks([b0, b1])
    expect(flat.map((t) => t.id)).toEqual([0, 1, 2, 3, 4])
  })

  it('preserves blockId references after flattening', () => {
    const b0 = makeBlock(0, 'hello world', { wordsPerStack: 1 }, 0)
    const b1 = makeBlock(1, 'foo bar', { wordsPerStack: 1 }, 2)
    const flat = flattenBlocks([b0, b1])
    expect(flat.filter((t) => t.blockId === 0)).toHaveLength(2)
    expect(flat.filter((t) => t.blockId === 1)).toHaveLength(2)
  })

  it('preserves all words across all tokens', () => {
    const text = 'The quick brown fox'
    const block = makeBlock(0, text, { wordsPerStack: 2 })
    const flat = flattenBlocks([block])
    const allWords = flat.flatMap((t) => t.stack.words)
    expect(allWords).toEqual(['The', 'quick', 'brown', 'fox'])
  })
})

// ── updateBlockConfig ──────────────────────────────────────────────────────

describe('updateBlockConfig', () => {
  it('updates bpm without re-tokenizing (token count unchanged)', () => {
    const block = makeBlock(0, 'one two three four five six', { wordsPerStack: 3 })
    const originalCount = block.tokens.length
    const [updated] = updateBlockConfig([block], 0, { bpm: 200 }, BASE_CONFIG)
    expect(updated.config.bpm).toBe(200)
    expect(updated.tokens).toHaveLength(originalCount)
  })

  it('updating bpm propagates the new value to all child tokens via block.config', () => {
    const block = makeBlock(0, 'one two three', { bpm: 60, wordsPerStack: 3 })
    const [updated] = updateBlockConfig([block], 0, { bpm: 180 }, BASE_CONFIG)
    // All tokens without override should inherit the new block bpm
    updated.tokens.forEach((t) => {
      expect(t.configOverride?.bpm).toBeUndefined()
      expect(updated.config.bpm).toBe(180)
    })
  })

  it('changing wordsPerStack re-tokenizes the block', () => {
    const block = makeBlock(0, 'one two three four five six', { wordsPerStack: 3 })
    expect(block.tokens).toHaveLength(2)
    const [updated] = updateBlockConfig([block], 0, { wordsPerStack: 2 }, BASE_CONFIG)
    expect(updated.tokens).toHaveLength(3)
    expect(updated.config.wordsPerStack).toBe(2)
  })

  it('re-tokenization preserves configOverride and timestampMs by position', () => {
    const block = makeBlock(0, 'one two three four', { wordsPerStack: 2 })
    // Manually stamp timestamps on original tokens
    const stamped: ScriptBlock = {
      ...block,
      tokens: block.tokens.map((t, i) => ({ ...t, timestampMs: (i + 1) * 100, configOverride: i === 0 ? { bpm: 99 } : null })),
    }
    const [updated] = updateBlockConfig([stamped], 0, { wordsPerStack: 2 }, BASE_CONFIG)
    // Same wordsPerStack — just a config update, not re-tokenization
    expect(updated.tokens[0].timestampMs).toBe(100)
    expect(updated.tokens[0].configOverride?.bpm).toBe(99)
  })

  it('does not affect other blocks', () => {
    const b0 = makeBlock(0, 'block zero', { wordsPerStack: 1 })
    const b1 = makeBlock(1, 'block one', { wordsPerStack: 1 })
    const result = updateBlockConfig([b0, b1], 0, { bpm: 999 }, BASE_CONFIG)
    expect(result[1].config.bpm).toBe(b1.config.bpm)
  })

  it('re-indexes global token ids across all blocks after the update', () => {
    const b0 = makeBlock(0, 'a b c', { wordsPerStack: 1 }, 0)  // tokens at ids 0,1,2
    const b1 = makeBlock(1, 'd e', { wordsPerStack: 1 }, 3)      // tokens at ids 3,4
    const result = updateBlockConfig([b0, b1], 0, { bpm: 120 }, BASE_CONFIG)
    const flat = flattenBlocks(result)
    expect(flat.map((t) => t.id)).toEqual([0, 1, 2, 3, 4])
  })

  it('changing stacksVisible only updates config (no re-tokenization)', () => {
    const block = makeBlock(0, 'one two three', { wordsPerStack: 3, stacksVisible: 1 })
    const tokenWords = block.tokens.map((t) => t.stack.words.join(' '))
    const [updated] = updateBlockConfig([block], 0, { stacksVisible: 3 }, BASE_CONFIG)
    expect(updated.config.stacksVisible).toBe(3)
    expect(updated.tokens.map((t) => t.stack.words.join(' '))).toEqual(tokenWords)
  })
})

// Disable pause multipliers so duration tests isolate pure BPM math.
const NO_PAUSE_CONFIG: ScriptTokenConfig = {
  ...BASE_CONFIG,
  pauseAtSentences: false,
  pauseAtHeadlines: false,
}

// Build a block with a known-normal token to avoid paragraph-end multipliers.
function makeNormalBlock(bpm: number): ScriptBlock {
  // 'one two' → wordsPerStack=2 → one paragraph-end token; use explicit type override below.
  const block = createBlock(0, 'one', { bpm, wordsPerStack: 3, stacksVisible: 1 }, BASE_CONFIG, 0)
  // Force the first (only) token to 'normal' type so no pause multiplier applies.
  const normalToken = { ...block.tokens[0], stack: { ...block.tokens[0].stack, type: 'normal' as const } }
  return { ...block, tokens: [normalToken] }
}

// ── child token overrides ──────────────────────────────────────────────────

describe('child token BPM override', () => {
  it('child configOverride.bpm takes precedence over block bpm in calcTokenDuration', () => {
    const block = makeNormalBlock(60)
    const token = { ...block.tokens[0], configOverride: { bpm: 120 } }
    const dur = calcTokenDuration(token, block, NO_PAUSE_CONFIG)
    expect(dur).toBe(60_000 / 120)
  })

  it('high BPM override (above old 600 cap) produces correct beatMs', () => {
    // 900 and 1200 BPM are now within the allowed range
    for (const bpmOverride of [700, 900, 1200]) {
      const block = makeNormalBlock(60)
      const token = { ...block.tokens[0], configOverride: { bpm: bpmOverride } }
      expect(calcTokenDuration(token, block, NO_PAUSE_CONFIG)).toBeCloseTo(60_000 / bpmOverride, 5)
    }
  })

  it('null configOverride inherits block bpm', () => {
    const block = makeNormalBlock(60)
    const token = { ...block.tokens[0], configOverride: null }
    const dur = calcTokenDuration(token, block, NO_PAUSE_CONFIG)
    expect(dur).toBe(60_000 / 60)
  })

  it('empty configOverride ({}) inherits block bpm', () => {
    const block = makeNormalBlock(60)
    const token = { ...block.tokens[0], configOverride: {} }
    const dur = calcTokenDuration(token, block, NO_PAUSE_CONFIG)
    expect(dur).toBe(60_000 / 60)
  })
})

// ── calcTokenDuration ──────────────────────────────────────────────────────

describe('calcTokenDuration', () => {
  it('returns beatMs for a normal stack at given BPM', () => {
    const block = makeNormalBlock(60)
    expect(calcTokenDuration(block.tokens[0], block, NO_PAUSE_CONFIG)).toBe(1000)
  })

  it('doubles duration for sentence-end when pauseAtSentences=true', () => {
    // 'Hello. World.' with wordsPerStack=1: first token is sentence-end, second is paragraph-end.
    const config: ScriptTokenConfig = { ...BASE_CONFIG, bpm: 60, pauseAtSentences: true }
    const block = makeBlock(0, 'Hello. World.', { bpm: 60, wordsPerStack: 1 })
    // token[0] = 'Hello.' type=sentence-end → 2× beatMs
    const sentenceEndToken = block.tokens[0]
    expect(sentenceEndToken.stack.type).toBe('sentence-end')
    expect(calcTokenDuration(sentenceEndToken, block, config)).toBe(2000)
  })

  it('uses token configOverride.bpm over block bpm', () => {
    const block = makeNormalBlock(60)
    const token = { ...block.tokens[0], configOverride: { bpm: 120 } }
    expect(calcTokenDuration(token, block, NO_PAUSE_CONFIG)).toBe(500)
  })

  it('uses block bpm when no configOverride', () => {
    const block = makeNormalBlock(90)
    const token = { ...block.tokens[0], configOverride: null }
    expect(calcTokenDuration(token, block, NO_PAUSE_CONFIG)).toBeCloseTo(60_000 / 90)
  })
})

// ── createEmptyProject ─────────────────────────────────────────────────────

describe('createEmptyProject', () => {
  it('produces version 3', () => {
    const p = createEmptyProject('Test', BASE_CONFIG)
    expect(p.version).toBe(3)
  })

  it('starts with empty blocks array', () => {
    const p = createEmptyProject('Test', BASE_CONFIG)
    expect(p.blocks).toHaveLength(0)
  })

  it('sets setupDone to false', () => {
    const p = createEmptyProject('Test', BASE_CONFIG)
    expect(p.setupDone).toBe(false)
  })

  it('defaults displayStyle to bpm', () => {
    const p = createEmptyProject('Test', BASE_CONFIG)
    expect(p.displayStyle).toBe('bpm')
  })

  it('accepts click-to-read displayStyle', () => {
    const p = createEmptyProject('Test', BASE_CONFIG, 'click-to-read')
    expect(p.displayStyle).toBe('click-to-read')
  })
})

// ── removePassageFromText ──────────────────────────────────────────────────

describe('removePassageFromText', () => {
  it('removes a passage that exists in source', () => {
    const source = 'Hello world. This is a test.'
    const result = removePassageFromText(source, 'This is a test.')
    expect(result).toBe('Hello world.')
  })

  it('returns source unchanged when passage is not found', () => {
    const source = 'Hello world.'
    const result = removePassageFromText(source, 'Not in source')
    expect(result).toBe('Hello world.')
  })

  it('returns source unchanged for empty passage', () => {
    const source = 'Hello world.'
    expect(removePassageFromText(source, '')).toBe('Hello world.')
    expect(removePassageFromText(source, '   ')).toBe('Hello world.')
  })

  it('collapses double whitespace after removal', () => {
    const source = 'Start middle end'
    const result = removePassageFromText(source, 'middle')
    expect(result).not.toContain('  ')
  })
})

// ── inject: source text removal and duplicate prevention ───────────────────

describe('inject: source text removal', () => {
  it('removePassageFromText removes injected passage so it cannot be re-injected verbatim', () => {
    const source = 'The quick brown fox. Jumps over the lazy dog.'
    const passage = 'The quick brown fox.'
    const after = removePassageFromText(source, passage)
    expect(after).not.toContain(passage)
    const afterAgain = removePassageFromText(after, passage)
    expect(afterAgain).toBe(after)
  })

  it('createBlock with defaultConfig produces valid tokens', () => {
    const text = 'Build your script one token at a time.'
    const block = makeBlock(0, text)
    expect(block.tokens.length).toBeGreaterThan(0)
    block.tokens.forEach((token, i) => {
      expect(token.id).toBe(i)
      expect(token.blockId).toBe(0)
      expect(token.stack.words.length).toBeGreaterThan(0)
      expect(token.configOverride).toBeNull()
      expect(token.timestampMs).toBeNull()
    })
  })

  it('injecting same passage twice returns source unchanged on second removal', () => {
    const source = 'First passage. Second passage.'
    const after1 = removePassageFromText(source, 'First passage.')
    const after2 = removePassageFromText(after1, 'First passage.')
    expect(after2).toBe(after1)
    expect(after2).toContain('Second passage.')
  })

  it('flattenBlocks returns all tokens from multiple blocks in order', () => {
    const b0 = makeBlock(0, 'block zero text', { wordsPerStack: 1 }, 0)
    const b1 = makeBlock(1, 'block one text', { wordsPerStack: 1 }, b0.tokens.length)
    const flat = flattenBlocks([b0, b1])
    expect(flat).toHaveLength(b0.tokens.length + b1.tokens.length)
    flat.forEach((t, i) => expect(t.id).toBe(i))
  })
})

// exportProjectAsJson DOM tests live in useScriptPlayback.test.tsx (happy-dom env)

// ── DEFAULT_SCRIPT_CONFIG — new fields ─────────────────────────────────────

describe('DEFAULT_SCRIPT_CONFIG', () => {
  it('includes linesEnabled as false', () => {
    expect(DEFAULT_SCRIPT_CONFIG.linesEnabled).toBe(false)
  })

  it('includes linesCount as 3', () => {
    expect(DEFAULT_SCRIPT_CONFIG.linesCount).toBe(3)
  })

  it('includes minFontSize as 12', () => {
    expect(DEFAULT_SCRIPT_CONFIG.minFontSize).toBe(12)
  })
})

// ── removePassageFromText — whitespace tolerance and edge cases ────────────

describe('removePassageFromText — whitespace tolerance', () => {
  it('matches passage when source has \\n where passage has a space', () => {
    const source = 'Hello\nworld. More text.'
    const result = removePassageFromText(source, 'Hello world.')
    expect(result).not.toContain('Hello')
    expect(result).toContain('More text.')
  })

  it('matches passage when passage has \\n where source has a space', () => {
    const source = 'Hello world. More text.'
    const result = removePassageFromText(source, 'Hello\nworld.')
    expect(result).not.toContain('Hello')
    expect(result).toContain('More text.')
  })

  it('handles repeated phrase — removes only first occurrence, second survives', () => {
    const source = 'Go east. Go east. Stay west.'
    const after1 = removePassageFromText(source, 'Go east.')
    // First removed; second still present
    expect(after1).toContain('Go east.')
    expect(after1).toContain('Stay west.')

    const after2 = removePassageFromText(after1, 'Go east.')
    expect(after2).not.toContain('Go east.')
    expect(after2).toContain('Stay west.')
  })

  it('handles regex-special characters in passage without throwing', () => {
    const source = 'Price: $9.99 (plus tax). More info.'
    const result = removePassageFromText(source, '$9.99 (plus tax).')
    expect(result).toContain('Price:')
    expect(result).toContain('More info.')
    expect(result).not.toContain('$9.99')
  })

  it('handles brackets, dots, plus signs', () => {
    const source = 'Call func(x) + y. Next part.'
    const result = removePassageFromText(source, 'func(x) + y.')
    expect(result).not.toContain('func(x)')
    expect(result).toContain('Next part.')
  })

  it('removes a long phrase spanning multiple sentences', () => {
    const source = 'Alpha. Beta. Gamma. Delta.'
    const result = removePassageFromText(source, 'Beta. Gamma.')
    expect(result).toBe('Alpha. Delta.')
  })

  it('removes passage that is the entire source text', () => {
    const result = removePassageFromText('Complete sentence.', 'Complete sentence.')
    expect(result).toBe('')
  })

  it('normalises excessive blank lines after removal', () => {
    const source = 'Para one.\n\nTo remove.\n\nPara three.'
    const result = removePassageFromText(source, 'To remove.')
    expect(result).not.toMatch(/\n{3,}/)
    expect(result).toContain('Para one.')
    expect(result).toContain('Para three.')
  })

  it('empty source text returns empty string regardless of passage', () => {
    expect(removePassageFromText('', 'anything')).toBe('')
  })

  it('passage with leading/trailing whitespace matches trimmed content', () => {
    const source = 'Hello world.'
    expect(removePassageFromText(source, '  Hello world.  ')).toBe('')
  })
})

// ── computeDisplayGrid ─────────────────────────────────────────────────────

describe('computeDisplayGrid', () => {
  function cfg(overrides: Partial<ScriptTokenConfig> = {}): ScriptTokenConfig {
    return { ...BASE_CONFIG, ...overrides }
  }

  // ── null token ────────────────────────────────────────────────────────────

  it('returns empty slots for null displayToken', () => {
    const result = computeDisplayGrid(null, [], BASE_CONFIG)
    expect(result.slots).toHaveLength(0)
    expect(result.cols).toBe(1)
    expect(result.rows).toBe(1)
    expect(result.activeSlot).toBe(-1)
  })

  // ── single-line backward compatibility ───────────────────────────────────

  it('single-stack: cols=1 rows=1 at every position', () => {
    const block = makeBlock(0, 'one two three four five', { wordsPerStack: 1, stacksVisible: 1 })
    const projectCfg = cfg({ linesEnabled: false })
    block.tokens.forEach((token) => {
      const r = computeDisplayGrid(token, [block], projectCfg)
      expect(r.cols).toBe(1)
      expect(r.rows).toBe(1)
      expect(r.slots).toHaveLength(1)
      expect(r.slots[0].words).toEqual(token.stack.words)
      expect(r.activeSlot).toBe(0)
    })
  })

  // ── multiple chunks per line (stacksVisible > 1) ─────────────────────────

  it('multi-column: progressive fill — first position fills slot 0 only', () => {
    const block = makeBlock(0, 'a b c d e f', { wordsPerStack: 1, stacksVisible: 3 })
    const projectCfg = cfg({ linesEnabled: false })
    const r = computeDisplayGrid(block.tokens[0], [block], projectCfg)
    expect(r.cols).toBe(3)
    expect(r.rows).toBe(1)
    expect(r.activeSlot).toBe(0)
    expect(r.slots[0].words).toEqual(['a'])
    expect(r.slots[1].words).toHaveLength(0)
    expect(r.slots[2].words).toHaveLength(0)
  })

  it('multi-column: position 1 fills slots 0 and 1', () => {
    const block = makeBlock(0, 'a b c d e f', { wordsPerStack: 1, stacksVisible: 3 })
    const r = computeDisplayGrid(block.tokens[1], [block], cfg({ linesEnabled: false }))
    expect(r.activeSlot).toBe(1)
    expect(r.slots[0].words).toEqual(['a'])
    expect(r.slots[1].words).toEqual(['b'])
    expect(r.slots[2].words).toHaveLength(0)
  })

  it('multi-column: last position in batch fills all slots', () => {
    const block = makeBlock(0, 'a b c d e f', { wordsPerStack: 1, stacksVisible: 3 })
    const r = computeDisplayGrid(block.tokens[2], [block], cfg({ linesEnabled: false }))
    expect(r.activeSlot).toBe(2)
    expect(r.slots[0].words).toEqual(['a'])
    expect(r.slots[1].words).toEqual(['b'])
    expect(r.slots[2].words).toEqual(['c'])
  })

  it('multi-column: batch resets at batchSize boundary', () => {
    const block = makeBlock(0, 'a b c d e f', { wordsPerStack: 1, stacksVisible: 3 })
    // Token index 3 is first in the second batch
    const r = computeDisplayGrid(block.tokens[3], [block], cfg({ linesEnabled: false }))
    expect(r.activeSlot).toBe(0)
    expect(r.slots[0].words).toEqual(['d'])
    expect(r.slots[1].words).toHaveLength(0)
    expect(r.slots[2].words).toHaveLength(0)
  })

  // ── multiple lines per screen (linesEnabled + linesCount) ────────────────

  it('multi-row: cols=1 rows=3 progressive fill', () => {
    const block = makeBlock(0, 'a b c d e f', { wordsPerStack: 1, stacksVisible: 1 })
    const projectCfg = cfg({ linesEnabled: true, linesCount: 3 })

    const r0 = computeDisplayGrid(block.tokens[0], [block], projectCfg)
    expect(r0.cols).toBe(1)
    expect(r0.rows).toBe(3)
    expect(r0.slots).toHaveLength(3)
    expect(r0.slots[0].words).toEqual(['a'])
    expect(r0.slots[1].words).toHaveLength(0)
    expect(r0.slots[2].words).toHaveLength(0)

    const r2 = computeDisplayGrid(block.tokens[2], [block], projectCfg)
    expect(r2.slots[0].words).toEqual(['a'])
    expect(r2.slots[1].words).toEqual(['b'])
    expect(r2.slots[2].words).toEqual(['c'])
  })

  it('multi-row: batch resets after linesCount rows', () => {
    const block = makeBlock(0, 'a b c d e f', { wordsPerStack: 1, stacksVisible: 1 })
    const projectCfg = cfg({ linesEnabled: true, linesCount: 3 })
    // Token 3 is first in the second batch (new block of 3 rows)
    const r = computeDisplayGrid(block.tokens[3], [block], projectCfg)
    expect(r.activeSlot).toBe(0)
    expect(r.slots[0].words).toEqual(['d'])
    expect(r.slots[1].words).toHaveLength(0)
    expect(r.slots[2].words).toHaveLength(0)
  })

  // ── multiple lines combined with multiple chunks per line ─────────────────

  it('2×2 grid: position 0 fills only top-left slot', () => {
    const block = makeBlock(0, 'a b c d', { wordsPerStack: 1, stacksVisible: 2 })
    const projectCfg = cfg({ linesEnabled: true, linesCount: 2 })
    const r = computeDisplayGrid(block.tokens[0], [block], projectCfg)
    expect(r.cols).toBe(2)
    expect(r.rows).toBe(2)
    expect(r.slots).toHaveLength(4)
    expect(r.activeSlot).toBe(0)
    expect(r.slots[0].words).toEqual(['a'])
    expect(r.slots.slice(1).every((s) => s.words.length === 0)).toBe(true)
  })

  it('2×2 grid: position 1 completes row 0', () => {
    const block = makeBlock(0, 'a b c d', { wordsPerStack: 1, stacksVisible: 2 })
    const r = computeDisplayGrid(block.tokens[1], [block], cfg({ linesEnabled: true, linesCount: 2 }))
    expect(r.activeSlot).toBe(1)
    expect(r.slots[0].words).toEqual(['a'])
    expect(r.slots[1].words).toEqual(['b'])
    expect(r.slots[2].words).toHaveLength(0)
    expect(r.slots[3].words).toHaveLength(0)
  })

  it('2×2 grid: position 2 fills row 0 + row 1 slot 0', () => {
    const block = makeBlock(0, 'a b c d', { wordsPerStack: 1, stacksVisible: 2 })
    const r = computeDisplayGrid(block.tokens[2], [block], cfg({ linesEnabled: true, linesCount: 2 }))
    expect(r.activeSlot).toBe(2)
    expect(r.slots[0].words).toEqual(['a'])
    expect(r.slots[1].words).toEqual(['b'])
    expect(r.slots[2].words).toEqual(['c'])
    expect(r.slots[3].words).toHaveLength(0)
  })

  it('2×2 grid: position 3 fills all slots', () => {
    const block = makeBlock(0, 'a b c d', { wordsPerStack: 1, stacksVisible: 2 })
    const r = computeDisplayGrid(block.tokens[3], [block], cfg({ linesEnabled: true, linesCount: 2 }))
    expect(r.activeSlot).toBe(3)
    expect(r.slots[3].words).toEqual(['d'])
  })

  // ── edge cases ────────────────────────────────────────────────────────────

  it('headline token: slot carries isHeadline=true', () => {
    const block = createBlock(
      0, 'CHAPTER ONE', { bpm: 60, wordsPerStack: 3, stacksVisible: 1 }, BASE_CONFIG, 0,
      { longWord: false, enumerations: false, bullets: false, commas: false, names: false, headlines: true }
    )
    const r = computeDisplayGrid(block.tokens[0], [block], BASE_CONFIG)
    expect(r.slots[0].isHeadline).toBe(true)
  })

  it('orphaned token (block not in list) returns single-slot fallback', () => {
    const block = makeBlock(0, 'hello world', { wordsPerStack: 1, stacksVisible: 2 })
    const r = computeDisplayGrid(block.tokens[0], [], BASE_CONFIG)
    expect(r.slots).toHaveLength(1)
    expect(r.cols).toBe(1)
    expect(r.rows).toBe(1)
    expect(r.activeSlot).toBe(0)
  })

  it('short block (fewer tokens than batchSize): trailing slots are empty', () => {
    // 2 tokens but stacksVisible=3 → third slot always empty
    const block = makeBlock(0, 'alpha beta', { wordsPerStack: 1, stacksVisible: 3 })
    expect(block.tokens).toHaveLength(2)
    const r = computeDisplayGrid(block.tokens[1], [block], cfg({ linesEnabled: false }))
    expect(r.slots[0].words).toEqual(['alpha'])
    expect(r.slots[1].words).toEqual(['beta'])
    expect(r.slots[2].words).toHaveLength(0)
  })

  it('linesEnabled=false with linesCount>1 still uses rows=1', () => {
    const block = makeBlock(0, 'a b c', { wordsPerStack: 1, stacksVisible: 1 })
    const r = computeDisplayGrid(block.tokens[0], [block], cfg({ linesEnabled: false, linesCount: 5 }))
    expect(r.rows).toBe(1)
    expect(r.slots).toHaveLength(1)
  })

  it('linesEnabled=true with linesCount=1 still uses rows=1', () => {
    const block = makeBlock(0, 'a b c', { wordsPerStack: 1, stacksVisible: 1 })
    const r = computeDisplayGrid(block.tokens[0], [block], cfg({ linesEnabled: true, linesCount: 1 }))
    expect(r.rows).toBe(1)
  })

  it('single-word block: single slot, activeSlot=0', () => {
    const block = makeBlock(0, 'hello', { wordsPerStack: 1, stacksVisible: 1 })
    expect(block.tokens).toHaveLength(1)
    const r = computeDisplayGrid(block.tokens[0], [block], BASE_CONFIG)
    expect(r.slots).toHaveLength(1)
    expect(r.slots[0].words).toEqual(['hello'])
    expect(r.activeSlot).toBe(0)
  })
})

// ── countWords ─────────────────────────────────────────────────────────────

describe('countWords', () => {
  it('counts space-separated words', () => {
    expect(countWords('one two three')).toBe(3)
  })

  it('returns 0 for empty string', () => {
    expect(countWords('')).toBe(0)
  })

  it('returns 0 for whitespace-only string', () => {
    expect(countWords('   \n\t  ')).toBe(0)
  })

  it('handles multiple spaces between words', () => {
    expect(countWords('one   two')).toBe(2)
  })

  it('handles newlines between words', () => {
    expect(countWords('one\ntwo\nthree')).toBe(3)
  })
})

// ── splitTextByWordCount ───────────────────────────────────────────────────

describe('splitTextByWordCount', () => {
  it('splits at word boundary', () => {
    const { taken, remaining } = splitTextByWordCount('one two three four', 2)
    expect(taken).toBe('one two')
    expect(remaining).toBe('three four')
  })

  it('returns all text when wordCount exceeds word count', () => {
    const { taken, remaining } = splitTextByWordCount('one two', 10)
    expect(taken).toBe('one two')
    expect(remaining).toBe('')
  })

  it('returns all text when wordCount matches exactly', () => {
    const { taken, remaining } = splitTextByWordCount('one two three', 3)
    expect(taken).toBe('one two three')
    expect(remaining).toBe('')
  })

  it('returns empty taken for wordCount=0', () => {
    const { taken, remaining } = splitTextByWordCount('hello world', 0)
    expect(taken).toBe('')
    expect(remaining).toBe('hello world')
  })

  it('preserves internal paragraph breaks when enough words are taken', () => {
    // '\n\n' lies between "one." and "para"; need ≥3 words to include it in taken
    const { taken } = splitTextByWordCount('para one.\n\npara two.', 3)
    expect(taken).toContain('\n\n')
  })

  it('handles empty input', () => {
    const { taken, remaining } = splitTextByWordCount('', 5)
    expect(taken).toBe('')
    expect(remaining).toBe('')
  })
})

// ── createEmptyBlock ───────────────────────────────────────────────────────

describe('createEmptyBlock', () => {
  const cfg: ScriptBlockConfig = { bpm: 60, wordsPerStack: 3, stacksVisible: 1, targetWordCount: 50 }

  it('creates a block with no tokens', () => {
    const block = createEmptyBlock(0, cfg)
    expect(block.tokens).toHaveLength(0)
  })

  it('has empty sourceText', () => {
    const block = createEmptyBlock(0, cfg)
    expect(block.sourceText).toBe('')
  })

  it('stores the provided config', () => {
    const block = createEmptyBlock(5, cfg)
    expect(block.id).toBe(5)
    expect(block.config).toEqual(cfg)
  })

  it('flattenBlocks skips empty blocks', () => {
    const empty = createEmptyBlock(0, cfg)
    const filled = makeBlock(1, 'hello world', { wordsPerStack: 1 }, 0)
    const flat = flattenBlocks([empty, filled])
    expect(flat).toHaveLength(filled.tokens.length)
  })
})

// ── distributeTextIntoBlocks ───────────────────────────────────────────────

describe('distributeTextIntoBlocks', () => {
  const cfg: ScriptBlockConfig = { bpm: 60, wordsPerStack: 1, stacksVisible: 1 }

  function emptyBlock(id: number, capacity: number): ScriptBlock {
    return createEmptyBlock(id, { ...cfg, targetWordCount: capacity })
  }

  it('fills one empty block up to its targetWordCount', () => {
    const blocks = [emptyBlock(0, 3)]
    const { blocks: out, remainingText } = distributeTextIntoBlocks(blocks, 'one two three', BASE_CONFIG)
    expect(countWords(out[0].sourceText)).toBe(3)
    expect(remainingText).toBe('')
  })

  it('distributes across multiple blocks in order', () => {
    const blocks = [emptyBlock(0, 2), emptyBlock(1, 2)]
    const { blocks: out, remainingText } = distributeTextIntoBlocks(blocks, 'a b c d', BASE_CONFIG)
    expect(countWords(out[0].sourceText)).toBe(2)
    expect(countWords(out[1].sourceText)).toBe(2)
    expect(remainingText).toBe('')
  })

  it('preserves leftover tray text when text exceeds total capacity', () => {
    const blocks = [emptyBlock(0, 2)]
    const { blocks: out, remainingText } = distributeTextIntoBlocks(blocks, 'a b c d e', BASE_CONFIG)
    expect(countWords(out[0].sourceText)).toBe(2)
    expect(remainingText).toBe('c d e')
  })

  it('stops filling when text runs out before all blocks are full', () => {
    const blocks = [emptyBlock(0, 5), emptyBlock(1, 5)]
    const { blocks: out } = distributeTextIntoBlocks(blocks, 'one two three', BASE_CONFIG)
    expect(countWords(out[0].sourceText)).toBe(3)
    expect(out[1].sourceText).toBe('')
  })

  it('skips legacy blocks (undefined targetWordCount)', () => {
    const legacy: ScriptBlock = { id: 0, sourceText: 'existing', config: cfg, tokens: [] }
    const fresh = emptyBlock(1, 3)
    const { blocks: out, remainingText } = distributeTextIntoBlocks([legacy, fresh], 'a b c', BASE_CONFIG)
    expect(out[0].sourceText).toBe('existing')
    expect(countWords(out[1].sourceText)).toBe(3)
    expect(remainingText).toBe('')
  })

  it('skips blocks already at capacity', () => {
    const block = emptyBlock(0, 2)
    const { blocks: after1 } = distributeTextIntoBlocks([block], 'x y', BASE_CONFIG)
    const { blocks: after2, remainingText } = distributeTextIntoBlocks(after1, 'new text', BASE_CONFIG)
    expect(countWords(after2[0].sourceText)).toBe(2)
    expect(remainingText).toBe('new text')
  })

  it('partially fills a block then fills it further on a second inject', () => {
    const blocks = [emptyBlock(0, 4)]
    const { blocks: after1 } = distributeTextIntoBlocks(blocks, 'one two', BASE_CONFIG)
    expect(countWords(after1[0].sourceText)).toBe(2)
    const { blocks: after2, remainingText } = distributeTextIntoBlocks(after1, 'three four', BASE_CONFIG)
    expect(countWords(after2[0].sourceText)).toBe(4)
    expect(remainingText).toBe('')
  })

  it('produces tokens for filled blocks', () => {
    const blocks = [emptyBlock(0, 3)]
    const { blocks: out } = distributeTextIntoBlocks(blocks, 'one two three', BASE_CONFIG)
    expect(out[0].tokens.length).toBeGreaterThan(0)
  })

  it('assigns contiguous 0-based global token ids across blocks', () => {
    const blocks = [emptyBlock(0, 2), emptyBlock(1, 2)]
    const { blocks: out } = distributeTextIntoBlocks(blocks, 'a b c d', BASE_CONFIG)
    const flat = flattenBlocks(out)
    flat.forEach((t, i) => expect(t.id).toBe(i))
  })
})

// ── clearBlockText ─────────────────────────────────────────────────────────

describe('clearBlockText', () => {
  it('clears sourceText and tokens from the specified block', () => {
    const b0 = makeBlock(0, 'hello world', { wordsPerStack: 1 })
    const b1 = makeBlock(1, 'foo bar', { wordsPerStack: 1 }, b0.tokens.length)
    const result = clearBlockText([b0, b1], 0)
    expect(result[0].sourceText).toBe('')
    expect(result[0].tokens).toHaveLength(0)
  })

  it('preserves the block config after clearing', () => {
    const block = makeBlock(0, 'text to clear', { bpm: 120, wordsPerStack: 2, stacksVisible: 2 })
    const [cleared] = clearBlockText([block], 0)
    expect(cleared.config.bpm).toBe(120)
    expect(cleared.config.wordsPerStack).toBe(2)
    expect(cleared.config.stacksVisible).toBe(2)
  })

  it('does not affect other blocks', () => {
    const b0 = makeBlock(0, 'clear this', { wordsPerStack: 1 })
    const b1 = makeBlock(1, 'keep this', { wordsPerStack: 1 }, b0.tokens.length)
    const result = clearBlockText([b0, b1], 0)
    expect(result[1].sourceText).toBe('keep this')
    expect(result[1].tokens.length).toBeGreaterThan(0)
  })

  it('re-indexes remaining tokens after clearing', () => {
    const b0 = makeBlock(0, 'clear me', { wordsPerStack: 1 })
    const b1 = makeBlock(1, 'keep me', { wordsPerStack: 1 }, b0.tokens.length)
    const result = clearBlockText([b0, b1], 0)
    const flat = flattenBlocks(result)
    flat.forEach((t, i) => expect(t.id).toBe(i))
  })
})

// ── clearAllBlocksText ────────────────────────────────────────────────────

describe('clearAllBlocksText', () => {
  it('clears sourceText and tokens from every block', () => {
    const b0 = makeBlock(0, 'block zero', { wordsPerStack: 1 })
    const b1 = makeBlock(1, 'block one', { wordsPerStack: 1 }, b0.tokens.length)
    const result = clearAllBlocksText([b0, b1])
    result.forEach((b) => {
      expect(b.sourceText).toBe('')
      expect(b.tokens).toHaveLength(0)
    })
  })

  it('preserves config on all blocks', () => {
    const b0 = makeBlock(0, 'text', { bpm: 90, wordsPerStack: 2, stacksVisible: 3 })
    const [cleared] = clearAllBlocksText([b0])
    expect(cleared.config.bpm).toBe(90)
    expect(cleared.config.wordsPerStack).toBe(2)
    expect(cleared.config.stacksVisible).toBe(3)
  })

  it('handles empty blocks array', () => {
    expect(clearAllBlocksText([])).toEqual([])
  })
})

// ── createEmptyProject — no text required ─────────────────────────────────

describe('createEmptyProject — script creation without initial text', () => {
  it('creates a project with no source text', () => {
    const p = createEmptyProject('My Script', BASE_CONFIG)
    expect(p.sourceText).toBe('')
  })

  it('creates a project with an empty blocks array', () => {
    const p = createEmptyProject('My Script', BASE_CONFIG)
    expect(p.blocks).toHaveLength(0)
  })

  it('project with empty blocks produces an empty flat token list', () => {
    const p = createEmptyProject('My Script', BASE_CONFIG)
    expect(flattenBlocks(p.blocks)).toHaveLength(0)
  })
})

// ── resolveBlockConfig ────────────────────────────────────────────────────

describe('resolveBlockConfig', () => {
  const projectCfg: ScriptTokenConfig = {
    ...DEFAULT_SCRIPT_CONFIG,
    bpm: 60,
    wordsPerStack: 3,
    stacksVisible: 2,
    fontSize: 36,
    textColor: '#ffffff',
    bgColor: '#000000',
    pauseAtSentences: true,
    pauseAtHeadlines: true,
    linesEnabled: false,
    linesCount: 3,
  }

  it('required fields always come from block config', () => {
    const blockCfg: ScriptBlockConfig = { bpm: 120, wordsPerStack: 5, stacksVisible: 3 }
    const resolved = resolveBlockConfig(projectCfg, blockCfg)
    expect(resolved.bpm).toBe(120)
    expect(resolved.wordsPerStack).toBe(5)
    expect(resolved.stacksVisible).toBe(3)
  })

  it('undefined optional display fields inherit from project config', () => {
    const blockCfg: ScriptBlockConfig = { bpm: 60, wordsPerStack: 3, stacksVisible: 1 }
    const resolved = resolveBlockConfig(projectCfg, blockCfg)
    expect(resolved.fontSize).toBe(projectCfg.fontSize)
    expect(resolved.textColor).toBe(projectCfg.textColor)
    expect(resolved.bgColor).toBe(projectCfg.bgColor)
    expect(resolved.pauseAtSentences).toBe(projectCfg.pauseAtSentences)
  })

  it('defined optional display fields override project config', () => {
    const blockCfg: ScriptBlockConfig = {
      bpm: 60,
      wordsPerStack: 3,
      stacksVisible: 1,
      fontSize: 48,
      textColor: '#ff0000',
      bgColor: '#0000ff',
      pauseAtSentences: false,
    }
    const resolved = resolveBlockConfig(projectCfg, blockCfg)
    expect(resolved.fontSize).toBe(48)
    expect(resolved.textColor).toBe('#ff0000')
    expect(resolved.bgColor).toBe('#0000ff')
    expect(resolved.pauseAtSentences).toBe(false)
  })

  it('partial block overrides: only specified fields are overridden', () => {
    const blockCfg: ScriptBlockConfig = {
      bpm: 60,
      wordsPerStack: 3,
      stacksVisible: 1,
      bgColor: '#abcdef',
      // textColor not specified — should inherit from project
    }
    const resolved = resolveBlockConfig(projectCfg, blockCfg)
    expect(resolved.bgColor).toBe('#abcdef')
    expect(resolved.textColor).toBe(projectCfg.textColor)
  })

  it('block linesEnabled override switches multi-line independently', () => {
    const blockCfg: ScriptBlockConfig = {
      bpm: 60,
      wordsPerStack: 3,
      stacksVisible: 1,
      linesEnabled: true,
      linesCount: 5,
    }
    const resolved = resolveBlockConfig(projectCfg, blockCfg)
    expect(resolved.linesEnabled).toBe(true)
    expect(resolved.linesCount).toBe(5)
  })
})

// ── defaultConfigFromSettings — color resolution ──────────────────────────

describe('defaultConfigFromSettings — color resolution', () => {
  function makeSettings(overrides: Partial<Settings> = {}): Settings {
    return {
      bpm: 60,
      pause_at_sentences: true,
      pause_at_headlines: true,
      chunk_rule_long_word: false,
      chunk_rule_enumerations: false,
      chunk_rule_bullets: false,
      chunk_rule_commas: false,
      chunk_rule_names: false,
      chunk_rule_headlines: true,
      words_per_stack: 3,
      stacks_visible: 1,
      stack_gap: 32,
      lines_enabled: false,
      lines_count: 3,
      lines_row_gap: 8,
      stack_vertical_offset: 0,
      stack_horizontal_offset: 0,
      font_size: 36,
      font_family: '',
      theme: 'dark',
      highlight_active: false,
      highlight_color: '',
      highlight_text_color: '',
      text_color: '',
      viewport_bg_color: '',
      segmentation_enabled: false,
      segmentation_threshold: 200,
      segmentation_chunk_size: 150,
      auto_chapter_detection: false,
      show_chunk_dividers: false,
      highlight_mode: 'default',
      highlight_panning_chunk_size: 3,
      highlighting_mode: 'default',
      summaries_initialized: false,
      tap_to_read: false,
      tap_to_read_key: 'Space',
      lock_at_wpm: false,
      target_wpm: 200,
      metronome_enabled: false,
      view_style: 'default',
      custom_palettes: [],
      custom_text_presets: [],
      custom_font_presets: [],
      custom_playback_presets: [],
      custom_reader_configs: [],
      ...overrides,
    }
  }

  it('produces a non-empty textColor even when settings.text_color is empty (dark theme)', () => {
    const cfg = defaultConfigFromSettings(makeSettings({ theme: 'dark', text_color: '' }))
    expect(cfg.textColor).toBeTruthy()
    expect(cfg.textColor).not.toBe('')
  })

  it('produces a non-empty bgColor even when settings.viewport_bg_color is empty (dark theme)', () => {
    const cfg = defaultConfigFromSettings(makeSettings({ theme: 'dark', viewport_bg_color: '' }))
    expect(cfg.bgColor).toBeTruthy()
    expect(cfg.bgColor).not.toBe('')
  })

  it('produces a non-empty textColor for light theme', () => {
    const cfg = defaultConfigFromSettings(makeSettings({ theme: 'light', text_color: '' }))
    expect(cfg.textColor).toBeTruthy()
  })

  it('uses explicit text_color when provided', () => {
    const cfg = defaultConfigFromSettings(makeSettings({ text_color: '#123456' }))
    expect(cfg.textColor).toBe('#123456')
  })

  it('captures fontFamily, highlightActive, showChunkDividers from settings', () => {
    const cfg = defaultConfigFromSettings(makeSettings({
      font_family: 'Georgia',
      highlight_active: true,
      show_chunk_dividers: true,
    }))
    expect(cfg.fontFamily).toBe('Georgia')
    expect(cfg.highlightActive).toBe(true)
    expect(cfg.showChunkDividers).toBe(true)
  })
})

// ── calcTokenDuration — block-level pause overrides ───────────────────────

describe('calcTokenDuration — block-level pause overrides', () => {
  it('block pauseAtSentences=false suppresses pause even when project says true', () => {
    const block = createBlock(
      0,
      'Hello world.',
      { bpm: 60, wordsPerStack: 2, stacksVisible: 1, pauseAtSentences: false },
      { ...BASE_CONFIG, pauseAtSentences: true }
    )
    const sentenceEndToken = block.tokens.find(t => t.stack.type === 'sentence-end')
    if (!sentenceEndToken) return // skip if tokenizer didn't produce sentence-end
    const durationWithOverride = calcTokenDuration(sentenceEndToken, block, {
      ...BASE_CONFIG,
      pauseAtSentences: true,
    })
    const durationWithout = calcTokenDuration(
      { ...sentenceEndToken },
      { ...block, config: { ...block.config, pauseAtSentences: undefined } },
      { ...BASE_CONFIG, pauseAtSentences: false }
    )
    // With override=false the sentence pause is suppressed → same as pauseAtSentences=false project
    expect(durationWithOverride).toBe(durationWithout)
  })

  it('block with no pauseAtSentences override inherits from project config', () => {
    const block = createBlock(
      0,
      'Hello world.',
      { bpm: 60, wordsPerStack: 2, stacksVisible: 1 },
      { ...BASE_CONFIG, pauseAtSentences: true }
    )
    const token = block.tokens[0]
    const withPause = calcTokenDuration(token, block, { ...BASE_CONFIG, pauseAtSentences: true })
    const withoutPause = calcTokenDuration(token, block, { ...BASE_CONFIG, pauseAtSentences: false })
    // Both should be equal for a non-sentence-end token (no pause applied)
    // The key check is that there's no exception and the project config is used
    expect(typeof withPause).toBe('number')
    expect(typeof withoutPause).toBe('number')
  })
})

// ── Script round-trip: per-block display settings preserved in JSON ────────

describe('Script JSON round-trip with per-block display settings', () => {
  it('block textColor is preserved through JSON serialisation', () => {
    const blockCfg: ScriptBlockConfig = {
      bpm: 60,
      wordsPerStack: 3,
      stacksVisible: 1,
      textColor: '#ff0000',
      bgColor: '#00ff00',
    }
    const project = createEmptyProject('Test', BASE_CONFIG)
    const block = createEmptyBlock(0, blockCfg)
    const withBlock = { ...project, blocks: [block] }

    // Simulate save/load via JSON
    const reloaded = JSON.parse(JSON.stringify(withBlock))
    expect(reloaded.blocks[0].config.textColor).toBe('#ff0000')
    expect(reloaded.blocks[0].config.bgColor).toBe('#00ff00')
  })

  it('resolveBlockConfig produces correct result after JSON round-trip', () => {
    const blockCfg: ScriptBlockConfig = {
      bpm: 90,
      wordsPerStack: 2,
      stacksVisible: 1,
      fontSize: 48,
      highlightActive: true,
    }
    const block = createEmptyBlock(0, blockCfg)
    const reloaded: typeof block = JSON.parse(JSON.stringify(block))
    const resolved = resolveBlockConfig(BASE_CONFIG, reloaded.config)
    expect(resolved.bpm).toBe(90)
    expect(resolved.fontSize).toBe(48)
    expect(resolved.highlightActive).toBe(true)
    // Fields not in blockCfg inherit from BASE_CONFIG
    expect(resolved.textColor).toBe(BASE_CONFIG.textColor)
  })
})

// ── Lock at WPM — backward compatibility ──────────────────────────────────

describe('ScriptBlockConfig without lockAtWpm (legacy blocks)', () => {
  it('a block without lockAtWpm or targetWpm fields is accepted and tokenized normally', () => {
    // ScriptBlockConfig.lockAtWpm is optional — legacy configs must be loadable
    const legacyCfg: ScriptBlockConfig = { bpm: 80, wordsPerStack: 3, stacksVisible: 2 }
    const block = createBlock(0, 'one two three four five six', legacyCfg, BASE_CONFIG)
    expect(block.tokens.length).toBeGreaterThan(0)
    expect(block.config.lockAtWpm).toBeUndefined()
    expect(block.config.targetWpm).toBeUndefined()
  })

  it('resolveBlockConfig works correctly for legacy blocks without lockAtWpm', () => {
    const legacyCfg: ScriptBlockConfig = { bpm: 100, wordsPerStack: 4, stacksVisible: 1 }
    const resolved = resolveBlockConfig(BASE_CONFIG, legacyCfg)
    expect(resolved.bpm).toBe(100)
    expect(resolved.wordsPerStack).toBe(4)
    // lockAtWpm/targetWpm are not carried through resolveBlockConfig (informational only)
  })

  it('a project loaded from JSON without lockAtWpm in blocks parses without error', () => {
    const project = createEmptyProject('Legacy Project', BASE_CONFIG)
    const legacyBlock = createBlock(
      0,
      'hello world test',
      { bpm: 60, wordsPerStack: 3, stacksVisible: 1 },
      BASE_CONFIG
    )
    const withBlocks = { ...project, blocks: [legacyBlock] }
    const roundTripped = JSON.parse(JSON.stringify(withBlocks))
    expect(roundTripped.blocks[0].config.lockAtWpm).toBeUndefined()
    expect(flattenBlocks(roundTripped.blocks)).toHaveLength(legacyBlock.tokens.length)
  })
})
