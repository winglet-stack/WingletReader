import React from 'react'
import { copyReaderDefaultsToRww, type ReadWhileWorkingStatus, type Settings } from '../../types'
import { useSettings } from '../../contexts/SettingsContext'
import RwwSettingsEditor, {
  type RwwShortcutPatch,
  type RwwSettingsTabId,
} from './RwwSettingsEditor'
import type { RwwHostChromeProps } from './RwwStartControl'
import { readWhileWorkingStatusError } from '../../engine/shortcutCapture'

interface Props {
  local: Settings
  onSave: (patch: Partial<Settings>) => void
  onSaveShortcut?: (patch: RwwShortcutPatch) => void | Promise<void>
  status?: ReadWhileWorkingStatus | null
  hostChrome?: RwwHostChromeProps
  onActiveTabChange?: (tabId: RwwSettingsTabId) => void
}

export default function RwwSettingsBody({
  local,
  onSave,
  onSaveShortcut,
  status = null,
  hostChrome,
  onActiveTabChange,
}: Props) {
  const { effectiveSettingsFor, settingsStore, saveSettingsStore } = useSettings()
  void local
  const readinessError = readWhileWorkingStatusError(status)
  const copyFromReaderDefaults = (): Promise<void> =>
    saveSettingsStore(copyReaderDefaultsToRww(settingsStore))

  return (
    <RwwSettingsEditor
      settings={effectiveSettingsFor('rww')}
      onSave={onSave}
      onCopyFromReaderDefaults={copyFromReaderDefaults}
      onSaveShortcut={onSaveShortcut}
      readinessError={readinessError}
      hostChrome={hostChrome}
      onActiveTabChange={onActiveTabChange}
    />
  )
}
