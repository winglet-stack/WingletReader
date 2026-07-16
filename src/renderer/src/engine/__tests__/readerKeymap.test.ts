/**
 * Exhaustive branch tests for the reader keyboard decision table (RO-4).
 * Mirrors the readerSession.test.ts grain: pure inputs in, action out,
 * every guard and cascade branch pinned — including preventDefault per key.
 */
import { describe, it, expect } from 'vitest'
import { resolveReaderKeyAction, type ReaderKeyInput } from '../readerKeymap'

const BASE: ReaderKeyInput = {
  code: 'Space',
  shiftKey: false,
  targetTag: 'DIV',
  tapToReadEnabled: false,
  tapToReadKey: 'Space',
  liveRewindKey: 'Mouse1',
  liveRewindStacks: 1,
  playState: 'idle',
  hasSavedIndex: false,
  isFullscreen: false,
  showFsControls: false,
  showBookmarkPopover: false,
  goalPickArmed: false,
  showReaderConfigDrawer: false,
  showQuickSettings: false,
  pagedPlainActive: false,
}

function resolve(overrides: Partial<ReaderKeyInput> = {}) {
  return resolveReaderKeyAction({ ...BASE, ...overrides })
}

describe('input guard — form controls never intercepted', () => {
  it.each(['INPUT', 'TEXTAREA', 'SELECT'])('%s swallows every key', (targetTag) => {
    expect(resolve({ targetTag, code: 'Space' })).toBeNull()
    expect(resolve({ targetTag, code: 'Escape' })).toBeNull()
    expect(resolve({ targetTag, code: 'KeyF' })).toBeNull()
  })

  it('lets Escape close the bookmark popover even from its label input', () => {
    expect(
      resolve({ targetTag: 'INPUT', code: 'Escape', showBookmarkPopover: true })
    ).toEqual({ type: 'close-bookmark-popover', preventDefault: true })
  })

  it('outranks tap-to-read', () => {
    expect(
      resolve({ targetTag: 'TEXTAREA', tapToReadEnabled: true, tapToReadKey: 'Space', code: 'Space' })
    ).toBeNull()
  })

  it('non-form tags proceed normally', () => {
    expect(resolve({ targetTag: 'BODY', code: 'KeyS' })).toEqual({
      type: 'stop-reading',
      preventDefault: false,
    })
  })
})

describe('tap-to-read override — 4-way play state split', () => {
  const tap = { tapToReadEnabled: true, tapToReadKey: 'KeyJ', code: 'KeyJ' }

  it('playing → advance', () => {
    expect(resolve({ ...tap, playState: 'playing' })).toEqual({
      type: 'advance',
      preventDefault: true,
    })
  })

  it('paused → resume', () => {
    expect(resolve({ ...tap, playState: 'paused' })).toEqual({
      type: 'resume',
      preventDefault: true,
    })
  })

  it('idle with saved index → resume-saved', () => {
    expect(resolve({ ...tap, playState: 'idle', hasSavedIndex: true })).toEqual({
      type: 'resume-saved',
      preventDefault: true,
    })
  })

  it('idle without saved index → play', () => {
    expect(resolve({ ...tap, playState: 'idle', hasSavedIndex: false })).toEqual({
      type: 'play',
      preventDefault: true,
    })
  })

  it('stopped → play even with a saved index (resume-saved is idle-only)', () => {
    expect(resolve({ ...tap, playState: 'stopped', hasSavedIndex: true })).toEqual({
      type: 'play',
      preventDefault: true,
    })
  })

  it('disabled tap mode leaves the key to the switch (KeyJ unhandled)', () => {
    expect(resolve({ tapToReadEnabled: false, tapToReadKey: 'KeyJ', code: 'KeyJ' })).toBeNull()
  })

  it('enabled but non-matching code falls through to the switch', () => {
    expect(
      resolve({ tapToReadEnabled: true, tapToReadKey: 'KeyJ', code: 'KeyS' })
    ).toEqual({ type: 'stop-reading', preventDefault: false })
  })

  it('overrides Space when the tap key IS Space: playing → advance, not pause', () => {
    expect(
      resolve({ tapToReadEnabled: true, tapToReadKey: 'Space', code: 'Space', playState: 'playing' })
    ).toEqual({ type: 'advance', preventDefault: true })
  })
})

describe('Space — 4-way play state split', () => {
  it('playing → pause', () => {
    expect(resolve({ code: 'Space', playState: 'playing' })).toEqual({
      type: 'pause',
      preventDefault: true,
    })
  })

  it('paused → resume', () => {
    expect(resolve({ code: 'Space', playState: 'paused' })).toEqual({
      type: 'resume',
      preventDefault: true,
    })
  })

  it('idle with saved index → resume-saved', () => {
    expect(resolve({ code: 'Space', playState: 'idle', hasSavedIndex: true })).toEqual({
      type: 'resume-saved',
      preventDefault: true,
    })
  })

  it('idle without saved index → play', () => {
    expect(resolve({ code: 'Space', playState: 'idle', hasSavedIndex: false })).toEqual({
      type: 'play',
      preventDefault: true,
    })
  })

  it('stopped → play even with a saved index', () => {
    expect(resolve({ code: 'Space', playState: 'stopped', hasSavedIndex: true })).toEqual({
      type: 'play',
      preventDefault: true,
    })
  })
})

describe('KeyR — restart', () => {
  it('restarts without preventDefault', () => {
    expect(resolve({ code: 'KeyR' })).toEqual({ type: 'restart', preventDefault: false })
  })
})

describe('KeyC — fullscreen controls toggle', () => {
  it('toggles the controls overlay only when fullscreen', () => {
    expect(resolve({ code: 'KeyC', isFullscreen: true })).toEqual({
      type: 'toggle-fs-controls',
      preventDefault: true,
    })
  })

  it('does nothing outside fullscreen', () => {
    expect(resolve({ code: 'KeyC', isFullscreen: false })).toBeNull()
  })
})

describe('Escape cascade — strict priority order', () => {
  const allOpen = {
    code: 'Escape',
    showBookmarkPopover: true,
    goalPickArmed: true,
    showReaderConfigDrawer: true,
    showQuickSettings: true,
    isFullscreen: true,
    showFsControls: true,
  }

  it('1. goal pick arming wins over everything below', () => {
    expect(resolve(allOpen)).toEqual({ type: 'cancel-goal-pick', preventDefault: true })
  })

  it('2. bookmark popover is next', () => {
    expect(resolve({ ...allOpen, goalPickArmed: false })).toEqual({
      type: 'close-bookmark-popover',
      preventDefault: true,
    })
  })

  it('goal pick arming still wins from form controls', () => {
    expect(resolve({ targetTag: 'INPUT', code: 'Escape', goalPickArmed: true })).toEqual({
      type: 'cancel-goal-pick',
      preventDefault: true,
    })
  })

  it('3. reader config drawer is next', () => {
    expect(resolve({ ...allOpen, goalPickArmed: false, showBookmarkPopover: false })).toEqual({
      type: 'close-reader-config-drawer',
      preventDefault: true,
    })
  })

  it('4. quick settings is next', () => {
    expect(
      resolve({
        ...allOpen,
        goalPickArmed: false,
        showBookmarkPopover: false,
        showReaderConfigDrawer: false,
      })
    ).toEqual({
      type: 'close-quick-settings',
      preventDefault: true,
    })
  })

  it('5. fullscreen with controls shown hides the controls', () => {
    expect(
      resolve({
        ...allOpen,
        goalPickArmed: false,
        showBookmarkPopover: false,
        showReaderConfigDrawer: false,
        showQuickSettings: false,
      })
    ).toEqual({ type: 'hide-fs-controls', preventDefault: true })
  })

  it('6. fullscreen without controls exits fullscreen', () => {
    expect(
      resolve({
        ...allOpen,
        goalPickArmed: false,
        showBookmarkPopover: false,
        showReaderConfigDrawer: false,
        showQuickSettings: false,
        showFsControls: false,
      })
    ).toEqual({ type: 'exit-fullscreen', preventDefault: true })
  })

  it('7. otherwise stops reading (with preventDefault, unlike KeyS)', () => {
    expect(resolve({ code: 'Escape' })).toEqual({ type: 'stop-reading', preventDefault: true })
  })

  it('controls shown but not fullscreen falls past the hide branch to stop-reading', () => {
    expect(resolve({ code: 'Escape', isFullscreen: false, showFsControls: true })).toEqual({
      type: 'stop-reading',
      preventDefault: true,
    })
  })
})

describe('remaining switch keys', () => {
  it('KeyS stops reading without preventDefault', () => {
    expect(resolve({ code: 'KeyS' })).toEqual({ type: 'stop-reading', preventDefault: false })
  })

  it('KeyF toggles fullscreen', () => {
    expect(resolve({ code: 'KeyF' })).toEqual({ type: 'toggle-fullscreen', preventDefault: true })
  })

  it('KeyT toggles plain text', () => {
    expect(resolve({ code: 'KeyT' })).toEqual({ type: 'toggle-plain-text', preventDefault: true })
  })

  it('ArrowLeft rewinds 10, no preventDefault', () => {
    expect(resolve({ code: 'ArrowLeft' })).toEqual({
      type: 'rewind',
      amount: 10,
      preventDefault: false,
    })
  })

  it('Shift+ArrowLeft rewinds 30', () => {
    expect(resolve({ code: 'ArrowLeft', shiftKey: true })).toEqual({
      type: 'rewind',
      amount: 30,
      preventDefault: false,
    })
  })

  it('ArrowRight seeks forward 10, no preventDefault', () => {
    expect(resolve({ code: 'ArrowRight' })).toEqual({
      type: 'seek-forward',
      amount: 10,
      preventDefault: false,
    })
  })

  it('Shift+ArrowRight seeks forward 30', () => {
    expect(resolve({ code: 'ArrowRight', shiftKey: true })).toEqual({
      type: 'seek-forward',
      amount: 30,
      preventDefault: false,
    })
  })

  it('unmapped keys are not handled', () => {
    expect(resolve({ code: 'KeyZ' })).toBeNull()
    expect(resolve({ code: 'Enter' })).toBeNull()
    expect(resolve({ code: 'Tab' })).toBeNull()
  })
})

describe('plain paged Text view — arrows flip Pages (TC-6)', () => {
  it('ArrowLeft flips to the previous Page (with preventDefault)', () => {
    expect(resolve({ code: 'ArrowLeft', pagedPlainActive: true })).toEqual({
      type: 'page-prev',
      preventDefault: true,
    })
  })

  it('ArrowRight flips to the next Page (with preventDefault)', () => {
    expect(resolve({ code: 'ArrowRight', pagedPlainActive: true })).toEqual({
      type: 'page-next',
      preventDefault: true,
    })
  })

  it('Shift does not change the paged-plain arrow mapping', () => {
    expect(resolve({ code: 'ArrowLeft', pagedPlainActive: true, shiftKey: true })).toEqual({
      type: 'page-prev',
      preventDefault: true,
    })
    expect(resolve({ code: 'ArrowRight', pagedPlainActive: true, shiftKey: true })).toEqual({
      type: 'page-next',
      preventDefault: true,
    })
  })

  it('outside paged-plain, arrows still rewind/seek the playhead', () => {
    expect(resolve({ code: 'ArrowLeft', pagedPlainActive: false })).toEqual({
      type: 'rewind',
      amount: 10,
      preventDefault: false,
    })
    expect(resolve({ code: 'ArrowRight', pagedPlainActive: false })).toEqual({
      type: 'seek-forward',
      amount: 10,
      preventDefault: false,
    })
  })

  it('Space still pauses/resumes even while paged-plain is active', () => {
    expect(resolve({ code: 'Space', pagedPlainActive: true, playState: 'playing' })).toEqual({
      type: 'pause',
      preventDefault: true,
    })
  })

  it('form-control guard still wins over paged-plain arrows', () => {
    expect(resolve({ code: 'ArrowLeft', pagedPlainActive: true, targetTag: 'INPUT' })).toBeNull()
    expect(resolve({ code: 'ArrowRight', pagedPlainActive: true, targetTag: 'TEXTAREA' })).toBeNull()
  })
})

describe('live rewind — keyboard binding while playing or paused', () => {
  const live = { liveRewindKey: 'KeyQ', liveRewindStacks: 2, code: 'KeyQ' }

  it('playing → live-rewind with configured stack step', () => {
    expect(resolve({ ...live, playState: 'playing' })).toEqual({
      type: 'live-rewind',
      amount: 2,
      preventDefault: true,
    })
  })

  it('paused → live-rewind', () => {
    expect(resolve({ ...live, playState: 'paused' })).toEqual({
      type: 'live-rewind',
      amount: 2,
      preventDefault: true,
    })
  })

  it('idle → not handled', () => {
    expect(resolve({ ...live, playState: 'idle' })).toBeNull()
  })

  it('mouse binding is not handled by the keyboard table', () => {
    expect(
      resolve({ liveRewindKey: 'Mouse1', liveRewindStacks: 1, code: 'Mouse1', playState: 'playing' })
    ).toBeNull()
  })

  it('tap-to-read advance key takes priority over live rewind when both match', () => {
    expect(
      resolve({
        tapToReadEnabled: true,
        tapToReadKey: 'KeyQ',
        liveRewindKey: 'KeyQ',
        liveRewindStacks: 1,
        code: 'KeyQ',
        playState: 'playing',
      })
    ).toEqual({ type: 'advance', preventDefault: true })
  })
})
