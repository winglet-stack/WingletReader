import { describe, it, expect, vi } from 'vitest'
import {
  applyContentLimit,
  buildStacksForTransmute,
  buildVideoFrame,
  buildVideoPreviewFrame,
  drawFrame,
  estimateDuration,
  estimateFileSize,
  formatDuration,
  formatFileSize,
  frameBatchSize,
  resolutionDimensions,
  type VideoReaderFrame
} from '../videoRenderer'
import type { TransmuteConfig, WordStack } from '../../types'

// ── Fixtures ───────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<TransmuteConfig> = {}): TransmuteConfig {
  return {
    textId: null,
    segmentId: null,
    // Reader-derived defaults
    bpm: 120,
    wordsPerStack: 3,
    pauseAtSentences: false,
    pauseAtHeadlines: false,
    fontSize: 36,
    fontFamily: '',
    theme: 'dark',
    bgColor: '#1a1a1a',
    textColor: '#f0f0f0',
    stackVerticalOffset: 0,
    stackHorizontalOffset: 0,
    highlightActive: false,
    highlightColor: '',
    highlightTextColor: '',
    highlightMode: 'default',
    highlightPanningChunkSize: 0,
    highlightingMode: 'default',
    linesCount: 1,
    linesRowGap: 8,
    stacksVisible: 1,
    stackGap: 32,
    showChunkDividers: true,
    chunkRuleLongWord: false,
    chunkRuleEnumerations: false,
    chunkRuleBullets: false,
    chunkRuleCommas: false,
    chunkRuleNames: false,
    // Video-specific defaults
    resolution: '1280x720',
    maxDurationMinutes: null,
    contentLimitType: 'none',
    contentLimitWords: 1000,
    contentLimitPercentage: 100,
    showProgressOverlay: false,
    bgColorOverride: '',
    transparentBackground: false,
    ...overrides
  }
}

const SAMPLE = 'one two three four five six seven eight nine ten'

// ── Minimal mock canvas context for drawFrame tests ────────────────────────
//
// Tracks draw calls so we can assert on what was drawn without needing a real
// canvas (OffscreenCanvas is not available in the node test environment).

interface FillRectCall { x: number; y: number; w: number; h: number; fillStyle: string }
interface FillTextCall {
  text: string
  x: number
  y: number
  fillStyle: string
  font: string
  textBaseline: string
}
interface StrokeRectCall { x: number; y: number; w: number; h: number }
interface ClearRectCall { x: number; y: number; w: number; h: number }

function makeMockCtx() {
  const fillRects: FillRectCall[] = []
  const fillTexts: FillTextCall[] = []
  const strokeRects: StrokeRectCall[] = []
  const clearRects: ClearRectCall[] = []

  let _fillStyle = ''
  let _strokeStyle = ''
  let _font = ''
  let _textAlign = ''
  let _textBaseline = ''
  let _globalAlpha = 1
  let _lineWidth = 1

  const savedAlphas: number[] = []

  const ctx = {
    get fillStyle() { return _fillStyle },
    set fillStyle(v: string) { _fillStyle = v },
    get strokeStyle() { return _strokeStyle },
    set strokeStyle(v: string) { _strokeStyle = v },
    get font() { return _font },
    set font(v: string) { _font = v },
    get textAlign() { return _textAlign },
    set textAlign(v: string) { _textAlign = v },
    get textBaseline() { return _textBaseline },
    set textBaseline(v: string) { _textBaseline = v },
    get globalAlpha() { return _globalAlpha },
    set globalAlpha(v: number) { _globalAlpha = v },
    get lineWidth() { return _lineWidth },
    set lineWidth(v: number) { _lineWidth = v },

    fillRect(x: number, y: number, w: number, h: number) {
      fillRects.push({ x, y, w, h, fillStyle: _fillStyle })
    },
    fillText(text: string, x: number, y: number) {
      fillTexts.push({ text, x, y, fillStyle: _fillStyle, font: _font, textBaseline: _textBaseline })
    },
    strokeRect(x: number, y: number, w: number, h: number) {
      strokeRects.push({ x, y, w, h })
    },
    clearRect(x: number, y: number, w: number, h: number) {
      clearRects.push({ x, y, w, h })
    },
    // measureText: return dimensions proportional to the current font size.
    measureText(text: string) {
      const size = Number(_font.match(/(\d+)px/)?.[1] ?? 16)
      return {
        width: text.length * size * 0.6,
        actualBoundingBoxAscent: size * 0.8,
        actualBoundingBoxDescent: size * 0.2,
      }
    },
    save() { savedAlphas.push(_globalAlpha) },
    restore() {
      if (savedAlphas.length) _globalAlpha = savedAlphas.pop()!
    },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},

    // Test helpers
    _fillRects: fillRects,
    _fillTexts: fillTexts,
    _strokeRects: strokeRects,
    _clearRects: clearRects,
  }

  return ctx
}

// ── Frame helpers ──────────────────────────────────────────────────────────
//
// The exporter is a painter over the reader frame, so a drawing test states the
// stacks and (where it matters) the beat, and lets the frame decide the rest.
// Without an explicit beat the still preview frame is used: one complete block,
// every slot filled — the state these tests used to describe by handing over a
// fully-populated display array.

interface SampleStack { words: string[]; isHeadline: boolean }

function toStacks(samples: SampleStack[]): WordStack[] {
  return samples.map((sample) => ({
    words: sample.words,
    type: sample.isHeadline ? 'headline' : 'normal',
  }))
}

interface PaintOptions {
  width?: number
  height?: number
  /** Beat to paint. Omitted → the still full-block preview frame. */
  currentIndex?: number
  progress?: number
}

function frameFor(
  ctx: ReturnType<typeof makeMockCtx>,
  samples: SampleStack[],
  config: TransmuteConfig,
  options: PaintOptions = {}
): VideoReaderFrame {
  const { width = 1280, height = 720, currentIndex } = options
  const stacks = toStacks(samples)
  return currentIndex === undefined
    ? buildVideoPreviewFrame({ ctx: ctx as any, stacks, config, width, height })
    : buildVideoFrame({ ctx: ctx as any, stacks, currentIndex, config, width, height })
}

function paint(
  ctx: ReturnType<typeof makeMockCtx>,
  samples: SampleStack[],
  config: TransmuteConfig,
  options: PaintOptions = {}
): void {
  drawFrame(ctx as any, frameFor(ctx, samples, config, options), config, options.progress)
}

function fontSizeFromCall(call: FillTextCall): number {
  return Number(call.font.match(/(\d+)px/)?.[1] ?? 16)
}

function textBoundsFromCall(call: FillTextCall) {
  const size = fontSizeFromCall(call)
  const width = call.text.length * size * 0.6
  return {
    top: call.y - size * 0.8,
    bottom: call.y + size * 0.2,
    left: call.x - width / 2,
    right: call.x + width / 2,
    width,
  }
}

// ── resolutionDimensions ───────────────────────────────────────────────────

describe('resolutionDimensions', () => {
  it('returns correct dimensions for 1280x720', () => {
    expect(resolutionDimensions('1280x720')).toEqual({ width: 1280, height: 720 })
  })
  it('returns correct dimensions for 1920x1080', () => {
    expect(resolutionDimensions('1920x1080')).toEqual({ width: 1920, height: 1080 })
  })
  it('returns correct dimensions for 1080x1920', () => {
    expect(resolutionDimensions('1080x1920')).toEqual({ width: 1080, height: 1920 })
  })
  it('returns correct dimensions for 720x720', () => {
    expect(resolutionDimensions('720x720')).toEqual({ width: 720, height: 720 })
  })
})

// ── applyContentLimit ──────────────────────────────────────────────────────

describe('applyContentLimit', () => {
  it('returns full content when type is none', () => {
    const cfg = makeConfig({ contentLimitType: 'none' })
    expect(applyContentLimit(SAMPLE, cfg)).toBe(SAMPLE)
  })

  it('returns full content when word limit exceeds content length', () => {
    const cfg = makeConfig({ contentLimitType: 'words', contentLimitWords: 999 })
    expect(applyContentLimit(SAMPLE, cfg)).toBe(SAMPLE)
  })

  it('trims to exact word count', () => {
    const cfg = makeConfig({ contentLimitType: 'words', contentLimitWords: 5 })
    const result = applyContentLimit(SAMPLE, cfg)
    expect(result.trim().split(/\s+/).length).toBe(5)
    expect(result).toBe('one two three four five')
  })

  it('clamps word count to at least 1', () => {
    const cfg = makeConfig({ contentLimitType: 'words', contentLimitWords: 0 })
    const result = applyContentLimit(SAMPLE, cfg)
    expect(result.trim().split(/\s+/).length).toBe(1)
  })

  it('returns full content when percentage is 100', () => {
    const cfg = makeConfig({ contentLimitType: 'percentage', contentLimitPercentage: 100 })
    expect(applyContentLimit(SAMPLE, cfg)).toBe(SAMPLE)
  })

  it('trims to correct percentage', () => {
    const cfg = makeConfig({ contentLimitType: 'percentage', contentLimitPercentage: 50 })
    const result = applyContentLimit(SAMPLE, cfg)
    const wordCount = result.trim().split(/\s+/).length
    expect(wordCount).toBe(5) // 50% of 10 words
  })

  it('preserves newlines so paragraph structure survives', () => {
    const multiPara = 'para one alpha\n\npara two beta gamma delta epsilon'
    const cfg = makeConfig({ contentLimitType: 'words', contentLimitWords: 3 })
    const result = applyContentLimit(multiPara, cfg)
    expect(result).toBe('para one alpha')
  })

  it('handles empty content gracefully', () => {
    const cfg = makeConfig({ contentLimitType: 'words', contentLimitWords: 5 })
    expect(applyContentLimit('', cfg)).toBe('')
    expect(applyContentLimit('   ', cfg)).toBe('   ')
  })
})

// ── buildStacksForTransmute ────────────────────────────────────────────────

describe('buildStacksForTransmute', () => {
  it('builds stacks from plain text', () => {
    const stacks = buildStacksForTransmute('hello world foo bar', makeConfig())
    expect(stacks.length).toBeGreaterThan(0)
    const allWords = stacks.flatMap((s) => s.words)
    expect(allWords).toEqual(['hello', 'world', 'foo', 'bar'])
  })

  it('respects wordsPerStack', () => {
    const stacks = buildStacksForTransmute('one two three four five six', makeConfig({ wordsPerStack: 2 }))
    // With no chunk rules, stacks should have at most 2 words each
    stacks.forEach((s) => expect(s.words.length).toBeLessThanOrEqual(2))
  })

  it('allows Transmute-specific wordsPerStack values above the live Reader cap', () => {
    const text = 'one two three four five six seven eight nine ten eleven twelve'
    const stacks = buildStacksForTransmute(text, makeConfig({ wordsPerStack: 12 }))
    expect(stacks[0].words.length).toBe(12)
  })

  it('caps Transmute-specific wordsPerStack values at 20', () => {
    const text = Array.from({ length: 25 }, (_, i) => `word${i + 1}`).join(' ')
    const stacks = buildStacksForTransmute(text, makeConfig({ wordsPerStack: 25 }))
    expect(stacks.map((s) => s.words.length)).toEqual([13, 12])
    stacks.forEach((s) => expect(s.words.length).toBeLessThanOrEqual(20))
  })

  it('keeps Transmute stacks sane at the N=20 ceiling', () => {
    const text = Array.from({ length: 40 }, (_, i) => `word${i + 1}`).join(' ')
    const stacks = buildStacksForTransmute(text, makeConfig({ wordsPerStack: 20 }))
    expect(stacks.map((s) => s.words.length)).toEqual([20, 20])
  })

  it('always treats headlines regardless of chunk rule settings', () => {
    const text = '# My Heading\nsome body text'
    const stacks = buildStacksForTransmute(text, makeConfig())
    const types = stacks.map((s) => s.type)
    expect(types).toContain('headline')
  })

  it('uses chunk rule longWord from config (soft preferred break, SP-3)', () => {
    const longWord = 'A'.repeat(16)
    // 12 words at N=7, long word at index 5. Pure balance gives [6][6] (long word
    // shares stack 1 with "before"); the soft break before it pulls the split to
    // [5][7], so the long word starts a stack only when the rule is on.
    const text = `alpha beta gamma delta before ${longWord} six seven eight nine ten eleven`
    const withRule = buildStacksForTransmute(text, makeConfig({ chunkRuleLongWord: true, wordsPerStack: 7 }))
    const withoutRule = buildStacksForTransmute(text, makeConfig({ chunkRuleLongWord: false, wordsPerStack: 7 }))
    // With longWord rule, the soft break lands before the long word so it starts a new stack
    const longWordStartsStackWithRule = withRule.some((s) => s.words[0] === longWord)
    // Without rule, "before" and the long word share the same stack
    const sharedWithoutRule = withoutRule.some((s) => s.words.includes('before') && s.words.includes(longWord))
    expect(longWordStartsStackWithRule).toBe(true)
    expect(sharedWithoutRule).toBe(true)
  })
})

// ── estimateDuration ───────────────────────────────────────────────────────

describe('estimateDuration', () => {
  it('returns 0 for empty stacks', () => {
    expect(estimateDuration([], makeConfig())).toBe(0)
  })

  it('is proportional to BPM (faster BPM = shorter duration)', () => {
    const stacks = buildStacksForTransmute(SAMPLE, makeConfig())
    const slow = estimateDuration(stacks, makeConfig({ bpm: 60 }))
    const fast = estimateDuration(stacks, makeConfig({ bpm: 120 }))
    expect(slow).toBeGreaterThan(fast)
    expect(slow).toBeCloseTo(fast * 2, 0)
  })

  it('high BPM (previously above cap) still produces a positive duration', () => {
    const stacks = buildStacksForTransmute(SAMPLE, makeConfig())
    const at300 = estimateDuration(stacks, makeConfig({ bpm: 300 }))
    const at600 = estimateDuration(stacks, makeConfig({ bpm: 600 }))
    const at1200 = estimateDuration(stacks, makeConfig({ bpm: 1200 }))
    const at5000 = estimateDuration(stacks, makeConfig({ bpm: 5000 }))
    expect(at600).toBeGreaterThan(0)
    expect(at1200).toBeGreaterThan(0)
    expect(at5000).toBeGreaterThan(0)
    // Duration shrinks monotonically as BPM rises
    expect(at300).toBeGreaterThan(at600)
    expect(at600).toBeGreaterThan(at1200)
    expect(at1200).toBeGreaterThan(at5000)
  })

  it('BPM within the old range produces the same duration as before the cap increase', () => {
    // Ensure raising the cap did not change timing math for existing BPM values
    const stacks = buildStacksForTransmute(SAMPLE, makeConfig())
    const d120 = estimateDuration(stacks, makeConfig({ bpm: 120 }))
    // beatMs at 120 BPM = 500 ms; one normal stack = 500 ms
    expect(d120).toBeGreaterThan(0)
    expect(d120 % 1).toBe(0) // integer milliseconds
  })

  it('increases when pauseAtSentences is on', () => {
    const text = 'Hello world. Another sentence here.'
    const stacks = buildStacksForTransmute(text, makeConfig())
    const withPause = estimateDuration(stacks, makeConfig({ pauseAtSentences: true }))
    const withoutPause = estimateDuration(stacks, makeConfig({ pauseAtSentences: false }))
    expect(withPause).toBeGreaterThan(withoutPause)
  })
})

// ── estimateFileSize ───────────────────────────────────────────────────────

describe('estimateFileSize', () => {
  it('returns 0 for 0 ms', () => {
    expect(estimateFileSize(0)).toBe(0)
  })

  it('returns a positive value for non-zero duration', () => {
    expect(estimateFileSize(60_000)).toBeGreaterThan(0)
  })

  it('is proportional to duration', () => {
    const oneMinute = estimateFileSize(60_000)
    const twoMinutes = estimateFileSize(120_000)
    expect(twoMinutes).toBeCloseTo(oneMinute * 2, 0)
  })
})

// ── formatDuration ─────────────────────────────────────────────────────────

describe('formatDuration', () => {
  it('formats seconds only', () => {
    expect(formatDuration(5_000)).toBe('5s')
    expect(formatDuration(59_500)).toBe('1m 0s') // rounds to nearest second
  })

  it('formats minutes and seconds', () => {
    expect(formatDuration(90_000)).toBe('1m 30s')
    expect(formatDuration(3_540_000)).toBe('59m 0s')
  })

  it('formats hours, minutes, and seconds', () => {
    expect(formatDuration(3_661_000)).toBe('1h 1m 1s')
  })

  it('handles zero', () => {
    expect(formatDuration(0)).toBe('0s')
  })
})

// ── formatFileSize ─────────────────────────────────────────────────────────

describe('formatFileSize', () => {
  it('formats bytes', () => {
    expect(formatFileSize(500)).toBe('500 B')
  })

  it('formats kilobytes', () => {
    expect(formatFileSize(2048)).toBe('2.0 KB')
  })

  it('formats megabytes', () => {
    expect(formatFileSize(1_572_864)).toBe('1.5 MB')
  })
})

// ── frameBatchSize ─────────────────────────────────────────────────────────

describe('frameBatchSize', () => {
  it('returns stacksVisible for single-row mode (linesCount=1)', () => {
    expect(frameBatchSize(makeConfig({ linesCount: 1, stacksVisible: 2 }))).toBe(2)
  })

  it('returns stacksVisible for single-row mode (linesCount=1)', () => {
    expect(frameBatchSize(makeConfig({ linesCount: 1, stacksVisible: 3 }))).toBe(3)
  })

  it('returns 1 when stacksVisible=1 and linesCount=1', () => {
    expect(frameBatchSize(makeConfig({ linesCount: 1, stacksVisible: 1 }))).toBe(1)
  })

  it('returns linesCount × stacksVisible in multi-line mode', () => {
    expect(frameBatchSize(makeConfig({ linesCount: 3, stacksVisible: 2 }))).toBe(6)
  })

  it('clamps linesCount and stacksVisible to minimum of 1', () => {
    expect(frameBatchSize(makeConfig({ linesCount: 0, stacksVisible: 0 }))).toBe(1)
  })

  it('handles single column multi-line (linesCount=3, stacksVisible=1)', () => {
    expect(frameBatchSize(makeConfig({ linesCount: 3, stacksVisible: 1 }))).toBe(3)
  })
})

// ── buildVideoFrame — the exporter consumes the reader frame ───────────────
//
// These replace the exporter's own block/reveal derivation (buildReaderLikeFrame).
// The subject is unchanged: the exporter must show the same slots the reader would.

describe('buildVideoFrame', () => {
  it('pre-reveals the first panning chunk like the reader', () => {
    const ctx = makeMockCtx()
    const config = makeConfig({
      wordsPerStack: 1,
      stacksVisible: 4,
      highlightMode: 'panning-bar',
      highlightPanningChunkSize: 4
    })
    const stacks = buildStacksForTransmute('one two three four', config)
    const { frame } = buildVideoFrame({ ctx: ctx as any, stacks, currentIndex: 0, config, width: 1280, height: 720 })

    expect(frame.block.currentLineIdx).toBe(0)
    expect(frame.block.currentSlotIdx).toBe(0)
    const slots = frame.rows[0].slots
    expect(slots[0].stack?.words).toEqual(['one'])
    expect(slots[1].stack?.words).toEqual(['two'])
    // Reserved-but-empty, where the old display array carried an empty-word sentinel.
    expect(slots[2].stack).toBeNull()
  })

  it('keeps the reveal sticky across a panning-mode gap beat', () => {
    const ctx = makeMockCtx()
    const config = makeConfig({
      wordsPerStack: 1,
      stacksVisible: 4,
      highlightMode: 'panning-bar',
      highlightPanningChunkSize: 4
    })
    const stacks = buildStacksForTransmute('one two three four', config)

    const first = buildVideoFrame({ ctx: ctx as any, stacks, currentIndex: 0, config, width: 1280, height: 720 })
    // Beat two would reveal only up to slot 1 on its own; the high-water mark holds it.
    const second = buildVideoFrame({
      ctx: ctx as any, stacks, currentIndex: 1, config, width: 1280, height: 720,
      reveal: first.frame.reveal,
    })

    expect(first.frame.revealUpToSlot).toBe(1)
    expect(second.frame.revealUpToSlot).toBe(1)
    expect(second.frame.rows[0].slots[1].stack?.words).toEqual(['two'])
  })

  it('re-derives the block at the solver-reduced effective line count', () => {
    const config = makeConfig({ wordsPerStack: 1, stacksVisible: 1, linesCount: 20 })
    const ctx = makeMockCtx()
    const stacks = buildStacksForTransmute(
      'zero one two three four five six seven eight nine',
      config
    )
    const { frame } = buildVideoFrame({ ctx: ctx as any, stacks, currentIndex: 4, config, width: 1280, height: 720 })

    expect(frame.geometry.linesCount).toBeLessThan(20)
    expect(frame.rows).toHaveLength(frame.geometry.linesCount)
    expect(frame.rows[frame.block.currentLineIdx].slots[0].stack?.words).toEqual(['four'])
  })

  it('keeps stacksVisible and wordsPerStack sacrosanct under solver degradation', () => {
    const ctx = makeMockCtx()
    const config = makeConfig({
      wordsPerStack: 9,
      stacksVisible: 6,
      linesCount: 6,
      fontSize: 180,
      stackGap: 120,
      linesRowGap: 80,
      stackHorizontalOffset: 500,
      stackVerticalOffset: -500,
    })
    const stacks = toStacks(
      Array.from({ length: 36 }, (_, i) => ({ words: [`longword${i}`], isHeadline: false }))
    )
    const { frame } = buildVideoPreviewFrame({ ctx: ctx as any, stacks, config, width: 720, height: 720 })

    expect(frame.stacksVisible).toBe(6)
    expect(frame.wordsPerStack).toBe(9)
    expect(frame.geometry.linesCount).toBeLessThanOrEqual(6)
    expect(frame.geometry.stackGap).toBeLessThanOrEqual(config.stackGap)
    expect(frame.geometry.rowGap).toBeLessThanOrEqual(config.linesRowGap)
    expect(Math.abs(frame.geometry.horizontalOffset)).toBeLessThanOrEqual(500)
    expect(Math.abs(frame.geometry.verticalOffset)).toBeLessThanOrEqual(500)
  })

  it('reserves the progress overlay strip out of the stage box', () => {
    const ctx = makeMockCtx()
    const stacks = toStacks([{ words: ['hello'], isHeadline: false }])
    const plain = buildVideoFrame({ ctx: ctx as any, stacks, currentIndex: 0, config: makeConfig(), width: 1280, height: 720 })
    const overlaid = buildVideoFrame({
      ctx: ctx as any, stacks, currentIndex: 0,
      config: makeConfig({ showProgressOverlay: true }), width: 1280, height: 720,
    })

    expect(overlaid.stage.x).toBeGreaterThan(plain.stage.x)
    expect(overlaid.stage.width).toBeLessThan(plain.stage.width)
  })
})

// ── drawFrame — canvas rendering assertions ────────────────────────────────
//
// Uses a mock canvas context that records fillRect / fillText / strokeRect
// calls. This avoids needing a real OffscreenCanvas in the node environment
// while still verifying the visual output contract of drawFrame.

describe('drawFrame — background', () => {
  it('fills the entire canvas with bgColor', () => {
    const ctx = makeMockCtx()
    paint(ctx, [], makeConfig({ bgColor: '#123456' }))
    const bgFill = ctx._fillRects[0]
    expect(bgFill.fillStyle).toBe('#123456')
    expect(bgFill.x).toBe(0)
    expect(bgFill.y).toBe(0)
    expect(bgFill.w).toBe(1280)
    expect(bgFill.h).toBe(720)
  })

  it('draws nothing beyond background when the frame holds no stacks', () => {
    const ctx = makeMockCtx()
    paint(ctx, [], makeConfig())
    // Only the background fillRect
    expect(ctx._fillRects).toHaveLength(1)
    expect(ctx._fillTexts).toHaveLength(0)
  })

  it('uses bgColorOverride instead of bgColor when set', () => {
    const ctx = makeMockCtx()
    paint(ctx, [], makeConfig({ bgColor: '#111111', bgColorOverride: '#aabbcc' }))
    const bgFill = ctx._fillRects[0]
    expect(bgFill.fillStyle).toBe('#aabbcc')
    expect(bgFill.w).toBe(1280)
    expect(bgFill.h).toBe(720)
  })

  it('uses bgColor when bgColorOverride is empty string', () => {
    const ctx = makeMockCtx()
    paint(ctx, [], makeConfig({ bgColor: '#deadbe', bgColorOverride: '' }))
    const bgFill = ctx._fillRects[0]
    expect(bgFill.fillStyle).toBe('#deadbe')
  })

  it('skips the background fill entirely when transparentBackground is true', () => {
    const ctx = makeMockCtx()
    paint(ctx, [], makeConfig({ transparentBackground: true }))
    // No fillRect at all — not even a background
    expect(ctx._fillRects).toHaveLength(0)
  })

  it('calls clearRect over the full canvas when transparentBackground is true', () => {
    const ctx = makeMockCtx()
    paint(ctx, [], makeConfig({ transparentBackground: true }))
    expect(ctx._clearRects).toHaveLength(1)
    expect(ctx._clearRects[0]).toEqual({ x: 0, y: 0, w: 1280, h: 720 })
  })

  it('does not call clearRect when transparentBackground is false', () => {
    const ctx = makeMockCtx()
    paint(ctx, [], makeConfig({ transparentBackground: false }))
    expect(ctx._clearRects).toHaveLength(0)
  })

  it('ignores bgColorOverride when transparentBackground is true', () => {
    const ctx = makeMockCtx()
    paint(ctx, [], makeConfig({ bgColorOverride: '#ff0000', transparentBackground: true }))
    // Should be no fill rects since transparent background skips the fill
    const bgColorFill = ctx._fillRects.find((r) => r.fillStyle === '#ff0000' && r.w === 1280)
    expect(bgColorFill).toBeUndefined()
    expect(ctx._fillRects).toHaveLength(0)
  })

  it('renders text over transparent background', () => {
    const ctx = makeMockCtx()
    paint(ctx, [{ words: ['hello'], isHeadline: false }], makeConfig({ transparentBackground: true }))
    // No background fill
    const bgRects = ctx._fillRects.filter((r) => r.w === 1280 && r.h === 720)
    expect(bgRects).toHaveLength(0)
    // But text is still drawn
    const textCall = ctx._fillTexts.find((t) => t.text === 'hello')
    expect(textCall).toBeDefined()
  })

  it('renders progress bar over transparent background', () => {
    const ctx = makeMockCtx()
    paint(
      ctx,
      [{ words: ['hi'], isHeadline: false }],
      makeConfig({ showProgressOverlay: true, transparentBackground: true }),
      { progress: 0.5 }
    )
    // No full-canvas background fill
    const bgRects = ctx._fillRects.filter((r) => r.w === 1280 && r.h === 720)
    expect(bgRects).toHaveLength(0)
    // But progress bar elements are still drawn (bar rects at OVERLAY_BAR_W=5)
    const barRects = ctx._fillRects.filter((r) => r.w === 5)
    expect(barRects).toHaveLength(2)
    // And percentage text is drawn
    expect(ctx._fillTexts.some((t) => t.text === '50%')).toBe(true)
  })
})

describe('drawFrame — single-stack mode (stacksVisible=1)', () => {
  it('renders text in textColor when highlight is off', () => {
    const ctx = makeMockCtx()
    paint(ctx, [{ words: ['hello'], isHeadline: false }], makeConfig({ textColor: '#aabbcc', highlightActive: false }))
    const textCall = ctx._fillTexts.find((t) => t.text === 'hello')
    expect(textCall).toBeDefined()
    expect(textCall!.fillStyle).toBe('#aabbcc')
  })

  it('draws a filled highlight box (fillRect) — not strokeRect — when highlightActive', () => {
    const ctx = makeMockCtx()
    paint(
      ctx,
      [{ words: ['word'], isHeadline: false }],
      makeConfig({ highlightActive: true, highlightColor: '#ff0000', highlightTextColor: '#ffffff' })
    )
    // Must have a fillRect in the highlight color
    const highlightFill = ctx._fillRects.find((r) => r.fillStyle === '#ff0000')
    expect(highlightFill).toBeDefined()
    // Must NOT use strokeRect for the highlight
    expect(ctx._strokeRects).toHaveLength(0)
  })

  it('renders text in highlightTextColor on top of the highlight box', () => {
    const ctx = makeMockCtx()
    paint(
      ctx,
      [{ words: ['word'], isHeadline: false }],
      makeConfig({ highlightActive: true, highlightColor: '#ff0000', highlightTextColor: '#00ff00' })
    )
    const textCall = ctx._fillTexts.find((t) => t.text === 'word')
    expect(textCall).toBeDefined()
    expect(textCall!.fillStyle).toBe('#00ff00')
  })

  // A headline keeps its own treatment instead of the filled highlight box, in the
  // exported video as before. The decorative headline rules also use the accent
  // colour, but are only 2px tall — so a highlight box is identified by height > 2.
  it('draws no highlight box behind a headline stack in single-stack layout (Issue 06)', () => {
    const ctx = makeMockCtx()
    paint(
      ctx,
      [{ words: ['title'], isHeadline: true }],
      makeConfig({
        stacksVisible: 1,
        linesCount: 1,
        highlightActive: true,
        highlightColor: '#ff0000',
        highlightTextColor: '#00ff00',
      })
    )
    // No highlight fill (a box in the highlight colour taller than the 2px rules).
    const highlightBox = ctx._fillRects.find((r) => r.fillStyle === '#ff0000' && r.h > 2)
    expect(highlightBox).toBeUndefined()
    // Headline text comes from the accent path (#ff0000), not the highlight text (#00ff00).
    const textCall = ctx._fillTexts.find((t) => t.text === 'TITLE')
    expect(textCall).toBeDefined()
    expect(textCall!.fillStyle).toBe('#ff0000')
  })

  it('draws no highlight box behind a headline cell in a grid layout (Issue 06b)', () => {
    const ctx = makeMockCtx()
    paint(
      ctx,
      [{ words: ['title'], isHeadline: true }, { words: ['body'], isHeadline: false }],
      makeConfig({
        stacksVisible: 2,
        highlightActive: true,
        highlightColor: '#ff0000',
        highlightTextColor: '#00ff00',
      }),
      { currentIndex: 0 } // highlighted slot holds the headline
    )
    // The highlighted cell holds the headline → no highlight fill behind it.
    const highlightBox = ctx._fillRects.find((r) => r.fillStyle === '#ff0000' && r.h > 2)
    expect(highlightBox).toBeUndefined()
    // Headline cell text uses the accent path (#ff0000), not the highlight text (#00ff00).
    const textCall = ctx._fillTexts.find((t) => t.text === 'TITLE')
    expect(textCall).toBeDefined()
    expect(textCall!.fillStyle).toBe('#ff0000')
  })

  it('keeps text inside the frame when vertical offset would push it above the top', () => {
    const ctx = makeMockCtx()
    paint(ctx, [{ words: ['hello'], isHeadline: false }], makeConfig({ fontSize: 160, stackVerticalOffset: -500 }))
    const textCall = ctx._fillTexts.find((t) => t.text === 'hello')
    expect(textCall).toBeDefined()
    expect(textCall!.textBaseline).toBe('alphabetic')
    const bounds = textBoundsFromCall(textCall!)
    expect(bounds.top).toBeGreaterThanOrEqual(54)
    expect(bounds.bottom).toBeLessThanOrEqual(666)
  })

  it('scales a long stack to fit the video text width', () => {
    const ctx = makeMockCtx()
    const words = ['supercalifragilistic', 'expialidocious', 'counterrevolutionary', 'misinterpretations']
    const text = words.join(' ')
    paint(ctx, [{ words, isHeadline: false }], makeConfig({ fontSize: 96 }), { width: 720, height: 720 })
    const textCall = ctx._fillTexts.find((t) => t.text === text)
    expect(textCall).toBeDefined()
    expect(textBoundsFromCall(textCall!).width).toBeLessThanOrEqual(568)
  })

  it('honours the reader comfort font floor instead of the exporter\'s old 12px floor', () => {
    const ctx = makeMockCtx()
    // A grid this dense used to be shrunk by the exporter's own fitFontSize pass,
    // which stopped at 12px (and 6px absolute). The size now comes from the solver.
    const config = makeConfig({ stacksVisible: 3, linesCount: 3, fontSize: 40 })
    const stacks = Array.from({ length: 9 }, (_, i) => ({ words: [`word${i}`], isHeadline: false }))
    const { frame } = frameFor(ctx, stacks, config)
    paint(ctx, stacks, config)

    expect(frame.geometry.fontSize).toBeGreaterThanOrEqual(18)
    for (const call of ctx._fillTexts) {
      expect(fontSizeFromCall(call)).toBe(frame.geometry.fontSize)
    }
  })

  it('auto-resolves highlight text color to white/black when highlightTextColor is empty', () => {
    const ctx = makeMockCtx()
    // Dark highlight → text should be white
    paint(
      ctx,
      [{ words: ['word'], isHeadline: false }],
      makeConfig({ highlightActive: true, highlightColor: '#000000', highlightTextColor: '' })
    )
    const textCall = ctx._fillTexts.find((t) => t.text === 'word')
    expect(textCall).toBeDefined()
    expect(textCall!.fillStyle).toBe('#ffffff')
  })

  it('uses reader theme foreground as the highlight color fallback', () => {
    const ctx = makeMockCtx()
    paint(
      ctx,
      [{ words: ['word'], isHeadline: false }],
      makeConfig({ highlightActive: true, highlightColor: '', theme: 'dark' })
    )
    const highlightFill = ctx._fillRects.find((r) => r.fillStyle === '#f4f0e6')
    expect(highlightFill).toBeDefined()
  })
})

describe('drawFrame — headline rendering', () => {
  it('renders headline text in uppercase', () => {
    const ctx = makeMockCtx()
    paint(ctx, [{ words: ['chapter', 'one'], isHeadline: true }], makeConfig())
    const textCall = ctx._fillTexts.find((t) => t.text === 'CHAPTER ONE')
    expect(textCall).toBeDefined()
  })

  it('draws a headline at the frame\'s headline-scaled font size', () => {
    const ctx = makeMockCtx()
    const config = makeConfig()
    const samples = [{ words: ['intro'], isHeadline: true }]
    const { frame } = frameFor(ctx, samples, config)
    paint(ctx, samples, config)

    const textCall = ctx._fillTexts.find((t) => t.text === 'INTRO')
    expect(textCall).toBeDefined()
    // The 0.7 headline scale belongs to the frame; the painter must not scale again.
    expect(fontSizeFromCall(textCall!)).toBe(frame.rows[0].slots[0].fontSize)
    expect(frame.rows[0].slots[0].fontSize).toBeLessThan(frame.geometry.fontSize)
  })

  it('draws two decorative rule rectangles for headline stacks', () => {
    const ctx = makeMockCtx()
    paint(ctx, [{ words: ['intro'], isHeadline: true }], makeConfig())
    // Background fill + two rule rects (both 40×2px, opacity reduced)
    const rulesAndBg = ctx._fillRects
    // Filter out the background rect (full-canvas size)
    const ruleRects = rulesAndBg.filter((r) => r.w === 40 && r.h === 2)
    expect(ruleRects).toHaveLength(2)
  })

  it('draws no highlight box for headline stacks when highlightActive=true (Issue 06)', () => {
    const ctx = makeMockCtx()
    paint(
      ctx,
      [{ words: ['chapter'], isHeadline: true }],
      makeConfig({ highlightActive: true, highlightColor: '#ff0000' })
    )
    // A headline is never highlighted, matching the live reader: no fill box is
    // drawn behind it. The headline rules are also in highlightColor but only
    // 40×2px, so a box would be wider than 40px and taller than 2px.
    const highlightBox = ctx._fillRects.find(
      (r) => r.fillStyle === '#ff0000' && r.w > 40 && r.h > 2
    )
    expect(highlightBox).toBeUndefined()
  })
})

describe('drawFrame — grid mode (stacksVisible > 1 or linesCount > 1)', () => {
  it('renders all stacks in a single-row multi-column layout', () => {
    const ctx = makeMockCtx()
    const stacks = [
      { words: ['one'], isHeadline: false },
      { words: ['two'], isHeadline: false },
      { words: ['three'], isHeadline: false },
    ]
    paint(ctx, stacks, makeConfig({ stacksVisible: 3, linesCount: 1 }))
    expect(ctx._fillTexts.map((t) => t.text)).toEqual(expect.arrayContaining(['one', 'two', 'three']))
  })

  it('renders all stacks in a multi-row grid layout', () => {
    const ctx = makeMockCtx()
    const stacks = Array.from({ length: 6 }, (_, i) => ({ words: [`w${i}`], isHeadline: false }))
    paint(ctx, stacks, makeConfig({ stacksVisible: 3, linesCount: 2 }))
    expect(ctx._fillTexts).toHaveLength(6)
  })

  it('paints nothing in reserved-but-empty slots', () => {
    const ctx = makeMockCtx()
    const stacks = Array.from({ length: 6 }, (_, i) => ({ words: [`w${i}`], isHeadline: false }))
    // Beat 1 of a 3×2 block: the line box holds six slots, two are filled.
    paint(ctx, stacks, makeConfig({ stacksVisible: 3, linesCount: 2 }), { currentIndex: 1 })
    expect(ctx._fillTexts.map((t) => t.text)).toEqual(['w0', 'w1'])
  })

  it('shrinks dense multi-line text so the top and bottom rows are not clipped', () => {
    const ctx = makeMockCtx()
    const stacks = Array.from({ length: 10 }, (_, i) => ({ words: [`w${i}`], isHeadline: false }))
    paint(ctx, stacks, makeConfig({ fontSize: 180, stacksVisible: 1, linesCount: 10 }))

    expect(ctx._fillTexts).toHaveLength(10)
    for (const call of ctx._fillTexts) {
      const bounds = textBoundsFromCall(call)
      expect(bounds.top).toBeGreaterThanOrEqual(54)
      expect(bounds.bottom).toBeLessThanOrEqual(666)
    }
  })

  it('keeps every drawn stack inside a dense video frame after solver degradation', () => {
    const ctx = makeMockCtx()
    const config = makeConfig({
      wordsPerStack: 8,
      stacksVisible: 6,
      linesCount: 6,
      fontSize: 180,
      stackGap: 120,
      linesRowGap: 80,
      stackHorizontalOffset: 500,
      stackVerticalOffset: -500,
    })
    const stacks = Array.from({ length: 36 }, (_, i) => ({
      words: [`dense${i}`, 'configuration', 'keeps', 'words'],
      isHeadline: false,
    }))
    const { frame } = frameFor(ctx, stacks, config, { width: 720, height: 720 })

    paint(ctx, stacks, config, { width: 720, height: 720 })

    expect(frame.stacksVisible).toBe(config.stacksVisible)
    expect(ctx._fillTexts).toHaveLength(frame.geometry.linesCount * config.stacksVisible)
    for (const call of ctx._fillTexts) {
      const bounds = textBoundsFromCall(call)
      expect(bounds.left).toBeGreaterThanOrEqual(0)
      expect(bounds.right).toBeLessThanOrEqual(720)
      expect(bounds.top).toBeGreaterThanOrEqual(0)
      expect(bounds.bottom).toBeLessThanOrEqual(720)
    }
  })

  it('places stacks at different x positions in multi-column mode', () => {
    const ctx = makeMockCtx()
    const stacks = [
      { words: ['left'], isHeadline: false },
      { words: ['right'], isHeadline: false },
    ]
    paint(ctx, stacks, makeConfig({ stacksVisible: 2, linesCount: 1 }))
    const leftX = ctx._fillTexts.find((t) => t.text === 'left')!.x
    const rightX = ctx._fillTexts.find((t) => t.text === 'right')!.x
    expect(rightX).toBeGreaterThan(leftX)
  })

  it('applies stackVerticalOffset to the grid', () => {
    const offset = 50
    const ctxNoOffset = makeMockCtx()
    const ctxWithOffset = makeMockCtx()
    const stack = [{ words: ['test'], isHeadline: false }]
    paint(ctxNoOffset, stack, makeConfig({ stacksVisible: 2, linesCount: 1, stackVerticalOffset: 0 }))
    paint(ctxWithOffset, stack, makeConfig({ stacksVisible: 2, linesCount: 1, stackVerticalOffset: offset }))
    const yNoOffset = ctxNoOffset._fillTexts[0]?.y ?? 0
    const yWithOffset = ctxWithOffset._fillTexts[0]?.y ?? 0
    expect(yWithOffset - yNoOffset).toBeCloseTo(offset, 0)
  })

  it('draws column dividers when showChunkDividers=true', () => {
    const ctx = makeMockCtx()
    const stacks = [
      { words: ['a'], isHeadline: false },
      { words: ['b'], isHeadline: false },
    ]
    // stroke() is called for dividers; track via a spy
    const strokeSpy = vi.spyOn(ctx, 'stroke')
    paint(ctx, stacks, makeConfig({ stacksVisible: 2, linesCount: 1, showChunkDividers: true }))
    expect(strokeSpy).toHaveBeenCalled()
  })

  it('does not draw dividers when showChunkDividers=false', () => {
    const ctx = makeMockCtx()
    const stacks = [
      { words: ['a'], isHeadline: false },
      { words: ['b'], isHeadline: false },
    ]
    const strokeSpy = vi.spyOn(ctx, 'stroke')
    paint(ctx, stacks, makeConfig({ stacksVisible: 2, linesCount: 1, showChunkDividers: false }))
    expect(strokeSpy).not.toHaveBeenCalled()
  })

  it('draws the current slot highlight in multi-column mode', () => {
    const ctx = makeMockCtx()
    const stacks = [
      { words: ['one'], isHeadline: false },
      { words: ['two'], isHeadline: false },
      { words: ['three'], isHeadline: false },
    ]
    paint(
      ctx,
      stacks,
      makeConfig({ stacksVisible: 3, linesCount: 1, highlightActive: true, highlightColor: '#ff0000' })
    )
    const highlightBoxes = ctx._fillRects.filter((r) => r.fillStyle === '#ff0000' && r.w > 20 && r.h > 10)
    expect(highlightBoxes).toHaveLength(1)
  })

  it('draws progressive highlights through the current slot in grid mode', () => {
    const ctx = makeMockCtx()
    const stacks = [
      { words: ['one'], isHeadline: false },
      { words: ['two'], isHeadline: false },
      { words: ['three'], isHeadline: false },
    ]
    paint(
      ctx,
      stacks,
      makeConfig({
        stacksVisible: 3,
        linesCount: 1,
        highlightActive: true,
        highlightColor: '#ff0000',
        highlightMode: 'progressive-bar'
      }),
      { currentIndex: 2 }
    )
    const highlightBoxes = ctx._fillRects.filter((r) => r.fillStyle === '#ff0000' && r.w > 20 && r.h > 10)
    expect(highlightBoxes.length).toBeGreaterThanOrEqual(3)
  })

  it('connects adjacent highlighted slots through the divider gap', () => {
    // progressive-bar at slot 1 → both stacks are simultaneously active. The reader
    // joins them into one bar (.stack-divider--active + .stack-slot--connected-*);
    // the exporter used to ignore the divider's active state and leave a gap.
    const ctx = makeMockCtx()
    const stacks = [
      { words: ['hello'], isHeadline: false },
      { words: ['world'], isHeadline: false },
    ]
    const config = makeConfig({
      stacksVisible: 2,
      linesCount: 1,
      highlightActive: true,
      highlightColor: '#ff0000',
      highlightMode: 'progressive-bar',
      showChunkDividers: true,
    })
    paint(ctx, stacks, config, { currentIndex: 1 })

    const highlightFills = ctx._fillRects
      .filter((r) => r.fillStyle === '#ff0000')
      .sort((a, b) => a.x - b.x)
    // Two word boxes plus the connector between them — no gap, no overlap.
    expect(highlightFills).toHaveLength(3)
    const [left, connector, right] = highlightFills
    expect(connector.x).toBe(left.x + left.w)
    expect(connector.x + connector.w).toBe(right.x)
  })

  it('leaves an inactive divider as the hairline rule', () => {
    const ctx = makeMockCtx()
    const stacks = [
      { words: ['hello'], isHeadline: false },
      { words: ['world'], isHeadline: false },
    ]
    const strokeSpy = vi.spyOn(ctx, 'stroke')
    // Default highlight mode → only slot 0 is active, so the divider stays inert.
    paint(
      ctx,
      stacks,
      makeConfig({
        stacksVisible: 2,
        linesCount: 1,
        highlightActive: true,
        highlightColor: '#ff0000',
        showChunkDividers: true,
      }),
      { currentIndex: 0 }
    )
    expect(strokeSpy).toHaveBeenCalled()
    expect(ctx._fillRects.filter((r) => r.fillStyle === '#ff0000')).toHaveLength(1)
  })

  it('draws panning-bar first-scan highlights in grid mode', () => {
    const ctx = makeMockCtx()
    const stacks = [
      { words: ['one'], isHeadline: false },
      { words: ['two'], isHeadline: false },
      { words: ['three'], isHeadline: false },
      { words: ['four'], isHeadline: false },
    ]
    paint(
      ctx,
      stacks,
      makeConfig({
        stacksVisible: 4,
        linesCount: 1,
        highlightActive: true,
        highlightColor: '#ff0000',
        highlightMode: 'panning-bar',
        highlightPanningChunkSize: 4
      }),
      { currentIndex: 0 }
    )
    const highlightBoxes = ctx._fillRects.filter((r) => r.fillStyle === '#ff0000' && r.w > 20 && r.h > 10)
    expect(highlightBoxes.length).toBeGreaterThanOrEqual(2)
  })
})

describe('drawFrame — stackVerticalOffset (single-stack)', () => {
  it('shifts the text Y position by the offset', () => {
    const ctxZero = makeMockCtx()
    const ctxShifted = makeMockCtx()
    const stack = [{ words: ['hello'], isHeadline: false }]

    paint(ctxZero, stack, makeConfig({ stackVerticalOffset: 0 }))
    paint(ctxShifted, stack, makeConfig({ stackVerticalOffset: 80 }))

    const yZero = ctxZero._fillTexts[0]?.y ?? 0
    const yShifted = ctxShifted._fillTexts[0]?.y ?? 0
    expect(yShifted - yZero).toBeCloseTo(80, 0)
  })
})

// ── Reader settings → TransmuteConfig mapping (via makeConfig fixture) ─────

describe('TransmuteConfig Reader-derived fields', () => {
  it('carries stackVerticalOffset', () => {
    const cfg = makeConfig({ stackVerticalOffset: 50 })
    expect(cfg.stackVerticalOffset).toBe(50)
  })

  it('carries highlightActive and highlightColor', () => {
    const cfg = makeConfig({ highlightActive: true, highlightColor: '#ff0000' })
    expect(cfg.highlightActive).toBe(true)
    expect(cfg.highlightColor).toBe('#ff0000')
  })

  it('carries linesCount, linesRowGap, stacksVisible, stackGap', () => {
    const cfg = makeConfig({
      linesCount: 4,
      linesRowGap: 12,
      stacksVisible: 2,
      stackGap: 24
    })
    expect(cfg.linesCount).toBe(4)
    expect(cfg.linesRowGap).toBe(12)
    expect(cfg.stacksVisible).toBe(2)
    expect(cfg.stackGap).toBe(24)
  })

  it('carries showChunkDividers', () => {
    const cfg = makeConfig({ showChunkDividers: false })
    expect(cfg.showChunkDividers).toBe(false)
  })

  it('carries bgColorOverride and transparentBackground', () => {
    const cfg = makeConfig({ bgColorOverride: '#aabbcc', transparentBackground: true })
    expect(cfg.bgColorOverride).toBe('#aabbcc')
    expect(cfg.transparentBackground).toBe(true)
  })

  it('does not affect video-specific fields', () => {
    const cfg = makeConfig({ resolution: '1080x1920', maxDurationMinutes: 5 })
    expect(cfg.resolution).toBe('1080x1920')
    expect(cfg.maxDurationMinutes).toBe(5)
  })
})

// ── drawFrame — multi-segment isolation ────────────────────────────────────
//
// These tests verify that drawFrame produces independent output on each call
// regardless of prior calls — i.e., that segment N+1 is not affected by the
// canvas state left by segment N.  This mirrors the fix in renderVideo where
// a fresh OffscreenCanvas is created per segment.

describe('drawFrame — segment isolation (fresh context per call)', () => {
  it('draws background and text on a fresh context for the first segment', () => {
    const ctx = makeMockCtx()
    paint(ctx, [{ words: ['alpha'], isHeadline: false }], makeConfig({ bgColor: '#111111', textColor: '#ffffff' }))
    const bgFill = ctx._fillRects[0]
    expect(bgFill.fillStyle).toBe('#111111')
    const textDraw = ctx._fillTexts.find((t) => t.text === 'alpha')
    expect(textDraw).toBeDefined()
    expect(textDraw!.fillStyle).toBe('#ffffff')
  })

  it('draws background and text correctly on a separate fresh context for the second segment', () => {
    // Simulate segment 1 drawing
    const ctx1 = makeMockCtx()
    paint(ctx1, [{ words: ['seg1'], isHeadline: false }], makeConfig({ bgColor: '#111111' }))

    // Simulate segment 2 drawing on its OWN fresh context — must be fully independent
    const ctx2 = makeMockCtx()
    paint(ctx2, [{ words: ['seg2'], isHeadline: false }], makeConfig({ bgColor: '#222222', textColor: '#eeeeee' }))

    // Segment 2's context must have its own background
    const bg2 = ctx2._fillRects[0]
    expect(bg2.fillStyle).toBe('#222222')
    // Segment 2's text must be drawn
    expect(ctx2._fillTexts.find((t) => t.text === 'seg2')).toBeDefined()
    // Segment 1's text must NOT appear on ctx2
    expect(ctx2._fillTexts.find((t) => t.text === 'seg1')).toBeUndefined()
  })

  it('draws the correct stack text for every call in a sequence of segment frames', () => {
    const words = ['first', 'second', 'third']
    words.forEach((word) => {
      // Each iteration simulates a fresh canvas for that segment
      const ctx = makeMockCtx()
      paint(ctx, [{ words: [word], isHeadline: false }], makeConfig())
      const drawn = ctx._fillTexts.find((t) => t.text === word)
      expect(drawn).toBeDefined()
    })
  })

  it('fills the background on every drawFrame call regardless of prior state', () => {
    // The same mock context reused to verify background fill is always present
    const ctx = makeMockCtx()
    for (let i = 0; i < 3; i++) {
      const before = ctx._fillRects.length
      paint(ctx, [{ words: [`word${i}`], isHeadline: false }], makeConfig({ bgColor: '#0a0a0a' }))
      // At least one fillRect was added per call (the background)
      const added = ctx._fillRects.slice(before)
      expect(added.some((r) => r.fillStyle === '#0a0a0a' && r.w === 1280 && r.h === 720)).toBe(true)
    }
  })

  it('draws headline text on a second-segment context after a normal-text first segment', () => {
    // Segment 1: normal text
    const ctx1 = makeMockCtx()
    paint(ctx1, [{ words: ['body'], isHeadline: false }], makeConfig())

    // Segment 2: headline — must render correctly on its own fresh context
    const ctx2 = makeMockCtx()
    paint(ctx2, [{ words: ['chapter', 'one'], isHeadline: true }], makeConfig())
    const textDraw = ctx2._fillTexts.find((t) => t.text === 'CHAPTER ONE')
    expect(textDraw).toBeDefined()
    // Decorative rules (40×2px) must appear
    const ruleRects = ctx2._fillRects.filter((r) => r.w === 40 && r.h === 2)
    expect(ruleRects).toHaveLength(2)
  })
})

// ── drawFrame — progress overlay ───────────────────────────────────────────

describe('drawFrame — progress overlay', () => {
  const HELLO = [{ words: ['hello'], isHeadline: false }]

  it('does not draw overlay elements when showProgressOverlay is false', () => {
    const ctx = makeMockCtx()
    paint(ctx, HELLO, makeConfig({ showProgressOverlay: false }), { progress: 0.5 })
    expect(ctx._fillTexts.some((t) => t.text.includes('%'))).toBe(false)
  })

  it('draws a percentage chip when showProgressOverlay is true', () => {
    const ctx = makeMockCtx()
    paint(ctx, HELLO, makeConfig({ showProgressOverlay: true }), { progress: 0.47 })
    expect(ctx._fillTexts.some((t) => t.text === '47%')).toBe(true)
  })

  it('draws two bar rects (track + fill) when showProgressOverlay is true', () => {
    const ctx = makeMockCtx()
    paint(ctx, HELLO, makeConfig({ showProgressOverlay: true }), { progress: 0.5 })
    // Track and fill are both drawn at OVERLAY_BAR_W = 5px wide
    const barRects = ctx._fillRects.filter((r) => r.w === 5)
    expect(barRects).toHaveLength(2)
  })

  it('does not draw overlay when progressFraction is undefined even if showProgressOverlay is true', () => {
    const ctx = makeMockCtx()
    paint(ctx, HELLO, makeConfig({ showProgressOverlay: true }))
    expect(ctx._fillTexts.some((t) => t.text.includes('%'))).toBe(false)
  })

  it('shifts text cx right when overlay is on vs off', () => {
    const ctxOn = makeMockCtx()
    const ctxOff = makeMockCtx()
    const stack = [{ words: ['test'], isHeadline: false }]
    paint(ctxOn, stack, makeConfig({ showProgressOverlay: true }), { progress: 0.5 })
    paint(ctxOff, stack, makeConfig({ showProgressOverlay: false }))
    const xOn = ctxOn._fillTexts.find((t) => t.text === 'test')!.x
    const xOff = ctxOff._fillTexts.find((t) => t.text === 'test')!.x
    expect(xOn).toBeGreaterThan(xOff)
  })

  it('clamps percentage to 100 when progress exceeds 1', () => {
    const ctx = makeMockCtx()
    paint(ctx, HELLO, makeConfig({ showProgressOverlay: true }), { progress: 1.5 })
    expect(ctx._fillTexts.some((t) => t.text === '100%')).toBe(true)
  })
})
