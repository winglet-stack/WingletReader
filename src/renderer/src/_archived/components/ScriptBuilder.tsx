import { Fragment, useEffect, useRef, useState } from 'react'
import type { Settings, TransmuteConfig } from '../../types'
import { rulesFromSettings } from '../../engine/tokenizer'
import {
  solveForTargetWpm,
  SCRIPT_WPM_CONSTRAINTS,
  SCRIPT_TARGET_WPM_MIN,
  SCRIPT_TARGET_WPM_MAX,
  SCRIPT_TARGET_WPM_STEP,
} from '../../engine/wpmSolver'
import {
  calcTokenDuration,
  clearAllBlocksText,
  clearBlockText,
  computeDisplayGrid,
  countWords,
  createBlock,
  createEmptyBlock,
  createEmptyProject,
  defaultConfigFromSettings,
  distributeTextIntoBlocks,
  exportProjectAsJson,
  flattenBlocks,
  resolveBlockConfig,
  updateBlockConfig,
} from '../engine/scriptBuilder'
import type {
  ScriptProject,
  ScriptToken,
  ScriptBlock,
  ScriptBlockConfig,
  ScriptTokenConfig,
} from '../engine/scriptTypes'
import { useScriptPlayback } from '../hooks/useScriptPlayback'
import StackDisplay from '../../components/StackDisplay'
import StackPreviewGrid from '../../components/StackPreviewGrid'
import { renderVideo, type VideoSegment } from '../../engine/videoRenderer'

// ── Display font fitting ───────────────────────────────────────────────────────

// Fallback ratio when Canvas API is unavailable (e.g. SSR, test env without canvas).
const CHAR_WIDTH_RATIO_FALLBACK = 0.62

// Module-level canvas reused across renders to avoid repeated allocations.
let _measureCanvas: HTMLCanvasElement | null = null

/**
 * Return the rendered pixel width of `text` at `fontSize` in `fontFamily`.
 * Uses Canvas measureText for accuracy; falls back to a character-ratio
 * estimate when Canvas is unavailable.
 */
function measureTextWidth(text: string, fontSize: number, fontFamily: string): number {
  if (typeof document === 'undefined') {
    return text.length * fontSize * CHAR_WIDTH_RATIO_FALLBACK
  }
  if (!_measureCanvas) _measureCanvas = document.createElement('canvas')
  const ctx = _measureCanvas.getContext('2d')
  if (!ctx) return text.length * fontSize * CHAR_WIDTH_RATIO_FALLBACK
  ctx.font = `700 ${fontSize}px ${fontFamily || 'system-ui, sans-serif'}`
  return ctx.measureText(text).width
}

/**
 * Find the largest integer font size in [minFontSize, maxFontSize] such that
 * every visible slot's text fits within `usableW` at its rendered size.
 * Headlines render at Math.floor(baseFontSize × 0.7) via StackDisplay.
 *
 * Uses binary search — O(log range) iterations, each O(slots) canvas calls.
 *
 * Layout constants mirror the CSS:
 *   .stack-slot  padding: 14px 28px  → SLOT_H_PAD=28, SLOT_W_PAD=56
 *   .stack-words line-height: 1.2    → explicit rule in index.css
 *
 * Returns { fontSize, hasOverflow: true } when no size ≥ minFontSize fits all
 * texts; the caller should apply white-space:nowrap + text-overflow:ellipsis.
 */
function computeDisplayFontSize(
  slots: Array<{ words: string[]; isHeadline: boolean }>,
  stageW: number,
  stageH: number,
  cols: number,
  stackGap: number,
  rows: number,
  rowGap: number,
  minFontSize: number,
  fontFamily: string
): { fontSize: number; hasOverflow: boolean } {
  if (stageW <= 0 || stageH <= 0) return { fontSize: minFontSize, hasOverflow: false }

  const SLOT_H_PAD = 28  // 14px top + 14px bottom
  const SLOT_W_PAD = 56  // 28px left + 28px right
  const LINE_HEIGHT = 1.2 // explicit line-height on .stack-words (index.css)

  // Usable width per slot after distributing column gaps and subtracting slot padding
  const totalColGaps = Math.max(0, cols - 1) * stackGap
  const slotW = (stageW - totalColGaps) / Math.max(1, cols)
  const usableW = Math.max(40, slotW - SLOT_W_PAD)

  // Max font size that keeps each row's single text line within its row allocation:
  //   slotHeight = fontSize × LINE_HEIGHT + SLOT_H_PAD ≤ rowH
  //   → fontSize ≤ (rowH − SLOT_H_PAD) / LINE_HEIGHT
  const totalRowGap = Math.max(0, rows - 1) * rowGap
  const rowH = (stageH - totalRowGap) / Math.max(1, rows)
  const maxByHeight = Math.floor((rowH - SLOT_H_PAD) / LINE_HEIGHT)
  const maxFontSize = Math.min(160, Math.max(minFontSize, maxByHeight))

  const nonEmpty = slots.filter((s) => s.words.length > 0)
  if (nonEmpty.length === 0) return { fontSize: maxFontSize, hasOverflow: false }

  // Returns true when all slots' texts fit within usableW at the given base size
  function allFit(base: number): boolean {
    return nonEmpty.every((slot) => {
      const renderSize = slot.isHeadline ? Math.floor(base * 0.7) : base
      return measureTextWidth(slot.words.join(' '), renderSize, fontFamily) <= usableW
    })
  }

  if (allFit(maxFontSize)) return { fontSize: maxFontSize, hasOverflow: false }
  if (!allFit(minFontSize)) return { fontSize: minFontSize, hasOverflow: true }

  let lo = minFontSize
  let hi = maxFontSize
  while (lo < hi - 1) {
    const mid = Math.floor((lo + hi) / 2)
    if (allFit(mid)) lo = mid
    else hi = mid
  }
  return { fontSize: lo, hasOverflow: false }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMs(ms: number): string {
  const total = Math.round(ms / 1000)
  const s = total % 60
  const m = Math.floor(total / 60) % 60
  const h = Math.floor(total / 3600)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function totalDurationMs(blocks: ScriptBlock[], projectConfig: ScriptTokenConfig): number {
  const blockMap = new Map(blocks.map((b) => [b.id, b]))
  return flattenBlocks(blocks).reduce((sum, token) => {
    const block = blockMap.get(token.blockId)
    if (!block) return sum
    return sum + calcTokenDuration(token, block, projectConfig)
  }, 0)
}

function nextBlockId(blocks: ScriptBlock[]): number {
  return blocks.length === 0 ? 0 : Math.max(...blocks.map((b) => b.id)) + 1
}

// Builds a TransmuteConfig from a fully-resolved ScriptTokenConfig (project defaults
// merged with any block overrides via resolveBlockConfig). Never reads global Settings —
// all needed values must already be present in cfg.
function buildTransmuteConfig(
  cfg: ScriptTokenConfig,
  resolution: '1280x720' | '1920x1080' | '1080x1920' | '720x720',
  settings: Settings
): TransmuteConfig {
  return {
    textId: null,
    segmentId: null,
    bpm: cfg.bpm,
    wordsPerStack: cfg.wordsPerStack,
    pauseAtSentences: cfg.pauseAtSentences,
    pauseAtHeadlines: cfg.pauseAtHeadlines,
    fontSize: cfg.fontSize,
    fontFamily: cfg.fontFamily || 'system-ui, sans-serif',
    theme: settings.theme ?? 'dark',
    bgColor: cfg.bgColor || '#1a1a1a',
    textColor: cfg.textColor || '#f0f0f0',
    stackVerticalOffset: cfg.stackVerticalOffset,
    stackHorizontalOffset: cfg.stackHorizontalOffset ?? 0,
    highlightActive: cfg.highlightActive ?? false,
    highlightColor: cfg.highlightColor || '',
    highlightTextColor: cfg.highlightTextColor || '',
    highlightMode: settings.highlight_mode ?? 'default',
    highlightPanningChunkSize: settings.highlight_panning_chunk_size ?? 0,
    highlightingMode: settings.highlighting_mode ?? 'default',
    linesEnabled: cfg.linesEnabled,
    linesCount: cfg.linesCount,
    linesRowGap: cfg.linesRowGap,
    stacksVisible: cfg.stacksVisible,
    stackGap: cfg.stackGap,
    showChunkDividers: cfg.showChunkDividers ?? false,
    chunkRuleLongWord: settings.chunk_rule_long_word,
    chunkRuleEnumerations: settings.chunk_rule_enumerations,
    chunkRuleBullets: settings.chunk_rule_bullets,
    chunkRuleCommas: settings.chunk_rule_commas,
    chunkRuleNames: settings.chunk_rule_names,
    resolution,
    maxDurationMinutes: null,
    contentLimitType: 'none',
    contentLimitWords: 1000,
    contentLimitPercentage: 100,
    showProgressOverlay: false,
    bgColorOverride: '',
    transparentBackground: false,
  }
}

// ── AdditionalOptionsModal — project-level only ───────────────────────────────

interface AdditionalOptionsModalProps {
  projectConfig: ScriptTokenConfig
  onClose: () => void
  onUpdateProjectConfig: (patch: Partial<ScriptTokenConfig>) => void
}

function AdditionalOptionsModal({
  projectConfig,
  onClose,
  onUpdateProjectConfig,
}: AdditionalOptionsModalProps) {
  function handleChange(field: keyof ScriptTokenConfig, value: number | boolean) {
    onUpdateProjectConfig({ [field]: value })
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-box sb-options-modal">
        <h2 className="modal-title">Project Options</h2>

        <div className="sb-options-section-label">Display</div>

        <div className="sb-field-row">
          <label className="sb-field-label">Min font size</label>
          <input
            className="sb-field-input"
            type="number"
            min={8}
            max={48}
            value={projectConfig.minFontSize ?? 12}
            onChange={(e) => handleChange('minFontSize', Math.max(8, Math.min(48, Number(e.target.value))))}
            style={{ maxWidth: 70 }}
          />
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>px</span>
        </div>

        <div className="sb-field-row">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.82rem' }}>
            <input
              type="checkbox"
              checked={projectConfig.linesEnabled}
              onChange={(e) => handleChange('linesEnabled', e.target.checked)}
            />
            Multiple lines
          </label>
        </div>

        {projectConfig.linesEnabled && (
          <div className="sb-field-row">
            <label className="sb-field-label">Lines (rows)</label>
            <input
              className="sb-field-input"
              type="number"
              min={2}
              max={10}
              value={projectConfig.linesCount}
              onChange={(e) => handleChange('linesCount', Math.max(2, Math.min(10, Number(e.target.value))))}
              style={{ maxWidth: 70 }}
            />
          </div>
        )}

        <div className="sb-field-row">
          <label className="sb-field-label">Stack gap (px)</label>
          <input
            className="sb-field-input"
            type="number"
            min={0}
            max={200}
            value={projectConfig.stackGap}
            onChange={(e) => handleChange('stackGap', Number(e.target.value))}
            style={{ maxWidth: 70 }}
          />
        </div>

        <div className="sb-field-row">
          <label className="sb-field-label">Row gap (px)</label>
          <input
            className="sb-field-input"
            type="number"
            min={0}
            max={200}
            value={projectConfig.linesRowGap}
            onChange={(e) => handleChange('linesRowGap', Number(e.target.value))}
            style={{ maxWidth: 70 }}
          />
        </div>

        <div className="sb-field-row">
          <label className="sb-field-label">Vertical offset</label>
          <input
            className="sb-field-input"
            type="number"
            min={-400}
            max={400}
            value={projectConfig.stackVerticalOffset}
            onChange={(e) => handleChange('stackVerticalOffset', Number(e.target.value))}
            style={{ maxWidth: 70 }}
          />
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>px</span>
        </div>

        <div className="sb-field-row">
          <label className="sb-field-label">Horizontal offset</label>
          <input
            className="sb-field-input"
            type="number"
            min={-400}
            max={400}
            value={projectConfig.stackHorizontalOffset ?? 0}
            onChange={(e) => handleChange('stackHorizontalOffset', Math.max(-400, Math.min(400, Number(e.target.value))))}
            style={{ maxWidth: 70 }}
          />
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>px</span>
        </div>

        <div className="sb-options-section-label">Timing</div>

        <div className="sb-field-row">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.82rem' }}>
            <input
              type="checkbox"
              checked={projectConfig.pauseAtSentences}
              onChange={(e) => handleChange('pauseAtSentences', e.target.checked)}
            />
            Pause at sentences
          </label>
        </div>

        <div className="sb-field-row">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.82rem' }}>
            <input
              type="checkbox"
              checked={projectConfig.pauseAtHeadlines}
              onChange={(e) => handleChange('pauseAtHeadlines', e.target.checked)}
            />
            Pause at headlines
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="sb-btn sb-btn--primary sb-btn--sm" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

// ── BlockSettingsModal ────────────────────────────────────────────────────────

interface BlockSettingsModalProps {
  mode: 'create' | 'edit'
  initialBlockConfig: ScriptBlockConfig
  projectConfig: ScriptTokenConfig
  settings: Settings
  block?: ScriptBlock
  onConfirm: (blockConfig: ScriptBlockConfig, projectPatch: Partial<ScriptTokenConfig>) => void
  onDelete?: () => void
  onClose: () => void
}

function BlockSettingsModal({
  mode,
  initialBlockConfig,
  projectConfig,
  settings,
  block,
  onConfirm,
  onDelete,
  onClose,
}: BlockSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'basic' | 'advanced' | 'text'>('basic')

  // Block-level required settings
  const [bpm, setBpm] = useState(initialBlockConfig.bpm)
  const [wordsPerStack, setWordsPerStack] = useState(initialBlockConfig.wordsPerStack)
  const [stacksVisible, setStacksVisible] = useState(initialBlockConfig.stacksVisible)
  const [targetWordCount, setTargetWordCount] = useState<number | ''>(
    initialBlockConfig.targetWordCount ?? ''
  )
  const [lockAtWpm, setLockAtWpm] = useState(initialBlockConfig.lockAtWpm ?? false)
  const [targetWpm, setTargetWpm] = useState(
    initialBlockConfig.targetWpm ?? initialBlockConfig.bpm * initialBlockConfig.wordsPerStack
  )

  // Per-block display settings — prefer existing block override, fall back to project default.
  // On save these are stored as per-block overrides (not project patches), making each block
  // independent from global reader settings and from other blocks' display settings.
  const [linesEnabled, setLinesEnabled] = useState(initialBlockConfig.linesEnabled ?? projectConfig.linesEnabled)
  const [linesCount, setLinesCount] = useState(initialBlockConfig.linesCount ?? projectConfig.linesCount)
  const [fontSize, setFontSize] = useState(initialBlockConfig.fontSize ?? projectConfig.fontSize)
  const [minFontSize, setMinFontSize] = useState(initialBlockConfig.minFontSize ?? projectConfig.minFontSize ?? 12)
  const [stackGap, setStackGap] = useState(initialBlockConfig.stackGap ?? projectConfig.stackGap)
  const [linesRowGap, setLinesRowGap] = useState(initialBlockConfig.linesRowGap ?? projectConfig.linesRowGap)
  const [stackVerticalOffset, setStackVerticalOffset] = useState(initialBlockConfig.stackVerticalOffset ?? projectConfig.stackVerticalOffset)
  const [stackHorizontalOffset, setStackHorizontalOffset] = useState(initialBlockConfig.stackHorizontalOffset ?? projectConfig.stackHorizontalOffset ?? 0)
  const [projTextColor, setProjTextColor] = useState(initialBlockConfig.textColor ?? projectConfig.textColor ?? '')
  const [projBgColor, setProjBgColor] = useState(initialBlockConfig.bgColor ?? projectConfig.bgColor ?? '')
  const [projHighlightColor, setProjHighlightColor] = useState(initialBlockConfig.highlightColor ?? projectConfig.highlightColor ?? '')
  const [projHighlightTextColor, setProjHighlightTextColor] = useState(initialBlockConfig.highlightTextColor ?? projectConfig.highlightTextColor ?? '')
  const [pauseAtSentences, setPauseAtSentences] = useState(initialBlockConfig.pauseAtSentences ?? projectConfig.pauseAtSentences)
  const [pauseAtHeadlines, setPauseAtHeadlines] = useState(initialBlockConfig.pauseAtHeadlines ?? projectConfig.pauseAtHeadlines)
  // fontFamily, highlightActive, showChunkDividers: not yet editable in the modal UI but
  // stored per-block so the block is fully self-contained on save
  const [fontFamily] = useState(initialBlockConfig.fontFamily ?? projectConfig.fontFamily ?? settings.font_family ?? '')
  const [highlightActive] = useState(initialBlockConfig.highlightActive ?? projectConfig.highlightActive ?? settings.highlight_active ?? false)
  const [showChunkDividers] = useState(initialBlockConfig.showChunkDividers ?? projectConfig.showChunkDividers ?? settings.show_chunk_dividers ?? false)

  const hasText = mode === 'edit' && !!block?.sourceText?.trim()

  const bpmValid = bpm >= 10 && bpm <= 1200
  const wordsValid = wordsPerStack >= 1 && wordsPerStack <= 20
  const stacksValid = stacksVisible >= 1 && stacksVisible <= 8

  function handleConfirm() {
    if (!bpmValid || !wordsValid || !stacksValid) return
    const blockConfig: ScriptBlockConfig = {
      // Required timing/layout
      bpm: Math.round(Math.max(10, Math.min(1200, bpm))),
      wordsPerStack: Math.round(Math.max(1, Math.min(20, wordsPerStack))),
      stacksVisible: Math.round(Math.max(1, Math.min(8, stacksVisible))),
      targetWordCount: typeof targetWordCount === 'number' && targetWordCount >= 1
        ? targetWordCount
        : undefined,
      lockAtWpm,
      targetWpm: lockAtWpm ? targetWpm : undefined,
      // Per-block display overrides — stored on the block, not the project
      pauseAtSentences,
      pauseAtHeadlines,
      fontSize,
      minFontSize,
      fontFamily,
      textColor: projTextColor,
      bgColor: projBgColor,
      highlightColor: projHighlightColor,
      highlightTextColor: projHighlightTextColor,
      highlightActive,
      showChunkDividers,
      stackGap,
      linesEnabled,
      linesCount,
      linesRowGap,
      stackVerticalOffset,
      stackHorizontalOffset,
    }
    onConfirm(blockConfig, {})
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="modal-box sb-block-modal--with-preview">
        <div className="sb-block-modal__header">
        <h2 className="modal-title">
          {mode === 'create' ? 'Add Block' : `Block ${(block?.id ?? 0) + 1} Settings`}
        </h2>

        {/* Tabs */}
        <div className="sb-options-tabs">
          <button
            className={`sb-options-tab${activeTab === 'basic' ? ' sb-options-tab--active' : ''}`}
            onClick={() => setActiveTab('basic')}
          >
            Basic
          </button>
          <button
            className={`sb-options-tab${activeTab === 'advanced' ? ' sb-options-tab--active' : ''}`}
            onClick={() => setActiveTab('advanced')}
          >
            Advanced
          </button>
          {hasText && (
            <button
              className={`sb-options-tab${activeTab === 'text' ? ' sb-options-tab--active' : ''}`}
              onClick={() => setActiveTab('text')}
            >
              Injected Text
            </button>
          )}
        </div>
        </div>{/* sb-block-modal__header */}

        <div className="sb-block-modal__body">
        <div className="sb-block-modal__controls">

        {/* ── Basic Settings ── */}
        {activeTab === 'basic' && (
          <div>
            <div className="sb-options-section-label">Basic Settings</div>

            <div className="sb-field-row">
              <label className="sb-field-label">Total words</label>
              <input
                className="sb-field-input"
                type="number"
                min={1}
                max={10000}
                placeholder="e.g. 50"
                value={targetWordCount}
                onChange={(e) =>
                  setTargetWordCount(
                    e.target.value === '' ? '' : Math.max(1, Number(e.target.value))
                  )
                }
                style={{ maxWidth: 80 }}
              />
            </div>

            {/* Lock at WPM toggle */}
            <div className="sb-field-row">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.82rem' }}>
                <input
                  type="checkbox"
                  checked={lockAtWpm}
                  onChange={(e) => {
                    const enabled = e.target.checked
                    setLockAtWpm(enabled)
                    if (enabled) {
                      const sol = solveForTargetWpm(targetWpm, SCRIPT_WPM_CONSTRAINTS)
                      setBpm(sol.bpm)
                      setWordsPerStack(sol.wordsPerStack)
                    }
                  }}
                />
                Lock at WPM
              </label>
            </div>

            {lockAtWpm ? (
              <div className="sb-field-row" style={{ flexWrap: 'wrap', gap: 6 }}>
                <label className="sb-field-label">Target WPM</label>
                <input
                  type="range"
                  min={SCRIPT_TARGET_WPM_MIN}
                  max={SCRIPT_TARGET_WPM_MAX}
                  step={SCRIPT_TARGET_WPM_STEP}
                  value={targetWpm}
                  onChange={(e) => {
                    const t = Number(e.target.value)
                    setTargetWpm(t)
                    const sol = solveForTargetWpm(t, SCRIPT_WPM_CONSTRAINTS)
                    setBpm(sol.bpm)
                    setWordsPerStack(sol.wordsPerStack)
                  }}
                  style={{ flex: 1, minWidth: 80 }}
                />
                <input
                  className="sb-field-input"
                  type="number"
                  min={SCRIPT_TARGET_WPM_MIN}
                  max={SCRIPT_TARGET_WPM_MAX}
                  value={targetWpm}
                  onChange={(e) => {
                    const t = Math.max(SCRIPT_TARGET_WPM_MIN, Math.min(SCRIPT_TARGET_WPM_MAX, Number(e.target.value)))
                    setTargetWpm(t)
                    const sol = solveForTargetWpm(t, SCRIPT_WPM_CONSTRAINTS)
                    setBpm(sol.bpm)
                    setWordsPerStack(sol.wordsPerStack)
                  }}
                  style={{ maxWidth: 70 }}
                />
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
                  → {bpm} bpm · {wordsPerStack} wps · {bpm * wordsPerStack} wpm
                </span>
              </div>
            ) : (
              <div className="sb-field-row" style={{ flexWrap: 'wrap', gap: 6 }}>
                <label className="sb-field-label">BPM</label>
                <input
                  type="range"
                  min={10}
                  max={1200}
                  step={1}
                  value={bpm}
                  onChange={(e) => setBpm(Number(e.target.value))}
                  style={{ flex: 1, minWidth: 80 }}
                />
                <input
                  className={`sb-field-input${!bpmValid ? ' sb-field-input--invalid' : ''}`}
                  type="number"
                  min={10}
                  max={1200}
                  value={bpm}
                  onChange={(e) => setBpm(Number(e.target.value))}
                  style={{ maxWidth: 60 }}
                />
              </div>
            )}

            {/* Words/chunk — editable when lock is off; info-only when on */}
            {!lockAtWpm ? (
              <div className="sb-field-row" style={{ flexWrap: 'wrap', gap: 6 }}>
                <label className="sb-field-label">Words / chunk</label>
                <input
                  type="range"
                  min={1}
                  max={20}
                  step={1}
                  value={wordsPerStack}
                  onChange={(e) => setWordsPerStack(Number(e.target.value))}
                  style={{ flex: 1, minWidth: 80 }}
                />
                <span style={{ fontSize: '0.8rem', minWidth: 24, textAlign: 'right' }}>
                  {wordsPerStack}
                </span>
              </div>
            ) : null}

            <div className="sb-field-row" style={{ flexWrap: 'wrap', gap: 6 }}>
              <label className="sb-field-label">Chunks / line</label>
              <input
                type="range"
                min={1}
                max={8}
                step={1}
                value={stacksVisible}
                onChange={(e) => setStacksVisible(Number(e.target.value))}
                style={{ flex: 1, minWidth: 80 }}
              />
              <span style={{ fontSize: '0.8rem', minWidth: 24, textAlign: 'right' }}>
                {stacksVisible}
              </span>
            </div>

            <div className="sb-field-row" style={{ marginTop: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.82rem' }}>
                <input
                  type="checkbox"
                  checked={linesEnabled}
                  onChange={(e) => setLinesEnabled(e.target.checked)}
                />
                Multiple Lines
              </label>
            </div>

            {linesEnabled && (
              <div className="sb-field-row" style={{ flexWrap: 'wrap', gap: 6 }}>
                <label className="sb-field-label">Line count</label>
                <input
                  type="range"
                  min={2}
                  max={10}
                  step={1}
                  value={linesCount}
                  onChange={(e) => setLinesCount(Number(e.target.value))}
                  style={{ flex: 1, minWidth: 80 }}
                />
                <span style={{ fontSize: '0.8rem', minWidth: 24, textAlign: 'right' }}>
                  {linesCount}
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── Advanced Settings ── */}
        {activeTab === 'advanced' && (
          <div>
            <div className="sb-options-section-label">Text Settings</div>

            <div className="sb-field-row">
              <label className="sb-field-label">Font size</label>
              <input
                className="sb-field-input"
                type="number"
                min={8}
                max={160}
                value={fontSize}
                onChange={(e) => setFontSize(Math.max(8, Math.min(160, Number(e.target.value))))}
                style={{ maxWidth: 70 }}
              />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>px</span>
            </div>

            <div className="sb-field-row">
              <label className="sb-field-label">Min font</label>
              <input
                className="sb-field-input"
                type="number"
                min={8}
                max={48}
                value={minFontSize}
                onChange={(e) => setMinFontSize(Math.max(8, Math.min(48, Number(e.target.value))))}
                style={{ maxWidth: 70 }}
              />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>px</span>
            </div>

            <div className="sb-field-row">
              <label className="sb-field-label">Font family</label>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {settings.font_family || 'System default'}
              </span>
            </div>

            <div className="sb-field-row">
              <label className="sb-field-label">Text color</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="color"
                  className="color-swatch-input"
                  value={projTextColor || (settings.theme === 'light' ? '#111111' : '#f0f0f0')}
                  onChange={(e) => setProjTextColor(e.target.value)}
                />
                {projTextColor && (
                  <button className="sb-btn sb-btn--sm" style={{ fontSize: '0.68rem', padding: '1px 5px' }} onClick={() => setProjTextColor('')}>
                    Reset
                  </button>
                )}
              </div>
            </div>

            <div className="sb-field-row">
              <label className="sb-field-label">Highlight color</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="color"
                  className="color-swatch-input"
                  value={projHighlightColor || (settings.theme === 'light' ? '#111111' : '#f0f0f0')}
                  onChange={(e) => setProjHighlightColor(e.target.value)}
                />
                {projHighlightColor && (
                  <button className="sb-btn sb-btn--sm" style={{ fontSize: '0.68rem', padding: '1px 5px' }} onClick={() => setProjHighlightColor('')}>
                    Reset
                  </button>
                )}
              </div>
            </div>

            <div className="sb-field-row">
              <label className="sb-field-label">Highlight text</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="color"
                  className="color-swatch-input"
                  value={projHighlightTextColor || (settings.theme === 'light' ? '#ffffff' : '#000000')}
                  onChange={(e) => setProjHighlightTextColor(e.target.value)}
                />
                {projHighlightTextColor && (
                  <button className="sb-btn sb-btn--sm" style={{ fontSize: '0.68rem', padding: '1px 5px' }} onClick={() => setProjHighlightTextColor('')}>
                    Reset
                  </button>
                )}
              </div>
            </div>

            <div className="sb-options-section-label">Display Settings</div>

            <div className="sb-field-row">
              <label className="sb-field-label">Background</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="color"
                  className="color-swatch-input"
                  value={projBgColor || (settings.theme === 'light' ? '#fafafa' : '#0d0d0d')}
                  onChange={(e) => setProjBgColor(e.target.value)}
                />
                {projBgColor && (
                  <button className="sb-btn sb-btn--sm" style={{ fontSize: '0.68rem', padding: '1px 5px' }} onClick={() => setProjBgColor('')}>
                    Reset
                  </button>
                )}
              </div>
            </div>

            <div className="sb-field-row">
              <label className="sb-field-label">Stack gap</label>
              <input
                className="sb-field-input"
                type="number"
                min={0}
                max={200}
                value={stackGap}
                onChange={(e) => setStackGap(Math.max(0, Math.min(200, Number(e.target.value))))}
                style={{ maxWidth: 70 }}
              />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>px</span>
            </div>

            <div className="sb-field-row">
              <label className="sb-field-label">Vert. offset</label>
              <input
                className="sb-field-input"
                type="number"
                min={-400}
                max={400}
                value={stackVerticalOffset}
                onChange={(e) => setStackVerticalOffset(Math.max(-400, Math.min(400, Number(e.target.value))))}
                style={{ maxWidth: 70 }}
              />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>px</span>
            </div>

            <div className="sb-field-row">
              <label className="sb-field-label">Horiz. offset</label>
              <input
                className="sb-field-input"
                type="number"
                min={-400}
                max={400}
                value={stackHorizontalOffset}
                onChange={(e) => setStackHorizontalOffset(Math.max(-400, Math.min(400, Number(e.target.value))))}
                style={{ maxWidth: 70 }}
              />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>px</span>
            </div>

            {linesEnabled && (
              <div className="sb-field-row">
                <label className="sb-field-label">Row gap</label>
                <input
                  className="sb-field-input"
                  type="number"
                  min={0}
                  max={200}
                  value={linesRowGap}
                  onChange={(e) => setLinesRowGap(Math.max(0, Math.min(200, Number(e.target.value))))}
                  style={{ maxWidth: 70 }}
                />
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>px</span>
              </div>
            )}

            <div className="sb-options-section-label">Timing</div>

            <div className="sb-field-row">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.82rem' }}>
                <input
                  type="checkbox"
                  checked={pauseAtSentences}
                  onChange={(e) => setPauseAtSentences(e.target.checked)}
                />
                Pause at sentences
              </label>
            </div>

            <div className="sb-field-row">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.82rem' }}>
                <input
                  type="checkbox"
                  checked={pauseAtHeadlines}
                  onChange={(e) => setPauseAtHeadlines(e.target.checked)}
                />
                Pause at headlines
              </label>
            </div>

          </div>
        )}

        {/* ── Injected Text ── */}
        {activeTab === 'text' && hasText && (
          <div className="sb-block-modal-text">
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 8 }}>
              {countWords(block!.sourceText)} words injected
            </p>
            <pre className="sb-block-modal-text__pre">{block!.sourceText}</pre>
          </div>
        )}

        </div>{/* sb-block-modal__controls */}

          <div className="sb-block-modal__preview-col">
            <div className="sb-block-modal__preview-label">Live Preview</div>
            <StackPreviewGrid
              stageClassName="sb-block-preview-stage"
              fontSize={fontSize}
              fontFamily={fontFamily}
              textColor={projTextColor}
              highlightColor={projHighlightColor}
              highlightTextColor={projHighlightTextColor}
              highlightActive={highlightActive}
              bgColor={projBgColor}
              showChunkDividers={showChunkDividers}
              stacksVisible={stacksVisible}
              stackGap={stackGap}
              stackVerticalOffset={stackVerticalOffset}
              stackHorizontalOffset={stackHorizontalOffset}
              linesEnabled={linesEnabled}
              linesCount={linesCount}
              linesRowGap={linesRowGap}
              wordsPerStack={wordsPerStack}
              offsetScale={1}
            />
          </div>
        </div>{/* sb-block-modal__body */}

        <div className="sb-block-modal__footer">
          {mode === 'edit' && onDelete && (
            <button
              className="sb-btn sb-btn--sm sb-btn--danger"
              style={{ marginRight: 'auto' }}
              onClick={() => {
                if (window.confirm('Delete this block?')) onDelete()
              }}
            >
              Delete block
            </button>
          )}
          <button className="sb-btn sb-btn--sm" onClick={onClose}>Cancel</button>
          <button
            className="sb-btn sb-btn--sm sb-btn--primary"
            onClick={handleConfirm}
            disabled={!bpmValid || !wordsValid || !stacksValid}
          >
            {mode === 'create' ? 'Add Block' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── VideoExportModal ──────────────────────────────────────────────────────────

interface VideoExportModalProps {
  project: ScriptProject
  settings: Settings
  onClose: () => void
}

function VideoExportModal({ project, settings, onClose }: VideoExportModalProps) {
  const [resolution, setResolution] = useState<'1280x720' | '1920x1080' | '1080x1920' | '720x720'>('1280x720')
  const [phase, setPhase] = useState<'config' | 'rendering' | 'done' | 'error'>('config')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [resultBuffer, setResultBuffer] = useState<ArrayBuffer | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const flatTokens = flattenBlocks(project.blocks)
  const tokenCount = flatTokens.length
  const durationMs = totalDurationMs(project.blocks, project.defaultConfig)

  async function handleRender() {
    setPhase('rendering')
    setProgress(0)
    setError(null)
    abortRef.current = new AbortController()
    // Build one VideoSegment per block so each block's display settings are applied
    // independently in the export — exactly matching what the preview shows.
    const segments: VideoSegment[] = project.blocks
      .filter(b => b.tokens.length > 0)
      .map(block => ({
        stacks: block.tokens.map(t => t.stack),
        config: buildTransmuteConfig(resolveBlockConfig(project.defaultConfig, block.config), resolution, settings),
      }))
    try {
      const buf = await renderVideo(segments, setProgress, abortRef.current.signal)
      setResultBuffer(buf)
      setPhase('done')
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') {
        setPhase('config')
      } else {
        setError(String(err))
        setPhase('error')
      }
    }
  }

  function handleDownload() {
    if (!resultBuffer) return
    const blob = new Blob([resultBuffer], { type: 'video/mp4' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project.name.replace(/[^a-z0-9_-]/gi, '_') || 'script'}.mp4`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-box">
        <h2 className="modal-title">Export as Video</h2>

        {phase === 'config' && (
          <>
            <div className="sb-field-row" style={{ marginBottom: 12 }}>
              <label className="sb-field-label">Resolution</label>
              <select
                className="sb-field-input"
                value={resolution}
                onChange={(e) => setResolution(e.target.value as typeof resolution)}
              >
                <option value="1280x720">1280×720 (Landscape)</option>
                <option value="1920x1080">1920×1080 (Landscape HD)</option>
                <option value="1080x1920">1080×1920 (Portrait)</option>
                <option value="720x720">720×720 (Square)</option>
              </select>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 12px' }}>
              {tokenCount} token{tokenCount !== 1 ? 's' : ''} · ~{formatMs(durationMs)}
            </p>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0 0 12px' }}>
              Per-token BPM overrides are applied; project-default BPM is used for tokens without overrides.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="sb-btn sb-btn--sm" onClick={onClose}>Cancel</button>
              <button
                className="sb-btn sb-btn--primary sb-btn--sm"
                onClick={handleRender}
                disabled={tokenCount === 0}
              >
                Render →
              </button>
            </div>
          </>
        )}

        {phase === 'rendering' && (
          <>
            <p style={{ fontSize: '0.82rem', margin: '8px 0' }}>Rendering video…</p>
            <div style={{ background: 'var(--bg3)', borderRadius: 4, height: 6, overflow: 'hidden', margin: '8px 0' }}>
              <div style={{ width: `${Math.round(progress * 100)}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.2s' }} />
            </div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 10 }}>
              {Math.round(progress * 100)}%
            </p>
            <button
              className="sb-btn sb-btn--sm sb-btn--danger"
              onClick={() => abortRef.current?.abort()}
            >
              Cancel render
            </button>
          </>
        )}

        {phase === 'done' && (
          <>
            <p style={{ fontSize: '0.82rem', margin: '8px 0' }}>Video ready.</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="sb-btn sb-btn--sm" onClick={onClose}>Close</button>
              <button className="sb-btn sb-btn--primary sb-btn--sm" onClick={handleDownload}>
                Download .mp4
              </button>
            </div>
          </>
        )}

        {phase === 'error' && (
          <>
            <p style={{ fontSize: '0.82rem', color: 'var(--danger)', margin: '8px 0' }}>{error}</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="sb-btn sb-btn--sm" onClick={onClose}>Close</button>
              <button className="sb-btn sb-btn--sm" onClick={() => setPhase('config')}>Try again</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ScriptBuilder({ settings, onExit }: { settings: Settings; onExit?: () => void }) {
  const [project, setProject] = useState<ScriptProject>(() => ({
    ...createEmptyProject('My Script', defaultConfigFromSettings(settings)),
    setupDone: true,
  }))

  const flatTokens = flattenBlocks(project.blocks)

  const playback = useScriptPlayback(
    flatTokens,
    project.blocks,
    project.defaultConfig,
    (updatedTokens) => {
      // Propagate timestamp changes from click-to-read advances back into the blocks
      setProject((p) => {
        const tokenMap = new Map(updatedTokens.map((t) => [t.id, t]))
        const newBlocks = p.blocks.map((block) => ({
          ...block,
          tokens: block.tokens.map((t) => tokenMap.get(t.id) ?? t),
        }))
        return { ...p, blocks: newBlocks, updatedAt: new Date().toISOString() }
      })
    }
  )

  const [selectedId, setSelectedId] = useState<number | null>(null)
  // Block-level selection (for empty blocks where no token can be selected)
  const [selectedBlockId, setSelectedBlockId] = useState<number | null>(null)

  const [blockModalState, setBlockModalState] = useState<
    { mode: 'create' } | { mode: 'edit'; blockId: number } | null
  >(null)
  const [showVideoExport, setShowVideoExport] = useState(false)
  const [sourcePanelOpen, setSourcePanelOpen] = useState(false)

  // Local text for the editable token textarea in the right panel
  const [editingTokenText, setEditingTokenText] = useState('')

  const tokenListRef = useRef<HTMLDivElement>(null)
  const loadFileRef = useRef<HTMLInputElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [stageDims, setStageDims] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setStageDims({ width, height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Derive selected token and its block from the project's flat token list
  const selectedToken: ScriptToken | null =
    selectedId !== null ? (flatTokens.find((t) => t.id === selectedId) ?? null) : null
  const selectedBlock: ScriptBlock | null = selectedToken
    ? (project.blocks.find((b) => b.id === selectedToken.blockId) ?? null)
    : selectedBlockId !== null
      ? (project.blocks.find((b) => b.id === selectedBlockId) ?? null)
      : null

  const currentToken = flatTokens[playback.currentTokenIdx] ?? null
  const displayToken = playback.isPlaying ? currentToken : (selectedToken ?? currentToken)
  const totalTokens = flatTokens.length

  // Effective display config: block config merged over project defaults, then token override
  const effectiveConfig: ScriptTokenConfig = (() => {
    const base = { ...project.defaultConfig }
    if (selectedBlock) {
      base.bpm = selectedBlock.config.bpm
      base.wordsPerStack = selectedBlock.config.wordsPerStack
      base.stacksVisible = selectedBlock.config.stacksVisible
    }
    if (selectedToken?.configOverride) {
      if (selectedToken.configOverride.bpm !== undefined) base.bpm = selectedToken.configOverride.bpm
      if (selectedToken.configOverride.wordsPerStack !== undefined)
        base.wordsPerStack = selectedToken.configOverride.wordsPerStack
      if (selectedToken.configOverride.stacksVisible !== undefined)
        base.stacksVisible = selectedToken.configOverride.stacksVisible
    }
    return base
  })()

  // Sync editing textarea when selected token changes
  useEffect(() => {
    if (selectedToken) {
      setEditingTokenText(selectedToken.stack.words.join(' '))
    }
  }, [selectedToken?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll token list to keep playing item in view
  useEffect(() => {
    const list = tokenListRef.current
    if (!list) return
    const active = list.querySelector(`[data-token-id="${playback.currentTokenIdx}"]`) as HTMLElement | null
    if (active) active.scrollIntoView({ block: 'nearest' })
  }, [playback.currentTokenIdx])

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function syncPlayback(newBlocks: ScriptBlock[]) {
    const newFlat = flattenBlocks(newBlocks)
    playback.patchTokens(newFlat)
    playback.patchBlocks(newBlocks)
  }

  // ── New project ───────────────────────────────────────────────────────────────

  function handleNewProject() {
    if (project.blocks.length > 0) {
      if (!window.confirm('Create a new project? The current script will be lost.')) return
    }
    const name = window.prompt('Project name', 'My Script')
    if (name === null) return
    const config = defaultConfigFromSettings(settings)
    const newProject: ScriptProject = {
      ...createEmptyProject(name.trim() || 'My Script', config),
      setupDone: true,
    }
    setProject(newProject)
    playback.setTokens([], [])
    setSelectedId(null)
    setSelectedBlockId(null)
  }

  // ── Load script from file ─────────────────────────────────────────────────────

  function handleLoadFile(file: File) {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string) as ScriptProject
        if (json.version !== 3) {
          alert('This script file uses an unsupported version and cannot be loaded.')
          return
        }
        const blocks = json.blocks ?? []
        setProject({ ...json, blocks, setupDone: true })
        const flat = flattenBlocks(blocks)
        playback.setTokens(flat, blocks)
        setSelectedId(null)
        setSelectedBlockId(null)
      } catch {
        alert('Failed to load script: the file is not valid JSON.')
      }
    }
    reader.readAsText(file)
  }

  // ── Exit ──────────────────────────────────────────────────────────────────────

  function handleExit() {
    if (project.blocks.length > 0) {
      if (!window.confirm('You have blocks in this script. Exit without saving?')) return
    }
    onExit?.()
  }

  // ── Block workflow ────────────────────────────────────────────────────────────

  function handleAddBlockFromModal(config: ScriptBlockConfig, projectPatch: Partial<ScriptTokenConfig>) {
    const newProjectConfig = { ...project.defaultConfig, ...projectPatch }
    const bid = nextBlockId(project.blocks)
    const block = createEmptyBlock(bid, config)
    const newBlocks = [...project.blocks, block]
    setProject((p) => ({
      ...p,
      blocks: newBlocks,
      defaultConfig: newProjectConfig,
      updatedAt: new Date().toISOString(),
    }))
    syncPlayback(newBlocks)
    setSelectedBlockId(block.id)
    setSelectedId(null)
    setBlockModalState(null)
  }

  function handleUpdateBlockFromModal(
    blockId: number,
    config: ScriptBlockConfig,
    projectPatch: Partial<ScriptTokenConfig>
  ) {
    const newProjectConfig = { ...project.defaultConfig, ...projectPatch }
    const editedBlock = project.blocks.find((b) => b.id === blockId)
    const withinIdx =
      editedBlock && selectedToken
        ? editedBlock.tokens.findIndex((t) => t.id === selectedToken.id)
        : -1
    const newBlocks = updateBlockConfig(project.blocks, blockId, config, newProjectConfig, rulesFromSettings(settings))
    setProject((p) => ({
      ...p,
      blocks: newBlocks,
      defaultConfig: newProjectConfig,
      updatedAt: new Date().toISOString(),
    }))
    syncPlayback(newBlocks)
    const updatedBlock = newBlocks.find((b) => b.id === blockId)
    if (updatedBlock && updatedBlock.tokens.length > 0 && withinIdx >= 0) {
      const newToken = updatedBlock.tokens[Math.min(withinIdx, updatedBlock.tokens.length - 1)]
      if (newToken) setSelectedId(newToken.id)
    } else {
      setSelectedBlockId(blockId)
      setSelectedId(null)
    }
    setBlockModalState(null)
  }

  const hasInjectCapacity = project.blocks.some(
    (b) =>
      b.config.targetWordCount !== undefined &&
      countWords(b.sourceText) < b.config.targetWordCount
  )
  const canInjectFromTray = !!project.sourceText.trim() && hasInjectCapacity

  function handleInjectFromTray() {
    if (!canInjectFromTray) return
    const { blocks: newBlocks, remainingText } = distributeTextIntoBlocks(
      project.blocks,
      project.sourceText,
      project.defaultConfig,
      rulesFromSettings(settings)
    )
    setProject((p) => ({
      ...p,
      blocks: newBlocks,
      sourceText: remainingText,
      updatedAt: new Date().toISOString(),
    }))
    syncPlayback(newBlocks)
  }

  function handleClearBlock(blockId: number) {
    const newBlocks = clearBlockText(project.blocks, blockId)
    setProject((p) => ({ ...p, blocks: newBlocks, updatedAt: new Date().toISOString() }))
    syncPlayback(newBlocks)
    // Keep selectedBlockId (block still exists); clear token selection
    if (selectedToken && selectedToken.blockId === blockId) setSelectedId(null)
  }

  function handleClearAllBlocks() {
    if (!window.confirm('Clear all injected text from every block?')) return
    const newBlocks = clearAllBlocksText(project.blocks)
    setProject((p) => ({ ...p, blocks: newBlocks, updatedAt: new Date().toISOString() }))
    syncPlayback(newBlocks)
    setSelectedId(null)
  }

  // ── Token deletion ────────────────────────────────────────────────────────────

  function handleDeleteToken(tokenId: number) {
    let offset = 0
    const newBlocks = project.blocks.map((block) => {
      const newTokens = block.tokens
        .filter((t) => t.id !== tokenId)
        .map((t) => ({ ...t, id: offset++ }))
      return { ...block, tokens: newTokens }
    })

    setProject((p) => ({ ...p, blocks: newBlocks, updatedAt: new Date().toISOString() }))
    syncPlayback(newBlocks)
    const newFlat = flattenBlocks(newBlocks)
    if (selectedId === tokenId) {
      setSelectedId(newFlat.length > 0 ? 0 : null)
      // Fall back to block selection if the block still exists
      const parentBlock = project.blocks.find((b) => b.tokens.some((t) => t.id === tokenId))
      if (parentBlock) setSelectedBlockId(parentBlock.id)
    }
  }

  // ── Block deletion ────────────────────────────────────────────────────────────

  function handleDeleteBlock(blockId: number) {
    let offset = 0
    const newBlocks = project.blocks
      .filter((b) => b.id !== blockId)
      .map((block) => ({
        ...block,
        tokens: block.tokens.map((t) => ({ ...t, id: offset++ })),
      }))

    setProject((p) => ({ ...p, blocks: newBlocks, updatedAt: new Date().toISOString() }))
    syncPlayback(newBlocks)
    const newFlat = flattenBlocks(newBlocks)
    const stillExists = selectedId !== null && newFlat.some((t) => t.id === selectedId)
    if (!stillExists) setSelectedId(newFlat.length > 0 ? 0 : null)
    if (selectedBlockId === blockId) setSelectedBlockId(null)
  }

  // ── Token move (within-block only) ────────────────────────────────────────────

  function handleMoveToken(tokenId: number, direction: 'up' | 'down') {
    const block = project.blocks.find((b) => b.tokens.some((t) => t.id === tokenId))
    if (!block) return
    const withinIdx = block.tokens.findIndex((t) => t.id === tokenId)
    const newWithinIdx = direction === 'up' ? withinIdx - 1 : withinIdx + 1
    if (newWithinIdx < 0 || newWithinIdx >= block.tokens.length) return

    const swapped = [...block.tokens]
    ;[swapped[withinIdx], swapped[newWithinIdx]] = [swapped[newWithinIdx], swapped[withinIdx]]

    let offset = 0
    const newBlocks = project.blocks.map((b) => {
      if (b.id !== block.id) {
        return { ...b, tokens: b.tokens.map((t) => ({ ...t, id: offset++ })) }
      }
      return { ...b, tokens: swapped.map((t) => ({ ...t, id: offset++ })) }
    })

    setProject((p) => ({ ...p, blocks: newBlocks, updatedAt: new Date().toISOString() }))
    syncPlayback(newBlocks)
    // Follow the moved token to its new global id
    const movedBlock = newBlocks.find((b) => b.id === block.id)
    const movedToken = movedBlock?.tokens[newWithinIdx]
    if (movedToken) setSelectedId(movedToken.id)
  }

  // ── Token text edit ───────────────────────────────────────────────────────────

  function applyTokenTextEdit() {
    if (!selectedToken || !selectedBlock) return
    const text = editingTokenText.trim()
    if (!text) return
    // Re-tokenize the edited text using the block's config
    const blockOffset = flattenBlocks(
      project.blocks.filter((b) => b.id < selectedBlock.id)
    ).length
    // Build temporary block to get re-tokenized children
    const tempBlock = createBlock(
      selectedBlock.id,
      text,
      selectedBlock.config,
      project.defaultConfig,
      0,
      rulesFromSettings(settings)
    )
    if (tempBlock.tokens.length === 0) return

    // Find position of the selected token within the block
    const posInBlock = selectedBlock.tokens.findIndex((t) => t.id === selectedToken.id)
    const replacement = tempBlock.tokens.map((t, i) => ({
      ...t,
      blockId: selectedBlock.id,
      configOverride: i === 0 ? selectedToken.configOverride : null,
      timestampMs: null,
    }))

    const newBlockTokens = [
      ...selectedBlock.tokens.slice(0, posInBlock),
      ...replacement,
      ...selectedBlock.tokens.slice(posInBlock + 1),
    ]

    let offset = blockOffset
    const updatedBlock: ScriptBlock = {
      ...selectedBlock,
      tokens: newBlockTokens.map((t) => ({ ...t, id: offset++ })),
    }
    const newBlocks = project.blocks.map((b) =>
      b.id === selectedBlock.id ? updatedBlock : { ...b, tokens: b.tokens.map((t) => ({ ...t, id: offset++ })) }
    )
    // Re-index all blocks after the edited one
    let globalOffset = 0
    const reindexed = newBlocks.map((b) => ({
      ...b,
      tokens: b.tokens.map((t) => ({ ...t, id: globalOffset++ })),
    }))

    setProject((p) => ({ ...p, blocks: reindexed, updatedAt: new Date().toISOString() }))
    syncPlayback(reindexed)
    // Select the first replacement token
    const newEditedBlock = reindexed.find((b) => b.id === selectedBlock.id)
    const firstReplacement = newEditedBlock?.tokens[posInBlock]
    if (firstReplacement) setSelectedId(firstReplacement.id)
  }

  // ── Token BPM override ────────────────────────────────────────────────────────

  function handleTokenBpmOverride(tokenId: number, bpm: number) {
    let offset = 0
    const newBlocks = project.blocks.map((block) => ({
      ...block,
      tokens: block.tokens.map((t) => {
        const updated =
          t.id === tokenId
            ? { ...t, configOverride: { ...(t.configOverride ?? {}), bpm } }
            : t
        return { ...updated, id: offset++ }
      }),
    }))
    setProject((p) => ({ ...p, blocks: newBlocks, updatedAt: new Date().toISOString() }))
    syncPlayback(newBlocks)
  }

  function handleClearTokenBpmOverride(tokenId: number) {
    let offset = 0
    const newBlocks = project.blocks.map((block) => ({
      ...block,
      tokens: block.tokens.map((t) => {
        if (t.id !== tokenId) return { ...t, id: offset++ }
        const { bpm: _bpm, ...rest } = t.configOverride ?? {}
        const newOverride = Object.keys(rest).length > 0 ? rest : null
        return { ...t, id: offset++, configOverride: newOverride }
      }),
    }))
    setProject((p) => ({ ...p, blocks: newBlocks, updatedAt: new Date().toISOString() }))
    syncPlayback(newBlocks)
  }

  // ── Project config update ─────────────────────────────────────────────────────

  function handleUpdateProjectConfig(patch: Partial<ScriptTokenConfig>) {
    setProject((p) => ({
      ...p,
      defaultConfig: { ...p.defaultConfig, ...patch },
      updatedAt: new Date().toISOString(),
    }))
  }

  // ── Playback ──────────────────────────────────────────────────────────────────

  function handleStart() {
    playback.startPreview()
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (blockModalState) { setBlockModalState(null); return }
        if (showVideoExport) { setShowVideoExport(false); return }
        return
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [blockModalState, showVideoExport])

  const durationMs = totalDurationMs(project.blocks, project.defaultConfig)

  return (
    <div className="script-builder-shell">
      {/* ── Toolbar ── */}
      <div className="script-builder-toolbar">
        <span>Script Builder</span>
        {onExit && (
          <button
            className="sb-btn sb-btn--sm"
            onClick={handleExit}
            title="Exit Script Builder"
            style={{ marginLeft: 8 }}
          >
            ← Exit
          </button>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {durationMs > 0 && (
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {formatMs(durationMs)}
            </span>
          )}
          <button
            className="sb-btn sb-btn--sm"
            onClick={() => {
              const name = window.prompt('Project name', project.name)
              if (name?.trim()) setProject((p) => ({ ...p, name: name.trim() }))
            }}
            title="Rename project"
          >
            {project.name}
          </button>
          <button className="sb-btn sb-btn--sm" onClick={handleNewProject}>
            New project
          </button>
          <input
            ref={loadFileRef}
            type="file"
            accept=".script.json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleLoadFile(file)
              e.target.value = ''
            }}
          />
          <button
            className="sb-btn sb-btn--sm"
            onClick={() => loadFileRef.current?.click()}
            title="Load a saved .script.json file"
          >
            Load script
          </button>
          <button
            className="sb-btn sb-btn--sm"
            disabled={project.blocks.length === 0}
            onClick={() => exportProjectAsJson(project)}
            title="Save script as JSON"
          >
            Save JSON
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <button
              className="sb-btn sb-btn--sm sb-btn--primary"
              disabled={totalTokens === 0}
              onClick={() => setShowVideoExport(true)}
              title="Export script as video"
            >
              Export Video
            </button>
            <button
              className="sb-btn sb-btn--sm"
              onClick={() => setBlockModalState({ mode: 'create' })}
              title="Add a new script block"
            >
              + Add Block
            </button>
          </div>
        </div>
      </div>

      <div className="script-builder-main">
        <div className="script-builder-panels">
          {/* ── Center panel ── */}
          <div className="script-builder-center">
            {(() => {
              // Resolve display config from the block owning the displayed token.
              // During playback this tracks the playing block; when editing it uses
              // the selected block. This ensures the preview stage is always consistent
              // with the block's own display settings (not global reader settings).
              const displayBlock = displayToken
                ? (project.blocks.find(b => b.id === displayToken.blockId) ?? null)
                : selectedBlock
              const cfg = displayBlock
                ? resolveBlockConfig(project.defaultConfig, displayBlock.config)
                : project.defaultConfig

              const { slots, cols: gridCols, rows: gridRows, activeSlot } =
                computeDisplayGrid(displayToken, project.blocks, cfg)
              const { fontSize: fittedFontSize, hasOverflow } = computeDisplayFontSize(
                slots,
                stageDims.width,
                stageDims.height,
                gridCols,
                cfg.stackGap,
                gridRows,
                cfg.linesRowGap,
                cfg.minFontSize ?? 12,
                cfg.fontFamily || 'system-ui, sans-serif'
              )
              // CSS grid template: alternating "1fr <gap>px 1fr …" matching the Reader
              const gridTemplateColumns =
                gridCols <= 1
                  ? '1fr'
                  : Array.from({ length: gridCols }, (_, i) =>
                      i === 0 ? '1fr' : `${cfg.stackGap}px 1fr`
                    ).join(' ')
              return (
                <div
                  ref={stageRef}
                  className={[
                    'sb-display-stage',
                    !displayToken ? 'sb-display-stage--empty' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={
                    {
                      '--rd-stage-bg': cfg.bgColor || undefined,
                      '--rd-text': cfg.textColor || undefined,
                      '--rd-font': cfg.fontFamily || undefined,
                      ...(cfg.highlightColor ? { '--rd-highlight': cfg.highlightColor } : {}),
                      ...(cfg.highlightTextColor ? { '--rd-highlight-text': cfg.highlightTextColor } : {}),
                    } as React.CSSProperties
                  }
                >
                  {displayToken && totalTokens > 0 ? (
                    <div
                      className="reader-stack-rows"
                      style={{
                        transform: (cfg.stackVerticalOffset !== 0 || (cfg.stackHorizontalOffset ?? 0) !== 0)
                          ? `translateY(${cfg.stackVerticalOffset}px) translateX(${cfg.stackHorizontalOffset ?? 0}px)`
                          : undefined,
                        gap: `${cfg.linesRowGap}px`,
                      }}
                    >
                      {Array.from({ length: gridRows }, (_, rowIdx) => (
                        <div key={rowIdx} className="reader-stack-row" style={{ gridTemplateColumns }}>
                          {Array.from({ length: gridCols }, (_, colIdx) => {
                            const slotIdx = rowIdx * gridCols + colIdx
                            const slot = slots[slotIdx]
                            const isEmpty = !slot || slot.words.length === 0
                            const isCurrent = slotIdx === activeSlot
                            const isActive = (cfg.highlightActive ?? false) && isCurrent && !isEmpty
                            return (
                              <Fragment key={colIdx}>
                                {colIdx > 0 && (
                                  <div
                                    className="stack-divider"
                                    aria-hidden="true"
                                    style={{
                                      visibility: (cfg.showChunkDividers ?? false) ? 'visible' : 'hidden',
                                    }}
                                  />
                                )}
                                <div className={`stack-slot${isActive ? ' stack-slot--active' : ''}`}>
                                  {!isEmpty && (
                                    <StackDisplay
                                      stack={{
                                        words: slot!.words,
                                        type: slot!.isHeadline ? 'headline' : 'normal',
                                      }}
                                      fontSize={fittedFontSize}
                                      isHeadline={slot!.isHeadline}
                                      textOverflow={hasOverflow}
                                    />
                                  )}
                                </div>
                              </Fragment>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span>
                      {project.blocks.length === 0
                        ? 'Add blocks below, then inject from the tray'
                        : totalTokens === 0
                          ? 'Inject from tray to fill your blocks'
                          : 'Select a block or press ▶ to begin'}
                    </span>
                  )}
                </div>
              )
            })()}

            {/* Playback controls */}
            <div className="sb-center-bar">
              {!playback.isPlaying ? (
                <button
                  className="sb-btn sb-btn--sm sb-btn--primary"
                  onClick={handleStart}
                  disabled={totalTokens === 0}
                >
                  ▶ Preview
                </button>
              ) : (
                <>
                  <button className="sb-btn sb-btn--sm" onClick={playback.pause}>
                    ⏸ Pause
                  </button>
                  <button className="sb-btn sb-btn--sm" onClick={playback.stop}>
                    ■ Stop
                  </button>
                </>
              )}
              <span className="sb-status">
                {playback.isPlaying
                  ? `${playback.currentTokenIdx + 1} / ${totalTokens}`
                  : totalTokens > 0
                    ? `${totalTokens} token${totalTokens !== 1 ? 's' : ''} · ${formatMs(durationMs)}`
                    : ''}
              </span>
            </div>
          </div>

          {/* ── Right panel — block list + token details ── */}
          <div className="script-builder-right">
            {/* Block / token list */}
            <div className="sb-right-token-list" ref={tokenListRef}>
              {project.blocks.length === 0 && (
                <div style={{ padding: '12px 10px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Add blocks below, then inject from the tray.
                </div>
              )}
              {project.blocks.map((block) => (
                <div key={block.id} className="sb-block-group">
                  {/* Compact block card — click to open settings modal */}
                  <div
                    className={[
                      'sb-block-header',
                      selectedBlock?.id === block.id ? 'sb-block-header--active' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => {
                      setSelectedBlockId(block.id)
                      setSelectedId(null)
                      setBlockModalState({ mode: 'edit', blockId: block.id })
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <span className="sb-block-header__label">Block {block.id + 1}</span>
                    <span className="sb-block-header__count">
                      {block.tokens.length > 0
                        ? `${block.tokens.length} token${block.tokens.length !== 1 ? 's' : ''}`
                        : 'empty'}
                    </span>
                    <button
                      className="sb-btn sb-btn--sm"
                      style={{ padding: '1px 6px', fontSize: '0.7rem', marginLeft: 'auto' }}
                      onClick={(e) => { e.stopPropagation(); handleClearBlock(block.id) }}
                      title="Clear injected text"
                      disabled={!block.sourceText}
                    >
                      ×
                    </button>
                  </div>
                  {/* Child tokens */}
                  {block.tokens.map((token) => (
                    <div
                      key={token.id}
                      data-token-id={token.id}
                      className={[
                        'sb-token-item',
                        token.id === selectedId ? 'sb-token-item--active' : '',
                        token.id === playback.currentTokenIdx && playback.isPlaying
                          ? 'sb-token-item--playing'
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => { setSelectedId(token.id); setSelectedBlockId(null) }}
                    >
                      <span className="sb-token-item__idx">{token.id + 1}</span>
                      <span className="sb-token-item__words">{token.stack.words.join(' ')}</span>
                      {token.stack.type !== 'normal' && (
                        <span className="sb-token-item__badge">
                          {token.stack.type.split('-')[0]}
                        </span>
                      )}
                      {token.configOverride?.bpm !== undefined && (
                        <span className="sb-token-item__badge" title="BPM override">
                          {token.configOverride.bpm}bpm
                        </span>
                      )}
                      {/* Within-block move buttons */}
                      <div className="sb-token-item__reorder" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="sb-reorder-btn"
                          disabled={block.tokens[0].id === token.id}
                          onClick={() => handleMoveToken(token.id, 'up')}
                          title="Move up within block"
                        >
                          ▲
                        </button>
                        <button
                          className="sb-reorder-btn"
                          disabled={block.tokens[block.tokens.length - 1].id === token.id}
                          onClick={() => handleMoveToken(token.id, 'down')}
                          title="Move down within block"
                        >
                          ▼
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Token details */}
            <div className="sb-right-details">
              {selectedToken && selectedBlock ? (
                <>
                  {/* ── Token section ── */}
                  <div className="sb-panel-section">
                    <h4>Token {selectedToken.id + 1}</h4>

                    <textarea
                      className="sb-token-edit-textarea"
                      value={editingTokenText}
                      onChange={(e) => setEditingTokenText(e.target.value)}
                      onBlur={applyTokenTextEdit}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          applyTokenTextEdit()
                          e.currentTarget.blur()
                        }
                      }}
                      rows={3}
                      spellCheck={false}
                    />

                    {selectedToken.stack.type !== 'normal' && (
                      <span className="sb-token-item__badge" style={{ marginTop: 4, display: 'inline-block' }}>
                        {selectedToken.stack.type}
                      </span>
                    )}

                    <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                      <button
                        className="sb-btn sb-btn--sm"
                        style={{ flex: 1 }}
                        disabled={selectedToken.id === 0}
                        onClick={() => setSelectedId(selectedToken.id - 1)}
                      >
                        ← Prev
                      </button>
                      <button
                        className="sb-btn sb-btn--sm"
                        style={{ flex: 1 }}
                        disabled={selectedToken.id === totalTokens - 1}
                        onClick={() => setSelectedId(selectedToken.id + 1)}
                      >
                        Next →
                      </button>
                    </div>

                    <div style={{ marginTop: 6 }}>
                      <button
                        className="sb-btn sb-btn--sm sb-btn--danger"
                        onClick={() => handleDeleteToken(selectedToken.id)}
                      >
                        Delete token
                      </button>
                    </div>
                  </div>

                  {/* ── Token BPM override ── */}
                  <div className="sb-panel-section">
                    <h4>Token BPM override</h4>
                    <div className="sb-field-row">
                      <input
                        className="sb-field-input"
                        type="number"
                        min={10}
                        max={1200}
                        value={selectedToken.configOverride?.bpm ?? selectedBlock.config.bpm}
                        onChange={(e) =>
                          handleTokenBpmOverride(
                            selectedToken.id,
                            Math.max(10, Math.min(1200, Number(e.target.value)))
                          )
                        }
                        style={{ maxWidth: 80 }}
                      />
                      {selectedToken.configOverride?.bpm !== undefined && (
                        <button
                          className="sb-btn sb-btn--sm"
                          onClick={() => handleClearTokenBpmOverride(selectedToken.id)}
                          title="Reset to block BPM"
                        >
                          ↺ Block default
                        </button>
                      )}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      Block default: {selectedBlock.config.bpm} BPM
                    </div>
                  </div>

                  {/* ── Open block settings ── */}
                  <div className="sb-panel-section">
                    <button
                      className="sb-btn sb-btn--sm"
                      style={{ width: '100%' }}
                      onClick={() => setBlockModalState({ mode: 'edit', blockId: selectedBlock.id })}
                    >
                      Block {selectedBlock.id + 1} settings…
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ padding: '16px 12px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Select a token to edit it, or click a block to open its settings.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Inject bar ── */}
        <div className="sb-token-bar">
          <button
            className="sb-btn sb-btn--primary sb-btn--sm"
            onClick={handleInjectFromTray}
            disabled={!canInjectFromTray}
            title={!project.sourceText.trim() ? 'No tray text' : !hasInjectCapacity ? 'All blocks are full' : 'Distribute tray text into blocks'}
          >
            Inject from tray →
          </button>
          <button
            className="sb-btn sb-btn--sm"
            onClick={handleClearAllBlocks}
            disabled={project.blocks.every((b) => !b.sourceText)}
            title="Clear all injected text"
          >
            Clear all
          </button>
        </div>

        {/* ── Source text panel ── */}
        <div className={`sb-source-panel${sourcePanelOpen ? ' sb-source-panel--open' : ''}`}>
          <div className="sb-source-panel-bar">
            <button
              className="sb-btn sb-btn--sm"
              onClick={() => setSourcePanelOpen((v) => !v)}
            >
              {sourcePanelOpen ? '▲' : '▼'} Source text
              {project.sourceText && (
                <span style={{ marginLeft: 6, color: 'var(--text-muted)' }}>
                  ({project.sourceText.length} chars remaining)
                </span>
              )}
            </button>
          </div>
          {sourcePanelOpen && (
            <textarea
              className="sb-source-textarea"
              value={project.sourceText}
              onChange={(e) =>
                setProject((p) => ({
                  ...p,
                  sourceText: e.target.value,
                  updatedAt: new Date().toISOString(),
                }))
              }
              spellCheck={false}
            />
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      {blockModalState?.mode === 'create' && (
        <BlockSettingsModal
          mode="create"
          initialBlockConfig={{
            bpm: project.defaultConfig.bpm,
            wordsPerStack: project.defaultConfig.wordsPerStack,
            stacksVisible: project.defaultConfig.stacksVisible,
            targetWordCount: 50,
          }}
          projectConfig={project.defaultConfig}
          settings={settings}
          onConfirm={handleAddBlockFromModal}
          onClose={() => setBlockModalState(null)}
        />
      )}

      {blockModalState?.mode === 'edit' && (() => {
        const editBlock = project.blocks.find((b) => b.id === blockModalState.blockId)
        if (!editBlock) return null
        return (
          <BlockSettingsModal
            mode="edit"
            initialBlockConfig={editBlock.config}
            projectConfig={project.defaultConfig}
            settings={settings}
            block={editBlock}
            onConfirm={(config, projectPatch) =>
              handleUpdateBlockFromModal(blockModalState.blockId, config, projectPatch)
            }
            onDelete={() => {
              handleDeleteBlock(blockModalState.blockId)
              setBlockModalState(null)
            }}
            onClose={() => setBlockModalState(null)}
          />
        )
      })()}

      {showVideoExport && (
        <VideoExportModal
          project={project}
          settings={settings}
          onClose={() => setShowVideoExport(false)}
        />
      )}
    </div>
  )
}
