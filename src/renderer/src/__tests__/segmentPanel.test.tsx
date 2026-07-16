/**
 * SegmentPanel origin vocabulary tests.
 *
 * Environment: happy-dom (matched by vitest.config.ts environmentMatchGlobs).
 */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import SegmentPanel from '../components/SegmentPanel'
import { useLibrary } from '../contexts/LibraryContext'
import { useReader } from '../contexts/ReaderContext'
import type { Bookmark, CategoryRecord, TextRecord, TextSegment } from '../types'

vi.mock('../contexts/LibraryContext', () => ({
  useLibrary: vi.fn(),
}))

vi.mock('../contexts/ReaderContext', () => ({
  useReader: vi.fn(),
}))

const useLibraryMock = vi.mocked(useLibrary)
const useReaderMock = vi.mocked(useReader)

const baseText: TextRecord = {
  id: 1,
  title: 'Library Text',
  content: 'one two three four',
  word_count: 4,
  segment_count: 2,
  category_id: 2,
}

const categories: CategoryRecord[] = [
  { id: 1, name: 'Uncategorized', is_system: true, is_locked: true },
  { id: 2, name: 'Reading', is_system: true },
  { id: 3, name: 'Archive', is_system: true },
]

const segments: TextSegment[] = [
  {
    id: 10,
    textId: 1,
    title: 'Detected Heading',
    content: 'one two three',
    order: 0,
    sourceType: 'detected_heading',
    word_count: 3,
  },
  {
    id: 11,
    textId: 1,
    title: 'Generated Slice',
    content: 'four five six',
    order: 1,
    sourceType: 'generated_chunk',
    word_count: 3,
  },
]

function installApi(bookmarks: Bookmark[] = []) {
  const api = {
    db: {
      getSummaries: vi.fn().mockResolvedValue([]),
      getBookmarks: vi.fn().mockResolvedValue(bookmarks),
      updateBookmarkLabel: vi.fn().mockResolvedValue(undefined),
      deleteBookmark: vi.fn().mockResolvedValue(undefined),
      deleteSummary: vi.fn(),
    },
  }
  ;(window as unknown as { api: unknown }).api = api
  return api
}

function renderPanel(
  parentText: TextRecord,
  bookmarks: Bookmark[] = [],
  panelSegments: TextSegment[] = segments,
  options: {
    assignTextCategory?: ReturnType<typeof vi.fn>
    categories?: CategoryRecord[]
  } = {}
) {
  const api = installApi(bookmarks)
  const handleOpenAddChapter = vi.fn()
  const assignTextCategory = options.assignTextCategory ?? vi.fn().mockResolvedValue(undefined)
  const openReader = vi.fn()
  const openTextAtWordOffset = vi.fn()

  useLibraryMock.mockReturnValue({
    parentText,
    categories: options.categories ?? categories,
    segments: panelSegments,
    assignTextCategory,
    setLibraryTab: vi.fn(),
    handleSegmentTitleChange: vi.fn(),
    handleOpenAddChapter,
    handleDeleteSegment: vi.fn(),
  } as unknown as ReturnType<typeof useLibrary>)

  useReaderMock.mockReturnValue({
    openReader,
    openSegmentInReader: vi.fn(),
    openTextAtWordOffset,
    handleContinueReadingSource: vi.fn(),
    summaryVersion: 0,
  } as unknown as ReturnType<typeof useReader>)

  render(<SegmentPanel />)

  return { api, assignTextCategory, handleOpenAddChapter, openReader, openTextAtWordOffset }
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  delete (window as unknown as { api?: unknown }).api
})

describe('SegmentPanel origin vocabulary', () => {
  it('uses contents for user texts, removes source badges, and shows Add Content', () => {
    const { handleOpenAddChapter } = renderPanel(baseText)

    expect(screen.getByRole('button', { name: 'Category: Reading' })).toBeTruthy()
    expect(screen.getByText(/2 contents/).textContent).toContain('6 words total')
    expect(screen.queryByRole('heading', { name: 'Bookmarks' })).toBeNull()
    expect(screen.queryByText('chapter')).toBeNull()
    expect(screen.queryByText('part')).toBeNull()

    const addButton = screen.getByRole('button', { name: '+ Add Content' })
    fireEvent.click(addButton)

    expect(handleOpenAddChapter).toHaveBeenCalledWith(baseText)
  })

  it('uses chapters for seeded texts and hides the Add Content affordance', () => {
    renderPanel({ ...baseText, seed_id: 'seeded-book' })

    expect(screen.getByText(/2 chapters/).textContent).toContain('6 words total')
    expect(screen.queryByRole('button', { name: '+ Add Content' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Add Chapter/i })).toBeNull()
    expect(screen.queryByText('part')).toBeNull()
  })

  it('does not render the old inline Library back button', () => {
    renderPanel(baseText)

    expect(screen.queryByRole('button', { name: 'Back to library' })).toBeNull()
    expect(screen.queryByText('← Library')).toBeNull()
  })

  it('shows a whole-text content row for user texts with no stored segments', () => {
    const emptyText = { ...baseText, segment_count: 0 }
    const { handleOpenAddChapter, openReader } = renderPanel(emptyText, [], [])

    expect(screen.getByText(/1 content/).textContent).toContain('4 words total')
    const wholeTextRow = screen.getByRole('button', { name: 'Read: Library Text' }).closest('li')!
    expect(within(wholeTextRow).getByText('Library Text')).toBeTruthy()
    expect(within(wholeTextRow).getByText(/4 words/).textContent).toContain('~1 min')
    expect(screen.queryByText(/0 contents/)).toBeNull()

    const addButton = screen.getByRole('button', { name: '+ Add Content' })
    fireEvent.click(addButton)
    expect(handleOpenAddChapter).toHaveBeenCalledWith(emptyText)

    fireEvent.click(screen.getByRole('button', { name: 'Read: Library Text' }))
    expect(openReader).toHaveBeenCalledWith(emptyText)
  })
})

describe('SegmentPanel category selector', () => {
  it('opens a contained category menu from the header', () => {
    renderPanel(baseText)

    fireEvent.click(screen.getByRole('button', { name: 'Category: Reading' }))

    const menu = screen.getByRole('menu', { name: 'Choose category' })
    expect(within(menu).getByRole('menuitemradio', { name: 'Uncategorized' })).toBeTruthy()
    expect(
      within(menu).getByRole('menuitemradio', { name: 'Reading' }).getAttribute('aria-checked')
    ).toBe('true')
    expect(within(menu).getByRole('menuitemradio', { name: 'Archive' })).toBeTruthy()
  })

  it('optimistically reassigns the parent book category through LibraryContext', async () => {
    const deferred = createDeferred<void>()
    const assignTextCategory = vi.fn().mockReturnValue(deferred.promise)
    renderPanel(baseText, [], segments, { assignTextCategory })

    fireEvent.click(screen.getByRole('button', { name: 'Category: Reading' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Archive' }))

    expect(assignTextCategory).toHaveBeenCalledWith(1, 3)
    expect(screen.getByRole('button', { name: 'Category: Archive' })).toBeTruthy()

    deferred.resolve()
    await waitFor(() => {
      expect(assignTextCategory).toHaveBeenCalledTimes(1)
    })
  })

  it('falls back to the previous category and shows an error when reassignment fails', async () => {
    const assignTextCategory = vi.fn().mockRejectedValue(new Error('write failed'))
    renderPanel(baseText, [], segments, { assignTextCategory })

    fireEvent.click(screen.getByRole('button', { name: 'Category: Reading' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Archive' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Category: Reading' })).toBeTruthy()
    })
    expect(screen.getByRole('alert').textContent).toContain(
      'Failed to update category: write failed'
    )
  })
})

describe('SegmentPanel bookmarks', () => {
  const bookmarkFixtures: Bookmark[] = [
    {
      id: 1,
      textId: 1,
      kind: 'normal',
      wordOffset: 80,
      label: 'Late normal',
      createdAt: '2026-07-12T10:00:00.000Z',
    },
    {
      id: 2,
      textId: 1,
      kind: 'goal',
      wordOffset: 60,
      label: 'Stop goal',
      createdAt: '2026-07-12T10:01:00.000Z',
    },
    {
      id: 3,
      textId: 1,
      kind: 'normal',
      wordOffset: 20,
      label: 'Early normal',
      createdAt: '2026-07-12T10:02:00.000Z',
    },
  ]

  it('renders grouped goal and saved bookmark lists and opens the source text at the offset', async () => {
    const { openTextAtWordOffset } = renderPanel(baseText, bookmarkFixtures)

    const heading = await screen.findByRole('heading', { name: 'Bookmarks' })
    const section = heading.closest('section')!
    const goalGroup = within(section)
      .getByRole('heading', { name: 'Target' })
      .closest('section')!
    const savedGroup = within(section)
      .getByRole('heading', { name: 'Saved' })
      .closest('section')!
    const readButtons = within(section).getAllByRole('button', {
      name: /Read from bookmark:/,
    })

    expect(within(goalGroup).getByRole('list')).toBeTruthy()
    expect(within(savedGroup).getByRole('list')).toBeTruthy()
    expect(
      within(goalGroup).getByRole('button', { name: 'Read from bookmark: Stop goal (Target)' })
    ).toBeTruthy()
    expect(
      within(savedGroup)
        .getAllByRole('button', { name: /Read from bookmark:/ })
        .map((button) => button.getAttribute('aria-label'))
    ).toEqual([
      'Read from bookmark: Early normal',
      'Read from bookmark: Late normal',
    ])
    expect(readButtons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Read from bookmark: Stop goal (Target)',
      'Read from bookmark: Early normal',
      'Read from bookmark: Late normal',
    ])
    expect(within(section).getAllByText('Read from')).toHaveLength(3)

    fireEvent.click(readButtons[1])
    expect(openTextAtWordOffset).toHaveBeenCalledWith(baseText, 20)
  })

  it('hides the goal group when no goal is set', async () => {
    renderPanel(baseText, bookmarkFixtures.filter((bookmark) => bookmark.kind === 'normal'))

    const heading = await screen.findByRole('heading', { name: 'Bookmarks' })
    const section = heading.closest('section')!
    const savedGroup = within(section)
      .getByRole('heading', { name: 'Saved' })
      .closest('section')!

    expect(within(section).queryByRole('heading', { name: 'Target' })).toBeNull()
    expect(
      within(savedGroup)
        .getAllByRole('button', { name: /Read from bookmark:/ })
        .map((button) => button.getAttribute('aria-label'))
    ).toEqual([
      'Read from bookmark: Early normal',
      'Read from bookmark: Late normal',
    ])
  })

  it('hides the whole bookmarks section when the text has no bookmarks', async () => {
    const { api } = renderPanel(baseText)

    await waitFor(() => {
      expect(api.db.getBookmarks).toHaveBeenCalledWith(1)
    })
    expect(screen.queryByRole('heading', { name: 'Bookmarks' })).toBeNull()
  })

  it('renames and deletes bookmarks through the bookmark API', async () => {
    const { api } = renderPanel(baseText, bookmarkFixtures)

    const heading = await screen.findByRole('heading', { name: 'Bookmarks' })
    const section = heading.closest('section')!

    fireEvent.click(within(section).getByRole('button', { name: 'Rename bookmark: Early normal' }))
    const input = within(section).getByRole('textbox', {
      name: 'Edit bookmark label: Early normal',
    })
    fireEvent.change(input, { target: { value: 'Renamed normal' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(api.db.updateBookmarkLabel).toHaveBeenCalledWith(3, 'Renamed normal')
    })
    expect(await within(section).findByText('Renamed normal')).toBeTruthy()

    fireEvent.click(within(section).getByRole('button', {
      name: 'Delete bookmark: Renamed normal',
    }))

    await waitFor(() => {
      expect(api.db.deleteBookmark).toHaveBeenCalledWith(3)
    })
    expect(within(section).queryByText('Renamed normal')).toBeNull()
  })
})
