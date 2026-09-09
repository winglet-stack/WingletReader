import React from 'react'
import type { ReadWhileWorkingStatus } from '../types'
import type { LibraryTab } from '../contexts/LibraryContext'
import type { SettingsSubview, SettingsSubviewOrigin } from '../contexts/NavigationContext'
import type { RwwShortcutPatch, RwwSettingsTabId } from '../components/settings/RwwSettingsEditor'
import type { RwwHostChromeProps } from '../components/settings/RwwStartControl'
import type { MainContentModel } from './useAppShellMainContentModel'
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
import HubView from '../components/hub/HubView'
import StatsView from '../components/stats/StatsView'
import { alphaChrome } from '../alphaChrome'

/**
 * The route table (ADR-0005 / ADR-0006 unchanged): one module where every
 * destination declares what renders it, what chrome it carries, and whether it
 * is live. `AppShell` reads it instead of re-deriving chrome from token
 * comparisons, and it is the only place a destination is declared — adding one
 * means adding an id to `APP_VIEWS` and an entry to `ROUTE_TABLE`, nothing else.
 *
 * Navigation *state* still lives in `NavigationContext`; only route *policy*
 * lives here.
 */

/** Every destination the app has. The route table is keyed by exactly these. */
export const APP_VIEWS = [
  'hub',
  'library',
  'import',
  'make-video',
  'add-chapter',
  'reader',
  'settings',
  'transmute',
  'stats',
] as const

export type AppView = (typeof APP_VIEWS)[number]

/** Where a live token that is not a destination lands. */
export const FALLBACK_VIEW: AppView = 'library'

/**
 * `window` owns the whole window and carries no shell chrome (the hub, ADR-0011);
 * `shell` mounts inside the shell frame's main content region.
 */
export type RouteLayout = 'window' | 'shell'

/**
 * Where the top-left "up one level" control goes (ADR-0020, ADR-0027), as data
 * the shell dispatches — the table declares the target, not the setter call.
 */
export type UpLevelTarget = 'hub' | 'settings-landing' | 'library-list'

/** What the top-left corner slot holds. `home` is the dove; it always means the hub. */
export type CornerControl =
  | { kind: 'none' }
  | { kind: 'home' }
  | { kind: 'up-level'; label: string; up: UpLevelTarget }

/** The chrome a destination carries, once its sub-route state is known. */
export interface RouteChrome {
  corner: CornerControl
  /** Top-right gear to Settings. */
  gear: boolean
  /** The Overlay Reader viewport Start/Exit host control (ADR-0021). */
  rwwStartControl: boolean
}

/**
 * The sub-route state chrome may depend on. The effective route is the token
 * plus these: the Library tab (owned by `LibraryContext`), the Settings subview
 * and its origin (`NavigationContext`), and the Overlay Reader settings tab
 * (local `AppShell` state). The table reads them; it does not own them.
 */
export interface RouteState {
  libraryTab: LibraryTab
  settingsSubview: SettingsSubview
  settingsSubviewOrigin: SettingsSubviewOrigin
  rwwSettingsTab: RwwSettingsTabId
}

/** Everything a destination's body may need to render. */
export interface RouteRenderContext {
  model: MainContentModel
  appVersion: string | null
  rwwStatus: ReadWhileWorkingStatus | null
  onSaveRwwShortcut: (patch: RwwShortcutPatch) => void | Promise<void>
  rwwHostChrome?: RwwHostChromeProps
  onRwwSettingsTabChange?: (tabId: RwwSettingsTabId) => void
}

export interface RouteDefinition {
  /** Reachable in this build. A destination that is not live redirects to the fallback. */
  live: boolean
  layout: RouteLayout
  chrome: (state: RouteState) => RouteChrome
  render: (ctx: RouteRenderContext) => React.ReactNode
}

export type RouteTable<Id extends string> = Record<Id, RouteDefinition>

export interface ResolvedRoute<Id extends string> {
  id: Id
  definition: RouteDefinition
}

/**
 * The single dead-route enforcement point. A token that is not a destination of
 * `table`, or whose destination is not live, resolves to `fallback`. Generic over
 * the table so a caller (or a test) can resolve against an extended one.
 */
export function resolveRoute<Id extends string>(
  token: string,
  table: RouteTable<Id>,
  fallback: Id
): ResolvedRoute<Id> {
  if (Object.prototype.hasOwnProperty.call(table, token)) {
    const definition = (table as RouteTable<string>)[token]
    if (definition.live) return { id: token as Id, definition }
  }
  return { id: fallback, definition: table[fallback] }
}

const NO_CHROME: RouteChrome = {
  corner: { kind: 'none' },
  gear: false,
  rwwStartControl: false,
}

const HOME_ONLY: RouteChrome = {
  corner: { kind: 'home' },
  gear: false,
  rwwStartControl: false,
}

const HOME_AND_GEAR: RouteChrome = {
  corner: { kind: 'home' },
  gear: true,
  rwwStartControl: false,
}

function libraryEmptyState(setView: (view: AppView) => void, msg: string) {
  return (
    <div className="empty-state">
      <p>{msg}</p>
      <button className="btn-primary" onClick={() => setView('library')}>Go to Library</button>
    </div>
  )
}

// Library renders only the text list; the Contents view (SegmentPanel) is the
// contextual per-text surface, reached from a text's card (no longer a tab).
function renderLibraryView({ model: m }: RouteRenderContext) {
  return m.parentText && m.libraryTab === 'chapters' ? <SegmentPanel /> : <Library />
}

function renderImportView({ model: m }: RouteRenderContext) {
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

function renderAddChapterView({ model: m }: RouteRenderContext) {
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
function renderReaderView({ model: m }: RouteRenderContext) {
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

function renderSettingsView(ctx: RouteRenderContext) {
  const m = ctx.model
  return (
    <SettingsPanel
      onExport={m.handleExport}
      onImport={m.handleImportJson}
      mode={m.settingsMode}
      onBackToTransmute={() => m.setView('transmute')}
      rwwStatus={ctx.rwwStatus}
      onSaveRwwShortcut={ctx.onSaveRwwShortcut}
      rwwHostChrome={ctx.rwwHostChrome}
      onRwwSettingsTabChange={ctx.onRwwSettingsTabChange}
    />
  )
}

function renderTransmuteView({ model: m }: RouteRenderContext) {
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

/**
 * One entry per destination. `Record<AppView, ...>` is what makes the set
 * exhaustive: a missing entry and an unknown key are both compile errors, so
 * the shell never needs a `default` branch that renders nothing.
 */
export const ROUTE_TABLE: RouteTable<AppView> = {
  // The hub (ADR-0011) is the device-face root: it owns the whole window and
  // carries no shell chrome of its own.
  hub: {
    live: true,
    layout: 'window',
    chrome: () => NO_CHROME,
    render: (ctx) => <HubView appVersion={ctx.appVersion} />,
  },
  library: {
    live: true,
    layout: 'shell',
    // The Contents view is one level below the Library list, so its corner is
    // the up-level sprite back to the list — never the dove (ADR-0027).
    chrome: ({ libraryTab }) =>
      libraryTab === 'chapters'
        ? {
          corner: { kind: 'up-level', label: 'Back to library', up: 'library-list' },
          gear: false,
          rwwStartControl: false,
        }
        : HOME_ONLY,
    render: renderLibraryView,
  },
  import: {
    live: true,
    layout: 'shell',
    chrome: () => HOME_AND_GEAR,
    render: renderImportView,
  },
  'make-video': {
    live: true,
    layout: 'shell',
    chrome: () => HOME_AND_GEAR,
    render: () => <MakeVideoLaunchpad />,
  },
  'add-chapter': {
    live: true,
    layout: 'shell',
    chrome: () => HOME_AND_GEAR,
    render: renderAddChapterView,
  },
  // The Reader is exempt from shell chrome entirely and keeps its own Back.
  reader: {
    live: true,
    layout: 'shell',
    chrome: () => NO_CHROME,
    render: renderReaderView,
  },
  settings: {
    live: true,
    layout: 'shell',
    // Nested Settings sub-pages replace the dove with the up-level sprite; the
    // Overlay Reader subview has two entry points, so its target is
    // origin-aware (ADR-0027).
    chrome: ({ settingsSubview, settingsSubviewOrigin, rwwSettingsTab }) => ({
      corner: settingsSubview === null
        ? { kind: 'home' }
        : settingsSubview === 'overlay-reader' && settingsSubviewOrigin === 'hub'
          ? { kind: 'up-level', label: 'Back to home', up: 'hub' }
          : { kind: 'up-level', label: 'Back to Settings', up: 'settings-landing' },
      gear: false,
      rwwStartControl:
        settingsSubview === 'overlay-reader' && rwwSettingsTab === 'playback-grid',
    }),
    render: renderSettingsView,
  },
  transmute: {
    live: true,
    layout: 'shell',
    chrome: () => HOME_AND_GEAR,
    render: renderTransmuteView,
  },
  // The Stats screen (ADR-0035 §6): reached from the hub stats banner.
  stats: {
    live: true,
    layout: 'shell',
    chrome: () => HOME_AND_GEAR,
    render: () => <StatsView />,
  },
}
