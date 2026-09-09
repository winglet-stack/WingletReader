/**
 * Unit tests for `useBookmarkCollection` — the bookmark list for one text.
 * Covers loading, the one-goal-at-a-time merge, the refusal hook a draft can
 * install, delete, the outcome a write reports, and forgetting a Target the
 * store already lost.
 *
 * The collection is **Reader-owned** since `architecture-depth/12`: it no longer
 * takes change callbacks or a consumed-id prop, because nothing is pushed back
 * up to a parent any more.
 *
 * Environment: happy-dom (vitest.config.ts environmentMatchGlobs).
 */

import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { useBookmarkCollection } from '../hooks/useBookmarkCollection'
import type { Bookmark } from '../types'

afterEach(cleanup)

function bookmark(patch: Partial<Bookmark> & { id: number }): Bookmark {
  return {
    textId: 7,
    kind: 'normal',
    wordOffset: 2,
    label: `Bookmark ${patch.id}`,
    createdAt: '2026-08-11T00:00:00.000Z',
    ...patch,
  }
}

function stubApi(stored: Bookmark[] = [], overrides: Record<string, unknown> = {}) {
  let nextId = 100
  const api = {
    db: {
      getBookmarks: vi.fn().mockResolvedValue(stored),
      saveBookmark: vi.fn((textId: number, draft: object) =>
        Promise.resolve({
          ...(draft as object),
          id: nextId++,
          textId,
          createdAt: '2026-08-11T00:00:00.000Z',
        })
      ),
      deleteBookmark: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    },
  }
  vi.stubGlobal('api', api)
  return api
}

interface HarnessProps {
  textId?: number | null
  refuse?: boolean
  onWritten?: (saved: boolean) => void
}

function Harness({ textId = 7, refuse = false, onWritten = () => {} }: HarnessProps) {
  const collection = useBookmarkCollection({ textId })

  return (
    <div>
      <ul>
        {collection.bookmarks.map((entry) => (
          <li key={entry.id}>{`${entry.kind}:${entry.label}`}</li>
        ))}
      </ul>
      <span data-testid="error">{collection.error ?? ''}</span>
      <span data-testid="saving">{String(collection.saving)}</span>
      <span data-testid="deleting">{String(collection.deletingId)}</span>
      <span data-testid="goal">{collection.goalBookmark?.label ?? 'none'}</span>
      <span data-testid="has">{String(collection.hasBookmarks)}</span>
      <button
        onClick={() =>
          void collection
            .createBookmark({
              kind: 'normal',
              wordOffset: 4,
              label: 'Fresh',
              validate: refuse ? () => Promise.resolve(false) : undefined,
            })
            .then(onWritten)
        }
      >
        create
      </button>
      <button
        onClick={() =>
          void collection.createBookmark({ kind: 'goal', wordOffset: 9, label: 'New goal' })
        }
      >
        create goal
      </button>
      <button onClick={() => void collection.deleteBookmark(collection.bookmarks[0])}>
        delete first
      </button>
      <button onClick={() => collection.forget(5)}>forget 5</button>
    </div>
  )
}

const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const rows = () => screen.queryAllByRole('listitem').map((item) => item.textContent)

describe('useBookmarkCollection', () => {
  it('loads the stored bookmarks for the text', async () => {
    const api = stubApi([bookmark({ id: 1, label: 'Early turn' })])

    render(<Harness />)
    await act(async () => {})

    expect(api.db.getBookmarks).toHaveBeenCalledWith(7)
    expect(rows()).toEqual(['normal:Early turn'])
    expect(screen.getByTestId('has').textContent).toBe('true')
  })

  it('stays empty and asks for nothing without a text id', async () => {
    const api = stubApi([bookmark({ id: 1 })])

    render(<Harness textId={null} />)
    await act(async () => {})

    expect(api.db.getBookmarks).not.toHaveBeenCalled()
    expect(rows()).toEqual([])
    expect(screen.getByTestId('has').textContent).toBe('false')
  })

  it('appends a created bookmark and reports the save', async () => {
    const api = stubApi()
    const onWritten = vi.fn()

    render(<Harness onWritten={onWritten} />)
    await act(async () => {})
    await act(async () => { click('create') })

    expect(api.db.saveBookmark).toHaveBeenCalledWith(7, {
      kind: 'normal',
      wordOffset: 4,
      label: 'Fresh',
    })
    expect(rows()).toEqual(['normal:Fresh'])
    expect(onWritten).toHaveBeenCalledWith(true)
    expect(screen.getByTestId('saving').textContent).toBe('false')
  })

  it('replaces the existing goal when a new one is saved', async () => {
    stubApi([bookmark({ id: 1, kind: 'goal', label: 'Old goal' }), bookmark({ id: 2 })])

    render(<Harness />)
    await act(async () => {})
    await act(async () => { click('create goal') })

    expect(rows()).toEqual(['normal:Bookmark 2', 'goal:New goal'])
    expect(screen.getByTestId('goal').textContent).toBe('New goal')
  })

  it('cancels the write when the draft rule refuses it', async () => {
    const api = stubApi()
    const onWritten = vi.fn()

    render(<Harness refuse onWritten={onWritten} />)
    await act(async () => {})
    await act(async () => { click('create') })

    expect(api.db.saveBookmark).not.toHaveBeenCalled()
    expect(onWritten).toHaveBeenCalledWith(false)
    expect(rows()).toEqual([])
    expect(screen.getByTestId('saving').textContent).toBe('false')
  })

  it('reports a failed write without dropping the list', async () => {
    stubApi([bookmark({ id: 1, label: 'Early turn' })], {
      saveBookmark: vi.fn().mockRejectedValue(new Error('nope')),
    })
    const onWritten = vi.fn()

    render(<Harness onWritten={onWritten} />)
    await act(async () => {})
    await act(async () => { click('create') })

    expect(screen.getByTestId('error').textContent).toBe('Could not save bookmark.')
    expect(onWritten).toHaveBeenCalledWith(false)
    expect(rows()).toEqual(['normal:Early turn'])
  })

  it('deletes a row through the bookmark API', async () => {
    const api = stubApi([bookmark({ id: 1, label: 'Early turn' }), bookmark({ id: 2 })])

    render(<Harness />)
    await act(async () => {})
    await act(async () => { click('delete first') })

    expect(api.db.deleteBookmark).toHaveBeenCalledWith(1)
    expect(rows()).toEqual(['normal:Bookmark 2'])
    expect(screen.getByTestId('deleting').textContent).toBe('null')
  })

  it('reports a failed delete and keeps the row', async () => {
    stubApi([bookmark({ id: 1, label: 'Early turn' })], {
      deleteBookmark: vi.fn().mockRejectedValue(new Error('nope')),
    })

    render(<Harness />)
    await act(async () => {})
    await act(async () => { click('delete first') })

    expect(screen.getByTestId('error').textContent).toBe('Could not delete bookmark.')
    expect(rows()).toEqual(['normal:Early turn'])
  })

  it('forgets a goal the session consumed without calling delete', async () => {
    const api = stubApi([bookmark({ id: 5, kind: 'goal', label: 'Session goal' })])

    render(<Harness />)
    await act(async () => {})
    expect(rows()).toEqual(['goal:Session goal'])

    await act(async () => { click('forget 5') })

    expect(rows()).toEqual([])
    expect(screen.getByTestId('goal').textContent).toBe('none')
    expect(api.db.deleteBookmark).not.toHaveBeenCalled()
  })

  it('exposes the active goal directly instead of announcing it upward', async () => {
    stubApi([bookmark({ id: 1 }), bookmark({ id: 5, kind: 'goal', label: 'Session goal' })])

    render(<Harness />)
    await act(async () => {})

    // The Reader reads the goal off the collection it owns; there is no
    // change-callback round trip left to assert (`architecture-depth/12`).
    expect(rows()).toEqual(['normal:Bookmark 1', 'goal:Session goal'])
    expect(screen.getByTestId('goal').textContent).toBe('Session goal')
  })

  it('empties the list when the bookmark API is unavailable', async () => {
    vi.stubGlobal('api', { db: {} })

    render(<Harness />)
    await act(async () => {})

    expect(rows()).toEqual([])
  })
})
