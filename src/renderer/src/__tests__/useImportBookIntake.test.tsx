/**
 * The structured-book intake — the door itself (codebase-health 08).
 *
 * Every case here runs on an **invented** channel rather than `.wbook` or
 * `.epub`. That is the whole claim of the seam: the intake holds one open
 * verdict and one commit lock, and reads what the card says and which commit
 * call runs off the channel. If any of these tests needed a real format, the
 * format knowledge would have leaked back into the surface.
 *
 * The commit *envelope*, by contrast, is deliberately not invented: every
 * channel answers success the same way (`architecture-depth/04`), so the
 * invented channel answers it too.
 *
 * Environment: happy-dom (matched by vitest.config.ts environmentMatchGlobs).
 */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { LibraryContext, type LibraryContextValue } from '../contexts/LibraryContext'
import { NavigationContext, type NavigationContextValue } from '../contexts/NavigationContext'
import {
  useImportBookIntake,
  useLandCommittedBook,
  type ImportBookTakeover
} from '../hooks/useImportBookIntake'
import type { ImportBookChannel } from '../components/import/bookChannels'
import type { BookCardContent } from '../components/import/BookCard'
import type { TextRecord } from '../types'

afterEach(() => {
  cleanup()
  delete (window as unknown as { api?: unknown }).api
})

const PATH = 'C:\\books\\invented.book'

const RECORD: TextRecord = { id: 3, title: 'Invented', content: '', word_count: 9 }

/** The shared success envelope, answered by an invented format. */
const COMMITTED = { status: 'committed' as const, filePath: PATH, textId: 3 }

/** A verdict shape no format uses, so nothing can pass by recognising it. */
interface TestVerdict {
  status: string
  label: string
  addable: boolean
}

function verdict(label: string, addable: boolean): TestVerdict {
  return { status: 'invented-status', label, addable }
}

/**
 * The invented format's card copy. `addable` is what decides confirm-vs-refusal
 * here, so nothing passes by recognising a real status string.
 */
function describeTestVerdict(candidate: { status: string }): BookCardContent {
  const { label, addable } = candidate as TestVerdict
  return addable
    ? { kind: 'confirm', title: label, meta: ['1 chapter'], detail: 'invented' }
    : { kind: 'refusal', message: label, tone: 'neutral' }
}

function testChannel(overrides: Partial<ImportBookChannel> = {}): ImportBookChannel {
  return {
    id: 'invented',
    label: 'Invented Book',
    pickOption: 'onWingletBook',
    parse: vi.fn().mockResolvedValue(verdict('parsed', true)),
    commit: vi.fn().mockResolvedValue(COMMITTED),
    describe: describeTestVerdict,
    ...overrides
  }
}

function libraryValue(overrides: Partial<LibraryContextValue> = {}) {
  return {
    categories: [],
    refreshTexts: vi.fn().mockResolvedValue(undefined),
    openSegments: vi.fn().mockResolvedValue(undefined),
    ...overrides
  } as unknown as LibraryContextValue
}

function navigationValue() {
  return { setView: vi.fn() } as unknown as NavigationContextValue
}

function renderIntake(
  channels: ImportBookChannel[],
  ctx: LibraryContextValue = libraryValue(),
  nav: NavigationContextValue = navigationValue()
) {
  const setError = vi.fn()
  const view = renderHook(() => useImportBookIntake(channels), {
    wrapper: ({ children }) => (
      <NavigationContext.Provider value={nav}>
        <LibraryContext.Provider value={ctx}>{children}</LibraryContext.Provider>
      </NavigationContext.Provider>
    )
  })
  const takeover = (): ImportBookTakeover | null => view.result.current.resolveTakeover(setError)
  return { ...view, setError, takeover }
}

describe('useImportBookIntake', () => {
  it('starts with no door open', () => {
    const { takeover } = renderIntake([testChannel()])

    expect(takeover()).toBeNull()
  })

  it('exposes one pick handler per registered channel', () => {
    const { result } = renderIntake([
      testChannel(),
      testChannel({ id: 'other', pickOption: 'onEpubBook' })
    ])

    expect(Object.keys(result.current.pickOptions).sort()).toEqual([
      'onEpubBook',
      'onWingletBook'
    ])
  })

  it('keeps the pick handlers stable across renders', () => {
    const channels = [testChannel()]
    const { result, rerender } = renderIntake(channels)
    const first = result.current.pickOptions

    rerender()

    expect(result.current.pickOptions).toBe(first)
  })

  it('opens the picked channel on its parse verdict', async () => {
    const channel = testChannel()
    const { result, takeover } = renderIntake([channel])

    await act(async () => {
      await result.current.pickOptions.onWingletBook?.({ filePath: PATH, fileName: 'invented.book' })
    })

    expect(channel.parse).toHaveBeenCalledWith(PATH)
    expect(takeover()).toMatchObject({
      channel,
      verdict: { label: 'parsed' },
      busy: false
    })
  })

  it('keeps only one door open — a second pick replaces the first', async () => {
    const first = testChannel()
    const second = testChannel({
      id: 'second',
      pickOption: 'onEpubBook',
      parse: vi.fn().mockResolvedValue(verdict('second', true))
    })
    const { result, takeover } = renderIntake([first, second])

    await act(async () => {
      await result.current.pickOptions.onWingletBook?.({ filePath: PATH, fileName: 'a' })
    })
    await act(async () => {
      await result.current.pickOptions.onEpubBook?.({ filePath: PATH, fileName: 'b' })
    })

    expect(takeover()?.channel).toBe(second)
  })

  it('commits the open book and lands it by the id the commit answered with', async () => {
    const ctx = libraryValue()
    ;(window as unknown as { api: unknown }).api = {
      db: { getTexts: vi.fn().mockResolvedValue([RECORD]) }
    }
    const channel = testChannel()
    const { result, takeover, setError } = renderIntake([channel], ctx)

    await act(async () => {
      await result.current.pickOptions.onWingletBook?.({ filePath: PATH, fileName: 'a' })
    })
    await act(async () => {
      takeover()?.onAdd()
    })

    expect(channel.commit).toHaveBeenCalledWith(PATH)
    await waitFor(() => expect(ctx.openSegments).toHaveBeenCalledWith(RECORD))
    expect(ctx.refreshTexts).toHaveBeenCalled()
    expect(setError).toHaveBeenCalledWith(null)
    // The door closes behind a landed book.
    expect(takeover()).toBeNull()
  })

  it('replaces the verdict in place when the commit refuses', async () => {
    const ctx = libraryValue()
    const channel = testChannel({
      commit: vi.fn().mockResolvedValue(verdict('refused', false))
    })
    const { result, takeover } = renderIntake([channel], ctx)

    await act(async () => {
      await result.current.pickOptions.onWingletBook?.({ filePath: PATH, fileName: 'a' })
    })
    await act(async () => {
      takeover()?.onAdd()
    })

    expect(takeover()).toMatchObject({ channel, verdict: { label: 'refused' } })
    expect(ctx.openSegments).not.toHaveBeenCalled()
  })

  it('never commits a verdict the channel does not offer an add for', async () => {
    const channel = testChannel({
      parse: vi.fn().mockResolvedValue(verdict('refusal', false))
    })
    const { result, takeover } = renderIntake([channel])

    await act(async () => {
      await result.current.pickOptions.onWingletBook?.({ filePath: PATH, fileName: 'a' })
    })
    await act(async () => {
      takeover()?.onAdd()
    })

    expect(channel.commit).not.toHaveBeenCalled()
    expect(takeover()).toMatchObject({ verdict: { label: 'refusal' } })
  })

  it('reports a thrown commit on the surface’s error line and keeps the card', async () => {
    const channel = testChannel({ commit: vi.fn().mockRejectedValue(new Error('disk gone')) })
    const { result, takeover, setError } = renderIntake([channel])

    await act(async () => {
      await result.current.pickOptions.onWingletBook?.({ filePath: PATH, fileName: 'a' })
    })
    await act(async () => {
      takeover()?.onAdd()
    })

    await waitFor(() =>
      expect(setError).toHaveBeenCalledWith('Failed to add book: disk gone')
    )
    expect(takeover()).toMatchObject({ verdict: { label: 'parsed' }, busy: false })
  })

  it('dismisses without committing anything', async () => {
    const channel = testChannel()
    const { result, takeover, setError } = renderIntake([channel])

    await act(async () => {
      await result.current.pickOptions.onWingletBook?.({ filePath: PATH, fileName: 'a' })
    })
    await act(async () => {
      takeover()?.onDismiss()
    })

    expect(channel.commit).not.toHaveBeenCalled()
    expect(setError).toHaveBeenCalledWith(null)
    expect(takeover()).toBeNull()
  })
})

describe('useLandCommittedBook', () => {
  function renderLander(ctx: LibraryContextValue, nav: NavigationContextValue) {
    return renderHook(() => useLandCommittedBook(), {
      wrapper: ({ children }) => (
        <NavigationContext.Provider value={nav}>
          <LibraryContext.Provider value={ctx}>{children}</LibraryContext.Provider>
        </NavigationContext.Provider>
      )
    })
  }

  it('opens the committed book’s Contents view', async () => {
    ;(window as unknown as { api: unknown }).api = {
      db: { getTexts: vi.fn().mockResolvedValue([RECORD]) }
    }
    const ctx = libraryValue()
    const nav = navigationValue()
    const { result } = renderLander(ctx, nav)

    await act(async () => {
      await result.current(3)
    })

    expect(ctx.refreshTexts).toHaveBeenCalled()
    expect(ctx.openSegments).toHaveBeenCalledWith(RECORD)
    expect(nav.setView).not.toHaveBeenCalled()
  })

  it('falls back to the Library rather than stranding the user', async () => {
    ;(window as unknown as { api: unknown }).api = {
      db: { getTexts: vi.fn().mockResolvedValue([RECORD]) }
    }
    const ctx = libraryValue()
    const nav = navigationValue()
    const { result } = renderLander(ctx, nav)

    await act(async () => {
      await result.current(999)
    })

    expect(ctx.openSegments).not.toHaveBeenCalled()
    expect(nav.setView).toHaveBeenCalledWith('library')
  })
})
