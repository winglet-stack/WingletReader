import React, { useState } from 'react'
import type { Settings } from '../../types'
import {
  READER_SETTINGS_LAYOUT,
  type ReaderSettingsTab,
} from '../settings/readerSettingsLayout'
import ReaderPreview from '../ReaderPreview'
import ReaderSettingsControls from './ReaderSettingsControls'
import { useReaderSettingsEditorDraft, flushOnNumericBlur } from './useReaderConfigDraft'

interface Props {
  settings: Settings
  onSave: (patch: Partial<Settings>) => void
  /** Settings host shows the folding preview; the in-Reader drawer (SR-4) won't. */
  showPreview?: boolean
  /**
   * In-Reader drawer host: apply each edit immediately instead of through the
   * debounced draft. The live reader behind the drawer *is* the preview, so
   * debouncing makes it lag during a drag and can drop an in-flight edit when
   * `liveSettings` changes underneath the draft. The Settings host keeps the
   * debounced draft (stable `settings` prop, no live reader behind it).
   */
  liveApply?: boolean
}

/**
 * Open/closed state of the folding preview panel (SR-3). A UI preference, NOT a
 * reader `Setting` — it stays out of the Settings store, profiles, and
 * export/import. Namespaced localStorage key; collapsed is the default.
 */
const PREVIEW_OPEN_STORAGE_KEY = 'wingletreader.readerSettings.previewOpen'

function readPreviewOpenPref(): boolean {
  try {
    return window.localStorage.getItem(PREVIEW_OPEN_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function writePreviewOpenPref(open: boolean): void {
  try {
    window.localStorage.setItem(PREVIEW_OPEN_STORAGE_KEY, String(open))
  } catch {
    /* localStorage unavailable — preference is best-effort only. */
  }
}

function ReaderSettingsInlinePreview({ settings }: { settings: Settings }) {
  return (
    <div className="rse-preview-inline">
      {/* Force dividers off: the reader stopped drawing them (SR-2), so the
          editor preview mirrors that without touching the shared previews. */}
      <ReaderPreview settings={settings} showChunkDividers={false} />
    </div>
  )
}

function ReaderSettingsTabBar({
  activeTabId,
  onTabChange,
  showPreview,
  previewOpen,
  onTogglePreview,
}: {
  activeTabId: ReaderSettingsTab['id']
  onTabChange: (id: ReaderSettingsTab['id']) => void
  showPreview: boolean
  previewOpen: boolean
  onTogglePreview: () => void
}) {
  return (
    <div className="rse-tabbar">
      <div className="rcp-section-tabs" role="tablist" aria-label="Reader settings">
        {READER_SETTINGS_LAYOUT.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTabId === tab.id}
            className={`theme-pill${activeTabId === tab.id ? ' theme-pill-active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {showPreview && (
        <button
          type="button"
          className={`theme-pill rse-preview-toggle${previewOpen ? ' theme-pill-active' : ''}`}
          aria-pressed={previewOpen}
          aria-expanded={previewOpen}
          onClick={onTogglePreview}
        >
          {previewOpen ? 'Hide preview' : 'Preview'}
        </button>
      )}
    </div>
  )
}

/**
 * The two-tab Reader settings editor (ADR-0019 / SR-1) — the single editor that
 * replaces the calm-grid card landing + "Edit everything" power view. It opens
 * directly on **Playback & Grid Layout** (two columns on every host; the Settings
 * host folds preview below the right column) and **Display**
 * (Text & Highlighting + Spacing | Colors). Every row is rendered from the
 * metadata table via `ReaderSettingField`, placed by the `readerSettingsLayout`
 * descriptor — the editor holds no per-field knowledge.
 *
 * Auto-saves through `useReaderConfigDraft` (debounced) with a numeric-blur flush;
 * there is no Save button. Host differences are props: the Settings host renders
 * the folding preview affordance (`showPreview`); the live preview is collapsed
 * by default and folds in-place via a toggle whose state persists as a localStorage
 * UI pref (SR-3). SR-4 points the in-Reader drawer here with the preview flag off.
 */
export default function ReaderSettingsEditor({
  settings,
  onSave,
  showPreview = true,
  liveApply = false,
}: Props) {
  const { local, update, flushPendingSave } = useReaderSettingsEditorDraft(settings, onSave, liveApply)
  const [activeTabId, setActiveTabId] = useState<ReaderSettingsTab['id']>('playback-grid')
  const [previewOpen, setPreviewOpen] = useState<boolean>(
    () => showPreview && readPreviewOpenPref()
  )

  const togglePreview = (): void => {
    setPreviewOpen((prev) => {
      const next = !prev
      writePreviewOpenPref(next)
      return next
    })
  }

  const previewVisible = showPreview && previewOpen
  const activeTab =
    READER_SETTINGS_LAYOUT.find((t) => t.id === activeTabId) ?? READER_SETTINGS_LAYOUT[0]
  const previewPanel =
    (previewVisible || (showPreview && activeTab.id === 'custom-colors'))
      ? <ReaderSettingsInlinePreview settings={local} />
      : null
  const showPreviewToggle = showPreview && activeTab.id !== 'custom-colors'

  const controls = (
    <ReaderSettingsControls
      activeTab={activeTab}
      local={local}
      update={update}
      onSave={onSave}
      onOpenCustomColors={() => setActiveTabId('custom-colors')}
      previewColumnFooter={showPreview ? previewPanel : undefined}
    />
  )

  return (
    <div className={showPreview ? 'rse-console' : undefined}>
      <ReaderSettingsTabBar
        activeTabId={activeTabId}
        onTabChange={setActiveTabId}
        showPreview={showPreviewToggle}
        previewOpen={previewOpen}
        onTogglePreview={togglePreview}
      />

      <div
        className="rse-console-body rcp-controls"
        onBlurCapture={(e) => flushOnNumericBlur(e, flushPendingSave)}
      >
        {controls}
      </div>
    </div>
  )
}
