/**
 * Which reader surface is open — the owner.
 *
 * One module decides whether quick settings, the bookmark popover, the config
 * drawer, the plain-text view or the in-frame library browse is showing, and
 * owns the consequences of each move: playback pausing when browse takes the
 * stage or a Target pick is armed, a shown session end being dismissed when the
 * ADR-0026 "Set a new target" bridge takes the stage back. No handler in
 * `Reader.tsx` enforces exclusion any more, and no state change happens inside a
 * `setState` updater.
 *
 * The policy itself is pure and lives in `engine/readerSurfaces.ts`; this hook is
 * the React binding: it holds the state, keys it on the engaged text, reconciles
 * the one surface it does not own, and turns the intents into callbacks.
 *
 * ## Why the surfaces are their own module, not part of the session
 *
 * `architecture-depth/11` left `showBookmarkPopover` on the reading-session
 * interface for one reason: the saved-position load reset it on a text change.
 * That is a coincidence of wiring, not a relationship — nothing about which
 * panel is open survives a reload, participates in the two-snapshot save model,
 * or is read by playback. The dependency runs one way, surfaces → session (a
 * pause, a dismiss), so the session stays unaware of them and both stay drivable
 * on their own.
 *
 * ## The config drawer is borrowed, not owned
 *
 * `readerConfigDrawerOpen` is **route** chrome: it lives in `ReaderContext`
 * because leaving the reader route closes it, which is a fact about the route
 * and not about the engaged text. So this hook treats it as an external cell —
 * it reconciles the cell into the panel slot during render (an outside open
 * still closes the popovers) and writes the cell back whenever an intent moves
 * the slot.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import {
  INITIAL_READER_SURFACES,
  goalPickDraft,
  isGoalPickArmed,
  readerStage,
  reduceReaderSurfaces,
  type GoalPickOrigin,
  type OpenableReaderPanel,
  type ReaderPanel,
  type ReaderStage,
  type ReaderSurfaceIntent,
  type ReaderSurfaceState,
  type TextViewMode,
} from '../engine/readerSurfaces'
import type { TextRecord } from '../types'

export interface ReaderSurfacesOptions {
  /** The engaged text. A different one establishes fresh surface state. */
  text: TextRecord
  /** Route chrome this hook commands but does not store (see module docblock). */
  configDrawerOpen: boolean
  setConfigDrawerOpen: Dispatch<SetStateAction<boolean>>
  /** Browse and an armed Target pick both take the stage from playback. */
  pause: () => void
  /** The "Set a new target" bridge leaves the Target dialog behind. */
  dismissSessionEnd: () => void
}

/** Everything that changes which surface is open. */
export interface SurfaceIntents {
  openQuickSettings(open: boolean): void
  openBookmarks(open: boolean): void
  openConfigDrawer(open: boolean): void
  toggleTextView(): void
  setTextViewMode(mode: TextViewMode): void
  /** Enter or leave the in-frame library browse. Entering pauses (ADR-0013). */
  toggleBrowse(): void
  /** One intent: pause, take the stage, open the popover, arm the pick. */
  armGoalPick(label: string, origin?: GoalPickOrigin): void
  pickGoalWord(wordOffset: number): void
  /** One intent: leave the pick, wherever it was armed from. */
  leaveGoalPick(): void
}

export interface ReaderSurfaces extends SurfaceIntents {
  // ── Observable state ──────────────────────────────────────────────────────
  stage: ReaderStage
  panel: ReaderPanel
  browsing: boolean
  /** The plain-text view's own flag; `stage` says whether it is actually shown. */
  textViewOpen: boolean
  textViewMode: TextViewMode
  quickSettingsOpen: boolean
  bookmarksOpen: boolean
  configDrawerOpen: boolean
  /** True only while the pick is waiting for a word. */
  goalPickArmed: boolean
  /** The pick as the bookmark popover reads it, or null outside a pick. */
  goalPickDraft: { wordOffset: number | null; customLabel: string } | null
}

/**
 * A ref that always holds the current render's value — the same "an event
 * handler needs this, but must not re-bind when it changes" concession the
 * session module makes.
 */
function useSyncedRef<T>(value: T) {
  const ref = useRef(value)
  ref.current = value
  return ref
}

/**
 * Fold the engaged text and the borrowed drawer cell into the stored state,
 * during render rather than in an effect: engaging a text *establishes* the
 * surfaces instead of un-setting the previous text's, and an outside drawer move
 * is already reflected by the time anything reads the slot.
 */
function useEngagedSurfaceState(
  text: TextRecord,
  configDrawerOpen: boolean
): [ReaderSurfaceState, Dispatch<SetStateAction<ReaderSurfaceState>>] {
  const [stored, setStored] = useState<ReaderSurfaceState>(INITIAL_READER_SURFACES)
  const [engagedText, setEngagedText] = useState<TextRecord>(text)

  if (text !== engagedText) {
    const engaged: ReaderSurfaceState = {
      ...INITIAL_READER_SURFACES,
      panel: configDrawerOpen ? 'config-drawer' : 'none',
    }
    setEngagedText(text)
    setStored(engaged)
    return [engaged, setStored]
  }

  const drawerIsPanel = stored.panel === 'config-drawer'
  if (configDrawerOpen === drawerIsPanel) return [stored, setStored]

  const reconciled = reduceReaderSurfaces(
    stored,
    configDrawerOpen
      ? { type: 'open-panel', panel: 'config-drawer' }
      : { type: 'close-panel', panel: 'config-drawer' }
  )
  setStored(reconciled)
  return [reconciled, setStored]
}

export function useReaderSurfaces({
  text,
  configDrawerOpen,
  setConfigDrawerOpen,
  pause,
  dismissSessionEnd,
}: ReaderSurfacesOptions): ReaderSurfaces {
  const [state, setState] = useEngagedSurfaceState(text, configDrawerOpen)
  const stateRef = useSyncedRef(state)
  const pauseRef = useSyncedRef(pause)
  const dismissRef = useSyncedRef(dismissSessionEnd)
  const setDrawerRef = useSyncedRef(setConfigDrawerOpen)

  /**
   * The one write path. The next state is computed from the current one *before*
   * the update, never inside the updater, so the drawer cell can be pushed in
   * the same turn without a state change hiding in a `setState` callback.
   */
  const dispatch = useCallback((intent: ReaderSurfaceIntent) => {
    const next = reduceReaderSurfaces(stateRef.current, intent)
    stateRef.current = next
    setState(next)
    setDrawerRef.current(next.panel === 'config-drawer')
  }, [setState, setDrawerRef, stateRef])

  // One object, built once: `dispatch` is stable, so every intent is, and a
  // consumer's callback dependencies do not churn.
  const intents = useMemo<SurfaceIntents>(() => {
    const setPanel = (panel: OpenableReaderPanel, open: boolean) =>
      dispatch(open ? { type: 'open-panel', panel } : { type: 'close-panel', panel })

    return {
      openQuickSettings: (open) => setPanel('quick-settings', open),
      openBookmarks: (open) => setPanel('bookmarks', open),
      openConfigDrawer: (open) => setPanel('config-drawer', open),
      toggleTextView: () => dispatch({ type: 'toggle-text-view' }),
      setTextViewMode: (mode) => dispatch({ type: 'set-text-view-mode', mode }),
      toggleBrowse: () => {
        // ADR-0013: entering the in-frame library browse pauses playback.
        if (!stateRef.current.browsing) pauseRef.current()
        dispatch({ type: 'toggle-browse' })
      },
      armGoalPick: (label, origin = 'popover') => {
        pauseRef.current()
        // The bridge out of the held Target dialog (ADR-0026): the pick takes
        // the stage the dialog was holding, so the dialog goes with it.
        if (origin === 'session-dialog') dismissRef.current()
        dispatch({ type: 'arm-goal-pick', origin, label: label.trim() })
      },
      pickGoalWord: (wordOffset) => dispatch({ type: 'pick-goal-word', wordOffset }),
      leaveGoalPick: () => dispatch({ type: 'leave-goal-pick' }),
    }
  }, [dispatch, stateRef, pauseRef, dismissRef])

  return useMemo(() => ({
    stage: readerStage(state),
    panel: state.panel,
    browsing: state.browsing,
    textViewOpen: state.textViewOpen,
    textViewMode: state.textViewMode,
    quickSettingsOpen: state.panel === 'quick-settings',
    bookmarksOpen: state.panel === 'bookmarks',
    configDrawerOpen: state.panel === 'config-drawer',
    goalPickArmed: isGoalPickArmed(state),
    goalPickDraft: goalPickDraft(state),
    ...intents,
  }), [state, intents])
}
