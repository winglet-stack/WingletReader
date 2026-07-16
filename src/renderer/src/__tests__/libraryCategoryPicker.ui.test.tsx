import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { CategoryRecord, TextRecord } from '../types'

const readerOpenMock = vi.hoisted(() => vi.fn())
const libraryValue = vi.hoisted(() => ({ current: null as any }))
const openTransmuteForTextMock = vi.hoisted(() => vi.fn())

vi.mock('../contexts/ReaderContext', () => ({
  useReader: () => ({ openLibraryCardReader: readerOpenMock }),
}))

vi.mock('../contexts/LibraryContext', () => ({
  useLibrary: () => libraryValue.current,
}))

vi.mock('../contexts/NavigationContext', () => ({
  useNavigation: () => ({ setView: vi.fn(), openTransmuteForText: openTransmuteForTextMock }),
}))

import Library from '../components/Library'
import ReaderLibraryBrowse from '../components/reader/ReaderLibraryBrowse'

const categories: CategoryRecord[] = [
  { id: 1, name: 'Uncategorized', is_system: true, is_locked: true },
  { id: 2, name: 'Reading', is_system: true },
  { id: 3, name: 'Archive', is_system: true },
  { id: 4, name: 'Research' },
  { id: 5, name: 'Reference' },
  { id: 6, name: 'Work' },
]

const texts: TextRecord[] = [
  {
    id: 101,
    title: 'Book One',
    content: 'one',
    word_count: 1,
    category_id: 2,
    segment_count: 2,
  },
  {
    id: 102,
    title: 'Book Two',
    content: 'two',
    word_count: 1,
    category_id: 3,
    segment_count: 2,
  },
]

function cardFor(title: string): HTMLElement {
  const openButton = screen.getByRole('button', { name: `Open contents for "${title}"` })
  const card = openButton.closest('li')
  if (!card) throw new Error(`Missing card for ${title}`)
  return card
}

function renderLibrary(assignTextCategory = vi.fn().mockResolvedValue(undefined)) {
  return renderLibraryWithTexts(texts, <Library />, assignTextCategory)
}

function renderLibraryWithTexts(
  nextTexts: TextRecord[],
  ui: React.ReactElement = <Library />,
  assignTextCategory = vi.fn().mockResolvedValue(undefined)
) {
  libraryValue.current = {
    texts: nextTexts,
    categories,
    activeText: null,
    handleDelete: vi.fn(),
    setLibraryTab: vi.fn(),
    openSegments: vi.fn(),
    handleOpenAddChapter: vi.fn(),
    createCategory: vi.fn(),
    renameCategory: vi.fn(),
    deleteCategory: vi.fn(),
    assignTextCategory,
    pendingDelete: null,
    undoDelete: vi.fn(),
  }
  render(ui)
  return { assignTextCategory }
}

beforeEach(() => {
  readerOpenMock.mockReset()
  vi.stubGlobal('api', {
    db: {
      getReadingPosition: vi.fn().mockResolvedValue(null),
      getBookResumeTarget: vi.fn().mockResolvedValue(null),
    },
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('Library text-card category chip', () => {
  it('shows only the assigned category as inert display', () => {
    renderLibrary()

    const card = within(cardFor('Book One'))
    const category = card.getByLabelText('Category: Reading')

    expect(category.tagName).toBe('SPAN')
    expect(card.queryByRole('button', { name: 'Reading' })).toBeNull()
    expect(card.queryByRole('button', { name: 'Uncategorized' })).toBeNull()
    expect(card.queryByRole('button', { name: 'Archive' })).toBeNull()
    expect(card.queryByRole('button', { name: /Show \d+ more categories/ })).toBeNull()
  })

  it('does not call the assign API when the category chip is clicked', () => {
    const { assignTextCategory } = renderLibrary()
    const card = within(cardFor('Book One'))

    fireEvent.click(card.getByLabelText('Category: Reading'))

    expect(assignTextCategory).not.toHaveBeenCalled()
  })
})

describe('Library category filter toolbar', () => {
  it('does not repeat the active category or show a result count when All is selected', () => {
    renderLibrary()

    expect(screen.queryByText('All categories')).toBeNull()
    expect(screen.queryByText(/^\d+ results?$/)).toBeNull()
  })

  it('shows the result count on the tab row when a category filter is active', () => {
    renderLibrary()

    fireEvent.click(screen.getByRole('tab', { name: 'Reading' }))

    const count = screen.getByRole('status')
    expect(count.textContent).toBe('1 result')
    expect(count.className).toBe('library-category-count')
    expect(screen.queryByText('All categories')).toBeNull()
    expect(count.closest('.library-category-tabs-row')).toBeTruthy()
  })

  it('shows the result count on the tab row when search narrows the list', () => {
    renderLibrary()

    fireEvent.change(screen.getByLabelText('Search library'), { target: { value: 'Book One' } })

    const count = screen.getByRole('status')
    expect(count.textContent).toBe('1 result')
    expect(count.closest('.library-category-tabs-row')).toBeTruthy()
  })
})

describe('Library segment vocabulary hosts', () => {
  it('renders origin-based segment vocabulary in standalone Library', () => {
    renderLibraryWithTexts([
      { ...texts[0], segment_count: 2 },
      { ...texts[1], seed_id: 'default-book', segment_count: 3 },
    ])

    expect(cardFor('Book One').textContent).toContain('2 contents')
    expect(screen.getByRole('button', { name: 'View contents for "Book One"' })).toBeTruthy()
    expect(cardFor('Book Two').textContent).toContain('3 chapters')
    expect(screen.getByRole('button', { name: 'View chapters for "Book Two"' })).toBeTruthy()
  })

  it('renders the same TextCard vocabulary in the in-frame Reader browse', () => {
    renderLibraryWithTexts(
      [{ ...texts[0], segment_count: 2 }],
      <ReaderLibraryBrowse />
    )

    expect(cardFor('Book One').textContent).toContain('2 contents')
    expect(screen.getByRole('button', { name: 'View contents for "Book One"' })).toBeTruthy()
  })
})
