import React, { useState, useEffect, useRef } from 'react'
import type { ReadWhileWorkingStatus, Settings } from '../types'
import ReaderConfigPanel from './ReaderConfigPanel'
import SettingsHeader from './settings/SettingsHeader'
import GlobalSettingsBody from './settings/GlobalSettingsBody'
import ReaderSettingsBody from './settings/ReaderSettingsBody'
import RwwSettingsBody from './settings/RwwSettingsBody'
import type { RwwShortcutPatch, RwwSettingsTabId } from './settings/RwwSettingsEditor'
import type { RwwHostChromeProps } from './settings/RwwStartControl'
import { useSettings } from '../contexts/SettingsContext'
import { useNavigation } from '../contexts/NavigationContext'

interface Props {
  onExport: () => void
  onImport: () => void
  mode?: 'global' | 'transmute'
  onBackToTransmute?: () => void
  rwwStatus?: ReadWhileWorkingStatus | null
  onSaveRwwShortcut?: (patch: RwwShortcutPatch) => void | Promise<void>
  rwwHostChrome?: RwwHostChromeProps
  onRwwSettingsTabChange?: (tabId: RwwSettingsTabId) => void
}

export default function SettingsPanel({
  onExport,
  onImport,
  mode = 'global',
  onBackToTransmute,
  rwwStatus = null,
  onSaveRwwShortcut,
  rwwHostChrome,
  onRwwSettingsTabChange,
}: Props) {
  const { settings, saveSettings, transmuteReaderSettings, saveTransmuteReaderSettings } =
    useSettings()
  const { settingsSubview, setSettingsSubview } = useNavigation()
  const isTransmuteMode = mode === 'transmute'
  const active = isTransmuteMode ? transmuteReaderSettings : settings
  const saveActive = isTransmuteMode ? saveTransmuteReaderSettings : saveSettings
  const [local, setLocal] = useState<Settings>(active)
  // Set just before a commit we originate ourselves (a sub-panel save or an
  // auto-saving update). It tells the reset effect below to skip its blanket
  // resync for that one `active` change, so persisting a value doesn't clobber
  // the user's other local state.
  const skipResetRef = useRef(false)
  // Flat app-preferences surface (ADR-0008/0009): the panel-local mode chips and
  // Simplified/Advanced density switch are gone. Reader tuning opens the
  // full-page defaults editor in place; Overlay Reader opens its matching
  // Settings subview and receives the two-tab editor in later OR slices.
  const activeSettingsSubview = isTransmuteMode ? null : settingsSubview

  useEffect(() => {
    // A self-originated commit changes `active`; don't resync `local` from it,
    // or we'd discard unrelated unsaved edits the user still has on screen.
    if (skipResetRef.current) {
      skipResetRef.current = false
      return
    }
    setLocal(active)
  }, [active]) // eslint-disable-line react-hooks/exhaustive-deps

  const update = (patch: Partial<Settings>) => {
    setLocal((prev) => ({ ...prev, ...patch }))
    skipResetRef.current = true
    saveActive(patch)
  }

  // Reader-config saves: fold the patch into the working `local` state so the
  // saved value stays on screen, then persist it — without the reset effect
  // wiping the user's other unsaved edits.
  const saveFromSubPanel = (patch: Partial<Settings>) => {
    setLocal((prev) => ({ ...prev, ...patch }))
    skipResetRef.current = true
    return saveActive(patch)
  }

  // Transmute entry path: bypass the flat shell and render the existing transmute
  // reader settings editor (issue 04 leaves this branch unchanged).
  if (isTransmuteMode) {
    return (
      <div className="view-container view-container--wide">
        <SettingsHeader transmuteMode onBackToTransmute={onBackToTransmute} saved={false} />
        <ReaderConfigPanel settings={local} onSave={saveFromSubPanel} />
      </div>
    )
  }

  // Reader defaults: the full-page defaults editor (live static preview) opened
  // from the flat surface. Auto-saves through the sub-panel, so no Save button.
  if (activeSettingsSubview === 'reader-defaults') {
    return (
      <section
        className="view-container view-container--wide view-container--settings-subview view-container--reader-defaults-subview"
        aria-label="Reader defaults"
      >
        <ReaderSettingsBody local={local} onSave={saveFromSubPanel} />
      </section>
    )
  }

  if (activeSettingsSubview === 'overlay-reader') {
    return (
      <section
        className="view-container view-container--wide view-container--settings-subview view-container--overlay-reader-subview"
        aria-label="Overlay Reader settings"
      >
        <RwwSettingsBody
          local={local}
          onSave={saveFromSubPanel}
          onSaveShortcut={onSaveRwwShortcut}
          status={rwwStatus}
          hostChrome={rwwHostChrome}
          onActiveTabChange={onRwwSettingsTabChange}
        />
      </section>
    )
  }

  return (
    <div className={`view-container${activeSettingsSubview ? ' view-container--settings-subview' : ''}`}>
      {activeSettingsSubview === null && (
        <SettingsHeader transmuteMode={false} saved={false} />
      )}

      <GlobalSettingsBody
        local={local}
        update={update}
        onExport={onExport}
        onImport={onImport}
        onOpenReaderDefaults={() => setSettingsSubview('reader-defaults')}
      />
    </div>
  )
}
