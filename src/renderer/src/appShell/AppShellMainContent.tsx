import React from 'react'
import type { AppView, ReadWhileWorkingStatus } from '../types'
import type { RwwShortcutPatch, RwwSettingsTabId } from '../components/settings/RwwSettingsEditor'
import type { RwwHostChromeProps } from '../components/settings/RwwStartControl'
import Library from '../components/Library'
import ImportPanel from '../components/ImportPanel'
import Reader from '../components/Reader'
import SettingsPanel from '../components/SettingsPanel'
import SegmentPanel from '../components/SegmentPanel'
import AddChapterPanel from '../components/AddChapterPanel'
import TransmuteView from '../components/TransmuteView'
import ReaderEmptyFrame from '../components/reader/ReaderEmptyFrame'
import ReaderInertFrame from '../components/reader/ReaderInertFrame'
import ReaderLibraryBrowse from '../components/reader/ReaderLibraryBrowse'
import MakeVideoLaunchpad from '../components/hub/MakeVideoLaunchpad'
import { useAppShellMainContentModel } from './useAppShellMainContentModel'
import { alphaChrome } from '../alphaChrome'

/**
 * The shape returned by the content model hook. Each per-view render helper
 * takes the whole model so the `view` dispatch stays a flat lookup and new
 * destinations (e.g. the Make Video launchpad) are a single added `case`.
 */
type MainContentModel = ReturnType<typeof useAppShellMainContentModel>

function libraryEmptyState(setView: (view: AppView) => void, msg: string) {
  return (
    <div className="empty-state">
      <p>{msg}</p>
      <button className="btn-primary" onClick={() => setView('library')}>Go to Library</button>
    </div>
  )
}

// Library renders only the text list; Chapters (SegmentPanel) is the contextual
// per-text view, reached from a text's segments (no longer a tab).
function renderLibraryView(m: MainContentModel) {
  return m.parentText && m.libraryTab === 'chapters' ? <SegmentPanel /> : <Library />
}

function renderImportView(m: MainContentModel) {
  return (
    <ImportPanel
      onCancel={() => m.setView('hub')}
      onCreateVideoWithoutSaving={
        alphaChrome.importTileCreateVideoEnabled
          ? (title, content) => m.openTransmuteForUnsavedSource({ title, content })
          : undefined
      }
    />
  )
}

function renderAddChapterView(m: MainContentModel) {
  return m.addChapterTarget ? (
    <AddChapterPanel
      targetBook={m.addChapterTarget}
      chapterCount={m.addChapterTarget.segment_count ?? 0}
      onSaved={m.handleAddChapterSaved}
      onCancel={() => { m.setAddChapterTarget(null); m.setView('library') }}
    />
  ) : (
    libraryEmptyState(m.setView, 'No book selected. Go back to the library.')
  )
}

// Read always opens the Reader. With no engaged text, ADR-0013 keeps the Reader
// frame visible and swaps the stage between empty-library and browse states.
function renderReaderView(m: MainContentModel) {
  const { activeText } = m
  if (!activeText) {
    if (m.texts.length === 0) {
      return (
        <ReaderEmptyFrame
          onImport={() => m.setView('import')}
          onBack={() => m.setView('hub')}
          backLabel="Hub"
        />
      )
    }
    return (
      <ReaderInertFrame onBack={() => m.setView('hub')} backLabel="Hub">
        <ReaderLibraryBrowse />
      </ReaderInertFrame>
    )
  }
  return (
    <Reader
      onBack={() => m.setView('hub')}
      onExitToLibrary={() => m.setView('library')}
      backLabel="Hub"
    />
  )
}

function renderSettingsView(
  m: MainContentModel,
  rwwStatus: ReadWhileWorkingStatus | null,
  onSaveRwwShortcut: (patch: RwwShortcutPatch) => void | Promise<void>,
  rwwHostChrome?: RwwHostChromeProps,
  onRwwSettingsTabChange?: (tabId: RwwSettingsTabId) => void
) {
  return (
    <SettingsPanel
      onExport={m.handleExport}
      onImport={m.handleImportJson}
      mode={m.settingsMode}
      onBackToTransmute={() => m.setView('transmute')}
      rwwStatus={rwwStatus}
      onSaveRwwShortcut={onSaveRwwShortcut}
      rwwHostChrome={rwwHostChrome}
      onRwwSettingsTabChange={onRwwSettingsTabChange}
    />
  )
}

function renderTransmuteView(m: MainContentModel) {
  return (
    <TransmuteView
      texts={m.texts}
      settings={m.settings}
      onSaveSettings={m.saveSettings}
      onOpenReaderSettings={m.openTransmuteReaderSettings}
      launchTextId={m.transmuteLaunchTextId}
      onLaunchConsumed={m.clearTransmuteLaunch}
      launchSource={m.transmuteLaunchSource}
      onLaunchSourceConsumed={m.clearTransmuteLaunchSource}
    />
  )
}

function renderMakeVideoView(_m: MainContentModel) {
  return <MakeVideoLaunchpad />
}

/**
 * Routes the active `view` to its body. The hub is handled in `AppShell`
 * (it owns the whole window) and dead routes are filtered upstream, so any
 * unmatched view renders nothing inside the main content region.
 */
function renderViewContent(
  m: MainContentModel,
  rwwStatus: ReadWhileWorkingStatus | null,
  onSaveRwwShortcut: (patch: RwwShortcutPatch) => void | Promise<void>,
  rwwHostChrome?: RwwHostChromeProps,
  onRwwSettingsTabChange?: (tabId: RwwSettingsTabId) => void
): React.ReactNode {
  switch (m.view) {
    case 'library':
      return renderLibraryView(m)
    case 'import':
      return renderImportView(m)
    case 'make-video':
      return renderMakeVideoView(m)
    case 'add-chapter':
      return renderAddChapterView(m)
    case 'reader':
      return renderReaderView(m)
    case 'settings':
      return renderSettingsView(
        m,
        rwwStatus,
        onSaveRwwShortcut,
        rwwHostChrome,
        onRwwSettingsTabChange
      )
    case 'transmute':
      return renderTransmuteView(m)
    default:
      return null
  }
}

interface AppShellMainContentProps {
  shellError: string | null
  setShellError: (error: string | null) => void
  rwwStatus: ReadWhileWorkingStatus | null
  onSaveRwwShortcut: (patch: RwwShortcutPatch) => void | Promise<void>
  rwwHostChrome?: RwwHostChromeProps
  onRwwSettingsTabChange?: (tabId: RwwSettingsTabId) => void
}

export default function AppShellMainContent({
  shellError,
  setShellError,
  rwwStatus,
  onSaveRwwShortcut,
  rwwHostChrome,
  onRwwSettingsTabChange,
}: AppShellMainContentProps) {
  const model = useAppShellMainContentModel(shellError, setShellError)
  const { error, dismissError } = model

  return (
    <main className="main-content">
      {error && (
        <div
          className={`toast ${error.startsWith('✓') ? 'toast-success' : 'toast-error'}`}
          role="alert"
        >
          <span>{error}</span>
          <button className="toast-close" onClick={dismissError} aria-label="Dismiss">x</button>
        </div>
      )}

      {renderViewContent(
        model,
        rwwStatus,
        onSaveRwwShortcut,
        rwwHostChrome,
        onRwwSettingsTabChange
      )}
    </main>
  )
}
