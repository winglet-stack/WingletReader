import React, { useState } from 'react'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { segmentText } from '../engine/textSegmenter'
import { NavigationProvider } from '../contexts/NavigationContext'
import {
  useLibraryCatalog,
  useLibraryController,
  useLibraryImportActions,
  useLibrarySelection,
  usePendingTextDelete,
} from '../contexts/library/useLibraryController'
import type { CategoryRecord, TextRecord, TextSegment } from '../types'

vi.mock('../engine/textSegmenter', () => ({
  segmentText: vi.fn(),
}))

const TEXTS: TextRecord[] = [
  { id: 1, title: 'First', content: 'one', word_count: 1 },
  { id: 2, title: 'Second', content: 'two', word_count: 1 },
]

const CATEGORIES: CategoryRecord[] = [
  { id: 1, name: 'Uncategorized', is_system: true, is_locked: true },
  { id: 2, name: 'Reading', is_system: true },
]

const SEGMENTS: TextSegment[] = [
  {
    id: 10,
    textId: 1,
    title: 'Chapter One',
    content: 'one',
    order: 0,
    sourceType: 'detected_heading',
    word_count: 1,
  },
  {
    id: 11,
    textId: 1,
    title: 'Chapter Two',
    content: 'two',
    order: 1,
    sourceType: 'detected_heading',
    word_count: 1,
  },
]

const PROCESSING_DISABLED = {
  segmentation_enabled: false,
  auto_chapter_detection: false,
  segmentation_threshold: 5000,
  segmentation_chunk_size: 1500,
}

function makeDbApi(overrides: Record<string, unknown> = {}): Window['api']['db'] {
  return {
    getTexts: vi.fn().mockResolvedValue(TEXTS),
    getCategories: vi.fn().mockResolvedValue(CATEGORIES),
    saveCategory: vi.fn(),
    deleteCategory: vi.fn(),
    assignTextCategory: vi.fn(),
    getSegments: vi.fn().mockResolvedValue([]),
    saveText: vi.fn(),
    saveSegments: vi.fn(),
    deleteText: vi.fn().mockResolvedValue(undefined),
    deleteSegment: vi.fn(),
    updateSegmentTitle: vi.fn(),
    ...overrides,
  } as unknown as Window['api']['db']
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

beforeEach(() => {
  vi.mocked(segmentText).mockReset()
})

describe('useLibraryCatalog', () => {
  it('loads the text/category projections and refreshes after a category mutation', async () => {
    const created = { id: 4, name: 'Research' }
    const dbApi = makeDbApi({
      saveCategory: vi.fn().mockResolvedValue(created),
    })
    const setError = vi.fn()
    const { result } = renderHook(() => useLibraryCatalog(dbApi, setError))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.texts).toEqual(TEXTS)
    expect(result.current.categories).toEqual(CATEGORIES)

    await act(async () => {
      await expect(result.current.createCategory('Research')).resolves.toEqual(created)
    })

    expect(dbApi.saveCategory).toHaveBeenCalledWith({ name: 'Research' })
    expect(dbApi.getCategories).toHaveBeenCalledTimes(2)
    expect(setError).not.toHaveBeenCalled()
  })

  it('keeps the system category fallback for older bridge contracts', async () => {
    const dbApi = makeDbApi()
    delete (dbApi as { getCategories?: unknown }).getCategories
    const { result } = renderHook(() => useLibraryCatalog(dbApi, vi.fn()))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.categories.map((category) => category.name)).toEqual([
      'Uncategorized',
      'Reading',
      'Archive',
    ])
  })
})

describe('useLibrarySelection', () => {
  it('lands a text in the chapters view after loading its segments', async () => {
    const dbApi = makeDbApi({ getSegments: vi.fn().mockResolvedValue(SEGMENTS) })
    const setView = vi.fn()
    const { result } = renderHook(() =>
      useLibrarySelection(dbApi, setView, vi.fn(), vi.fn(), null)
    )

    await act(async () => {
      await result.current.openSegments(TEXTS[0])
    })

    expect(result.current.parentText).toEqual(TEXTS[0])
    expect(result.current.segments).toEqual(SEGMENTS)
    expect(result.current.libraryTab).toBe('chapters')
    expect(setView).toHaveBeenCalledWith('library')
  })
})

describe('usePendingTextDelete', () => {
  it('owns the optimistic removal and undo window directly', async () => {
    vi.useFakeTimers()
    const dbApi = makeDbApi()
    const clearDeletedTextDestinations = vi.fn()
    const { result } = renderHook(() => {
      const [texts, setTexts] = useState(TEXTS)
      const deletion = usePendingTextDelete(
        dbApi,
        texts,
        setTexts,
        clearDeletedTextDestinations,
        vi.fn(),
        vi.fn()
      )
      return { texts, ...deletion }
    })

    await act(async () => {
      await result.current.handleDelete(1)
    })
    expect(result.current.texts).toEqual([TEXTS[1]])
    expect(result.current.pendingDelete?.text).toEqual(TEXTS[0])
    expect(clearDeletedTextDestinations).toHaveBeenCalledWith(1)

    act(() => result.current.undoDelete())
    expect(result.current.texts).toEqual(TEXTS)
    expect(result.current.pendingDelete).toBeNull()
    expect(dbApi.deleteText).not.toHaveBeenCalled()
  })
})

describe('useLibraryImportActions', () => {
  it('builds the saved payload and lands an unsegmented import in the reader', async () => {
    const saved = { id: 7, title: 'Imported', content: 'body', word_count: 1 }
    const dbApi = makeDbApi({ saveText: vi.fn().mockResolvedValue(saved) })
    const setView = vi.fn()
    const setTexts = vi.fn()
    const setActiveText = vi.fn()
    const { result } = renderHook(() =>
      useLibraryImportActions(
        dbApi,
        setView,
        vi.fn(),
        setTexts,
        setActiveText,
        vi.fn(),
        vi.fn(),
        vi.fn()
      )
    )

    await act(async () => {
      await result.current.handleImportSave(
        'Imported',
        'body',
        { sourceType: 'pdf', pageCount: 3, html: '<p>body</p>' },
        PROCESSING_DISABLED,
        2
      )
    })

    expect(dbApi.saveText).toHaveBeenCalledWith({
      title: 'Imported',
      content: 'body',
      category_id: 2,
      source_type: 'pdf',
      page_count: 3,
      content_html: '<p>body</p>',
    })
    expect(setTexts).toHaveBeenCalledWith(expect.any(Function))
    expect(setActiveText).toHaveBeenCalledWith(saved)
    expect(setView).toHaveBeenCalledWith('reader')
  })

  it('lands a segmented import in chapters with the refreshed list projection', async () => {
    const saved = { id: 7, title: 'Imported', content: 'body', word_count: 1 }
    const refreshed = [{ ...saved, segment_count: 2 }]
    const dbApi = makeDbApi({
      saveText: vi.fn().mockResolvedValue(saved),
      saveSegments: vi.fn().mockResolvedValue(SEGMENTS),
      getTexts: vi.fn().mockResolvedValue(refreshed),
    })
    vi.mocked(segmentText).mockReturnValue(
      SEGMENTS.map(({ id: _id, textId: _textId, ...draft }) => draft)
    )
    const setView = vi.fn()
    const setTexts = vi.fn()
    const setActiveText = vi.fn()
    const setParentText = vi.fn()
    const setSegments = vi.fn()
    const setLibraryTab = vi.fn()
    const { result } = renderHook(() =>
      useLibraryImportActions(
        dbApi,
        setView,
        vi.fn(),
        setTexts,
        setActiveText,
        setParentText,
        setSegments,
        setLibraryTab
      )
    )

    await act(async () => {
      await result.current.handleImportSave(
        'Imported',
        'body',
        undefined,
        { ...PROCESSING_DISABLED, segmentation_enabled: true, segmentation_threshold: 0 }
      )
    })

    expect(dbApi.saveSegments).toHaveBeenCalledWith(7, expect.any(Array))
    expect(setTexts).toHaveBeenCalledWith(refreshed)
    expect(setParentText).toHaveBeenCalledWith({ ...saved, segment_count: 2 })
    expect(setSegments).toHaveBeenCalledWith(SEGMENTS)
    expect(setLibraryTab).toHaveBeenCalledWith('chapters')
    expect(setActiveText).not.toHaveBeenCalled()
    expect(setView).toHaveBeenCalledWith('library')
  })
})

describe('useLibraryController', () => {
  it('composes the unchanged context value contract', async () => {
    const dbApi = makeDbApi()
    vi.stubGlobal('api', { db: dbApi })
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <NavigationProvider>{children}</NavigationProvider>
    )
    const { result } = renderHook(() => useLibraryController(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(Object.keys(result.current)).toEqual([
      'texts',
      'categories',
      'activeText',
      'segments',
      'parentText',
      'libraryTab',
      'addChapterTarget',
      'pendingDelete',
      'loading',
      'error',
      'clearError',
      'openSegments',
      'handleDelete',
      'undoDelete',
      'handleImportSave',
      'createCategory',
      'renameCategory',
      'deleteCategory',
      'assignTextCategory',
      'handleDeleteSegment',
      'handleSegmentTitleChange',
      'handleOpenAddChapter',
      'handleAddChapterSaved',
      'setLibraryTab',
      'setActiveText',
      'setAddChapterTarget',
      'refreshTexts',
      'refreshCategories',
    ])
  })
})
