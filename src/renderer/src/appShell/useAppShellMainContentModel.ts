import { useNavigation } from '../contexts/NavigationContext'
import { useSettings } from '../contexts/SettingsContext'
import { useLibrary } from '../contexts/LibraryContext'
import { useReader } from '../contexts/ReaderContext'
import { useAppShellHandlers } from './useAppShellHandlers'
import { useAppShellErrors } from './useAppShellEffects'

/**
 * Everything a destination's body may read. The route table's `render` takes it
 * whole, so a new destination needs no new plumbing.
 */
export type MainContentModel = ReturnType<typeof useAppShellMainContentModel>

export function useAppShellMainContentModel(
  shellError: string | null,
  setShellError: (error: string | null) => void
) {
  const {
    view,
    setView,
    settingsMode,
    openGlobalSettings,
    openTransmuteReaderSettings,
    openTransmuteForText,
    transmuteLaunchTextId,
    clearTransmuteLaunch,
    openTransmuteForUnsavedSource,
    transmuteLaunchSource,
    clearTransmuteLaunchSource,
  } = useNavigation()
  const { settings, saveSettings } = useSettings()
  const {
    texts,
    activeText,
    segments,
    parentText,
    libraryTab,
    setLibraryTab,
    addChapterTarget,
    setAddChapterTarget,
    handleAddChapterSaved,
    refreshTexts,
    error: libraryError,
    clearError: clearLibraryError,
  } = useLibrary()
  const {
    openReader,
    readerError,
    clearReaderError,
  } = useReader()

  const {
    handleChooseReadWhileWorkingMode,
    handleExport,
    handleImportJson,
  } = useAppShellHandlers({
    saveSettings,
    setView,
    setShellError,
    openGlobalSettings,
    refreshTexts,
  })

  const { error, dismissError } = useAppShellErrors(
    shellError,
    setShellError,
    readerError,
    clearReaderError,
    libraryError,
    clearLibraryError
  )

  return {
    view,
    setView,
    settings,
    settingsMode,
    texts,
    activeText,
    segments,
    parentText,
    libraryTab,
    setLibraryTab,
    addChapterTarget,
    setAddChapterTarget,
    openReader,
    handleAddChapterSaved,
    handleChooseReadWhileWorkingMode,
    handleExport,
    handleImportJson,
    saveSettings,
    openGlobalSettings,
    openTransmuteReaderSettings,
    openTransmuteForText,
    transmuteLaunchTextId,
    clearTransmuteLaunch,
    openTransmuteForUnsavedSource,
    transmuteLaunchSource,
    clearTransmuteLaunchSource,
    error,
    dismissError,
  }
}
