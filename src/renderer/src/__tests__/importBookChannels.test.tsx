/**
 * The structured-book channel registry (codebase-health 08).
 *
 * Each channel is the whole of what the Import surface knows about a format:
 * which pick it answers, how to parse and commit a path, and what the one shared
 * card should say about a verdict. How a committed book is found is no longer
 * among them — every channel answers `committed` with the new row's id
 * (`architecture-depth/04`) — and neither is a card *component*: since
 * `architecture-depth/05` a channel supplies copy, and `BookCard` draws it.
 *
 * The point of the tests is that the *surface* holds no format knowledge — so
 * everything asserted here is asserted through the descriptor, never through
 * `ImportPanel`.
 *
 * Environment: happy-dom (matched by vitest.config.ts environmentMatchGlobs).
 */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import {
  IMPORT_BOOK_CHANNELS,
  isCommittedBook,
  offersAdd,
  type ImportBookChannel
} from '../components/import/bookChannels'
import BookCard from '../components/import/BookCard'

afterEach(() => {
  cleanup()
  delete (window as unknown as { api?: unknown }).api
})

const WBOOK_PATH = 'C:\\books\\the-lighthouse-keeper.wbook'
const EPUB_PATH = 'C:\\books\\middlemarch.epub'

function channelById(id: string): ImportBookChannel {
  const channel = IMPORT_BOOK_CHANNELS.find((candidate) => candidate.id === id)
  if (!channel) throw new Error(`no channel registered for ${id}`)
  return channel
}

/** Installs only the two `data` calls a channel reaches for. */
function installData(data: Record<string, unknown>) {
  ;(window as unknown as { api: unknown }).api = { data }
  return data
}

describe('IMPORT_BOOK_CHANNELS', () => {
  it('registers one channel per pick option, with distinct ids', () => {
    const pickOptions = IMPORT_BOOK_CHANNELS.map((channel) => channel.pickOption)
    const ids = IMPORT_BOOK_CHANNELS.map((channel) => channel.id)

    expect(new Set(pickOptions).size).toBe(pickOptions.length)
    expect(new Set(ids).size).toBe(ids.length)
    expect(pickOptions).toEqual(expect.arrayContaining(['onWingletBook', 'onEpubBook']))
  })

  it('gives every channel the full descriptor the surface reads', () => {
    for (const channel of IMPORT_BOOK_CHANNELS) {
      expect(typeof channel.parse).toBe('function')
      expect(typeof channel.commit).toBe('function')
      expect(typeof channel.describe).toBe('function')
      expect(channel.label).toBeTruthy()
    }
  })

  it('draws every format through the one card, not one component each', () => {
    // `architecture-depth/05`: a channel supplies copy, never a component.
    for (const channel of IMPORT_BOOK_CHANNELS) {
      expect(channel).not.toHaveProperty('Card')
    }
  })

  it('reports a successful commit in one shape, whichever channel ran it', async () => {
    // The point of `architecture-depth/04`: no format answers success its own
    // way, so the surface has one success check and lands by the id it is given.
    const commits = { commitWingletBook: vi.fn(), commitEpub: vi.fn() }
    const paths: Record<string, string> = {
      'winglet-book': WBOOK_PATH,
      'epub-book': EPUB_PATH
    }
    const answers: unknown[] = []

    for (const channel of IMPORT_BOOK_CHANNELS) {
      const filePath = paths[channel.id]
      for (const call of Object.values(commits)) {
        call.mockResolvedValue({ status: 'committed', filePath, textId: 12 })
      }
      installData(commits)
      answers.push(await channel.commit(filePath))
    }

    expect(answers).toEqual([
      { status: 'committed', filePath: WBOOK_PATH, textId: 12 },
      { status: 'committed', filePath: EPUB_PATH, textId: 12 }
    ])
    expect(answers.every((answer) => isCommittedBook(answer as { status: string }))).toBe(true)
  })
})

describe('the .wbook channel', () => {
  const channel = channelById('winglet-book')

  const accepted = {
    status: 'accepted' as const,
    filePath: WBOOK_PATH,
    confirmation: {
      seedId: 'the-lighthouse-keeper',
      title: 'The Lighthouse Keeper',
      chapterCount: 12,
      categoryName: 'Fiction'
    }
  }

  it('parses through the preload bridge, writing nothing', async () => {
    const data = installData({ parseWingletBook: vi.fn().mockResolvedValue(accepted) })

    expect(await channel.parse(WBOOK_PATH)).toEqual(accepted)
    expect(data.parseWingletBook).toHaveBeenCalledWith(WBOOK_PATH)
  })

  it('offers the add action for an accepted verdict only', () => {
    expect(offersAdd(channel, accepted)).toBe(true)
    for (const status of ['duplicate', 'foreign', 'unsupported-version', 'malformed']) {
      const refusal = { status, filePath: WBOOK_PATH }
      expect(offersAdd(channel, refusal)).toBe(false)
    }
  })

  it('answers a committed book with the new text id', async () => {
    const committed = { status: 'committed', filePath: WBOOK_PATH, textId: 7 }
    installData({ commitWingletBook: vi.fn().mockResolvedValue(committed) })

    const answer = await channel.commit(WBOOK_PATH)

    expect(isCommittedBook(answer)).toBe(true)
    expect(answer).toEqual(committed)
  })

  it('re-sends only the path, so commit re-runs the ladder from disk', async () => {
    const data = installData({
      commitWingletBook: vi
        .fn()
        .mockResolvedValue({ status: 'committed', filePath: WBOOK_PATH, textId: 7 })
    })

    await channel.commit(WBOOK_PATH)

    expect(data.commitWingletBook).toHaveBeenCalledWith(WBOOK_PATH)
  })

  it('hands back the commit verdict when the commit refuses', async () => {
    const duplicate = {
      status: 'duplicate',
      filePath: WBOOK_PATH,
      seedId: 'the-lighthouse-keeper',
      title: 'The Lighthouse Keeper'
    }
    installData({ commitWingletBook: vi.fn().mockResolvedValue(duplicate) })

    const answer = await channel.commit(WBOOK_PATH)

    expect(isCommittedBook(answer)).toBe(false)
    expect(answer).toEqual(duplicate)
  })

  it('does not mistake its accepted parse verdict for a committed book', async () => {
    // `accepted` is the parse half's word; committing says `committed`.
    installData({ commitWingletBook: vi.fn().mockResolvedValue(accepted) })

    expect(isCommittedBook(await channel.commit(WBOOK_PATH))).toBe(false)
  })

  it('describes its confirm card, drawn by the one shared card component', () => {
    render(
      <BookCard
        label={channel.label}
        content={channel.describe(accepted)}
        busy={false}
        onAdd={vi.fn()}
        onDismiss={vi.fn()}
      />
    )

    expect(screen.getByText('Winglet Book')).toBeTruthy()
    expect(screen.getByText('The Lighthouse Keeper')).toBeTruthy()
    expect(screen.getByText('12 chapters · Fiction')).toBeTruthy()
  })
})

describe('the .epub channel', () => {
  const channel = channelById('epub-book')

  const accepted = {
    status: 'accepted' as const,
    filePath: EPUB_PATH,
    confirmation: {
      title: 'Middlemarch',
      author: 'George Eliot',
      chapterCount: 86,
      wordCount: 316059,
      imagesOmitted: 0
    }
  }

  it('parses through the preload bridge, writing nothing', async () => {
    const data = installData({ parseEpub: vi.fn().mockResolvedValue(accepted) })

    expect(await channel.parse(EPUB_PATH)).toEqual(accepted)
    expect(data.parseEpub).toHaveBeenCalledWith(EPUB_PATH)
  })

  it('offers the add action for an accepted verdict only', () => {
    expect(offersAdd(channel, accepted)).toBe(true)
    for (const status of ['drm-protected', 'oversized', 'malformed']) {
      const refusal = { status, filePath: EPUB_PATH }
      expect(offersAdd(channel, refusal)).toBe(false)
    }
  })

  it('answers a committed book with the new text id', async () => {
    const committed = { status: 'committed', filePath: EPUB_PATH, textId: 41 }
    installData({ commitEpub: vi.fn().mockResolvedValue(committed) })

    const answer = await channel.commit(EPUB_PATH)

    expect(isCommittedBook(answer)).toBe(true)
    expect(answer).toEqual(committed)
  })

  it('does not mistake its accepted parse verdict for a committed book', async () => {
    installData({ commitEpub: vi.fn().mockResolvedValue(accepted) })

    expect(isCommittedBook(await channel.commit(EPUB_PATH))).toBe(false)
  })

  it('hands back the commit verdict when the commit refuses', async () => {
    const damaged = { status: 'malformed', filePath: EPUB_PATH, reason: 'container.xml is missing' }
    installData({ commitEpub: vi.fn().mockResolvedValue(damaged) })

    const answer = await channel.commit(EPUB_PATH)

    expect(isCommittedBook(answer)).toBe(false)
    expect(answer).toEqual(damaged)
  })

  it('describes its confirm card, drawn by the one shared card component', () => {
    render(
      <BookCard
        label={channel.label}
        content={channel.describe(accepted)}
        busy={false}
        onAdd={vi.fn()}
        onDismiss={vi.fn()}
      />
    )

    expect(screen.getByText('EPUB Book')).toBeTruthy()
    expect(screen.getByText('Middlemarch')).toBeTruthy()
    expect(screen.getByText('by George Eliot')).toBeTruthy()
  })
})
