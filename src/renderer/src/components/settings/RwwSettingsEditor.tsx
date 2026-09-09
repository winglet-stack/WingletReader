import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { Settings } from '../../types'
import {
  RWW_SETTINGS_LAYOUT,
  type RwwSettingsField,
  type RwwSettingsSection,
  type RwwSettingsTab,
} from './rwwSettingsLayout'
import RwwStartControl, { type RwwHostChromeProps } from './RwwStartControl'
import ReaderPreview from '../ReaderPreview'
import ReaderSettingField from '../readerConfig/ReaderSettingField'
import { flushOnNumericBlur } from '../readerConfig/useReaderConfigDraft'
import SettingToggleRow from '../SettingToggleRow'
import RwwShortcutRow from './RwwShortcutRow'
import SettingsLabel from './SettingsLabel'
import SliderField from './instruments/SliderField'
import { toRwwFlatPatch } from '../../engine/reader-configs'
import { settingMeta } from './settingMetadata'
import AlphaNotice from '../AlphaNotice'
import { alphaChrome } from '../../alphaChrome'

/** Top-level (non-projected) accelerator patch saved through the readiness path. */
export type RwwShortcutPatch =
  | Pick<Settings, 'read_while_working_shortcut'>
  | Pick<Settings, 'read_while_working_exit_shortcut'>

export type RwwSettingsTabId = RwwSettingsTab['id']

interface Props {
  settings: Settings
  onSave: (patch: Partial<Settings>) => void | Promise<void>
  onCopyFromReaderDefaults?: () => void | Promise<void>
  /**
   * Saves a summon/exit accelerator and refreshes readiness (ADR-0021). Kept
   * separate from `onSave` so shortcut rebinds bypass the rww_* projection and
   * re-check global-hotkey registration.
   */
  onSaveShortcut?: (patch: RwwShortcutPatch) => void | Promise<void>
  readinessError?: string | null
  hostChrome?: RwwHostChromeProps
  onActiveTabChange?: (tabId: RwwSettingsTabId) => void
}

const PREVIEW_OPEN_STORAGE_KEY = 'wingletreader.rwwSettings.playbackPreviewOpen'

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
    /* localStorage unavailable; the preview preference is best-effort only. */
  }
}

function useRwwSettingsDraft(
  settings: Settings,
  onSave: (patch: Partial<Settings>) => void | Promise<void>
) {
  const [local, setLocal] = useState<Settings>(settings)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingPatchRef = useRef<Partial<Settings> | null>(null)

  useEffect(() => {
    setLocal(settings)
  }, [settings])

  const flushPendingSave = useCallback(async () => {
    const pending = pendingPatchRef.current
    if (!pending) return
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    pendingPatchRef.current = null
    await onSave(toRwwFlatPatch(pending))
  }, [onSave])

  useEffect(() => () => { void flushPendingSave() }, [flushPendingSave])

  const update = useCallback((patch: Partial<Settings>) => {
    setLocal((prev) => ({ ...prev, ...patch }))
    pendingPatchRef.current = { ...(pendingPatchRef.current ?? {}), ...patch }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const pending = pendingPatchRef.current
      if (!pending) return
      pendingPatchRef.current = null
      debounceRef.current = null
      void onSave(toRwwFlatPatch(pending))
    }, 400)
  }, [onSave])

  const saveImmediate = useCallback((patch: Partial<Settings>) => {
    setLocal((prev) => ({ ...prev, ...patch }))
    void onSave(toRwwFlatPatch(patch))
  }, [onSave])

  const updateDirect = useCallback((patch: Partial<Settings>) => {
    setLocal((prev) => ({ ...prev, ...patch }))
    void onSave(patch)
  }, [onSave])

  return { local, update, saveImmediate, updateDirect, flushPendingSave }
}

function RwwSettingsTabBar({
  activeTabId,
  onTabChange,
  showPreview,
  previewOpen,
  onTogglePreview,
  onCopyFromReaderDefaults,
}: {
  activeTabId: RwwSettingsTab['id']
  onTabChange: (id: RwwSettingsTab['id']) => void
  showPreview: boolean
  previewOpen: boolean
  onTogglePreview: () => void
  onCopyFromReaderDefaults: () => void
}) {
  return (
    <div className="rse-tabbar">
      <div className="rcp-section-tabs" role="tablist" aria-label="Overlay Reader settings">
        {RWW_SETTINGS_LAYOUT.map((tab) => (
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
        <>
          {/* Divider separating the nav tabs from the action pills so Copy /
              Preview don't read as more tabs. Left-clustered (no right pin) keeps
              them clear of the Start square. */}
          <span className="rse-tabbar-divider" aria-hidden="true" />
          <button
            type="button"
            className="theme-pill rww-copy-defaults"
            onClick={onCopyFromReaderDefaults}
          >
            Copy from Reader defaults
          </button>
          <button
            type="button"
            className={`theme-pill rse-preview-toggle${previewOpen ? ' theme-pill-active' : ''}`}
            aria-pressed={previewOpen}
            aria-expanded={previewOpen}
            onClick={onTogglePreview}
          >
            {/* Reserve the widest label ("Hide preview") so the pill width is
                constant across the toggle — the pill never grows or shifts. The
                sizer is aria-hidden so the accessible name stays the visible
                label only. */}
            <span className="rse-preview-toggle__sizer" aria-hidden="true">
              Hide preview
            </span>
            <span className="rse-preview-toggle__label">
              {previewOpen ? 'Hide preview' : 'Preview'}
            </span>
          </button>
        </>
      )}
    </div>
  )
}

function RwwInlinePreview({ settings }: { settings: Settings }) {
  // Slice 06: the live preview is a 1:1 square that shrinks to fit its column.
  // The shape is CSS-driven (see .rse-preview-inline); this marker captures the
  // square intent so it survives refactors and is assertable without layout.
  return (
    <div className="rse-preview-inline" data-rww-preview-shape="square">
      <ReaderPreview settings={settings} showChunkDividers={false} />
    </div>
  )
}

function RwwPlaybackPanels({
  activeTab,
  local,
  update,
  onSave,
  previewPanel,
}: {
  activeTab: RwwSettingsTab
  local: Settings
  update: (patch: Partial<Settings>) => void
  onSave: (patch: Partial<Settings>) => void | Promise<void>
  previewPanel: React.ReactNode
}) {
  // Slice 05: the preview lives in a dedicated second column (descriptor
  // previewHost). Open → two columns (Playback/Layout left, preview right);
  // closed → the preview column is skipped so the editor collapses to the single
  // Playback column (slice 04 no-reserved-track behavior).
  const previewOpen = previewPanel != null
  return (
    <div
      className={`rse-columns${previewOpen ? ' rse-columns--preview-open' : ' rse-columns--preview-closed'}`}
      role="tabpanel"
      aria-label={activeTab.label}
    >
      {activeTab.columns.map((column) => {
        if (column.previewHost) {
          if (!previewPanel) return null
          return (
            <div
              key={column.id}
              className="rse-column rse-preview-host-col"
              data-rww-column="preview"
            >
              {previewPanel}
            </div>
          )
        }
        return (
          <div key={column.id} className="rse-column">
            {column.sections.map((section) => (
              <RwwSettingsSectionCard
                key={section.id}
                section={section}
                local={local}
                update={update}
                onSave={onSave}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}

function RwwSettingsFieldRows({
  fields,
  local,
  update,
  onSave,
}: {
  fields: readonly RwwSettingsField[]
  local: Settings
  update: (patch: Partial<Settings>) => void
  onSave: (patch: Partial<Settings>) => void | Promise<void>
}) {
  return (
    <>
      {fields.map((field) => (
        <ReaderSettingField
          key={field}
          field={field}
          local={local}
          update={update}
          onSave={onSave}
        />
      ))}
    </>
  )
}

function RwwSettingsSectionCard({
  section,
  local,
  update,
  onSave,
}: {
  section: RwwSettingsSection
  local: Settings
  update: (patch: Partial<Settings>) => void
  onSave: (patch: Partial<Settings>) => void | Promise<void>
}) {
  // Combined card (slice 03): one h2 section heading with an h3 sub-heading per
  // group. The grid group keeps data-rww-section="grid" so grid-scoped tests
  // still resolve it inside the shared Layout card. (The preview is no longer
  // folded here — slice 05 moved it to the dedicated second column.)
  if (section.subsections) {
    return (
      <section className="settings-section" data-rww-section={section.id}>
        <h2 className="settings-heading">{section.label}</h2>
        {section.subsections.map((sub) => (
          <div
            key={sub.id}
            className="settings-subsection"
            data-rww-section={sub.id}
            data-rww-subsection={sub.id}
          >
            <h3 className="settings-subheading">{sub.label}</h3>
            <RwwSettingsFieldRows
              fields={sub.fields}
              local={local}
              update={update}
              onSave={onSave}
            />
          </div>
        ))}
      </section>
    )
  }

  return (
    <section className="settings-section" data-rww-section={section.id}>
      <h2 className="settings-heading">{section.label}</h2>
      <RwwSettingsFieldRows
        fields={section.fields}
        local={local}
        update={update}
        onSave={onSave}
      />
    </section>
  )
}

function RwwOverlayTabLayout({
  activeTab,
  local,
  update,
  summonShortcut,
  exitShortcut,
  onSaveShortcut,
  hostChrome,
}: {
  activeTab: RwwSettingsTab
  local: Settings
  update: (patch: Partial<Settings>) => void
  summonShortcut: string
  exitShortcut: string
  onSaveShortcut: (patch: RwwShortcutPatch) => void
  hostChrome?: RwwHostChromeProps
}) {
  return (
    <div className="rww-overlay-tab-layout">
      <RwwOverlayStack
        activeTab={activeTab}
        local={local}
        update={update}
        summonShortcut={summonShortcut}
        exitShortcut={exitShortcut}
        onSaveShortcut={onSaveShortcut}
      />
      {hostChrome && (
        <div className="rww-overlay-host-column">
          <RwwStartControl variant="embedded" {...hostChrome} />
        </div>
      )}
    </div>
  )
}

/**
 * Overlay tab: a centered, fixed-width console stack of three inline management
 * blocks (ADR-0021), ordered Standby pill → Shortcut settings → Window size.
 * Section order/titles come from the layout descriptor; each section id maps to a
 * dedicated Overlay block body rather than the generic settings-section card.
 */
function RwwOverlayStack({
  activeTab,
  local,
  update,
  summonShortcut,
  exitShortcut,
  onSaveShortcut,
}: {
  activeTab: RwwSettingsTab
  local: Settings
  update: (patch: Partial<Settings>) => void
  summonShortcut: string
  exitShortcut: string
  onSaveShortcut: (patch: RwwShortcutPatch) => void
}) {
  const sections = activeTab.columns.flatMap((column) => column.sections)
  // Single-open fold-down discipline (ADR-0021): at most one fold-down block is
  // expanded at a time, so opening one closes any competing detail before the
  // frame can cross the minimum-window no-scroll threshold. Window size is the
  // only fold-down today, but the state is owned here so the guard generalizes.
  const [openFoldDown, setOpenFoldDown] = useState<string | null>(null)
  const toggleFoldDown = useCallback((id: string) => {
    setOpenFoldDown((current) => (current === id ? null : id))
  }, [])

  return (
    <div className="rww-overlay-stack" role="tabpanel" aria-label={activeTab.label}>
      {sections.map((section) => (
        <section
          key={section.id}
          className="rww-overlay-block"
          data-rww-section={section.id}
          data-foldopen={section.foldDown ? openFoldDown === section.id : undefined}
        >
          {section.foldDown ? (
            <RwwWindowSizeBlock
              section={section}
              local={local}
              update={update}
              open={openFoldDown === section.id}
              onToggle={() => toggleFoldDown(section.id)}
            />
          ) : (
            <>
              <h2 className="rww-overlay-block__title">{section.label}</h2>
              <RwwOverlayBlockBody
                section={section}
                local={local}
                update={update}
                summonShortcut={summonShortcut}
                exitShortcut={exitShortcut}
                onSaveShortcut={onSaveShortcut}
              />
            </>
          )}
        </section>
      ))}
    </div>
  )
}

/**
 * Window size fold-down block (ADR-0021): collapsed by default showing a compact
 * "W × H" summary, expanding inline to the width/height sliders. Expansion is
 * UI-local (no stored preference); the sliders still save through the existing
 * direct `update` path. The single-open guard lives in RwwOverlayStack.
 */
function RwwWindowSizeBlock({
  section,
  local,
  update,
  open,
  onToggle,
}: {
  section: RwwSettingsSection
  local: Settings
  update: (patch: Partial<Settings>) => void
  open: boolean
  onToggle: () => void
}) {
  const width = Number(local.read_while_working_window_width ?? 640)
  const height = Number(local.read_while_working_window_height ?? 360)
  const summary = `${width} × ${height}`
  return (
    <>
      <h2 className="rww-overlay-block__title rww-overlay-block__title--fold">
        <button
          type="button"
          className="rww-overlay-block__foldtoggle"
          aria-expanded={open}
          onClick={onToggle}
        >
          <span className="rww-overlay-block__title-text">{section.label}</span>
          {!open && <span className="rww-overlay-block__summary">{summary}</span>}
          <span className="rww-overlay-block__chevron" aria-hidden="true" />
        </button>
      </h2>
      {open && (
        <div className="rww-overlay-block__folddown">
          {section.fields.map((field) => (
            <RwwOverlayField key={field} field={field} local={local} update={update} />
          ))}
        </div>
      )}
    </>
  )
}

function RwwOverlayBlockBody({
  section,
  local,
  update,
  summonShortcut,
  exitShortcut,
  onSaveShortcut,
}: {
  section: RwwSettingsSection
  local: Settings
  update: (patch: Partial<Settings>) => void
  summonShortcut: string
  exitShortcut: string
  onSaveShortcut: (patch: RwwShortcutPatch) => void
}) {
  switch (section.id) {
    case 'standby':
      return (
        <SettingToggleRow
          label="Show standby pill"
          hint="Keep the small exit control visible while Overlay Reader is armed"
          checked={local.read_while_working_show_standby_control ?? true}
          onChange={(read_while_working_show_standby_control) =>
            update({ read_while_working_show_standby_control })
          }
        />
      )

    case 'shortcuts':
      return (
        <>
          <RwwShortcutRow
            label="Summon shortcut"
            hint="Global hotkey that summons the overlay from any app"
            value={summonShortcut}
            onCapture={(read_while_working_shortcut) =>
              onSaveShortcut({ read_while_working_shortcut })
            }
          />
          <RwwShortcutRow
            label="Exit shortcut"
            hint="Global hotkey that hides the overlay back to the tray"
            value={exitShortcut}
            onCapture={(read_while_working_exit_shortcut) =>
              onSaveShortcut({ read_while_working_exit_shortcut })
            }
          />
        </>
      )

    default:
      return (
        <>
          {section.fields.map((field) => (
            <RwwOverlayField key={field} field={field} local={local} update={update} />
          ))}
        </>
      )
  }
}

function RwwOverlayField({
  field,
  local,
  update,
}: {
  field: RwwSettingsField
  local: Settings
  update: (patch: Partial<Settings>) => void
}) {
  const meta = settingMeta(field)
  const rawValue = local[field]
  const set = (value: unknown) => update({ [field]: value } as unknown as Partial<Settings>)

  switch (meta.instrument) {
    case 'Slider':
      return (
        <div className="settings-row">
          <SettingsLabel label={meta.label} hint={meta.explain} />
          <SliderField
            label={meta.label}
            value={Number(rawValue)}
            min={meta.min!}
            max={meta.max!}
            step={meta.step}
            transform={meta.transform}
            clampValue={meta.clampValue}
            onLiveSet={set}
          />
        </div>
      )

    case 'Toggle':
      return (
        <SettingToggleRow
          label={meta.label}
          hint={meta.explain}
          checked={Boolean(rawValue)}
          onChange={set}
        />
      )

    default:
      return null
  }
}

export default function RwwSettingsEditor({
  settings,
  onSave,
  onCopyFromReaderDefaults = () => {},
  onSaveShortcut = () => {},
  readinessError = null,
  hostChrome,
  onActiveTabChange,
}: Props) {
  const { local, update, saveImmediate, updateDirect, flushPendingSave } =
    useRwwSettingsDraft(settings, onSave)
  const [activeTabId, setActiveTabId] = useState<RwwSettingsTab['id']>('overlay')
  const [previewOpen, setPreviewOpen] = useState<boolean>(() => readPreviewOpenPref())
  const activeTab =
    RWW_SETTINGS_LAYOUT.find((tab) => tab.id === activeTabId) ?? RWW_SETTINGS_LAYOUT[0]
  const previewVisible = activeTab.id === 'playback-grid' && previewOpen
  const showPreviewToggle = activeTab.id === 'playback-grid'

  useEffect(() => {
    onActiveTabChange?.(activeTabId)
  }, [activeTabId, onActiveTabChange])

  const handleTabChange = useCallback((id: RwwSettingsTab['id']) => {
    setActiveTabId(id)
  }, [])

  const togglePreview = (): void => {
    setPreviewOpen((prev) => {
      const next = !prev
      writePreviewOpenPref(next)
      return next
    })
  }

  const copyFromReaderDefaults = async (): Promise<void> => {
    await flushPendingSave()
    await onCopyFromReaderDefaults()
  }

  return (
    <div className="rse-console rww-settings-editor">
      <AlphaNotice
        enabled={alphaChrome.rwwExperimentalBannerEnabled}
        label="Read While Working experimental warning"
        style={{ marginBottom: '12px' }}
      >
        {alphaChrome.rwwExperimentalBannerCopy}
      </AlphaNotice>
      <RwwSettingsTabBar
        activeTabId={activeTabId}
        onTabChange={handleTabChange}
        showPreview={showPreviewToggle}
        previewOpen={previewOpen}
        onTogglePreview={togglePreview}
        onCopyFromReaderDefaults={() => { void copyFromReaderDefaults() }}
      />
      {readinessError && (
        <div
          className="settings-status settings-status--error rww-readiness-status"
          role="status"
          aria-live="polite"
        >
          {readinessError}
        </div>
      )}
      <div
        className="rse-console-body rcp-controls"
        onBlurCapture={(e) => flushOnNumericBlur(e, flushPendingSave)}
      >
        {activeTab.id === 'playback-grid' ? (
          <RwwPlaybackPanels
            activeTab={activeTab}
            local={local}
            update={update}
            onSave={saveImmediate}
            previewPanel={previewVisible ? <RwwInlinePreview settings={local} /> : null}
          />
        ) : (
          <RwwOverlayTabLayout
            activeTab={activeTab}
            local={local}
            update={updateDirect}
            summonShortcut={local.read_while_working_shortcut ?? 'Control+Space'}
            exitShortcut={local.read_while_working_exit_shortcut ?? 'Control+Space'}
            onSaveShortcut={onSaveShortcut}
            hostChrome={hostChrome}
          />
        )}
      </div>
    </div>
  )
}
