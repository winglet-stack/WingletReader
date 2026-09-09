import React, { useEffect, useCallback, useRef } from 'react'
import type { Settings } from '../../types'
import settingsDarkSrc from '../../assets/reader-buttons/settings-dark.png'
import settingsLightSrc from '../../assets/reader-buttons/settings-light.png'
import ReaderButtonIcon from './ReaderButtonIcon'
import SliderField from '../settings/instruments/SliderField'
import Stepper from '../settings/instruments/Stepper'
import Segmented from '../settings/instruments/Segmented'
import { settingMeta } from '../settings/settingMetadata'
import { effectiveLinesCount, linesCountPatch } from '../../../../shared/settings'
import type { ReaderLinesAnchor } from '../../../../shared/settings'

// Shared metadata — Quick Settings renders the same instruments/ranges as the
// Reader-defaults editor so a setting can never drift between surfaces (ADR-0014
// §1/§3). Read once: the table is static.
const bpmMeta = settingMeta('bpm')
const fontSizeMeta = settingMeta('font_size')
const wpsMeta = settingMeta('words_per_stack')
const stacksMeta = settingMeta('stacks_visible')
const linesMeta = settingMeta('lines_count')
const linesAnchorMeta = settingMeta('lines_anchor')
const highlightModeMeta = settingMeta('highlight_mode')

/** Write `highlight_mode` and its legacy `highlighting_mode` twin together
 *  (mirrors `readerConfig/HighlightModeRow`: only 'default' stays 'default'). */
function highlightModePatch(mode: string): Partial<Settings> {
  return { highlight_mode: mode, highlighting_mode: mode === 'default' ? 'default' : 'progressive' }
}

interface Props {
  /** Panel open-state is Reader-owned (Escape cascade closes it from the keymap). */
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Live settings shadow is Reader-owned (read by layout math, stage, keymap). */
  liveSettings: Settings
  /** Apply a patch to liveSettings AND persist it (live + save). */
  onQuickSet: (patch: Partial<Settings>) => void
  /** Apply a patch to liveSettings only — no persistence (slider drag preview). */
  onLiveSet: (patch: Partial<Settings>) => void
  /** Persist a patch only — no live update (slider release commit). */
  onPersist: (patch: Partial<Settings>) => void
  /**
   * Capture the current reading position into Reader's restorePositionRef before a
   * words_per_stack-changing patch re-tokenizes the text. Must be called synchronously
   * before the patch, and only when words_per_stack actually changes.
   */
  onBeforeRetokenize: () => void
  /** Open the Reader-owned config drawer (closes this popover first). */
  onSeeMoreSettings: () => void
  /** In-flow footer slot (windowed Reader); false keeps legacy fixed bottom-right corner. */
  embedded?: boolean
}

/**
 * In-Reader Quick Settings — a flat ordered live list of the most-used controls
 * in reading-frequency order (ADR-0014 §6), built on the shared instrument kit:
 * Speed · Words/stack · Text size · Stacks · Line count/anchor · Highlight ·
 * Tap-to-read · "See more settings →". (Lock-at-WPM was de-UI'd — ADR-0019 §4.)
 *
 * Each control owns its own draft state (SliderField / Stepper), so this shell
 * only carries the live/persist split and the re-tokenization capture contract:
 * any `words_per_stack` change runs `onBeforeRetokenize()` synchronously first so
 * Reader can seek back to the equivalent position after re-tokenization.
 */
export default function QuickSettingsPopover({
  open,
  onOpenChange,
  liveSettings,
  onQuickSet,
  onLiveSet,
  onPersist,
  onBeforeRetokenize,
  onSeeMoreSettings,
  embedded = false,
}: Props) {
  const quickSettingsWrapRef = useRef<HTMLDivElement>(null)

  // Close panel when the user clicks outside the floating wrap.
  useEffect(() => {
    if (!open) return
    const handleMouseDown = (e: MouseEvent) => {
      if (quickSettingsWrapRef.current && !quickSettingsWrapRef.current.contains(e.target as Node)) {
        onOpenChange(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [open, onOpenChange])

  // Commit a words_per_stack change: capture the reading position first so Reader's
  // restore effect can seek back after re-tokenization rebuilds the stacks.
  const commitWordsPerStack = useCallback(
    (v: number) => {
      onBeforeRetokenize()
      onQuickSet({ words_per_stack: v })
    },
    [onBeforeRetokenize, onQuickSet]
  )

  // ── Mode flags ──────────────────────────────────────────────────────────────
  // Only tap_to_read gates the list now: it hides Speed (auto-advance is off).
  // `lock_at_wpm`/`target_wpm` are de-UI'd (ADR-0019 §4) — Speed is always BPM
  // and Words per stack is always its own stepper.
  const showSpeed = !liveSettings.tap_to_read
  const wpm = liveSettings.bpm * liveSettings.words_per_stack

  return (
    <div
      ref={quickSettingsWrapRef}
      className={`reader-quickset-wrap${embedded ? ' reader-quickset-wrap--embedded' : ''}`}
    >
      {open && (
        <div
          className="reader-quickset-dropdown"
          role="dialog"
          aria-label="Quick settings"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation()
              onOpenChange(false)
            }
          }}
        >
          <div className="reader-quickset-header">Quick Settings</div>

          {/* 1 · Speed (always the BPM slider; hidden only in Tap mode) */}
          {showSpeed && (
            <div className="reader-quickset-row">
              <div className="reader-quickset-label">
                Speed
                <span className="reader-quickset-hint">{wpm} wpm</span>
              </div>
              <SliderField
                className="reader-quickset-control"
                label="BPM"
                value={liveSettings.bpm}
                min={bpmMeta.min!}
                max={bpmMeta.max!}
                step={bpmMeta.step}
                transform={bpmMeta.transform}
                clampValue={bpmMeta.clampValue}
                onLiveSet={(bpm) => onLiveSet({ bpm })}
                onPersist={(bpm) => onPersist({ bpm })}
              />
            </div>
          )}

          {/* 2 · Words per stack (always its own stepper) */}
          <div className="reader-quickset-row">
            <div className="reader-quickset-label">Words per stack</div>
            <div className="reader-quickset-control">
              <Stepper
                label="Words per stack"
                value={liveSettings.words_per_stack}
                min={wpsMeta.min!}
                max={wpsMeta.max!}
                onChange={commitWordsPerStack}
              />
            </div>
          </div>

          {/* 3 · Text size */}
          <div className="reader-quickset-row">
            <div className="reader-quickset-label">Text size</div>
            <SliderField
              className="reader-quickset-control"
              label={fontSizeMeta.label}
              value={liveSettings.font_size}
              min={fontSizeMeta.min!}
              max={fontSizeMeta.max!}
              step={fontSizeMeta.step}
              onLiveSet={(font_size) => onLiveSet({ font_size })}
              onPersist={(font_size) => onPersist({ font_size })}
            />
          </div>

          {/* 4 · Stacks visible */}
          <div className="reader-quickset-row">
            <div className="reader-quickset-label">Stacks visible</div>
            <div className="reader-quickset-control">
              <Stepper
                label="Stacks visible"
                value={liveSettings.stacks_visible}
                min={stacksMeta.min!}
                max={stacksMeta.max!}
                onChange={(stacks_visible) => onQuickSet({ stacks_visible })}
              />
            </div>
          </div>

          {/* 5 · Line count + conditional anchor */}
          <div className="reader-quickset-row">
            <div className="reader-quickset-label">{linesMeta.label}</div>
            <div className="reader-quickset-control">
              <Stepper
                label={linesMeta.label}
                value={effectiveLinesCount(liveSettings)}
                min={linesMeta.min!}
                max={linesMeta.max!}
                onChange={(lines_count) => onQuickSet(linesCountPatch(lines_count))}
              />
            </div>
          </div>

          {linesAnchorMeta.reveal?.(liveSettings) && (
            <div className="reader-quickset-row reader-quickset-row--sub">
              <div className="reader-quickset-label">{linesAnchorMeta.label}</div>
              <Segmented
                label={linesAnchorMeta.label}
                value={liveSettings.lines_anchor ?? 'center'}
                options={linesAnchorMeta.options as ReadonlyArray<{ value: ReaderLinesAnchor; label: string }>}
                onChange={(lines_anchor) => onQuickSet({ lines_anchor })}
              />
            </div>
          )}

          {/* 6 · Highlight + mode */}
          <div className="reader-quickset-row">
            <div className="reader-quickset-label">Highlight word stack</div>
            <div className="reader-quickset-control">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={liveSettings.highlight_active}
                  onChange={(e) => onQuickSet({ highlight_active: e.target.checked })}
                />
                <span className="toggle-track" />
              </label>
            </div>
          </div>

          {liveSettings.highlight_active && (
            <div className="reader-quickset-row reader-quickset-row--sub reader-quickset-row--stack">
              <div className="reader-quickset-label">Highlight mode</div>
              <Segmented
                label="Highlight mode"
                value={liveSettings.highlight_mode ?? 'default'}
                options={highlightModeMeta.options as ReadonlyArray<{ value: string; label: string }>}
                onChange={(mode) => onQuickSet(highlightModePatch(mode))}
              />
            </div>
          )}

          {/* 7 · Tap to Read */}
          <div className="reader-quickset-row">
            <div className="reader-quickset-label">
              Tap to Read
              <span className="reader-quickset-hint">Advance one stack on tap or key.</span>
            </div>
            <div className="reader-quickset-control">
              <label className="toggle">
                <input
                  type="checkbox"
                  aria-label="Tap to Read"
                  checked={liveSettings.tap_to_read}
                  onChange={(e) => onQuickSet({ tap_to_read: e.target.checked })}
                />
                <span className="toggle-track" />
              </label>
            </div>
          </div>

          {/* 8 · See more settings */}
          <div className="reader-quickset-footer">
            <button
              className="btn-ghost btn-small"
              onClick={() => {
                onOpenChange(false)
                onSeeMoreSettings()
              }}
            >
              See more settings &#8594;
            </button>
          </div>
        </div>
      )}

      <button
        className={`reader-utility-btn reader-utility-btn--quickset${open ? ' reader-utility-btn--open' : ''}`}
        onClick={() => onOpenChange(!open)}
        aria-label="Quick settings"
        aria-expanded={open}
        title="Quick settings"
      >
        <ReaderButtonIcon darkSrc={settingsDarkSrc} lightSrc={settingsLightSrc} alt="Quick settings" />
      </button>
    </div>
  )
}
