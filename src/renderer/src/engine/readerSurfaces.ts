/**
 * Which reader surface is open — the pure half.
 *
 * The Reader has five surfaces the reader can bring up: **quick settings**, the
 * **bookmark popover**, the **config drawer**, the **plain-text view** and the
 * in-frame **library browse**. Before `architecture-depth/12` four separate
 * handlers each enforced "only one of these at a time" independently, one of
 * them from inside a `setState` updater, and three effects fired on a text
 * change purely to un-set what another cluster had set.
 *
 * This module states the policy once, as data: a state, a set of intents, and
 * one reducer that says what each intent does to every surface. Nothing here
 * touches React, playback or the DOM — {@link useReaderSurfaces} is the binding
 * that owns those consequences.
 *
 * Two axes, deliberately kept apart:
 *
 * - **Panel** — quick settings, the bookmark popover and the config drawer share
 *   one slot; opening one closes the other two.
 * - **Stage** — reading, the plain-text view or library browse. Browse wins over
 *   the text view, which is why {@link readerStage} derives rather than stores.
 *
 * A Target pick spans both (the popover *and* the text view are open together),
 * which is exactly why it is one intent — {@link ReaderSurfaceIntent} `arm-goal-pick`
 * — and not a sequence a caller has to get right.
 */

/** The anchored/side surfaces. At most one is open. */
export type ReaderPanel = 'none' | 'quick-settings' | 'bookmarks' | 'config-drawer'

/** A panel that can actually be asked for. */
export type OpenableReaderPanel = Exclude<ReaderPanel, 'none'>

/** What fills the reader stage. Browse wins over the text view. */
export type ReaderStage = 'reading' | 'text-view' | 'browse'

/** The plain-text view's own tab (`source` exists for DOCX imports only). */
export type TextViewMode = 'plain' | 'source'

/**
 * Where a Target pick was armed from — it decides where leaving the pick
 * returns to. `session-dialog` is the ADR-0026 "Set a new target" bridge: the
 * pick was entered *from* the held Target dialog, so leaving it puts the stage
 * back the way the dialog left it. It replaces the former
 * `returnFromSessionTargetPick` flag that two handlers read and each partly
 * un-set.
 */
export type GoalPickOrigin = 'popover' | 'session-dialog'

/** The one-shot Target pick (ADR-0024 §4 as amended by BM-2). */
export interface GoalPick {
  origin: GoalPickOrigin
  /** The label the reader had typed when they armed; carried through the pick. */
  label: string
  /** The word the pick landed on, or `null` while it is still waiting for one. */
  wordOffset: number | null
}

export interface ReaderSurfaceState {
  panel: ReaderPanel
  /** The plain-text view's own open flag; `browsing` can still cover it. */
  textViewOpen: boolean
  textViewMode: TextViewMode
  browsing: boolean
  goalPick: GoalPick | null
}

/**
 * What engaging a text establishes. It is not a reset applied *after* the fact —
 * the surfaces are keyed on the engaged text, so a new text simply starts here.
 */
export const INITIAL_READER_SURFACES: ReaderSurfaceState = {
  panel: 'none',
  textViewOpen: false,
  textViewMode: 'plain',
  browsing: false,
  goalPick: null,
}

export type ReaderSurfaceIntent =
  | { type: 'open-panel'; panel: OpenableReaderPanel }
  | { type: 'close-panel'; panel: OpenableReaderPanel }
  | { type: 'toggle-text-view' }
  | { type: 'set-text-view-mode'; mode: TextViewMode }
  | { type: 'toggle-browse' }
  | { type: 'arm-goal-pick'; origin: GoalPickOrigin; label: string }
  | { type: 'pick-goal-word'; wordOffset: number }
  | { type: 'leave-goal-pick' }

/**
 * Leaving the pick, wherever it is left from — cancel, a picked word saved, the
 * popover closing, another panel opening, the text view closing, browse opening.
 * A `session-dialog` pick also gives the stage back, because that is what the
 * bridge promised when it took it.
 */
function leaveGoalPick(state: ReaderSurfaceState): ReaderSurfaceState {
  const pick = state.goalPick
  if (!pick) return state
  if (pick.origin === 'popover') return { ...state, goalPick: null }
  return {
    ...state,
    goalPick: null,
    panel: 'none',
    textViewOpen: false,
    textViewMode: 'plain',
  }
}

function openPanel(state: ReaderSurfaceState, panel: OpenableReaderPanel): ReaderSurfaceState {
  // Opening the bookmark popover is the one panel move a pick survives — the
  // pick lives in it.
  const base = panel === 'bookmarks' ? state : leaveGoalPick(state)
  return { ...base, panel }
}

function closePanel(state: ReaderSurfaceState, panel: OpenableReaderPanel): ReaderSurfaceState {
  if (state.panel !== panel) return state
  return { ...leaveGoalPick(state), panel: 'none' }
}

function toggleTextView(state: ReaderSurfaceState): ReaderSurfaceState {
  if (state.textViewOpen) {
    return { ...leaveGoalPick(state), textViewOpen: false, textViewMode: 'plain' }
  }
  return { ...leaveGoalPick(state), textViewOpen: true, panel: 'none' }
}

function toggleBrowse(state: ReaderSurfaceState): ReaderSurfaceState {
  if (state.browsing) return { ...state, browsing: false }
  return {
    ...leaveGoalPick(state),
    browsing: true,
    textViewOpen: false,
    textViewMode: 'plain',
    panel: 'none',
  }
}

/**
 * Arming is one intent, not eight statements: the popover opens, the plain-text
 * view takes the stage, browse and the other panels give it up, and the pick
 * itself is recorded with the origin that will let it be left again.
 */
function armGoalPick(origin: GoalPickOrigin, label: string): ReaderSurfaceState {
  return {
    panel: 'bookmarks',
    textViewOpen: true,
    textViewMode: 'plain',
    browsing: false,
    goalPick: { origin, label, wordOffset: null },
  }
}

function pickGoalWord(state: ReaderSurfaceState, wordOffset: number): ReaderSurfaceState {
  if (!state.goalPick) return state
  return { ...state, panel: 'bookmarks', goalPick: { ...state.goalPick, wordOffset } }
}

export function reduceReaderSurfaces(
  state: ReaderSurfaceState,
  intent: ReaderSurfaceIntent
): ReaderSurfaceState {
  switch (intent.type) {
    case 'open-panel':
      return openPanel(state, intent.panel)
    case 'close-panel':
      return closePanel(state, intent.panel)
    case 'toggle-text-view':
      return toggleTextView(state)
    case 'set-text-view-mode':
      return { ...state, textViewMode: intent.mode }
    case 'toggle-browse':
      return toggleBrowse(state)
    case 'arm-goal-pick':
      return armGoalPick(intent.origin, intent.label)
    case 'pick-goal-word':
      return pickGoalWord(state, intent.wordOffset)
    case 'leave-goal-pick':
      return leaveGoalPick(state)
  }
}

/** Browse covers the text view, which covers the reading stage. */
export function readerStage(state: ReaderSurfaceState): ReaderStage {
  if (state.browsing) return 'browse'
  return state.textViewOpen ? 'text-view' : 'reading'
}

/** Armed means *still waiting for a word*; a landed pick is no longer armed. */
export function isGoalPickArmed(state: ReaderSurfaceState): boolean {
  return state.goalPick !== null && state.goalPick.wordOffset === null
}

/** The pick as the bookmark popover reads it. */
export function goalPickDraft(
  state: ReaderSurfaceState
): { wordOffset: number | null; customLabel: string } | null {
  const pick = state.goalPick
  return pick ? { wordOffset: pick.wordOffset, customLabel: pick.label } : null
}
