import { buildStacks, pauseMs } from '@renderer/engine/tokenizer'
import type { ChunkRules } from '@renderer/engine/tokenizer'
import type { Settings } from '@renderer/types'
import type {
  ScriptTokenConfig,
  ScriptToken,
  ScriptProject,
  ScriptBlock,
  ScriptBlockConfig,
} from './scriptTypes'

/** One cell in the display grid returned by computeDisplayGrid. */
export interface DisplaySlot {
  words: string[]
  isHeadline: boolean
}

// ── Word counting & text splitting ───────────────────────────────────────────

/** Count whitespace-separated words in text. Returns 0 for empty or whitespace-only input. */
export function countWords(text: string): number {
  const t = text.trim()
  return t === '' ? 0 : t.split(/\s+/).length
}

/**
 * Split text so the taken portion contains at most wordCount words, preserving
 * internal whitespace (including paragraph breaks). Both parts are trimmed.
 */
export function splitTextByWordCount(
  text: string,
  wordCount: number
): { taken: string; remaining: string } {
  if (wordCount <= 0) return { taken: '', remaining: text.trim() }
  let count = 0
  let i = 0
  while (i < text.length && count < wordCount) {
    while (i < text.length && /\s/.test(text[i])) i++
    if (i >= text.length) break
    while (i < text.length && !/\s/.test(text[i])) i++
    count++
  }
  return { taken: text.slice(0, i).trim(), remaining: text.slice(i).trim() }
}

// ── Block factories ───────────────────────────────────────────────────────────

/**
 * Create a new ScriptBlock by tokenizing sourceText with the given block config.
 * Chunk rules and timing modifiers (pauseAtSentences, etc.) come from projectConfig.
 * @param id           Stable block id (never re-indexed; caller tracks nextBlockId).
 * @param sourceText   Raw injected text.
 * @param config       BPM, wordsPerStack, stacksVisible for this block.
 * @param projectConfig Project-wide config — provides chunk rules and pause settings.
 * @param globalOffset Starting value for globally-unique child token ids.
 */
export function createBlock(
  id: number,
  sourceText: string,
  config: ScriptBlockConfig,
  projectConfig: ScriptTokenConfig,
  globalOffset = 0,
  rules?: ChunkRules
): ScriptBlock {
  const text = sourceText.trim()
  if (!text) return { id, sourceText, config, tokens: [] }
  const stacks = buildStacks(text, config.wordsPerStack, rules)
  const tokens: ScriptToken[] = stacks.map((stack, i) => ({
    id: globalOffset + i,
    blockId: id,
    stack,
    timestampMs: null,
    configOverride: null,
  }))
  return { id, sourceText, config, tokens }
}

/**
 * Create an empty ScriptBlock with no source text or tokens.
 * The block is pre-configured with a target word count and playback settings;
 * text is injected later via distributeTextIntoBlocks.
 */
export function createEmptyBlock(id: number, config: ScriptBlockConfig): ScriptBlock {
  return { id, sourceText: '', config, tokens: [] }
}

/**
 * Flatten all blocks into a single token array with contiguous 0-based ids.
 * This is the token list consumed by the playback hook.
 */
export function flattenBlocks(blocks: ScriptBlock[]): ScriptToken[] {
  let id = 0
  const result: ScriptToken[] = []
  for (const block of blocks) {
    for (const token of block.tokens) {
      result.push({ ...token, id: id++ })
    }
  }
  return result
}

/**
 * Apply a config patch to one block and return the updated blocks array.
 * - bpm change: updates config only (no re-tokenization needed).
 * - wordsPerStack change: re-tokenizes the block's sourceText; preserves
 *   per-token configOverride and timestampMs by position (best effort).
 * - stacksVisible change: updates config only.
 * Global token ids are reassigned across all blocks after the update.
 */
export function updateBlockConfig(
  blocks: ScriptBlock[],
  blockId: number,
  patch: Partial<ScriptBlockConfig>,
  projectConfig: ScriptTokenConfig,
  rules?: ChunkRules
): ScriptBlock[] {
  let offset = 0
  return blocks.map((block) => {
    if (block.id !== blockId) {
      const newTokens = block.tokens.map((t) => ({ ...t, id: offset++ }))
      return { ...block, tokens: newTokens }
    }
    const newConfig: ScriptBlockConfig = { ...block.config, ...patch }
    if (patch.wordsPerStack !== undefined && patch.wordsPerStack !== block.config.wordsPerStack) {
      // Re-tokenize: word boundaries change
      const stacks = buildStacks(block.sourceText.trim(), newConfig.wordsPerStack, rules)
      const newTokens: ScriptToken[] = stacks.map((stack, i) => {
        const prev = block.tokens[i]
        return {
          id: offset + i,
          blockId: block.id,
          stack,
          timestampMs: prev?.timestampMs ?? null,
          configOverride: prev?.configOverride ?? null,
        }
      })
      offset += newTokens.length
      return { ...block, config: newConfig, tokens: newTokens }
    }
    // Config-only update (bpm or stacksVisible): keep existing tokens, just re-id them
    const newTokens = block.tokens.map((t) => ({ ...t, id: offset++ }))
    return { ...block, config: newConfig, tokens: newTokens }
  })
}

/**
 * Distribute trayText across blocks in order, filling each block up to its
 * remaining word capacity (targetWordCount - currentWordCount).
 * Blocks without targetWordCount (legacy) are skipped.
 * If a block already has some text, only the remaining capacity is filled.
 * Returns the updated blocks array and any tray text that was not consumed.
 */
export function distributeTextIntoBlocks(
  blocks: ScriptBlock[],
  trayText: string,
  projectConfig: ScriptTokenConfig,
  rules?: ChunkRules
): { blocks: ScriptBlock[]; remainingText: string } {
  let remaining = trayText.trim()
  let globalOffset = 0

  const newBlocks = blocks.map((block) => {
    const target = block.config.targetWordCount
    if (target === undefined) {
      // Legacy block: treat as full — re-index tokens only
      const newTokens = block.tokens.map((t) => ({ ...t, id: globalOffset++ }))
      return { ...block, tokens: newTokens }
    }
    const currentWordCount = countWords(block.sourceText)
    const capacity = target - currentWordCount
    if (capacity <= 0 || !remaining) {
      const newTokens = block.tokens.map((t) => ({ ...t, id: globalOffset++ }))
      return { ...block, tokens: newTokens }
    }
    const { taken, remaining: rest } = splitTextByWordCount(remaining, capacity)
    remaining = rest
    if (!taken) {
      const newTokens = block.tokens.map((t) => ({ ...t, id: globalOffset++ }))
      return { ...block, tokens: newTokens }
    }
    const newSourceText = block.sourceText.trim()
      ? block.sourceText.trim() + ' ' + taken
      : taken
    const stacks = buildStacks(newSourceText, block.config.wordsPerStack, rules)
    const newTokens: ScriptToken[] = stacks.map((stack, i) => ({
      id: globalOffset + i,
      blockId: block.id,
      stack,
      timestampMs: null,
      configOverride: null,
    }))
    globalOffset += newTokens.length
    return { ...block, sourceText: newSourceText, tokens: newTokens }
  })

  return { blocks: newBlocks, remainingText: remaining }
}

/** Clear sourceText and tokens from one block, preserving its config. */
export function clearBlockText(blocks: ScriptBlock[], blockId: number): ScriptBlock[] {
  let offset = 0
  return blocks.map((block) => {
    if (block.id !== blockId) {
      return { ...block, tokens: block.tokens.map((t) => ({ ...t, id: offset++ })) }
    }
    return { ...block, sourceText: '', tokens: [] }
  })
}

/** Clear sourceText and tokens from all blocks, preserving their configs. */
export function clearAllBlocksText(blocks: ScriptBlock[]): ScriptBlock[] {
  return blocks.map((block) => ({ ...block, sourceText: '', tokens: [] }))
}

// ── Duration calculation ──────────────────────────────────────────────────────

/**
 * Return display duration in milliseconds for a single token.
 * Resolution order: token.configOverride.bpm → block.config.bpm.
 * pauseAtSentences/pauseAtHeadlines always come from the project config.
 */
export function calcTokenDuration(
  token: ScriptToken,
  block: ScriptBlock,
  projectConfig: ScriptTokenConfig
): number {
  const bpm = token.configOverride?.bpm ?? block.config.bpm
  const beatMs = 60_000 / bpm
  return pauseMs(token.stack.type, beatMs, {
    pauseAtSentences: block.config.pauseAtSentences ?? projectConfig.pauseAtSentences,
    pauseAtHeadlines: block.config.pauseAtHeadlines ?? projectConfig.pauseAtHeadlines,
  })
}

// ── Settings bridge ───────────────────────────────────────────────────────────

/** Bootstrap a ScriptTokenConfig from the app's global Settings.
 * Colors are resolved to concrete values at project-creation time so the script
 * is self-contained and unaffected by later reader setting changes.
 */
export function defaultConfigFromSettings(settings: Settings): ScriptTokenConfig {
  return {
    bpm: settings.bpm,
    pauseAtSentences: settings.pause_at_sentences,
    pauseAtHeadlines: settings.pause_at_headlines,
    wordsPerStack: settings.words_per_stack,
    stacksVisible: settings.stacks_visible,
    stackGap: settings.stack_gap,
    linesEnabled: settings.lines_enabled,
    linesCount: settings.lines_count,
    linesRowGap: settings.lines_row_gap,
    stackVerticalOffset: settings.stack_vertical_offset,
    stackHorizontalOffset: settings.stack_horizontal_offset,
    fontSize: settings.font_size,
    minFontSize: 12,
    // Resolve colors to concrete strings now — prevents fallthrough to global settings later
    textColor: settings.text_color || (settings.theme === 'light' ? '#1a1a1a' : '#f0f0f0'),
    bgColor: settings.viewport_bg_color || (settings.theme === 'light' ? '#f5f5f5' : '#1a1a1a'),
    highlightColor: settings.highlight_color || '',
    highlightTextColor: settings.highlight_text_color || '',
    // Capture display settings that were previously read from Settings at render time
    fontFamily: settings.font_family || 'system-ui, sans-serif',
    highlightActive: settings.highlight_active,
    showChunkDividers: settings.show_chunk_dividers,
  }
}

/** Default config used when no app settings are available. */
export const DEFAULT_SCRIPT_CONFIG: ScriptTokenConfig = {
  bpm: 60,
  pauseAtSentences: true,
  pauseAtHeadlines: true,
  wordsPerStack: 3,
  stacksVisible: 1,
  stackGap: 32,
  linesEnabled: false,
  linesCount: 3,
  linesRowGap: 8,
  stackVerticalOffset: 0,
  stackHorizontalOffset: 0,
  fontSize: 36,
  minFontSize: 12,
  textColor: '#f0f0f0',
  bgColor: '#1a1a1a',
  highlightColor: '',
  highlightTextColor: '',
  fontFamily: 'system-ui, sans-serif',
  highlightActive: false,
  showChunkDividers: false,
}

/**
 * Produce a fully-resolved ScriptTokenConfig for a block by merging project-level
 * defaults with any display overrides stored in the block's config.
 * Required fields (bpm, wordsPerStack, stacksVisible) always come from the block.
 * Optional display fields override project defaults only when explicitly set (not undefined).
 */
export function resolveBlockConfig(
  projectConfig: ScriptTokenConfig,
  blockConfig: ScriptBlockConfig
): ScriptTokenConfig {
  const resolved: ScriptTokenConfig = {
    ...projectConfig,
    // Required block fields — always override project
    bpm: blockConfig.bpm,
    wordsPerStack: blockConfig.wordsPerStack,
    stacksVisible: blockConfig.stacksVisible,
  }
  // Apply optional display overrides only when defined
  if (blockConfig.pauseAtSentences !== undefined) resolved.pauseAtSentences = blockConfig.pauseAtSentences
  if (blockConfig.pauseAtHeadlines !== undefined) resolved.pauseAtHeadlines = blockConfig.pauseAtHeadlines
  if (blockConfig.fontSize !== undefined) resolved.fontSize = blockConfig.fontSize
  if (blockConfig.minFontSize !== undefined) resolved.minFontSize = blockConfig.minFontSize
  if (blockConfig.fontFamily !== undefined) resolved.fontFamily = blockConfig.fontFamily
  if (blockConfig.textColor !== undefined) resolved.textColor = blockConfig.textColor
  if (blockConfig.bgColor !== undefined) resolved.bgColor = blockConfig.bgColor
  if (blockConfig.highlightColor !== undefined) resolved.highlightColor = blockConfig.highlightColor
  if (blockConfig.highlightTextColor !== undefined) resolved.highlightTextColor = blockConfig.highlightTextColor
  if (blockConfig.highlightActive !== undefined) resolved.highlightActive = blockConfig.highlightActive
  if (blockConfig.showChunkDividers !== undefined) resolved.showChunkDividers = blockConfig.showChunkDividers
  if (blockConfig.stackGap !== undefined) resolved.stackGap = blockConfig.stackGap
  if (blockConfig.linesEnabled !== undefined) resolved.linesEnabled = blockConfig.linesEnabled
  if (blockConfig.linesCount !== undefined) resolved.linesCount = blockConfig.linesCount
  if (blockConfig.linesRowGap !== undefined) resolved.linesRowGap = blockConfig.linesRowGap
  if (blockConfig.stackVerticalOffset !== undefined) resolved.stackVerticalOffset = blockConfig.stackVerticalOffset
  if (blockConfig.stackHorizontalOffset !== undefined) resolved.stackHorizontalOffset = blockConfig.stackHorizontalOffset
  return resolved
}

// ── Project factories ─────────────────────────────────────────────────────────

/** Create a fresh empty ScriptProject (version 3) with the given name and config. */
export function createEmptyProject(
  name: string,
  defaultConfig: ScriptTokenConfig,
  displayStyle: 'bpm' | 'click-to-read' = 'bpm'
): ScriptProject {
  const now = new Date().toISOString()
  return {
    version: 3,
    name,
    createdAt: now,
    updatedAt: now,
    sourceText: '',
    defaultConfig,
    blocks: [],
    displayStyle,
    setupDone: false,
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/**
 * Remove the first occurrence of `passage` from `sourceText`.
 * Tries an exact match first; if that fails, falls back to a whitespace-tolerant
 * match that treats any run of whitespace (spaces, tabs, newlines) as equivalent —
 * so passages copied with different line breaks still match.
 * After removal, collapses runs of horizontal whitespace and trims leading/trailing
 * blank lines without destroying paragraph structure.
 * Returns sourceText unchanged when the passage is not found.
 */
export function removePassageFromText(sourceText: string, passage: string): string {
  const trimmed = passage.trim()
  if (!trimmed) return sourceText

  // Fast path: exact match
  let idx = sourceText.indexOf(trimmed)
  let matchLen = trimmed.length

  if (idx === -1) {
    // Whitespace-tolerant match: escape regex metacharacters then replace
    // whitespace runs with \s+ so any whitespace variant matches.
    const escaped = trimmed
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\s+/g, '\\s+')
    const m = new RegExp(escaped).exec(sourceText)
    if (!m) return sourceText
    idx = m.index
    matchLen = m[0].length
  }

  const before = sourceText.slice(0, idx)
  const after = sourceText.slice(idx + matchLen)
  return (before + after)
    .replace(/[ \t]{2,}/g, ' ')   // collapse horizontal whitespace runs
    .replace(/\n{3,}/g, '\n\n')   // normalize excessive blank lines to one
    .trim()
}

/**
 * Compute the grid of stacks to display for a given token.
 *
 * Mirrors the Reader/video-renderer progressive-fill block logic but operates
 * within a single block boundary, so each block "resets" its own batch.
 *
 * Layout:
 *   cols = block.config.stacksVisible
 *   rows = projectConfig.linesEnabled && linesCount > 1 ? linesCount : 1
 *   batchSize = cols × rows
 *
 * Slot ordering is row-major: slot 0 = (row 0, col 0), slot 1 = (row 0, col 1), …
 * Empty slots (before progressive reveal) have words: [].
 * activeSlot is the flat index of the current (last-filled) slot.
 */
export function computeDisplayGrid(
  displayToken: ScriptToken | null,
  blocks: ScriptBlock[],
  projectConfig: ScriptTokenConfig
): { slots: DisplaySlot[]; cols: number; rows: number; activeSlot: number } {
  if (!displayToken) {
    return { slots: [], cols: 1, rows: 1, activeSlot: -1 }
  }

  const block = blocks.find((b) => b.id === displayToken.blockId)

  // Fallback for orphaned token (block deleted)
  if (!block) {
    return {
      slots: [{ words: displayToken.stack.words, isHeadline: displayToken.stack.type === 'headline' }],
      cols: 1,
      rows: 1,
      activeSlot: 0,
    }
  }

  const cols = Math.max(1, block.config.stacksVisible)
  const effectiveLinesEnabled = block.config.linesEnabled ?? projectConfig.linesEnabled
  const effectiveLinesCount = block.config.linesCount ?? projectConfig.linesCount
  const rows =
    effectiveLinesEnabled && effectiveLinesCount > 1
      ? Math.max(1, effectiveLinesCount)
      : 1
  const batchSize = cols * rows

  const posInBlock = block.tokens.findIndex((t) => t.id === displayToken.id)
  if (posInBlock === -1) {
    return {
      slots: [{ words: displayToken.stack.words, isHeadline: displayToken.stack.type === 'headline' }],
      cols: 1,
      rows: 1,
      activeSlot: 0,
    }
  }

  const batchStart = posInBlock - (posInBlock % batchSize)
  const blockIndexInBatch = posInBlock % batchSize
  const currentLineIdx = Math.floor(blockIndexInBatch / cols)
  const currentSlotIdx = blockIndexInBatch % cols

  const slots: DisplaySlot[] = Array.from({ length: batchSize }, (_, flatIdx) => {
    const r = Math.floor(flatIdx / cols)
    const c = flatIdx % cols
    const visible = r < currentLineIdx || (r === currentLineIdx && c <= currentSlotIdx)
    if (visible) {
      const tokenIdx = batchStart + r * cols + c
      if (tokenIdx < block.tokens.length) {
        const t = block.tokens[tokenIdx]
        return { words: t.stack.words, isHeadline: t.stack.type === 'headline' }
      }
    }
    return { words: [], isHeadline: false }
  })

  return { slots, cols, rows, activeSlot: blockIndexInBatch }
}

/**
 * Trigger a browser-side JSON download of the project.
 * Block text (sourceText, tokens) is stripped before export so the file
 * carries only the structure/layout — not the user's content.
 * Uses Blob + URL.createObjectURL — no IPC or main-process involvement needed.
 */
export function exportProjectAsJson(project: ScriptProject): void {
  const payload: ScriptProject = {
    ...project,
    updatedAt: new Date().toISOString(),
    sourceText: '',
    blocks: project.blocks.map(block => ({ ...block, sourceText: '', tokens: [] })),
  }
  const json = JSON.stringify(payload, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${project.name.replace(/[^a-z0-9_-]/gi, '_') || 'script_project'}.script.json`
  a.click()
  URL.revokeObjectURL(url)
}
