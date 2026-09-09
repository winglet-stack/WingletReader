/**
 * TextCard interaction tests.
 *
 * Acceptance criteria covered:
 *   1. Three-zone card layout.
 *   2. Resume/Read opens resolved Reader targets.
 *   3. Category chip is display-only.
 *
 * Environment: happy-dom (matched by vitest.config.ts environmentMatchGlobs).
 */
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { CategoryRecord, TextRecord } from '../types'
import TextCard from '../components/library/TextCard'

const BOOK: TextRecord = {
  id: 7,
  title: 'My Novel',
  content: 'once upon a time',
  word_count: 4,
  segment_count: 0,
  category_id: 1,
}

const CATEGORIES: CategoryRecord[] = [
  { id: 1, name: 'Reading' },
  { id: 2, name: 'Archive' },
]

function renderCard(overrides: Partial<{
  text: TextRecord
  categories: CategoryRecord[]
  onRead: Parameters<typeof TextCard>[0]['onRead']
  onDelete: (id: number) => void
  onSegments: (t: TextRecord) => void
}> = {}) {
  const text = overrides.text ?? BOOK
  const onRead = overrides.onRead ?? vi.fn()
  const onDelete = overrides.onDelete ?? vi.fn()
  const onSegments = overrides.onSegments ?? vi.fn()
  render(
    <ul>
      <TextCard
        t={text}
        categories={overrides.categories ?? CATEGORIES}
        activeId={undefined}
        onRead={onRead}
        onDelete={onDelete}
        onSegments={onSegments}
      />
    </ul>
  )
  return { onRead, onDelete, onSegments }
}

beforeEach(() => {
  vi.stubGlobal('api', {
    db: {
      getReadingPosition: vi.fn().mockResolvedValue(null),
      getBookResumeTarget: vi.fn().mockResolvedValue(null),
    },
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('TextCard three-zone layout', () => {
  it('renders lead actions, clickable contents mid-zone, and trailing inert category', () => {
    const { onRead, onSegments } = renderCard()

    expect(screen.getByRole('button', { name: `Read "${BOOK.title}"` })).toBeTruthy()
    expect(screen.getByRole('button', { name: `View contents for "${BOOK.title}"` })).toBeTruthy()
    expect(screen.getByRole('button', { name: `Open contents for "${BOOK.title}"` })).toBeTruthy()

    const category = screen.getByLabelText('Category: Reading')
    expect(category.tagName).toBe('SPAN')
    expect(screen.queryByRole('button', { name: 'Reading' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Show \d+ more categories/ })).toBeNull()

    fireEvent.click(category)
    expect(onRead).not.toHaveBeenCalled()
    expect(onSegments).not.toHaveBeenCalled()
  })

  it('opens Contents view from the mid-zone without invoking the Reader action', () => {
    const { onRead, onSegments } = renderCard()

    fireEvent.click(screen.getByRole('button', { name: `Open contents for "${BOOK.title}"` }))

    expect(onSegments).toHaveBeenCalledOnce()
    expect(onSegments).toHaveBeenCalledWith(BOOK)
    expect(onRead).not.toHaveBeenCalled()
  })

  it('opens Contents view from the contents button without invoking the Reader action', () => {
    const { onRead, onSegments } = renderCard()

    fireEvent.click(screen.getByRole('button', { name: `View contents for "${BOOK.title}"` }))

    expect(onSegments).toHaveBeenCalledOnce()
    expect(onSegments).toHaveBeenCalledWith(BOOK)
    expect(onRead).not.toHaveBeenCalled()
  })
})

describe('TextCard segment vocabulary', () => {
  it('renders user text segments as contents', () => {
    const text = { ...BOOK, segment_count: 2 }
    const { onSegments } = renderCard({ text })

    expect(screen.getByText(/4 words/).textContent).toContain('2 contents')
    const viewButton = screen.getByRole('button', { name: `View contents for "${text.title}"` })
    expect(viewButton.getAttribute('title')).toBe('View contents')

    fireEvent.click(viewButton)

    expect(onSegments).toHaveBeenCalledWith(text)
  })

  it('renders seeded text segments as chapters', () => {
    const text = { ...BOOK, seed_id: 'default-book', segment_count: 3 }
    renderCard({ text })

    expect(screen.getByText(/4 words/).textContent).toContain('3 chapters')
    expect(screen.getByRole('button', { name: `View chapters for "${text.title}"` }).getAttribute('title'))
      .toBe('View chapters')
  })

  it('renders EPUB book segments as chapters', () => {
    // ADR-0034 §8: the publisher resolved these chapters, so the card says so —
    // no seed_id involved.
    const text = { ...BOOK, source_type: 'epub' as const, segment_count: 86 }
    renderCard({ text })

    expect(screen.getByText(/4 words/).textContent).toContain('86 chapters')
    expect(screen.getByRole('button', { name: `View chapters for "${text.title}"` }).getAttribute('title'))
      .toBe('View chapters')
  })

  it('keeps contents wording for the other import source types', () => {
    const text = { ...BOOK, source_type: 'pdf' as const, segment_count: 2 }
    renderCard({ text })

    expect(screen.getByText(/4 words/).textContent).toContain('2 contents')
  })

  it('shows the segment view action when no segments are present', () => {
    const { onSegments } = renderCard()

    const viewButton = screen.getByRole('button', { name: `View contents for "${BOOK.title}"` })
    expect(viewButton.getAttribute('title')).toBe('View contents')
    expect(screen.getByText(/4 words/).textContent).not.toContain('contents')

    fireEvent.click(viewButton)

    expect(onSegments).toHaveBeenCalledWith(BOOK)
  })

  it('does not render the old card add shortcut', () => {
    renderCard({ text: { ...BOOK, segment_count: 2 } })

    expect(screen.queryByRole('button', { name: /Add chapter/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Add content/i })).toBeNull()
  })
})

describe('TextCard delete action', () => {
  it('marks the card as removing before calling onDelete', () => {
    vi.useFakeTimers()
    const { onDelete } = renderCard()

    fireEvent.click(screen.getByRole('button', { name: `Delete "${BOOK.title}"` }))

    expect(screen.getByRole('listitem').className).toContain('text-card-removing')
    expect(onDelete).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(150)
    })

    expect(onDelete).toHaveBeenCalledWith(BOOK.id)
    expect(onDelete).toHaveBeenCalledOnce()
  })
})

describe('TextCard Resume routing', () => {
  it('labels and routes a single-segment saved position through getReadingPosition', async () => {
    vi.mocked(window.api.db.getReadingPosition).mockResolvedValue({
      textId: BOOK.id!,
      stackIndex: 12,
      updatedAt: '2026-07-13T10:00:00.000Z',
      source: 'text',
    })
    const { onRead, onSegments } = renderCard()

    const resumeButton = await screen.findByRole('button', { name: `Resume "${BOOK.title}"` })
    fireEvent.click(resumeButton)

    await waitFor(() => {
      expect(onRead).toHaveBeenCalledWith(BOOK, {
        kind: 'text',
        stackIndex: 12,
        resume: true,
      })
    })
    expect(onSegments).not.toHaveBeenCalled()
    expect(window.api.db.getBookResumeTarget).not.toHaveBeenCalled()
  })

  it('labels and routes a segmented saved position through getBookResumeTarget', async () => {
    const text = { ...BOOK, segment_count: 3 }
    vi.mocked(window.api.db.getBookResumeTarget).mockResolvedValue({
      segmentId: 44,
      stackIndex: 8,
      resume: true,
    })
    const { onRead, onSegments } = renderCard({ text })

    const resumeButton = await screen.findByRole('button', { name: `Resume "${text.title}"` })
    fireEvent.click(resumeButton)

    await waitFor(() => {
      expect(onRead).toHaveBeenCalledWith(text, {
        kind: 'segment',
        segmentId: 44,
        stackIndex: 8,
        resume: true,
      })
    })
    expect(onSegments).not.toHaveBeenCalled()
    expect(window.api.db.getReadingPosition).not.toHaveBeenCalled()
  })

  it('labels a fresh segmented target as Read', async () => {
    const text = { ...BOOK, segment_count: 2 }
    vi.mocked(window.api.db.getBookResumeTarget).mockResolvedValue({
      segmentId: 21,
      stackIndex: 0,
      resume: false,
    })
    const { onRead } = renderCard({ text })

    const readButton = await screen.findByRole('button', { name: `Read "${text.title}"` })
    fireEvent.click(readButton)

    await waitFor(() => {
      expect(onRead).toHaveBeenCalledWith(text, {
        kind: 'segment',
        segmentId: 21,
        stackIndex: 0,
        resume: false,
      })
    })
  })
})
