import React, { useCallback, useState, useEffect } from 'react'
import { useNavigation } from './contexts/NavigationContext'
import { useSettings } from './contexts/SettingsContext'
import { useLibrary } from './contexts/LibraryContext'
import { useReader } from './contexts/ReaderContext'
import type { ReadWhileWorkingStatus, Settings } from './types'
import SummarySetupModal from './components/SummarySetupModal'
import SummaryPromptModal from './components/SummaryPromptModal'
import { isAlphaDeadRoute } from './alphaChrome'
import HomeControl from './components/shell/HomeControl'
import UpLevelControl from './components/shell/UpLevelControl'
import GearControl from './components/shell/GearControl'
import RwwStartControl from './components/settings/RwwStartControl'
import type { RwwSettingsTabId } from './components/settings/RwwSettingsEditor'
import HubView from './components/hub/HubView'
import AppShellMainContent from './appShell/AppShellMainContent'
import { readWhileWorkingStatusError } from './engine/shortcutCapture'
import {
  useAppShellDocumentEffects,
  useReadWhileWorkingEnableFailed
} from './appShell/useAppShellEffects'

function statusFromStartError(
  message: string,
  settings: { read_while_working_shortcut?: string; read_while_working_exit_shortcut?: string }
): ReadWhileWorkingStatus {
  return {
    enabled: false,
    supported: true,
    registered: false,
    shortcut: settings.read_while_working_shortcut ?? 'Control+Space',
    exitShortcut: settings.read_while_working_exit_shortcut ?? 'Control+Space',
    exitRegistered: false,
    error: message,
    exitError: null,
  }
}

function canStartReadWhileWorking(status: ReadWhileWorkingStatus): boolean {
  return (
    status.enabled &&
    status.supported &&
    status.registered &&
    status.exitRegistered &&
    !readWhileWorkingStatusError(status)
  )
}

export default function AppShell() {
  const {
    view,
    setView,
    openGlobalSettings,
    settingsSubview,
    settingsSubviewOrigin,
    setSettingsSubview
  } = useNavigation()
  const { settings, saveSettings } = useSettings()
  const { activeText, libraryTab, loading, setLibraryTab } = useLibrary()
  const {
    showSummarySetup, handleSummarySetupConfirm, handleSummarySetupSkip,
    showSummaryPrompt, summaryContext,
    handleSummaryReread, handleSummarySave, handleCreateChapterAndSummarize,
    handleSummaryContinue, handleSummaryExit,
  } = useReader()

  const [shellError, setShellError] = useState<string | null>(null)
  const [rwwStatus, setRwwStatus] = useState<ReadWhileWorkingStatus | null>(null)
  const [rwwStarting, setRwwStarting] = useState(false)
  const [rwwExiting, setRwwExiting] = useState(false)
  const [rwwSettingsTab, setRwwSettingsTab] = useState<RwwSettingsTabId>('overlay')

  useEffect(() => {
    if (view !== 'settings' || settingsSubview !== 'overlay-reader') {
      setRwwSettingsTab('overlay')
    }
  }, [settingsSubview, view])

  const handleRwwSettingsTabChange = useCallback((tabId: RwwSettingsTabId) => {
    setRwwSettingsTab(tabId)
  }, [])

  useEffect(() => {
    if (!loading) window.api.app.splashReady()
  }, [loading])

  const refreshRwwStatus = useCallback(async () => {
    try {
      setRwwStatus(await window.api.readWhileWorking.getStatus())
    } catch (err) {
      setRwwStatus(statusFromStartError(
        `Failed to refresh Overlay Reader readiness: ${(err as Error).message}`,
        {
          read_while_working_shortcut: settings.read_while_working_shortcut,
          read_while_working_exit_shortcut: settings.read_while_working_exit_shortcut,
        }
      ))
    }
  }, [settings.read_while_working_exit_shortcut, settings.read_while_working_shortcut])

  useEffect(() => {
    if (view === 'settings' && settingsSubview === 'overlay-reader') {
      void refreshRwwStatus()
    }
  }, [
    refreshRwwStatus,
    settings.read_while_working_exit_shortcut,
    settings.read_while_working_shortcut,
    settingsSubview,
    view,
  ])

  const handleStartOverlayReader = useCallback(async () => {
    if (rwwStarting) return
    setRwwStarting(true)
    try {
      const status = await window.api.readWhileWorking.enableAndHideToTray()
      setRwwStatus(status)
      if (canStartReadWhileWorking(status)) {
        setView('library')
      }
    } catch (err) {
      setRwwStatus(statusFromStartError(
        `Failed to start Overlay Reader: ${(err as Error).message}`,
        {
          read_while_working_shortcut: settings.read_while_working_shortcut,
          read_while_working_exit_shortcut: settings.read_while_working_exit_shortcut,
        }
      ))
    } finally {
      setRwwStarting(false)
    }
  }, [
    rwwStarting,
    setView,
    settings.read_while_working_exit_shortcut,
    settings.read_while_working_shortcut,
  ])

  const handleExitOverlayReader = useCallback(async () => {
    if (rwwExiting) return
    setRwwExiting(true)
    try {
      await window.api.readWhileWorking.exit()
      await refreshRwwStatus()
    } catch (err) {
      setRwwStatus(statusFromStartError(
        `Failed to exit Overlay Reader: ${(err as Error).message}`,
        {
          read_while_working_shortcut: settings.read_while_working_shortcut,
          read_while_working_exit_shortcut: settings.read_while_working_exit_shortcut,
        }
      ))
    } finally {
      setRwwExiting(false)
    }
  }, [
    refreshRwwStatus,
    rwwExiting,
    settings.read_while_working_exit_shortcut,
    settings.read_while_working_shortcut,
  ])

  const handleSaveRwwShortcut = useCallback(async (
    patch: Pick<Settings, 'read_while_working_shortcut'> |
      Pick<Settings, 'read_while_working_exit_shortcut'>
  ) => {
    try {
      await saveSettings(patch)
      await refreshRwwStatus()
    } catch (err) {
      setRwwStatus(statusFromStartError(
        `Failed to save Overlay Reader shortcut: ${(err as Error).message}`,
        {
          read_while_working_shortcut: settings.read_while_working_shortcut,
          read_while_working_exit_shortcut: settings.read_while_working_exit_shortcut,
        }
      ))
    }
  }, [
    refreshRwwStatus,
    saveSettings,
    settings.read_while_working_exit_shortcut,
    settings.read_while_working_shortcut,
  ])

  const { fullscreenActive, appVersion } = useAppShellDocumentEffects(
    view,
    setView,
    settings.theme
  )

  useReadWhileWorkingEnableFailed(setShellError, openGlobalSettings)

  if (loading) {
    return <div className="app-loading"><span>Loading WingletReader…</span></div>
  }

  if (isAlphaDeadRoute(view)) {
    return null
  }

  // The hub (ADR-0011) is the device-face root: it owns the whole window.
  if (view === 'hub') {
    return (
      <div className={`app-shell theme-${settings.theme}`}>
        <HubView appVersion={appVersion} />
      </div>
    )
  }

  const showInnerChrome = view !== 'reader'
  const showSettingsUpLevel = view === 'settings' && settingsSubview !== null
  const showLibraryContentsUpLevel = view === 'library' && libraryTab === 'chapters'
  const settingsUpLevelLabel =
    settingsSubview === 'overlay-reader' && settingsSubviewOrigin === 'hub'
      ? 'Back to home'
      : 'Back to Settings'
  const handleSettingsUpLevel = () => {
    if (settingsSubview === 'overlay-reader' && settingsSubviewOrigin === 'hub') {
      setView('hub')
      return
    }
    setSettingsSubview(null)
  }

  return (
    <div
      className={`app-shell theme-${settings.theme}${fullscreenActive ? ' app-shell--fullscreen' : ''}`}
    >
      {/* Persistent top-left corner. Reader is exempt - it keeps its own Back. */}
      {showInnerChrome && (
        showSettingsUpLevel ? (
          <UpLevelControl
            onNavigateUp={handleSettingsUpLevel}
            label={settingsUpLevelLabel}
          />
        ) : showLibraryContentsUpLevel ? (
          <UpLevelControl
            onNavigateUp={() => setLibraryTab('list')}
            label="Back to library"
          />
        ) : (
          <HomeControl onNavigateHome={() => setView('hub')} />
        )
      )}
      {/* Gear corner (top-right → Settings). Hidden on Library and Settings. */}
      {showInnerChrome && view !== 'library' && view !== 'settings' && (
        <GearControl onOpenSettings={openGlobalSettings} />
      )}
      {view === 'settings' &&
        settingsSubview === 'overlay-reader' &&
        rwwSettingsTab === 'playback-grid' && (
        <RwwStartControl
          variant="viewport"
          status={rwwStatus}
          starting={rwwStarting}
          exiting={rwwExiting}
          onStart={handleStartOverlayReader}
          onExit={handleExitOverlayReader}
        />
      )}

      <AppShellMainContent
        shellError={shellError}
        setShellError={setShellError}
        rwwStatus={rwwStatus}
        onSaveRwwShortcut={handleSaveRwwShortcut}
        rwwHostChrome={{
          status: rwwStatus,
          starting: rwwStarting,
          exiting: rwwExiting,
          onStart: handleStartOverlayReader,
          onExit: handleExitOverlayReader,
        }}
        onRwwSettingsTabChange={handleRwwSettingsTabChange}
      />

      {showSummarySetup && (
        <SummarySetupModal
          onConfirm={handleSummarySetupConfirm}
          onSkip={handleSummarySetupSkip}
        />
      )}

      {showSummaryPrompt && summaryContext && (
        <SummaryPromptModal
          textTitle={summaryContext.textTitle}
          chapterTitle={summaryContext.chapterTitle}
          startWordOffset={summaryContext.startWordOffset}
          endWordOffset={summaryContext.endWordOffset}
          canCreateChapter={!summaryContext.segmentId}
          canContinue={summaryContext.endWordOffset < (activeText?.word_count ?? 0)}
          onReread={handleSummaryReread}
          onSave={handleSummarySave}
          onCreateChapterAndSummarize={handleCreateChapterAndSummarize}
          onContinue={handleSummaryContinue}
          onExit={handleSummaryExit}
        />
      )}
    </div>
  )
}
