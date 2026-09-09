/**
 * Winglet Book import UI (ADR-0033 §4; WB-3).
 *
 * Covers all six ladder outcomes as the Import surface renders them, the
 * commits-nothing guarantee of dismissal, and the fact that commit is a second
 * independent verdict rather than a rubber stamp on the parse.
 *
 * Environment: happy-dom (matched by vitest.config.ts environmentMatchGlobs).
 */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ImportPanel, { type ImportProcessingSettings } from '../components/ImportPanel'
import AddChapterPanel from '../components/AddChapterPanel'
import { LibraryContext, type LibraryContextValue } from '../contexts/LibraryContext'
import { WINGLET_BOOK_NOT_A_CHAPTER } from '../hooks/usePasteOrFileImport'
import type { TextRecord } from '../types'

afterEach(() => {
  cleanup()
  delete (window as unknown as { api?: unknown }).api
})

const settings: ImportProcessingSettings = {
  segmentation_enabled: false,
  auto_chapter_detection: false,
  segmentation_threshold: 5000,
  segmentation_chunk_size: 1500,
}

const WBOOK_PATH = 'C:\\books\\the-lighthouse-keeper.wbook'

const ACCEPTED = {
  status: 'accepted' as const,
  filePath: WBOOK_PATH,
  confirmation: {
    seedId: 'the-lighthouse-keeper',
    title: 'The Lighthouse Keeper',
    chapterCount: 12,
    categoryName: 'Fiction',
  },
}

/**
 * The shared book-intake success envelope (`architecture-depth/04`): commit
 * says it committed and hands back the row, so the panel lands by id.
 */
const COMMITTED = { status: 'committed' as const, filePath: WBOOK_PATH, textId: 7 }

const SEEDED_RECORD: TextRecord = {
  id: 7,
  title: 'The Lighthouse Keeper',
  content: '',
  word_count: 42000,
  segment_count: 12,
  seed_id: 'the-lighthouse-keeper',
}

type Verdict = typeof ACCEPTED | typeof COMMITTED | Record<string, unknown>

/** Installs `window.api` with a `.wbook` pick and the parse/commit pair. */
function installApi(
  parse: Verdict,
  commit: Verdict = COMMITTED,
  texts: TextRecord[] = [SEEDED_RECORD]
) {
  const api = {
    file: {
      open: vi.fn().mockResolvedValue({
        kind: 'winglet-book',
        fileName: 'the-lighthouse-keeper.wbook',
        filePath: WBOOK_PATH,
      }),
    },
    data: {
      parseWingletBook: vi.fn().mockResolvedValue(parse),
      commitWingletBook: vi.fn().mockResolvedValue(commit),
    },
    db: {
      getTexts: vi.fn().mockResolvedValue(texts),
    },
  }
  ;(window as unknown as { api: unknown }).api = api
  return api
}

function libraryValue(overrides: Partial<LibraryContextValue> = {}) {
  return {
    categories: [],
    refreshTexts: vi.fn().mockResolvedValue(undefined),
    openSegments: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as LibraryContextValue
}

async function pickWingletBook(ctx: LibraryContextValue = libraryValue()) {
  const user = userEvent.setup()
  render(
    <LibraryContext.Provider value={ctx}>
      <ImportPanel settings={settings} onSave={vi.fn()} onCancel={vi.fn()} />
    </LibraryContext.Provider>
  )
  await user.click(screen.getByRole('tab', { name: 'Upload File' }))
  await user.click(screen.getByRole('button', { name: 'Drop file here or click to browse' }))
  return user
}

describe('ImportPanel — Winglet Book routing', () => {
  it('shows the confirm card instead of the normal import flow for a recognized book', async () => {
    installApi(ACCEPTED)
    await pickWingletBook()

    expect(await screen.findByText('The Lighthouse Keeper')).toBeTruthy()
    expect(screen.getByText(/12 chapters/)).toBeTruthy()
    expect(screen.getByText(/Fiction/)).toBeTruthy()

    // The cleanup/preview/title/category flow is skipped entirely.
    expect(screen.queryByLabelText('Title')).toBeNull()
    expect(screen.queryByLabelText('Review extracted text')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save & Open in Reader' })).toBeNull()
  })

  it('commits on confirm and lands in the book’s Contents view', async () => {
    const api = installApi(ACCEPTED)
    const ctx = libraryValue()
    const user = await pickWingletBook(ctx)

    await user.click(await screen.findByRole('button', { name: 'Add to Library' }))

    await waitFor(() => expect(ctx.openSegments).toHaveBeenCalledWith(SEEDED_RECORD))
    expect(api.data.commitWingletBook).toHaveBeenCalledWith(WBOOK_PATH)
    expect(ctx.refreshTexts).toHaveBeenCalled()
  })

  it('commits nothing when the card is dismissed', async () => {
    const api = installApi(ACCEPTED)
    const ctx = libraryValue()
    const user = await pickWingletBook(ctx)

    await user.click(await screen.findByRole('button', { name: 'Not now' }))

    expect(api.data.commitWingletBook).not.toHaveBeenCalled()
    expect(ctx.openSegments).not.toHaveBeenCalled()
    // Back on the ordinary import surface, untouched.
    expect(screen.getByLabelText('Title')).toBeTruthy()
  })

  it('re-renders as a refusal when commit disagrees with a clean parse', async () => {
    // The pair is stateless: a duplicate can race in between the two calls.
    installApi(ACCEPTED, {
      status: 'duplicate',
      filePath: WBOOK_PATH,
      seedId: 'the-lighthouse-keeper',
      title: 'The Lighthouse Keeper',
    })
    const ctx = libraryValue()
    const user = await pickWingletBook(ctx)

    await user.click(await screen.findByRole('button', { name: 'Add to Library' }))

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      '“The Lighthouse Keeper” is already in your library.'
    )
    expect(ctx.openSegments).not.toHaveBeenCalled()
  })
})

describe('ImportPanel — Winglet Book refusals', () => {
  const cases: Array<{ name: string; verdict: Record<string, unknown>; message: RegExp }> = [
    {
      name: 'duplicate',
      verdict: {
        status: 'duplicate',
        filePath: WBOOK_PATH,
        seedId: 'the-lighthouse-keeper',
        title: 'The Lighthouse Keeper',
      },
      message: /already in your library/,
    },
    {
      name: 'foreign',
      verdict: { status: 'foreign', filePath: WBOOK_PATH },
      message: /isn't a Winglet Book/,
    },
    {
      name: 'unsupported-version (newer)',
      verdict: {
        status: 'unsupported-version',
        filePath: WBOOK_PATH,
        schemaVersion: 3,
        newer: true,
      },
      message: /newer version of WingletReader — please update/,
    },
    {
      name: 'unsupported-version (retired v1)',
      verdict: {
        status: 'unsupported-version',
        filePath: WBOOK_PATH,
        schemaVersion: 1,
        newer: false,
      },
      message: /format version WingletReader can't import/,
    },
    {
      name: 'malformed',
      verdict: { status: 'malformed', filePath: WBOOK_PATH, reason: 'segments must not be empty' },
      message: /This Winglet Book file is damaged\./,
    },
  ]

  for (const { name, verdict, message } of cases) {
    it(`renders a distinct message for ${name} and offers no add action`, async () => {
      const api = installApi(verdict)
      await pickWingletBook()

      expect(await screen.findByRole('alert')).toHaveProperty(
        'textContent',
        expect.stringMatching(message)
      )
      expect(screen.queryByRole('button', { name: 'Add to Library' })).toBeNull()
      expect(api.data.commitWingletBook).not.toHaveBeenCalled()
    })
  }

  it('surfaces the damaged file’s reason as detail', async () => {
    installApi({ status: 'malformed', filePath: WBOOK_PATH, reason: 'segments must not be empty' })
    await pickWingletBook()

    expect(await screen.findByText('segments must not be empty')).toBeTruthy()
  })

  it('returns to the normal import surface when a refusal is closed', async () => {
    installApi({ status: 'foreign', filePath: WBOOK_PATH })
    const user = await pickWingletBook()

    await user.click(await screen.findByRole('button', { name: 'Close' }))

    expect(screen.getByLabelText('Title')).toBeTruthy()
  })
})

describe('AddChapterPanel — Winglet Book is not a chapter', () => {
  it('refuses a picked .wbook with a pointer to Import', async () => {
    const user = userEvent.setup()
    installApi(ACCEPTED)

    render(
      <AddChapterPanel
        targetBook={{ id: 1, title: 'A Book', content: '', word_count: 0 }}
        chapterCount={0}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    await user.click(screen.getByRole('tab', { name: 'Upload File' }))
    await user.click(screen.getByRole('button', { name: 'Drop file here or click to browse' }))

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining(WINGLET_BOOK_NOT_A_CHAPTER)
    )
  })
})
