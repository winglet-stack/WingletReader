/**
 * Pure keyboard decision table extracted from Reader.tsx (RO-4).
 * Decides WHAT a keydown does; the side effects (HOW) stay in the
 * component's dispatch switch. `null` means "not handled" — the event
 * passes through untouched.
 */

import type { PlaybackState } from '../types'
import { isMouseBinding } from './readerBindings'

export type ReaderKeyAction = { preventDefault: boolean } & (
  | { type: 'advance' } // tap-to-read step while playing
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'resume-saved' }
  | { type: 'play' }
  | { type: 'restart' }
  | { type: 'toggle-fs-controls' }
  | { type: 'cancel-goal-pick' }
  | { type: 'close-bookmark-popover' }
  | { type: 'close-reader-config-drawer' }
  | { type: 'close-quick-settings' }
  | { type: 'hide-fs-controls' }
  | { type: 'exit-fullscreen' }
  | { type: 'stop-reading' }
  | { type: 'toggle-fullscreen' }
  | { type: 'toggle-plain-text' }
  | { type: 'rewind'; amount: number }
  | { type: 'seek-forward'; amount: number }
  | { type: 'live-rewind'; amount: number }
  | { type: 'page-prev' }
  | { type: 'page-next' }
)

export interface ReaderKeyInput {
  code: string
  shiftKey: boolean
  targetTag: string
  tapToReadEnabled: boolean
  tapToReadKey: string
  liveRewindKey: string
  liveRewindStacks: number
  playState: PlaybackState
  hasSavedIndex: boolean
  isFullscreen: boolean
  showFsControls: boolean
  showBookmarkPopover: boolean
  goalPickArmed: boolean
  showReaderConfigDrawer: boolean
  showQuickSettings: boolean
  /** Plain paged Text view is active: arrows flip Pages instead of seeking. */
  pagedPlainActive: boolean
}

const INPUT_TAGS = ['INPUT', 'TEXTAREA', 'SELECT']

/**
 * The 4-way play/pause state split shared by Space and the tap-to-read key.
 * Only the playing branch differs: Space pauses, the tap key steps forward.
 */
function playbackToggleAction(
  playState: PlaybackState,
  hasSavedIndex: boolean,
  whilePlaying: 'pause' | 'advance'
): ReaderKeyAction {
  if (playState === 'playing') return { type: whilePlaying, preventDefault: true }
  if (playState === 'paused') return { type: 'resume', preventDefault: true }
  if (playState === 'idle' && hasSavedIndex) return { type: 'resume-saved', preventDefault: true }
  return { type: 'play', preventDefault: true }
}

/** Keyboard-bound live rewind only; mouse bindings are handled on the stage. */
function liveRewindKeyAction(input: ReaderKeyInput): ReaderKeyAction | null {
  if (isMouseBinding(input.liveRewindKey) || input.code !== input.liveRewindKey) return null
  if (input.playState !== 'playing' && input.playState !== 'paused') return null
  return { type: 'live-rewind', amount: input.liveRewindStacks, preventDefault: true }
}

function escapeKeyAction(input: ReaderKeyInput): ReaderKeyAction {
  if (input.showBookmarkPopover) return { type: 'close-bookmark-popover', preventDefault: true }
  if (input.showReaderConfigDrawer) return { type: 'close-reader-config-drawer', preventDefault: true }
  if (input.showQuickSettings) return { type: 'close-quick-settings', preventDefault: true }
  if (input.isFullscreen && input.showFsControls) return { type: 'hide-fs-controls', preventDefault: true }
  if (input.isFullscreen) return { type: 'exit-fullscreen', preventDefault: true }
  return { type: 'stop-reading', preventDefault: true }
}

export function resolveReaderKeyAction(input: ReaderKeyInput): ReaderKeyAction | null {
  if (input.code === 'Escape' && input.goalPickArmed) {
    return { type: 'cancel-goal-pick', preventDefault: true }
  }

  // Never intercept while focus is in a form control
  if (INPUT_TAGS.includes(input.targetTag)) {
    if (input.code === 'Escape' && input.showBookmarkPopover) {
      return { type: 'close-bookmark-popover', preventDefault: true }
    }
    return null
  }

  // Tap-to-read: the configured advance key takes priority over the switch
  // below, including when the tap key is Space itself
  if (input.tapToReadEnabled && input.code === input.tapToReadKey) {
    return playbackToggleAction(input.playState, input.hasSavedIndex, 'advance')
  }

  const liveRewind = liveRewindKeyAction(input)
  if (liveRewind) return liveRewind

  switch (input.code) {
    case 'Space':
      return playbackToggleAction(input.playState, input.hasSavedIndex, 'pause')
    case 'KeyR':
      return { type: 'restart', preventDefault: false }
    case 'KeyC':
      if (input.isFullscreen) return { type: 'toggle-fs-controls', preventDefault: true }
      return null
    case 'Escape':
      return escapeKeyAction(input)
    case 'KeyS':
      return { type: 'stop-reading', preventDefault: false }
    case 'KeyF':
      return { type: 'toggle-fullscreen', preventDefault: true }
    case 'KeyT':
      return { type: 'toggle-plain-text', preventDefault: true }
    case 'ArrowLeft':
      if (input.pagedPlainActive) return { type: 'page-prev', preventDefault: true }
      return { type: 'rewind', amount: input.shiftKey ? 30 : 10, preventDefault: false }
    case 'ArrowRight':
      if (input.pagedPlainActive) return { type: 'page-next', preventDefault: true }
      return { type: 'seek-forward', amount: input.shiftKey ? 30 : 10, preventDefault: false }
    default:
      return null
  }
}
