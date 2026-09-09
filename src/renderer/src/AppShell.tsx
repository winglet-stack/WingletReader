import React, { useCallback, useState, useEffect } from 'react'
import { useNavigation } from './contexts/NavigationContext'
import { useSettings } from './contexts/SettingsContext'
import { useLibrary } from './contexts/LibraryContext'
import { useReader } from './contexts/ReaderContext'
import type { ReadWhileWorkingStatus, Settings } from './types'
import SummarySetupModal from './components/SummarySetupModal'
import SummaryPromptModal from './components/SummaryPromptModal'
import HomeControl from './components/shell/HomeControl'
import UpLevelControl from './components/shell/UpLevelControl'
import GearControl from './components/shell/GearControl'
import RwwStartControl from './components/settings/RwwStartControl'
import type { RwwSettingsTabId } from './components/settings/RwwSettingsEditor'
import AppShellMainContent from './appShell/AppShellMainContent'
import { useAppShellMainContentModel } from './appShell/useAppShellMainContentModel'
import {
  FALLBACK_VIEW,
  ROUTE_TABLE,
  resolveRoute,
  type RouteRenderContext,
  type UpLevelTarget
} from './appShell/routeTable'
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

  const { fullscreenActive, appVersion } = useAppShellDocumentEffects(settings.theme)

  useReadWhileWorkingEnableFailed(setShellError, openGlobalSettings)

  const model = useAppShellMainContentModel(shellError, setShellError)

  const navigateUp = useCallback((target: UpLevelTarget) => {
    if (target === 'hub') {
      setView('hub')
      return
    }
    if (target === 'library-list') {
      setLibraryTab('list')
      return
    }
    setSettingsSubview(null)
  }, [setLibraryTab, setSettingsSubview, setView])

  if (loading) {
    return <div className="app-loading"><span>Loading WingletReader…</span></div>
  }

  // The single dead-route enforcement point: an unknown or non-live token lands
  // on the fallback destination here, and nowhere else.
  const route = resolveRoute(view, ROUTE_TABLE, FALLBACK_VIEW)

  const renderContext: RouteRenderContext = {
    model,
    appVersion,
    rwwStatus,
    onSaveRwwShortcut: handleSaveRwwShortcut,
    rwwHostChrome: {
      status: rwwStatus,
      starting: rwwStarting,
      exiting: rwwExiting,
      onStart: handleStartOverlayReader,
      onExit: handleExitOverlayReader,
    },
    onRwwSettingsTabChange: handleRwwSettingsTabChange,
  }
  const body = route.definition.render(renderContext)

  // A `window` destination (the hub, ADR-0011) owns the whole window: no shell
  // chrome, no main-content region, no shell-owned modals.
  if (route.definition.layout === 'window') {
    return <div className={`app-shell theme-${settings.theme}`}>{body}</div>
  }

  const chrome = route.definition.chrome({
    libraryTab,
    settingsSubview,
    settingsSubviewOrigin,
    rwwSettingsTab,
  })
  const corner = chrome.corner

  return (
    <div
      className={`app-shell theme-${settings.theme}${fullscreenActive ? ' app-shell--fullscreen' : ''}`}
    >
      {/* Persistent top-left corner, per the table. Reader declares none. */}
      {corner.kind === 'home' && <HomeControl onNavigateHome={() => setView('hub')} />}
      {corner.kind === 'up-level' && (
        <UpLevelControl onNavigateUp={() => navigateUp(corner.up)} label={corner.label} />
      )}
      {/* Gear corner (top-right → Settings). */}
      {chrome.gear && <GearControl onOpenSettings={openGlobalSettings} />}
      {chrome.rwwStartControl && (
        <RwwStartControl
          variant="viewport"
          status={rwwStatus}
          starting={rwwStarting}
          exiting={rwwExiting}
          onStart={handleStartOverlayReader}
          onExit={handleExitOverlayReader}
        />
      )}

      <AppShellMainContent model={model}>{body}</AppShellMainContent>

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
