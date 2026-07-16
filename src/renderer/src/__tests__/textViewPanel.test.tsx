/**
 * TextViewPanel characterization tests — pin the plain-text-panel region of
 * Reader.tsx before extracting it into components/reader/TextViewPanel.tsx.
 *
 * Assertions:
 *  - reference header + Locate button render when the text view is open
 *  - plain view shows content with the current-word <mark> highlight
 *  - DOCX source shows Plain/Formatted tab buttons
 *  - non-DOCX text hides those tabs
 *  - clicking the Formatted tab switches the view
 *
 * Environment: happy-dom (matched by vitest.config.ts environmentMatchGlobs).
 */

import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import Reader from '../components/Reader'
import TextViewPanel from '../components/reader/TextViewPanel'
import { useTextPaging } from '../engine/useTextPaging'
import * as wordHighlight from '../engine/wordHighlight'
import type { Bookmark, Settings, TextRecord } from '../types'
import type { PlainTextContext } from '../engine/plainTextContext'
import { NavigationProvider } from '../contexts/NavigationContext'
import { SettingsProvider } from '../contexts/SettingsContext'
import { LibraryProvider } from '../contexts/LibraryContext'
import { ReaderProvider } from '../contexts/ReaderContext'

afterEach(cleanup)

// ── Shared mocks ──────────────────────────────────────────────────────────────

const mockOscillator = {
  connect: vi.fn(), start: vi.fn(), stop: vi.fn(),
  type: 'sine', frequency: { setValueAtTime: vi.fn() },
}
const mockGain = {
  connect: vi.fn(),
  gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
}
vi.stubGlobal('AudioContext', vi.fn(() => ({
  state: 'running', currentTime: 0,
  createOscillator: vi.fn(() => mockOscillator),
  createGain: vi.fn(() => mockGain),
  destination: {}, resume: vi.fn(), close: vi.fn(),
})))

vi.stubGlobal('api', {
  db: {
    getTexts: vi.fn().mockResolvedValue([]),
    getSettings: vi.fn().mockResolvedValue({}),
    saveSettings: vi.fn().mockResolvedValue({}),
    getReadingPosition: vi.fn().mockResolvedValue(null),
    getLatestResumeCandidate: vi.fn().mockResolvedValue(null),
    saveReadingPosition: vi.fn().mockResolvedValue({}),
  },
})

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_SETTINGS: Settings = {
  words_per_stack: 1,
  stacks_visible: 1,
  stack_gap: 32,
  bpm: 120,
  metronome_enabled: false,
  pause_at_sentences: false,
  pause_at_headlines: false,
  font_size: 36,
  stack_vertical_offset: 0,
  stack_horizontal_offset: 0,
  theme: 'dark',
  highlight_active: false,
  lines_enabled: false,
  lines_count: 1,
  lines_row_gap: 0,
  segmentation_enabled: false,
  segmentation_threshold: 5000,
  segmentation_chunk_size: 1500,
  auto_chapter_detection: false,
  summaries_initialized: false,
  chunk_rule_long_word: false,
  chunk_rule_enumerations: false,
  chunk_rule_bullets: false,
  chunk_rule_commas: false,
  chunk_rule_names: false,
  chunk_rule_headlines: false,
  view_style: 'default',
  show_chunk_dividers: false,
  highlight_color: '',
  viewport_bg_color: '',
  text_color: '',
  font_family: '',
  highlight_text_color: '',
  highlight_mode: 'default',
  highlight_panning_chunk_size: 0,
  highlighting_mode: 'default',
  tap_to_read: false,
  tap_to_read_key: 'Space',
  lock_at_wpm: false,
  target_wpm: 240,
  custom_palettes: [],
  custom_text_presets: [],
  custom_font_presets: [],
  custom_playback_presets: [],
  custom_reader_configs: [],
}

const PLAIN_TEXT: TextRecord = {
  id: 1,
  title: 'My Plain Book',
  content: 'alpha beta gamma delta epsilon zeta eta theta iota kappa',
  word_count: 10,
}

const DOCX_TEXT: TextRecord = {
  id: 2,
  title: 'My DOCX Book',
  content: 'alpha beta gamma delta epsilon',
  content_html: '<p>alpha beta gamma delta epsilon</p>',
  content_display: 'alpha beta gamma delta epsilon',
  source_type: 'docx',
  word_count: 5,
}

function renderReader(text: TextRecord, settingsOverride: Partial<Settings> = {}) {
  const settings = { ...BASE_SETTINGS, ...settingsOverride }
  render(
    <NavigationProvider>
      <SettingsProvider initialSettings={settings}>
        <LibraryProvider initialActiveText={text}>
          <ReaderProvider>
            <Reader onBack={vi.fn()} onExitToLibrary={vi.fn()} />
          </ReaderProvider>
        </LibraryProvider>
      </SettingsProvider>
    </NavigationProvider>
  )
}

function openTextView() {
  fireEvent.click(screen.getByRole('button', { name: 'Plain text view' }))
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TextViewPanel — header teardown', () => {
  it('renders the text-view region without the retired reference band', () => {
    renderReader(PLAIN_TEXT)
    openTextView()
    const region = screen.getByRole('region', { name: 'Text view' })
    expect(region).toBeTruthy()
    expect(region.querySelector('.plain-text-ref')).toBeNull()
    expect(within(region).queryByText('My Plain Book')).toBeNull()
    expect(within(region).queryByText(/word \d+ of \d+/)).toBeNull()
  })
})

describe('TextViewPanel — plain view word highlight', () => {
  it('renders a <mark> element for the current word when in plain mode', () => {
    renderReader(PLAIN_TEXT)
    openTextView()
    const mark = document.querySelector('mark.plain-text-word-highlight')
    expect(mark).toBeTruthy()
  })

  it('highlighted word is from the content', () => {
    renderReader(PLAIN_TEXT)
    openTextView()
    const mark = document.querySelector('mark.plain-text-word-highlight')
    // At index 0 the first word 'alpha' should be highlighted
    expect(mark?.textContent).toBe('alpha')
  })

  it('clicking a word is a no-op unless a goal pick is armed', () => {
    renderReader(PLAIN_TEXT)
    openTextView()

    fireEvent.click(screen.getByText('gamma'))

    const current = document.querySelector('mark.plain-text-word-highlight')
    const scrubber = screen.getByRole('slider', { name: 'Reading position' }) as HTMLInputElement

    expect(current?.textContent).toBe('alpha')
    expect(screen.queryByText('Click a word to set your target')).toBeNull()
    expect(Number(scrubber.value)).toBe(0)
  })

  it('shows the goal-pick banner while armed and reports the picked word', () => {
    const onPick = vi.fn()
    render(
      <ControlledTextViewPanel
        text={PLAIN_TEXT}
        plainTextCtx={{
          reference: 'My Plain Book',
          detail: 'word 0 of 10',
          wordOffset: 0,
          totalWords: 10,
          progress: 0,
        }}
        goalPickArmed
        onGoalWordPick={onPick}
      />
    )

    expect(screen.getByText('Click a word to set your target')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
    fireEvent.click(screen.getByText('gamma'))
    expect(onPick).toHaveBeenCalledWith(2)
  })
})

describe('TextViewPanel — source-format tabs for DOCX', () => {
  it('shows Plain Text and Formatted tabs for a DOCX text', () => {
    renderReader(DOCX_TEXT)
    openTextView()
    expect(screen.getByRole('tab', { name: 'Plain Text' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Formatted' })).toBeTruthy()
  })

  it('Plain Text tab is selected by default', () => {
    renderReader(DOCX_TEXT)
    openTextView()
    const plainTab = screen.getByRole('tab', { name: 'Plain Text' })
    expect(plainTab.getAttribute('aria-selected')).toBe('true')
  })

  it('clicking Formatted tab deselects Plain Text and selects Formatted', () => {
    renderReader(DOCX_TEXT)
    openTextView()
    fireEvent.click(screen.getByRole('tab', { name: 'Formatted' }))
    expect(screen.getByRole('tab', { name: 'Formatted' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'Plain Text' }).getAttribute('aria-selected')).toBe('false')
  })

  it('switching to Formatted tab shows the HTML view', () => {
    renderReader(DOCX_TEXT)
    openTextView()
    fireEvent.click(screen.getByRole('tab', { name: 'Formatted' }))
    expect(document.querySelector('.docx-view')).toBeTruthy()
  })
})

describe('TextViewPanel — non-DOCX text hides source tabs', () => {
  it('does not show source-format tabs for plain text', () => {
    renderReader(PLAIN_TEXT)
    openTextView()
    expect(screen.queryByRole('tab', { name: 'Plain Text' })).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Formatted' })).toBeNull()
  })
})

// ── PG-2: paged render swap + auto-follow (ADR-0025) ────────────────────────────
//
// These render TextViewPanel directly with a controlled plainTextCtx so the
// playhead's wordOffset can be moved without driving full playback. The fixture
// is a three-Page text: three 300-word paragraphs with distinct per-paragraph
// prefixes → pageStarts [0, 300, 600] over the shared word-offset space.

const paged = (n: number, prefix: string) =>
  Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(' ')

const PAGED_TEXT: TextRecord = {
  id: 99,
  title: 'Paged Book',
  content: [paged(300, 'a'), paged(300, 'b'), paged(300, 'c')].join('\n\n'),
  word_count: 900,
}

function makeCtx(wordOffset: number): PlainTextContext {
  return {
    reference: 'Paged Book',
    detail: `word ${wordOffset} of 900`,
    wordOffset,
    totalWords: 900,
    progress: wordOffset / 900,
  }
}

interface ControlledPanelProps {
  text: TextRecord
  plainTextCtx: PlainTextContext
  showPlainText?: boolean
  goalPickArmed?: boolean
  onGoalWordPick?: (wordOffset: number) => void
  plainTextContentRef?: React.MutableRefObject<HTMLPreElement | null>
  bookmarks?: Bookmark[]
}

function ControlledTextViewPanel({
  text,
  plainTextCtx,
  showPlainText = true,
  goalPickArmed = false,
  onGoalWordPick = vi.fn(),
  plainTextContentRef,
  bookmarks = [],
}: ControlledPanelProps) {
  const [textViewMode, setTextViewMode] = React.useState<'plain' | 'source'>('plain')
  const displayContent = (text.content_display ?? text.content ?? '').replace(/\f/g, '\n\n')
  const paging = useTextPaging(displayContent, plainTextCtx.wordOffset)

  return (
    <TextViewPanel
      text={text}
      displayContent={displayContent}
      plainTextCtx={plainTextCtx}
      paging={paging}
      textViewMode={textViewMode}
      onTextViewModeChange={setTextViewMode}
      showPlainText={showPlainText}
      goalPickArmed={goalPickArmed}
      onGoalWordPick={onGoalWordPick}
      plainTextContentRef={plainTextContentRef}
      bookmarks={bookmarks}
    />
  )
}

function panelEl(
  text: TextRecord,
  wordOffset: number,
  goalPickArmed = false,
  onPick: (w: number) => void = vi.fn()
) {
  return (
    <ControlledTextViewPanel
      text={text}
      plainTextCtx={makeCtx(wordOffset)}
      goalPickArmed={goalPickArmed}
      onGoalWordPick={onPick}
    />
  )
}

function renderPanel(
  wordOffset: number,
  goalPickArmed = false,
  onPick: (w: number) => void = vi.fn()
) {
  return render(panelEl(PAGED_TEXT, wordOffset, goalPickArmed, onPick))
}

describe('TextViewPanel — PG-2 renders only the current Page', () => {
  it('exposes the plain text content element for live glyph-box measurement', () => {
    const plainTextContentRef = { current: null } as React.MutableRefObject<HTMLPreElement | null>
    render(
      <ControlledTextViewPanel
        text={PAGED_TEXT}
        plainTextCtx={makeCtx(0)}
        plainTextContentRef={plainTextContentRef}
      />
    )

    expect(plainTextContentRef.current?.className).toBe('plain-text-content')
  })

  it('materializes only the playhead Page words, not the whole document', () => {
    renderPanel(0)
    // Page 0 = first paragraph (a0…a299) only.
    expect(document.querySelectorAll('.plain-text-word').length).toBe(300)
    expect(screen.queryByText('a0')).toBeTruthy()
    expect(screen.queryByText('a299')).toBeTruthy()
    // Words on later Pages are never rendered.
    expect(screen.queryByText('b0')).toBeNull()
    expect(screen.queryByText('c0')).toBeNull()
  })

  it('flips the visible Page when the playhead crosses a Page boundary', () => {
    const { rerender } = renderPanel(0)
    expect(screen.queryByText('a0')).toBeTruthy()
    expect(screen.queryByText('b0')).toBeNull()

    // Advance the playhead into Page 1 (wordOffset 300 = first word of paragraph b).
    rerender(
      <ControlledTextViewPanel
        text={PAGED_TEXT}
        plainTextCtx={makeCtx(300)}
      />
    )
    expect(screen.queryByText('b0')).toBeTruthy()
    expect(screen.queryByText('a0')).toBeNull()
    expect(screen.queryByText('c0')).toBeNull()
  })

  it('does not flip while the playhead stays within a Page', () => {
    const { rerender } = renderPanel(0)
    rerender(
      <ControlledTextViewPanel
        text={PAGED_TEXT}
        plainTextCtx={makeCtx(150)}
      />
    )
    // Still Page 0.
    expect(screen.queryByText('a150')).toBeTruthy()
    expect(screen.queryByText('b0')).toBeNull()
  })
})

describe('TextViewPanel — PG-2 stable pagination memo', () => {
  it('does not rebuild the scan when only wordOffset changes', () => {
    // OL-1: the unified scan memo is keyed on displayContent only, so moving the
    // playhead must not re-tokenize the book (ADR-0025 §1 anti-lag invariant).
    const spy = vi.spyOn(wordHighlight, 'scanText')
    const { rerender } = renderPanel(0)
    const callsAfterMount = spy.mock.calls.length
    expect(callsAfterMount).toBeGreaterThan(0)

    // Same text, moved playhead (within Page 0) — must not recompute.
    rerender(
      <ControlledTextViewPanel
        text={PAGED_TEXT}
        plainTextCtx={makeCtx(1)}
      />
    )
    expect(spy.mock.calls.length).toBe(callsAfterMount)
    spy.mockRestore()
  })
})

describe('Reader — OL-1 defers the Text-view scan off the engage frame', () => {
  it('does not tokenize the book on RSVP engage when the Text view is never opened', () => {
    const spy = vi.spyOn(wordHighlight, 'scanText')
    renderReader(PAGED_TEXT)
    // Engaged straight into the RSVP reader — neither Text-view pass runs.
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('tokenizes the book once when the plain Text view is entered', () => {
    const spy = vi.spyOn(wordHighlight, 'scanText')
    renderReader(PAGED_TEXT)
    expect(spy).not.toHaveBeenCalled()

    openTextView()
    // Entering the view computes the scan; the paged view renders its first Page.
    expect(spy).toHaveBeenCalled()
    expect(screen.getByText('a0')).toBeTruthy()
    expect(screen.getByText('Page 1 / 3')).toBeTruthy()
    spy.mockRestore()
  })
})

describe('TextViewPanel — PG-2 highlight and armed pick under paging', () => {
  it('marks the current word on its Page', () => {
    renderPanel(305)
    const mark = document.querySelector('mark.plain-text-word-highlight')
    // wordOffset 305 = paragraph b, word index 5.
    expect(mark?.textContent).toBe('b5')
  })

  it('unarmed word clicks do not report a pick', () => {
    const onPick = vi.fn()
    renderPanel(305, false, onPick)
    fireEvent.click(screen.getByText('b10'))
    expect(onPick).not.toHaveBeenCalled()
  })

  it('armed word clicks report the whole-text word offset, not a Page-local index', () => {
    const onPick = vi.fn()
    renderPanel(305, true, onPick)
    fireEvent.click(screen.getByText('b10'))
    expect(onPick).toHaveBeenCalledWith(310)
  })
})

// ── PG-3: manual paging + detach / re-attach (ADR-0025 §3) ──────────────────────
//
// Same three-Page fixture (pageStarts [0, 300, 600]). The playhead wordOffset is
// controlled via rerender; the mouse-only prev/next cluster and Locate drive the
// detach state machine. Paging is view-only — TextViewPanel has no playhead-moving
// callback, so "without moving the playhead" is structural (the controlled ctx
// wordOffset never changes across a paging click).

const SINGLE_PAGE_TEXT: TextRecord = {
  id: 42,
  title: 'Tiny Book',
  content: 'alpha beta gamma delta epsilon',
  word_count: 5,
}

describe('Reader — plain text console pager', () => {
  it('shows Locate and pager in the console while hiding playback controls', () => {
    renderReader(PAGED_TEXT)
    openTextView()

    expect(screen.queryByRole('toolbar', { name: 'Playback controls' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Scroll to current reading position' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Page navigation' })).toBeTruthy()
    expect(screen.getByText('Page 1 / 3')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull()

    // QA-2 + LN-1: Locate no longer owns the left slot; the engaged Reader's
    // browse toggle now lives there instead of an empty spacer.
    const browseToggle = screen.getByRole('button', { name: 'Browse library' })
    expect(browseToggle.closest('.reader-controls')).toBeTruthy()
    expect(document.querySelector('.reader-controls-spacer')).toBeNull()
  })

  it('renders Locate as an icon-only circle hanging off the right of the centered pager', () => {
    renderReader(PAGED_TEXT)
    openTextView()

    // QA-2: icon-only ⌖, no "Locate" text label.
    const locate = screen.getByRole('button', { name: 'Scroll to current reading position' })
    expect(locate.className).toContain('plain-text-locate-btn')
    expect(locate.textContent?.trim()).toBe('⌖')
    expect(locate.textContent).not.toContain('Locate')

    // Positioned inside the centered transport wrapper, after the pager, so it
    // extends rightward without shifting the pager off-center.
    const transport = document.querySelector('.plain-text-console-transport')
    expect(transport).not.toBeNull()
    const pager = transport?.querySelector('.plain-text-console-pager')
    expect(pager).not.toBeNull()
    expect(transport?.contains(locate)).toBe(true)
    // Locate comes after the pager group in DOM order (rightward extension).
    expect(
      pager?.compareDocumentPosition(locate) ?? 0,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('uses rewind and skip-forward sprites for previous and next page', () => {
    renderReader(PAGED_TEXT)
    openTextView()

    const prev = screen.getByRole('button', { name: 'Previous page' })
    const next = screen.getByRole('button', { name: 'Next page' })

    expect(prev.querySelector('img')?.getAttribute('src')).toContain('rewind')
    expect(next.querySelector('img')?.getAttribute('src')).toContain('skip-forward')
  })

  it('pages forward, detaches, then Locate re-attaches to the reading position', () => {
    renderReader(PAGED_TEXT)
    openTextView()

    const locate = screen.getByRole('button', { name: 'Scroll to current reading position' })
    expect(locate.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.queryByText('b0')).toBeTruthy()
    expect(screen.queryByText('a0')).toBeNull()
    expect(screen.getByText('Page 2 / 3')).toBeTruthy()
    expect(locate.getAttribute('aria-pressed')).toBe('true')
    expect(locate.className).toContain('plain-text-locate-btn--active')

    fireEvent.click(locate)
    expect(screen.queryByText('a0')).toBeTruthy()
    expect(screen.queryByText('b0')).toBeNull()
    expect(screen.getByText('Page 1 / 3')).toBeTruthy()
    expect(locate.getAttribute('aria-pressed')).toBe('false')
    expect(locate.className).not.toContain('plain-text-locate-btn--active')
  })

  it('disables previous on the first page and next on the last page', () => {
    renderReader(PAGED_TEXT)
    openTextView()

    const prev = screen.getByRole('button', { name: 'Previous page' }) as HTMLButtonElement
    expect(prev.disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))

    const next = screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement
    expect(next.disabled).toBe(true)
    expect(screen.getByText('Page 3 / 3')).toBeTruthy()
  })

  it('keeps the pager visible and disabled for a single-page text', () => {
    renderReader(SINGLE_PAGE_TEXT)
    openTextView()

    const prev = screen.getByRole('button', { name: 'Previous page' }) as HTMLButtonElement
    const next = screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement

    expect(screen.getByText('Page 1 / 1')).toBeTruthy()
    expect(prev.disabled).toBe(true)
    expect(next.disabled).toBe(true)
  })

  it('restores the normal playback console on the DOCX Formatted tab', () => {
    renderReader(DOCX_TEXT)
    openTextView()
    fireEvent.click(screen.getByRole('tab', { name: 'Formatted' }))

    expect(screen.getByRole('toolbar', { name: 'Playback controls' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Page navigation' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Scroll to current reading position' })).toBeNull()
  })

  it('keeps the normal playback console in the RSVP reader', () => {
    renderReader(PLAIN_TEXT)

    expect(screen.getByRole('toolbar', { name: 'Playback controls' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Page navigation' })).toBeNull()
  })
})

// ── PG-4: inline bookmarked-word markers on the current Page (ADR-0025 §4) ──────
//
// Same three-Page fixture (pageStarts [0, 300, 600]). Bookmarks are passed in
// directly; only bookmarks whose wordOffset lands on the visible Page are marked.
// Markers are decoration only — no bookmark callback exists, so there is no marker
// interaction to test beyond the armed goal-pick callback on the word span.

function bm(id: number, wordOffset: number, kind: Bookmark['kind']): Bookmark {
  return {
    id,
    textId: PAGED_TEXT.id!,
    kind,
    wordOffset,
    label: `bookmark ${id}`,
    createdAt: '2026-07-12T00:00:00.000Z',
  }
}

function renderPanelWithBookmarks(wordOffset: number, bookmarks: Bookmark[]) {
  return render(
    <ControlledTextViewPanel
      text={PAGED_TEXT}
      plainTextCtx={makeCtx(wordOffset)}
      bookmarks={bookmarks}
    />
  )
}

describe('TextViewPanel — PG-4 inline bookmark markers', () => {
  it('marks a bookmarked word that falls on the current Page', () => {
    renderPanelWithBookmarks(0, [bm(1, 5, 'normal')])
    const word = screen.getByText('a5')
    expect(word.className).toContain('plain-text-word-bookmark')
  })

  it('renders the goal bookmark visually distinct from a normal bookmark', () => {
    renderPanelWithBookmarks(0, [bm(1, 5, 'normal'), bm(2, 10, 'goal')])
    const normal = screen.getByText('a5')
    const goal = screen.getByText('a10')

    expect(normal.className).toContain('plain-text-word-bookmark')
    expect(normal.className).not.toContain('plain-text-word-bookmark-goal')

    expect(goal.className).toContain('plain-text-word-bookmark')
    expect(goal.className).toContain('plain-text-word-bookmark-goal')
  })

  it('shows no marker for a bookmark whose wordOffset is on another Page', () => {
    // Viewing Page 0; the only bookmark sits on Page 1 (offset 305 = b5).
    renderPanelWithBookmarks(0, [bm(1, 305, 'normal')])
    expect(screen.queryByText('b5')).toBeNull()
    expect(document.querySelector('.plain-text-word-bookmark')).toBeNull()
  })

  it('marks the off-Page bookmark only once paged to it', () => {
    renderPanelWithBookmarks(305, [bm(1, 305, 'normal')])
    const word = screen.getByText('b5')
    expect(word.className).toContain('plain-text-word-bookmark')
  })

  it('marker carries no interaction of its own — unarmed word clicks stay inert', () => {
    const onPick = vi.fn()
    render(
      <ControlledTextViewPanel
        text={PAGED_TEXT}
        plainTextCtx={makeCtx(0)}
        onGoalWordPick={onPick}
        bookmarks={[bm(1, 5, 'normal')]}
      />
    )
    const word = screen.getByText('a5')
    // Not a button/link, no bookmark-specific affordance — it is a plain word span.
    expect(word.tagName).toBe('SPAN')
    expect(word.getAttribute('title')).toBeNull()
    fireEvent.click(word)
    expect(onPick).not.toHaveBeenCalled()
  })
})

