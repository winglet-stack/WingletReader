import { useCallback } from 'react'
import type { Settings } from '../types'
import type { AppView } from './routeTable'

export function useAppShellHandlers(options: {
  saveSettings: (patch: Partial<Settings>) => Promise<void>
  setView: (view: AppView) => void
  setShellError: (error: string | null) => void
  openGlobalSettings: () => void
  refreshTexts: () => Promise<void>
}) {
  const { saveSettings, setView, setShellError, openGlobalSettings, refreshTexts } = options

  const handleChooseLibraryMode = useCallback(async () => {
    try {
      await saveSettings({ read_while_working_enabled: false })
      setView('library')
    } catch (err) {
      setShellError(`Failed to update mode: ${(err as Error).message}`)
      setView('library')
    }
  }, [saveSettings, setShellError, setView])

  const handleChooseReadWhileWorkingMode = useCallback(async () => {
    try {
      setView('library')
      // Single main-process enable path (shared with the tray Start item):
      // persists the flag, registers shortcuts and hides to the tray on success.
      const status = await window.api.readWhileWorking.enableAndHideToTray()
      if (!status.supported || !status.registered) {
        setShellError(status.error ?? 'Read while working could not be enabled.')
        openGlobalSettings()
      }
    } catch (err) {
      setShellError(`Failed to enable Read while working: ${(err as Error).message}`)
      openGlobalSettings()
    }
  }, [openGlobalSettings, setShellError, setView])

  const handleExport = useCallback(async () => {
    const result = await window.api.data.exportAll()
    if (!result.ok && result.error !== 'Cancelled') {
      setShellError(`Export failed: ${result.error}`)
    }
  }, [setShellError])

  const handleImportJson = useCallback(async () => {
    const result = await window.api.data.importJson()
    if (result.ok) {
      await refreshTexts()
      if (result.imported) {
        setShellError(`✓ Imported ${result.imported} text(s) successfully`)
        setTimeout(() => setShellError(null), 3000)
      }
    } else if (result.error && result.error !== 'Cancelled') {
      setShellError(`Import failed: ${result.error}`)
    }
  }, [refreshTexts, setShellError])

  return {
    handleChooseLibraryMode,
    handleChooseReadWhileWorkingMode,
    handleExport,
    handleImportJson,
  }
}
