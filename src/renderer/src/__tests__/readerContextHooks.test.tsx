/**
 * Direct coverage for the hooks the `ReaderProvider` body was extracted into
 * (codebase-health 07, mirroring the Thin Provider / Composed Controller Hooks
 * pattern established for `LibraryContext` by 06).
 * Environment: happy-dom (matched by vitest.config.ts environmentMatchGlobs).
 */
import React from 'react'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NavigationProvider } from '../contexts/NavigationContext'
import { SettingsProvider } from '../contexts/SettingsContext'
import { LibraryProvider } from '../contexts/LibraryContext'
import {
  usePostReadingSummary,
  useReaderChrome,
  useReaderController,
  useReaderEngagement,
  useReaderResume,
} from '../contexts/reader/useReaderController'
import type { Settings, TextRecord, TextSegment } from '../types'
import type { AppView } from '../appShell/routeTable'

const summaryFlow = vi.hoisted(() => ({ enabled: false }))

vi.mock('../alphaChrome', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../alphaChrome')>()
  return {
    ...actual,
    alphaChrome: {
      ...actual.alphaChrome,
      get postReadingSummaryEnabled() {
        return summaryFlow.enabled
      },
    },
  }
})

const BOOK: TextRecord = { id: 1, title: 'Source Book', content: '', word_count: 5000 }

const FULL_BOOK: TextRecord = {
  ...BOOK,
  content: 'one two three four five six seven eight',
  word_count: 8,
}

const SEGMENT: TextSegment = {
  id: 10,
  textId: 1,
  title: 'Chapter One',
  content: 'hello world',
  order: 0,
  sourceType: 'detected_heading',
  word_count: 2,
}

const SETTINGS = {
  words_per_stack: 3,
  chunk_rule_long_word: false,
  chunk_rule_enumerations: false,
  chunk_rule_bullets: false,
  chunk_rule_commas: false,
  chunk_rule_names: false,
  chunk_rule_headlines: true,
  pause_at_sentences: true,
  pause_at_headlines: true,
  summaries_initialized: false,
} as unknown as Settings

function makeDbApi(overrides: Record<string, unknown> = {}): Window['api']['db'] {
  return {
    getText: vi.fn().mockResolvedValue(FULL_BOOK),
    getTexts: vi.fn().mockResolvedValue([BOOK]),
    getSegment: vi.fn().mockResolvedValue(SEGMENT),
    getSegments: vi.fn().mockResolvedValue([SEGMENT]),
    getSettings: vi.fn().mockResolvedValue(SETTINGS),
    saveSettings: vi.fn().mockResolvedValue(SETTINGS),
    getReadingPosition: vi.fn().mockResolvedValue({ stackIndex: 3 }),
    getLatestResumeCandidate: vi.fn().mockResolvedValue(null),
    saveSummary: vi.fn().mockResolvedValue(undefined),
    createChapterFromPassage: vi.fn(),
    ...overrides,
  } as unknown as Window['api']['db']
}

function engagementDeps(overrides: Record<string, unknown> = {}) {
  return {
    dbApi: makeDbApi(),
    settings: SETTINGS,
    setView: vi.fn(),
    setError: vi.fn(),
    setActiveText: vi.fn(),
    openSegments: vi.fn().mockResolvedValue(undefined),
    parentText: null,
    segments: [],
    ...overrides,
  } as unknown as Parameters<typeof useReaderEngagement>[0]
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

beforeEach(() => {
  summaryFlow.enabled = false
})

describe('useReaderChrome', () => {
  it('closes the config drawer whenever the route leaves the reader', () => {
    const { result, rerender } = renderHook(
      ({ view }: { view: AppView }) => useReaderChrome(view),
      { initialProps: { view: 'reader' as AppView } }
    )

    act(() => result.current.setReaderConfigDrawerOpen(true))
    expect(result.current.readerConfigDrawerOpen).toBe(true)

    rerender({ view: 'library' })
    expect(result.current.readerConfigDrawerOpen).toBe(false)
  })

  it('owns the transient error banner', () => {
    const { result } = renderHook(() => useReaderChrome('reader'))

    act(() => result.current.setReaderError('boom'))
    expect(result.current.readerError).toBe('boom')

    act(() => result.current.clearReaderError())
    expect(result.current.readerError).toBeNull()
  })
})

describe('useReaderEngagement', () => {
  it('hands a chaptered book to the library segment view instead of engaging it', async () => {
    const deps = engagementDeps()
    const { result } = renderHook(() => useReaderEngagement(deps))

    await act(async () => {
      await result.current.openReader({ ...BOOK, segment_count: 4 })
    })

    expect(deps.openSegments).toHaveBeenCalledWith({ ...BOOK, segment_count: 4 })
    expect(deps.setActiveText).not.toHaveBeenCalled()
    expect(deps.setView).not.toHaveBeenCalled()
  })

  it('engages a standalone text and leaves the pending resume position untouched', async () => {
    const deps = engagementDeps({ initialResumeFrom: 7 })
    const { result } = renderHook(() => useReaderEngagement(deps))

    await act(async () => {
      await result.current.openReader(BOOK)
    })

    expect(deps.setActiveText).toHaveBeenCalledWith(FULL_BOOK)
    expect(deps.setView).toHaveBeenCalledWith('reader')
    expect(result.current.activeSegmentCtx).toBeUndefined()
    expect(result.current.readerRereReadEnd).toBeNull()
    expect(result.current.readerResumeFrom).toBe(7)
  })

  it('engages a library-card chapter as a stand-in text carrying its chapter context', async () => {
    const deps = engagementDeps()
    const { result } = renderHook(() => useReaderEngagement(deps))

    await act(async () => {
      await result.current.openLibraryCardReader(BOOK, {
        kind: 'segment',
        segmentId: SEGMENT.id!,
        stackIndex: 5,
        resume: true,
      })
    })

    expect(deps.setActiveText).toHaveBeenCalledWith({
      id: SEGMENT.id,
      title: SEGMENT.title,
      content: SEGMENT.content,
      word_count: SEGMENT.word_count,
    })
    expect(result.current.activeSegmentCtx).toEqual({
      sourceTitle: BOOK.title,
      index: SEGMENT.order,
      total: 1,
    })
    expect(result.current.readerResumeFrom).toBe(5)
  })

  it('drops the resume position when a library card asks to start from the beginning', async () => {
    const deps = engagementDeps({ initialResumeFrom: 7 })
    const { result } = renderHook(() => useReaderEngagement(deps))

    await act(async () => {
      await result.current.openLibraryCardReader(BOOK, {
        kind: 'text',
        stackIndex: 5,
        resume: false,
      })
    })

    expect(result.current.readerResumeFrom).toBeNull()
  })

  it('carries a bookmark word offset through untouched, without tokenizing', async () => {
    // `architecture-depth/08`: this used to build the whole book's Stacks here
    // purely to convert one offset into a stack index, then discard them while
    // playback rebuilt the same Stacks off-thread. The offset now travels as an
    // offset and the Reader resolves it against the tokenization it already has.
    const deps = engagementDeps()
    const { result } = renderHook(() => useReaderEngagement(deps))

    await act(async () => {
      await result.current.openTextAtWordOffset(BOOK, 4)
    })

    expect(result.current.readerResumeFromWordOffset).toBe(4)
    expect(result.current.readerResumeFrom).toBeNull()
    expect(result.current.activeSegmentCtx).toBeUndefined()
    expect(deps.setView).toHaveBeenCalledWith('reader')
  })

  it('continues the parent book at its saved reading position', async () => {
    const deps = engagementDeps({ parentText: BOOK })
    const { result } = renderHook(() => useReaderEngagement(deps))

    await act(async () => {
      await result.current.handleContinueReadingSource()
    })

    expect(deps.setActiveText).toHaveBeenCalledWith(FULL_BOOK)
    expect(result.current.readerResumeFrom).toBe(3)
  })

  it('reports a missing record through the reader error channel', async () => {
    const deps = engagementDeps({
      dbApi: makeDbApi({ getText: vi.fn().mockResolvedValue(null) }),
    })
    const { result } = renderHook(() => useReaderEngagement(deps))

    await act(async () => {
      await result.current.openReader(BOOK)
    })

    expect(deps.setError).toHaveBeenCalledWith('Failed to open text: Text not found')
    expect(deps.setView).not.toHaveBeenCalled()
  })
})

describe('useReaderResume', () => {
  const CANDIDATE = {
    textId: 1,
    title: 'Source Book',
    stackIndex: 4,
    updatedAt: '2026-08-11T10:00:00.000Z',
  }

  function resumeDeps(overrides: Record<string, unknown> = {}) {
    return {
      dbApi: makeDbApi({ getLatestResumeCandidate: vi.fn().mockResolvedValue(CANDIDATE) }),
      texts: [BOOK],
      view: 'reader',
      setError: vi.fn(),
      engageText: vi.fn(),
      loadText: vi.fn().mockResolvedValue(FULL_BOOK),
      ...overrides,
    } as unknown as Parameters<typeof useReaderResume>[0]
  }

  it('loads the latest candidate and engages it at its saved stack', async () => {
    const deps = resumeDeps()
    const { result } = renderHook(() => useReaderResume(deps))

    await waitFor(() => expect(result.current.resumeCandidate).toEqual(CANDIDATE))

    await act(async () => {
      await result.current.resumeReader()
    })

    expect(deps.loadText).toHaveBeenCalledWith(CANDIDATE.textId)
    expect(deps.engageText).toHaveBeenCalledWith(FULL_BOOK, { resumeFrom: 4 })
  })

  it('reports a failed resume and re-reads the candidate', async () => {
    const getLatestResumeCandidate = vi.fn().mockResolvedValue(CANDIDATE)
    const deps = resumeDeps({
      dbApi: makeDbApi({ getLatestResumeCandidate }),
      loadText: vi.fn().mockRejectedValue(new Error('Text not found')),
    })
    const { result } = renderHook(() => useReaderResume(deps))

    await waitFor(() => expect(result.current.resumeCandidate).toEqual(CANDIDATE))
    getLatestResumeCandidate.mockClear()

    await act(async () => {
      await result.current.resumeReader()
    })

    expect(deps.setError).toHaveBeenCalledWith('Failed to resume text: Text not found')
    await waitFor(() => expect(getLatestResumeCandidate).toHaveBeenCalled())
  })

  it('does nothing when there is no candidate to resume', async () => {
    const deps = resumeDeps({
      dbApi: makeDbApi({ getLatestResumeCandidate: vi.fn().mockResolvedValue(null) }),
    })
    const { result } = renderHook(() => useReaderResume(deps))

    await act(async () => {
      await result.current.resumeReader()
    })

    expect(deps.engageText).not.toHaveBeenCalled()
    expect(deps.setError).not.toHaveBeenCalled()
  })
})

describe('usePostReadingSummary', () => {
  function summaryDeps(overrides: Record<string, unknown> = {}) {
    return {
      dbApi: makeDbApi(),
      activeText: FULL_BOOK,
      parentText: null,
      segments: [],
      summariesInitialized: false,
      saveSettings: vi.fn().mockResolvedValue(undefined),
      refreshTexts: vi.fn().mockResolvedValue(undefined),
      setError: vi.fn(),
      setReaderRereReadEnd: vi.fn(),
      setReaderResumeFrom: vi.fn(),
      ...overrides,
    } as unknown as Parameters<typeof usePostReadingSummary>[0]
  }

  it('defers a session end to the host override without touching summary state', () => {
    const onReadingCompleteOverride = vi.fn()
    const deps = summaryDeps({ onReadingCompleteOverride })
    const { result } = renderHook(() => usePostReadingSummary(deps))

    act(() => result.current.handleReadingComplete(0, 50, 5))

    expect(onReadingCompleteOverride).toHaveBeenCalledWith(0, 50, 5)
    expect(deps.setReaderResumeFrom).not.toHaveBeenCalled()
    expect(result.current.summaryContext).toBeNull()
  })

  it('clears the session position but stays closed while the alpha flag is off', () => {
    const deps = summaryDeps()
    const { result } = renderHook(() => usePostReadingSummary(deps))

    act(() => result.current.handleReadingComplete(0, 50, 5))

    expect(deps.setReaderRereReadEnd).toHaveBeenCalledWith(null)
    expect(deps.setReaderResumeFrom).toHaveBeenCalledWith(null)
    expect(result.current.summaryContext).toBeNull()
    expect(result.current.showSummarySetup).toBe(false)
    expect(result.current.showSummaryPrompt).toBe(false)
  })

  it('records a chapter against its parent book once the flow is enabled', () => {
    summaryFlow.enabled = true
    const chapter: TextRecord = { id: SEGMENT.id, title: SEGMENT.title, content: SEGMENT.content }
    const deps = summaryDeps({ activeText: chapter, parentText: BOOK, segments: [SEGMENT] })
    const { result } = renderHook(() => usePostReadingSummary(deps))

    act(() => result.current.handleReadingComplete(10, 50, 5))

    expect(result.current.summaryContext).toEqual({
      textId: BOOK.id,
      textTitle: BOOK.title,
      segmentId: SEGMENT.id,
      chapterTitle: SEGMENT.title,
      startWordOffset: 10,
      endWordOffset: 50,
      endStackIndex: 5,
    })
    expect(result.current.showSummarySetup).toBe(true)
    expect(result.current.showSummaryPrompt).toBe(false)
  })

  it('goes straight to the prompt for a standalone text once summaries are initialized', () => {
    summaryFlow.enabled = true
    const deps = summaryDeps({ summariesInitialized: true })
    const { result } = renderHook(() => usePostReadingSummary(deps))

    act(() => result.current.handleReadingComplete(0, 50, 5))

    expect(result.current.summaryContext).toMatchObject({
      textId: FULL_BOOK.id,
      textTitle: FULL_BOOK.title,
      segmentId: undefined,
      chapterTitle: undefined,
    })
    expect(result.current.showSummarySetup).toBe(false)
    expect(result.current.showSummaryPrompt).toBe(true)
  })

  it('saves the summary against the recorded passage and bumps the version', async () => {
    summaryFlow.enabled = true
    const dbApi = makeDbApi()
    const deps = summaryDeps({ dbApi, summariesInitialized: true })
    const { result } = renderHook(() => usePostReadingSummary(deps))

    act(() => result.current.handleReadingComplete(10, 50, 5))
    await act(async () => {
      await result.current.handleSummarySave('what I learned')
    })

    expect(dbApi.saveSummary).toHaveBeenCalledWith({
      textId: FULL_BOOK.id,
      segmentId: undefined,
      textTitle: FULL_BOOK.title,
      chapterTitle: undefined,
      content: 'what I learned',
      startWordOffset: 10,
      endWordOffset: 50,
    })
    expect(result.current.summaryVersion).toBe(1)
    expect(result.current.showSummaryPrompt).toBe(false)
    expect(result.current.summaryContext).toBeNull()
  })

  it('re-reads the passage the summary covered', () => {
    summaryFlow.enabled = true
    const deps = summaryDeps({ summariesInitialized: true })
    const { result } = renderHook(() => usePostReadingSummary(deps))

    act(() => result.current.handleReadingComplete(10, 50, 5))
    act(() => result.current.handleSummaryReread())

    expect(deps.setReaderRereReadEnd).toHaveBeenLastCalledWith(5)
    expect(result.current.summaryContext).toBeNull()
    expect(result.current.showSummaryPrompt).toBe(false)
  })

  it('carves a chapter out of the read passage and adopts it as the summary target', async () => {
    summaryFlow.enabled = true
    const dbApi = makeDbApi({
      createChapterFromPassage: vi
        .fn()
        .mockResolvedValue({ ok: true, segment: { id: 42, title: 'Carved' } }),
    })
    const deps = summaryDeps({ dbApi, summariesInitialized: true })
    const { result } = renderHook(() => usePostReadingSummary(deps))

    act(() => result.current.handleReadingComplete(10, 50, 5))
    await act(async () => {
      await expect(result.current.handleCreateChapterAndSummarize('Carved')).resolves.toEqual({
        ok: true,
      })
    })

    expect(dbApi.createChapterFromPassage).toHaveBeenCalledWith(FULL_BOOK.id, 10, 50, 'Carved')
    expect(result.current.summaryContext).toMatchObject({ segmentId: 42, chapterTitle: 'Carved' })
    expect(deps.refreshTexts).toHaveBeenCalled()
  })

  it('refuses to carve a chapter without a recorded passage', async () => {
    const deps = summaryDeps()
    const { result } = renderHook(() => usePostReadingSummary(deps))

    await act(async () => {
      await expect(result.current.handleCreateChapterAndSummarize('Carved')).resolves.toEqual({
        ok: false,
        error: 'No reading context.',
      })
    })
  })
})

describe('useReaderController', () => {
  it('composes the unchanged context value contract', async () => {
    vi.stubGlobal('api', { db: makeDbApi() })
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <NavigationProvider>
        <SettingsProvider>
          <LibraryProvider>{children}</LibraryProvider>
        </SettingsProvider>
      </NavigationProvider>
    )
    const { result } = renderHook(() => useReaderController(), { wrapper })

    await waitFor(() => expect(result.current.resumeCandidate).toBeNull())
    expect(Object.keys(result.current)).toEqual([
      'activeSegmentCtx',
      'readerRereReadEnd',
      'readerResumeFrom',
      'readerResumeFromWordOffset',
      'readerConfigDrawerOpen',
      'resumeCandidate',
      'setReaderConfigDrawerOpen',
      'summaryContext',
      'showSummarySetup',
      'showSummaryPrompt',
      'summaryVersion',
      'readerError',
      'clearReaderError',
      'openReader',
      'openLibraryCardReader',
      'openSegmentInReader',
      'openTextAtWordOffset',
      'handleContinueReadingSource',
      'refreshResumeCandidate',
      'resumeReader',
      'handleCreateChapterAndSummarize',
      'handleReadingComplete',
      'handleResumeHandled',
      'handleSummaryReread',
      'handleSummarySetupConfirm',
      'handleSummarySetupSkip',
      'handleSummarySave',
      'handleSummaryExit',
      'handleSummaryContinue',
    ])
  })
})
