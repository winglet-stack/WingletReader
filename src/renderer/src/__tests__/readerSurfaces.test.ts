/**
 * The reader surface policy (`architecture-depth/12`) — the pure half.
 *
 * Before this module the "only one surface at a time" rule was enforced by four
 * separate handlers in `Reader.tsx`, one of them from inside a `setState`
 * updater, and could only be observed by rendering the whole component. Every
 * case here is a direct statement of the rule.
 *
 * Environment: node (no DOM needed).
 */

import { describe, it, expect } from 'vitest'
import {
  INITIAL_READER_SURFACES,
  goalPickDraft,
  isGoalPickArmed,
  readerStage,
  reduceReaderSurfaces,
  type ReaderSurfaceIntent,
  type ReaderSurfaceState,
} from '../engine/readerSurfaces'

function run(intents: ReaderSurfaceIntent[], from = INITIAL_READER_SURFACES): ReaderSurfaceState {
  return intents.reduce(reduceReaderSurfaces, from)
}

const OPEN_QUICK: ReaderSurfaceIntent = { type: 'open-panel', panel: 'quick-settings' }
const OPEN_BOOKMARKS: ReaderSurfaceIntent = { type: 'open-panel', panel: 'bookmarks' }
const OPEN_DRAWER: ReaderSurfaceIntent = { type: 'open-panel', panel: 'config-drawer' }
const ARM: ReaderSurfaceIntent = { type: 'arm-goal-pick', origin: 'popover', label: 'Chapter turn' }
const ARM_FROM_DIALOG: ReaderSurfaceIntent = {
  type: 'arm-goal-pick',
  origin: 'session-dialog',
  label: '',
}

describe('reader surfaces - panel exclusion', () => {
  it('holds one panel at a time, whichever is opened last', () => {
    expect(run([OPEN_QUICK]).panel).toBe('quick-settings')
    expect(run([OPEN_QUICK, OPEN_BOOKMARKS]).panel).toBe('bookmarks')
    expect(run([OPEN_QUICK, OPEN_BOOKMARKS, OPEN_DRAWER]).panel).toBe('config-drawer')
    // The pairing no handler used to enforce: the popovers and the drawer are
    // the same slot, so either one displaces the other.
    expect(run([OPEN_DRAWER, OPEN_BOOKMARKS]).panel).toBe('bookmarks')
    expect(run([OPEN_DRAWER, OPEN_QUICK]).panel).toBe('quick-settings')
  })

  it('closes only the panel that is actually open', () => {
    const state = run([OPEN_BOOKMARKS, { type: 'close-panel', panel: 'quick-settings' }])
    expect(state.panel).toBe('bookmarks')

    expect(run([OPEN_BOOKMARKS, { type: 'close-panel', panel: 'bookmarks' }]).panel).toBe('none')
  })
})

describe('reader surfaces - the stage', () => {
  it('derives the stage with browse over the text view over reading', () => {
    expect(readerStage(INITIAL_READER_SURFACES)).toBe('reading')
    expect(readerStage(run([{ type: 'toggle-text-view' }]))).toBe('text-view')
    expect(readerStage(run([{ type: 'toggle-browse' }]))).toBe('browse')
  })

  it('gives the stage to the text view and takes the panels down with it', () => {
    const state = run([OPEN_QUICK, { type: 'toggle-text-view' }])
    expect(state.textViewOpen).toBe(true)
    expect(state.panel).toBe('none')
  })

  it('resets the text view to its plain tab when it closes', () => {
    const state = run([
      { type: 'toggle-text-view' },
      { type: 'set-text-view-mode', mode: 'source' },
      { type: 'toggle-text-view' },
    ])
    expect(state.textViewOpen).toBe(false)
    expect(state.textViewMode).toBe('plain')
  })

  it('clears the text view and every panel when browse takes the stage, and only browse when it gives it back', () => {
    const browsing = run([OPEN_BOOKMARKS, { type: 'toggle-text-view' }, { type: 'toggle-browse' }])
    expect(browsing).toEqual({
      panel: 'none',
      textViewOpen: false,
      textViewMode: 'plain',
      browsing: true,
      goalPick: null,
    })

    expect(reduceReaderSurfaces(browsing, { type: 'toggle-browse' }).browsing).toBe(false)
  })
})

describe('reader surfaces - the Target pick is one mode', () => {
  it('arming establishes the popover, the text view and the pick in one intent', () => {
    const state = run([{ type: 'toggle-browse' }, ARM])
    expect(state).toEqual({
      panel: 'bookmarks',
      textViewOpen: true,
      textViewMode: 'plain',
      browsing: false,
      goalPick: { origin: 'popover', label: 'Chapter turn', wordOffset: null },
    })
    expect(isGoalPickArmed(state)).toBe(true)
    expect(goalPickDraft(state)).toEqual({ wordOffset: null, customLabel: 'Chapter turn' })
  })

  it('a landed word un-arms the pick but keeps the label and the popover', () => {
    const state = run([ARM, { type: 'pick-goal-word', wordOffset: 6 }])
    expect(isGoalPickArmed(state)).toBe(false)
    expect(state.panel).toBe('bookmarks')
    expect(goalPickDraft(state)).toEqual({ wordOffset: 6, customLabel: 'Chapter turn' })
  })

  it('ignores a picked word outside a pick', () => {
    expect(run([{ type: 'pick-goal-word', wordOffset: 6 }])).toEqual(INITIAL_READER_SURFACES)
  })

  it('leaving a popover pick keeps the popover and the text view where they were', () => {
    const state = run([ARM, { type: 'leave-goal-pick' }])
    expect(state.goalPick).toBeNull()
    expect(state.panel).toBe('bookmarks')
    expect(state.textViewOpen).toBe(true)
  })

  it('leaving a session-dialog pick gives the stage back, whichever way it is left', () => {
    const returned = { panel: 'none', textViewOpen: false, textViewMode: 'plain', browsing: false, goalPick: null }

    // Cancelled, closed with the popover, or finished with a saved Target — the
    // former `returnFromSessionTargetPick` flag is one mode value now, so all
    // three exits agree by construction.
    expect(run([ARM_FROM_DIALOG, { type: 'leave-goal-pick' }])).toEqual(returned)
    expect(run([ARM_FROM_DIALOG, { type: 'close-panel', panel: 'bookmarks' }])).toEqual(returned)
    expect(
      run([ARM_FROM_DIALOG, { type: 'pick-goal-word', wordOffset: 8 }, { type: 'leave-goal-pick' }])
    ).toEqual(returned)
  })

  it('leaves the pick whenever the bookmark popover stops being the open panel', () => {
    expect(run([ARM, OPEN_QUICK]).goalPick).toBeNull()
    expect(run([ARM, OPEN_DRAWER]).goalPick).toBeNull()
    expect(run([ARM, { type: 'toggle-browse' }]).goalPick).toBeNull()
    expect(run([ARM, { type: 'toggle-text-view' }]).goalPick).toBeNull()
    // …but not when the popover itself is re-opened.
    expect(run([ARM, OPEN_BOOKMARKS]).goalPick).not.toBeNull()
  })
})
