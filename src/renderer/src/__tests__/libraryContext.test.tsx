/**
 * LibraryContext tests.
 * Environment: happy-dom (matched by vitest.config.ts environmentMatchGlobs).
 */
import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import { NavigationProvider } from '../contexts/NavigationContext'
import { SettingsProvider } from '../contexts/SettingsContext'
import { LibraryProvider, useLibrary } from '../contexts/LibraryContext'
import type { TextRecord } from '../types'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SAMPLE_TEXTS: TextRecord[] = [
  { id: 1, title: 'Book One', content: 'hello', word_count: 1 },
  { id: 2, title: 'Book Two', content: 'world', word_count: 1 },
]

const SAMPLE_CATEGORIES = [
  { id: 1, name: 'Uncategorized', is_system: true, is_locked: true },
  { id: 2, name: 'Reading', is_system: true },
]

function makeApi(overrides: Record<string, unknown> = {}) {
  return {
    db: {
      getTexts: vi.fn().mockResolvedValue(SAMPLE_TEXTS),
      getText: vi.fn(),
      saveText: vi.fn(),
      deleteText: vi.fn().mockResolvedValue(undefined),
      getCategories: vi.fn().mockResolvedValue(SAMPLE_CATEGORIES),
      saveCategory: vi.fn(),
      deleteCategory: vi.fn(),
      assignTextCategory: vi.fn(),
      getSegments: vi.fn().mockResolvedValue([]),
      saveSegments: vi.fn(),
      deleteSegment: vi.fn(),
      updateSegmentTitle: vi.fn(),
      getSettings: vi.fn().mockResolvedValue({}),
      saveSettings: vi.fn().mockResolvedValue({}),
      ...overrides,
    },
  }
}

function dbApi() {
  return (window as unknown as { api: ReturnType<typeof makeApi> }).api.db
}

beforeEach(() => {
  vi.stubGlobal('api', makeApi())
})

async function renderWithLibrary(ui: React.ReactElement) {
  await act(async () => {
    render(
      <NavigationProvider>
        <SettingsProvider>
          <LibraryProvider>
            {ui}
          </LibraryProvider>
        </SettingsProvider>
      </NavigationProvider>
    )
  })
}

// ── Consumer helper ───────────────────────────────────────────────────────────

function TextsDisplay() {
  const { texts, loading } = useLibrary()
  if (loading) return <p>loading</p>
  return (
    <ul>
      {texts.map((t) => <li key={t.id}>{t.title}</li>)}
    </ul>
  )
}

function ActiveTextDisplay() {
  const { activeText, setActiveText } = useLibrary()
  return (
    <div>
      <span data-testid="active">{activeText?.title ?? 'none'}</span>
      <button onClick={() => setActiveText({ id: 99, title: 'Set Title', content: '', word_count: 0 })}>
        set
      </button>
      <button onClick={() => setActiveText(null)}>clear</button>
    </div>
  )
}

function DeleteButton({ id = 1 }: { id?: number }) {
  const { handleDelete } = useLibrary()
  return <button onClick={() => { void handleDelete(id) }}>delete {id}</button>
}

function UndoDeleteButton() {
  const { pendingDelete, undoDelete } = useLibrary()
  if (!pendingDelete) return null
  return <button onClick={undoDelete}>undo {pendingDelete.text.title}</button>
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LibraryContext — initial load', () => {
  it('loads texts on mount', async () => {
    await renderWithLibrary(<TextsDisplay />)
    expect(screen.getByText('Book One')).toBeTruthy()
    expect(screen.getByText('Book Two')).toBeTruthy()
    expect(dbApi().getTexts).toHaveBeenCalledTimes(1)
  })

  it('shows loading state before texts arrive', async () => {
    let resolve!: (v: TextRecord[]) => void
    vi.mocked(dbApi().getTexts).mockReturnValue(new Promise((r) => { resolve = r }))
    render(
      <NavigationProvider>
        <SettingsProvider>
          <LibraryProvider>
            <TextsDisplay />
          </LibraryProvider>
        </SettingsProvider>
      </NavigationProvider>
    )
    expect(screen.getByText('loading')).toBeTruthy()
    await act(async () => { resolve([]) })
    expect(screen.queryByText('loading')).toBeNull()
  })
})

describe('LibraryContext — handleDelete', () => {
  it('removes text optimistically and commits delete after the undo window', async () => {
    vi.useFakeTimers()
    vi.mocked(dbApi().deleteText).mockResolvedValue(undefined)

    await renderWithLibrary(
      <>
        <TextsDisplay />
        <DeleteButton id={1} />
      </>
    )

    expect(screen.getByText('Book One')).toBeTruthy()

    await act(async () => {
      screen.getByRole('button', { name: 'delete 1' }).click()
    })

    expect(screen.queryByText('Book One')).toBeNull()
    expect(screen.getByText('Book Two')).toBeTruthy()
    expect(dbApi().deleteText).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(6000)
      await Promise.resolve()
    })

    expect(dbApi().deleteText).toHaveBeenCalledWith(1)
    expect(dbApi().deleteText).toHaveBeenCalledTimes(1)
  })

  it('restores pending deleted text when undo is clicked', async () => {
    vi.useFakeTimers()
    vi.mocked(dbApi().deleteText).mockResolvedValue(undefined)

    await renderWithLibrary(
      <>
        <TextsDisplay />
        <DeleteButton id={1} />
        <UndoDeleteButton />
      </>
    )

    await act(async () => {
      screen.getByRole('button', { name: 'delete 1' }).click()
    })

    expect(screen.queryByText('Book One')).toBeNull()
    expect(screen.getByRole('button', { name: 'undo Book One' })).toBeTruthy()

    await act(async () => {
      screen.getByRole('button', { name: 'undo Book One' }).click()
    })

    expect(screen.getByText('Book One')).toBeTruthy()

    await act(async () => {
      vi.advanceTimersByTime(6000)
      await Promise.resolve()
    })

    expect(dbApi().deleteText).not.toHaveBeenCalled()
  })

  it('commits the previous pending delete when a second text is deleted', async () => {
    vi.useFakeTimers()
    vi.mocked(dbApi().deleteText).mockResolvedValue(undefined)

    await renderWithLibrary(
      <>
        <TextsDisplay />
        <DeleteButton id={1} />
        <DeleteButton id={2} />
      </>
    )

    await act(async () => {
      screen.getByRole('button', { name: 'delete 1' }).click()
    })

    expect(screen.queryByText('Book One')).toBeNull()
    expect(dbApi().deleteText).not.toHaveBeenCalled()

    await act(async () => {
      screen.getByRole('button', { name: 'delete 2' }).click()
      await Promise.resolve()
    })

    expect(screen.queryByText('Book Two')).toBeNull()
    expect(dbApi().deleteText).toHaveBeenCalledWith(1)
    expect(dbApi().deleteText).toHaveBeenCalledTimes(1)

    await act(async () => {
      vi.advanceTimersByTime(6000)
      await Promise.resolve()
    })

    expect(dbApi().deleteText).toHaveBeenCalledWith(2)
    expect(dbApi().deleteText).toHaveBeenCalledTimes(2)
  })
})

describe('LibraryContext — setActiveText', () => {
  it('updates activeText when setActiveText is called', async () => {
    await renderWithLibrary(<ActiveTextDisplay />)

    expect(screen.getByTestId('active').textContent).toBe('none')

    await act(async () => {
      screen.getByRole('button', { name: 'set' }).click()
    })

    expect(screen.getByTestId('active').textContent).toBe('Set Title')
  })

  it('clears activeText when setActiveText(null) is called', async () => {
    await renderWithLibrary(<ActiveTextDisplay />)

    await act(async () => {
      screen.getByRole('button', { name: 'set' }).click()
    })
    expect(screen.getByTestId('active').textContent).toBe('Set Title')

    await act(async () => {
      screen.getByRole('button', { name: 'clear' }).click()
    })
    expect(screen.getByTestId('active').textContent).toBe('none')
  })
})

describe('LibraryContext — useLibrary guard', () => {
  it('throws when useLibrary is called outside LibraryProvider', () => {
    function BadComponent() {
      useLibrary()
      return null
    }
    expect(() => {
      render(<BadComponent />)
    }).toThrow('useLibrary must be used within a LibraryProvider')
  })
})
