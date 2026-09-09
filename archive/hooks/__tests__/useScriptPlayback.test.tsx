/**
 * useScriptPlayback — hook behaviour tests.
 * Environment: happy-dom (matched by vitest.config.ts environmentMatchGlobs).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { useScriptPlayback } from '../useScriptPlayback'
import type { ScriptToken, ScriptTokenConfig, ScriptBlock, ScriptProject } from '../../engine/scriptTypes'
import { DEFAULT_SCRIPT_CONFIG, createEmptyProject, exportProjectAsJson, flattenBlocks } from '../../engine/scriptBuilder'

afterEach(cleanup)

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE_CONFIG: ScriptTokenConfig = { ...DEFAULT_SCRIPT_CONFIG, bpm: 600 }

const BASE_BLOCK_CFG = { bpm: 600, wordsPerStack: 3, stacksVisible: 1 }

function makeToken(id: number, blockId = 0): ScriptToken {
  return {
    id,
    blockId,
    stack: { words: [`word${id}`], type: 'normal' },
    timestampMs: null,
    configOverride: null,
  }
}

function makeTokens(count: number, blockId = 0): ScriptToken[] {
  return Array.from({ length: count }, (_, i) => makeToken(i, blockId))
}

/** Create a single ScriptBlock wrapping the given tokens. */
function makeBlock(id: number, tokens: ScriptToken[]): ScriptBlock {
  return {
    id,
    sourceText: tokens.map((t) => t.stack.words.join(' ')).join(' '),
    config: BASE_BLOCK_CFG,
    tokens,
  }
}

/** Convenience: one block containing all tokens. */
function singleBlock(tokens: ScriptToken[]): ScriptBlock[] {
  return [makeBlock(0, tokens)]
}

// ── click-to-read timestamp recording ────────────────────────────────────────

describe('useScriptPlayback — click-to-read timestamps', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('stamps an increasing timestampMs on each advance call', () => {
    const tokens = makeTokens(4)
    const onTokensChange = vi.fn()

    const { result } = renderHook(() =>
      useScriptPlayback(tokens, singleBlock(tokens), BASE_CONFIG, onTokensChange)
    )

    act(() => {
      result.current.startClickToRead()
    })

    act(() => {
      vi.advanceTimersByTime(500)
      result.current.advance()
    })
    act(() => {
      vi.advanceTimersByTime(300)
      result.current.advance()
    })

    const calls = onTokensChange.mock.calls
    const ts0 = calls[0][0][0].timestampMs as number
    const ts1 = calls[1][0][1].timestampMs as number

    expect(ts0).toBeGreaterThan(0)
    expect(ts1).toBeGreaterThan(ts0)
  })

  it('stamps monotonically increasing timestamps across multiple advances', () => {
    const tokens = makeTokens(5)
    const onTokensChange = vi.fn()

    const { result } = renderHook(() =>
      useScriptPlayback(tokens, singleBlock(tokens), BASE_CONFIG, onTokensChange)
    )

    act(() => {
      result.current.startClickToRead()
    })

    const timestamps: number[] = []
    for (let i = 0; i < 4; i++) {
      act(() => {
        vi.advanceTimersByTime(200)
        result.current.advance()
      })
      const lastCall = onTokensChange.mock.calls[onTokensChange.mock.calls.length - 1]
      timestamps.push(lastCall[0][i].timestampMs as number)
    }

    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeGreaterThan(timestamps[i - 1])
    }
  })

  it('does not stamp timestamps in preview (BPM) mode', () => {
    const tokens = makeTokens(3)
    const onTokensChange = vi.fn()

    const { result } = renderHook(() =>
      useScriptPlayback(tokens, singleBlock(tokens), BASE_CONFIG, onTokensChange)
    )

    act(() => {
      result.current.startPreview()
    })

    act(() => {
      result.current.advance()
    })

    const anyStamped = onTokensChange.mock.calls.some((call) =>
      call[0].some((t: ScriptToken) => t.timestampMs !== null)
    )
    expect(anyStamped).toBe(false)
  })

  it('stop() clears the start time so subsequent advances do not stamp', () => {
    const tokens = makeTokens(4)
    const onTokensChange = vi.fn()

    const { result } = renderHook(() =>
      useScriptPlayback(tokens, singleBlock(tokens), BASE_CONFIG, onTokensChange)
    )

    act(() => {
      result.current.startClickToRead()
    })
    act(() => {
      vi.advanceTimersByTime(200)
      result.current.stop()
    })
    act(() => {
      result.current.startClickToRead()
    })
    act(() => {
      vi.advanceTimersByTime(100)
      result.current.advance()
    })

    const lastCall = onTokensChange.mock.calls[onTokensChange.mock.calls.length - 1]
    const stampedTs = lastCall[0][0].timestampMs as number
    // Timestamp should be ~100ms (from the restarted session), not 300ms
    expect(stampedTs).toBeLessThan(300)
  })
})

// ── mode and state ────────────────────────────────────────────────────────────

describe('useScriptPlayback — mode and state', () => {
  it('starts in preview mode with isPlaying=false', () => {
    const tokens = makeTokens(2)
    const { result } = renderHook(() =>
      useScriptPlayback(tokens, singleBlock(tokens), BASE_CONFIG, vi.fn())
    )
    expect(result.current.mode).toBe('preview')
    expect(result.current.isPlaying).toBe(false)
  })

  it('startClickToRead sets mode to click-to-read', () => {
    const tokens = makeTokens(2)
    const { result } = renderHook(() =>
      useScriptPlayback(tokens, singleBlock(tokens), BASE_CONFIG, vi.fn())
    )
    act(() => { result.current.startClickToRead() })
    expect(result.current.mode).toBe('click-to-read')
    expect(result.current.isPlaying).toBe(true)
  })

  it('startPreview sets mode to preview and isPlaying=true', () => {
    vi.useFakeTimers()
    const tokens = makeTokens(3)
    const { result } = renderHook(() =>
      useScriptPlayback(tokens, singleBlock(tokens), BASE_CONFIG, vi.fn())
    )
    act(() => { result.current.startPreview() })
    expect(result.current.mode).toBe('preview')
    expect(result.current.isPlaying).toBe(true)
    vi.useRealTimers()
  })

  it('startPreview resets currentTokenIdx to 0 so repeated calls always restart from the beginning', () => {
    vi.useFakeTimers()
    const tokens = makeTokens(3)
    const { result } = renderHook(() =>
      useScriptPlayback(tokens, singleBlock(tokens), BASE_CONFIG, vi.fn())
    )
    act(() => { result.current.seekTo(2) })
    expect(result.current.currentTokenIdx).toBe(2)

    act(() => { result.current.startPreview() })
    expect(result.current.currentTokenIdx).toBe(0)
    expect(result.current.isPlaying).toBe(true)
    vi.useRealTimers()
  })

  it('pause sets isPlaying=false', () => {
    const tokens = makeTokens(2)
    const { result } = renderHook(() =>
      useScriptPlayback(tokens, singleBlock(tokens), BASE_CONFIG, vi.fn())
    )
    act(() => { result.current.startClickToRead() })
    act(() => { result.current.pause() })
    expect(result.current.isPlaying).toBe(false)
  })

  it('stop resets currentTokenIdx to 0', () => {
    const tokens = makeTokens(3)
    const { result } = renderHook(() =>
      useScriptPlayback(tokens, singleBlock(tokens), BASE_CONFIG, vi.fn())
    )
    act(() => { result.current.startClickToRead() })
    act(() => { result.current.advance() })
    act(() => { result.current.stop() })
    expect(result.current.currentTokenIdx).toBe(0)
  })

  it('does not expose a startSync method', () => {
    const tokens = makeTokens(2)
    const { result } = renderHook(() =>
      useScriptPlayback(tokens, singleBlock(tokens), BASE_CONFIG, vi.fn())
    )
    expect((result.current as unknown as Record<string, unknown>).startSync).toBeUndefined()
  })
})

// ── setTokens / updateToken ───────────────────────────────────────────────────

describe('useScriptPlayback — setTokens / updateToken', () => {
  it('setTokens resets to index 0 and stops playback', () => {
    const tokens = makeTokens(3)
    const { result } = renderHook(() =>
      useScriptPlayback(tokens, singleBlock(tokens), BASE_CONFIG, vi.fn())
    )
    act(() => { result.current.startClickToRead() })
    act(() => { result.current.advance() })
    const newTokens = makeTokens(5)
    act(() => { result.current.setTokens(newTokens) })
    expect(result.current.currentTokenIdx).toBe(0)
    expect(result.current.isPlaying).toBe(false)
  })

  it('setTokens with blocks updates blocksRef', () => {
    vi.useFakeTimers()
    const tokens = makeTokens(3)
    const blocks = singleBlock(tokens)
    const { result } = renderHook(() =>
      useScriptPlayback(tokens, blocks, BASE_CONFIG, vi.fn())
    )
    const newTokens = makeTokens(2)
    const newBlocks = singleBlock(newTokens)
    act(() => { result.current.setTokens(newTokens, newBlocks) })
    expect(result.current.tokens).toHaveLength(2)
    vi.useRealTimers()
  })

  it('updateToken mutates a single token in place', () => {
    const onTokensChange = vi.fn()
    const tokens = makeTokens(3)
    const { result } = renderHook(() =>
      useScriptPlayback(tokens, singleBlock(tokens), BASE_CONFIG, onTokensChange)
    )
    act(() => {
      result.current.updateToken(1, { timestampMs: 9999 })
    })
    const updated = onTokensChange.mock.calls[0][0] as ScriptToken[]
    expect(updated[1].timestampMs).toBe(9999)
    expect(updated[0].timestampMs).toBeNull()
    expect(updated[2].timestampMs).toBeNull()
  })
})

// ── patchTokens ───────────────────────────────────────────────────────────────

describe('useScriptPlayback — patchTokens', () => {
  it('updates tokens without stopping playback', () => {
    const tokens = makeTokens(3)
    const { result } = renderHook(() =>
      useScriptPlayback(tokens, singleBlock(tokens), BASE_CONFIG, vi.fn())
    )
    act(() => { result.current.startClickToRead() })
    expect(result.current.isPlaying).toBe(true)

    const newTokens = makeTokens(4)
    act(() => { result.current.patchTokens(newTokens) })

    expect(result.current.isPlaying).toBe(true)
    expect(result.current.tokens).toHaveLength(4)
  })

  it('preserves currentTokenIdx after patch when index is still valid', () => {
    const tokens = makeTokens(5)
    const { result } = renderHook(() =>
      useScriptPlayback(tokens, singleBlock(tokens), BASE_CONFIG, vi.fn())
    )
    act(() => { result.current.startClickToRead() })
    act(() => { result.current.advance() })
    act(() => { result.current.advance() })
    expect(result.current.currentTokenIdx).toBe(2)

    act(() => { result.current.patchTokens(makeTokens(5)) })

    expect(result.current.currentTokenIdx).toBe(2)
  })

  it('clamps currentTokenIdx when patched array is shorter', () => {
    const tokens = makeTokens(5)
    const { result } = renderHook(() =>
      useScriptPlayback(tokens, singleBlock(tokens), BASE_CONFIG, vi.fn())
    )
    act(() => { result.current.startClickToRead() })
    act(() => { result.current.advance() })
    act(() => { result.current.advance() })
    act(() => { result.current.advance() })
    expect(result.current.currentTokenIdx).toBe(3)

    act(() => { result.current.patchTokens(makeTokens(2)) })

    expect(result.current.currentTokenIdx).toBe(1)
    expect(result.current.tokens).toHaveLength(2)
  })

  it('resets index to 0 when patched with empty array', () => {
    const tokens = makeTokens(3)
    const { result } = renderHook(() =>
      useScriptPlayback(tokens, singleBlock(tokens), BASE_CONFIG, vi.fn())
    )
    act(() => { result.current.startClickToRead() })
    act(() => { result.current.advance() })

    act(() => { result.current.patchTokens([]) })

    expect(result.current.currentTokenIdx).toBe(0)
    expect(result.current.tokens).toHaveLength(0)
  })

  it('does not stop preview (BPM) playback when tokens are patched', () => {
    vi.useFakeTimers()
    const tokens = makeTokens(4)
    const { result } = renderHook(() =>
      useScriptPlayback(tokens, singleBlock(tokens), BASE_CONFIG, vi.fn())
    )
    act(() => { result.current.startPreview() })
    expect(result.current.isPlaying).toBe(true)

    act(() => { result.current.patchTokens(makeTokens(5)) })

    expect(result.current.isPlaying).toBe(true)
    vi.useRealTimers()
  })

  it('reflects token text changes in the patched array', () => {
    const tokens = makeTokens(3)
    const { result } = renderHook(() =>
      useScriptPlayback(tokens, singleBlock(tokens), BASE_CONFIG, vi.fn())
    )
    const edited = tokens.map((t) =>
      t.id === 1 ? { ...t, stack: { words: ['edited'], type: 'normal' as const } } : t
    )

    act(() => { result.current.patchTokens(edited) })

    expect(result.current.tokens[1].stack.words[0]).toBe('edited')
  })
})

// ── patchBlocks ───────────────────────────────────────────────────────────────

describe('useScriptPlayback — patchBlocks', () => {
  it('patchBlocks updates the blocks reference used for duration resolution', () => {
    vi.useFakeTimers()
    const tokens = makeTokens(3)
    const blocks = singleBlock(tokens)
    const { result } = renderHook(() =>
      useScriptPlayback(tokens, blocks, BASE_CONFIG, vi.fn())
    )

    const newBlocks: ScriptBlock[] = [
      { ...blocks[0], config: { ...BASE_BLOCK_CFG, bpm: 999 } },
    ]
    // patchBlocks should not throw and should accept the new block list
    act(() => { result.current.patchBlocks(newBlocks) })

    // After patching, the hook uses the new bpm for auto-advance (no assertion on timer
    // internals, but we verify patchBlocks is callable and doesn't disrupt playback state)
    expect(result.current.isPlaying).toBe(false)
    vi.useRealTimers()
  })

  it('patchBlocks does not stop or reset playback', () => {
    vi.useFakeTimers()
    const tokens = makeTokens(3)
    const blocks = singleBlock(tokens)
    const { result } = renderHook(() =>
      useScriptPlayback(tokens, blocks, BASE_CONFIG, vi.fn())
    )

    act(() => { result.current.startClickToRead() })
    expect(result.current.isPlaying).toBe(true)

    act(() => {
      result.current.patchBlocks([{ ...blocks[0], config: { ...BASE_BLOCK_CFG, bpm: 200 } }])
    })

    expect(result.current.isPlaying).toBe(true)
    expect(result.current.currentTokenIdx).toBe(0)
    vi.useRealTimers()
  })
})

// ── exportProjectAsJson (DOM — runs under happy-dom) ─────────────────────────

describe('exportProjectAsJson', () => {
  it('uses .script.json extension for the download filename', () => {
    const project = createEmptyProject('My Script', BASE_CONFIG)
    const mockAnchor = { href: '', download: '', click: vi.fn() }
    vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as unknown as HTMLElement)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    exportProjectAsJson(project)

    expect(mockAnchor.download).toMatch(/\.script\.json$/)
  })

  it('sanitizes project name for the filename', () => {
    const project = createEmptyProject('My Cool Script!', BASE_CONFIG)
    const mockAnchor = { href: '', download: '', click: vi.fn() }
    vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as unknown as HTMLElement)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    exportProjectAsJson(project)

    expect(mockAnchor.download).not.toContain('!')
    expect(mockAnchor.download).toMatch(/\.script\.json$/)
  })

  it('strips block sourceText, tokens, and project sourceText from the exported JSON', async () => {
    const block: ScriptBlock = {
      id: 0,
      sourceText: 'hello world foo bar',
      config: { bpm: 60, wordsPerStack: 2, stacksVisible: 1 },
      tokens: [
        { id: 0, blockId: 0, stack: { words: ['hello', 'world'], type: 'normal' }, timestampMs: null, configOverride: null },
        { id: 1, blockId: 0, stack: { words: ['foo', 'bar'], type: 'normal' }, timestampMs: null, configOverride: null },
      ],
    }
    const project: ScriptProject = {
      ...createEmptyProject('Export Test', BASE_CONFIG),
      sourceText: 'original tray text',
      blocks: [block],
    }

    let capturedBlob: Blob | null = null
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
      capturedBlob = b as Blob
      return 'blob:mock'
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const mockAnchor = { href: '', download: '', click: vi.fn() }
    vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as unknown as HTMLElement)

    exportProjectAsJson(project)

    expect(capturedBlob).not.toBeNull()
    const text = await capturedBlob!.text()
    const parsed = JSON.parse(text) as ScriptProject

    // Block content is stripped
    expect(parsed.blocks[0].sourceText).toBe('')
    expect(parsed.blocks[0].tokens).toHaveLength(0)
    // Project-level tray text is also stripped
    expect(parsed.sourceText).toBe('')
    // Block structure is preserved (id, config)
    expect(parsed.blocks[0].id).toBe(0)
    expect(parsed.blocks[0].config.bpm).toBe(60)
    expect(parsed.blocks[0].config.stacksVisible).toBe(1)
  })
})

// ── playback stops at last injected word ──────────────────────────────────────

describe('useScriptPlayback — stops at last injected word', () => {
  beforeEach(() => {
    // exportProjectAsJson tests spy on document.createElement; restore before each test
    // in this suite so renderHook has a real DOM.
    vi.restoreAllMocks()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('BPM preview stops when reaching the final token from partially-filled blocks', () => {
    // Simulate: blocks configured for more words than were actually injected.
    // The flat token list has 3 tokens. Playback must stop after token index 2.
    const tokens = makeTokens(3)
    const blocks = singleBlock(tokens)
    const { result } = renderHook(() =>
      useScriptPlayback(tokens, blocks, BASE_CONFIG, vi.fn())
    )

    act(() => { result.current.startPreview() })
    expect(result.current.isPlaying).toBe(true)
    expect(result.current.currentTokenIdx).toBe(0)

    // Advance through all 3 tokens (BPM=600 → beatMs=100ms each)
    act(() => { vi.advanceTimersByTime(100) })
    act(() => { vi.advanceTimersByTime(100) })
    act(() => { vi.advanceTimersByTime(100) })

    // After exhausting tokens, playback should have stopped
    expect(result.current.isPlaying).toBe(false)
    expect(result.current.currentTokenIdx).toBe(2)
  })

  it('empty blocks contribute no tokens — flat list length equals injected word count', () => {
    // 1 filled block (3 tokens) + 2 empty blocks (0 tokens each)
    const filledTokens = makeTokens(3, 0)
    const filledBlock = makeBlock(0, filledTokens)
    const emptyBlock1: ScriptBlock = {
      id: 1,
      sourceText: '',
      config: { bpm: 60, wordsPerStack: 3, stacksVisible: 1, targetWordCount: 10 },
      tokens: [],
    }
    const emptyBlock2: ScriptBlock = {
      id: 2,
      sourceText: '',
      config: { bpm: 60, wordsPerStack: 3, stacksVisible: 1, targetWordCount: 10 },
      tokens: [],
    }
    const flat = flattenBlocks([filledBlock, emptyBlock1, emptyBlock2])
    expect(flat).toHaveLength(3)
  })
})
