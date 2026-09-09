/**
 * EPUB Book import UI (ADR-0034 §8; EP-4a).
 *
 * The `.wbook` mirror (`importPanelWingletBook.test.tsx`) applied to the second
 * door: verdict takeover of the Import surface, every confirm-card field
 * including the conditional images line, each refusal's own copy — DRM by name,
 * never as damage — and the commit→Contents landing by returned `textId`.
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
import { EPUB_BOOK_NOT_A_CHAPTER } from '../hooks/usePasteOrFileImport'
import { alphaChrome } from '../alphaChrome'
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

const EPUB_PATH = 'C:\\books\\middlemarch.epub'

const ACCEPTED = {
  status: 'accepted' as const,
  filePath: EPUB_PATH,
  confirmation: {
    title: 'Middlemarch',
    author: 'George Eliot',
    chapterCount: 86,
    wordCount: 316059,
    imagesOmitted: 3,
  },
}

const COMMITTED = { status: 'committed' as const, filePath: EPUB_PATH, textId: 41 }

const IMPORTED_RECORD: TextRecord = {
  id: 41,
  title: 'Middlemarch',
  content: '',
  word_count: 316059,
  segment_count: 86,
}

type Verdict = Record<string, unknown>

/** Installs `window.api` with an `.epub` pick and the parse/commit pair. */
function installApi(
  parse: Verdict,
  commit: Verdict = COMMITTED,
  texts: TextRecord[] = [IMPORTED_RECORD]
) {
  const api = {
    file: {
      open: vi.fn().mockResolvedValue({
        kind: 'epub-book',
        fileName: 'middlemarch.epub',
        filePath: EPUB_PATH,
      }),
    },
    data: {
      parseEpub: vi.fn().mockResolvedValue(parse),
      commitEpub: vi.fn().mockResolvedValue(commit),
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

async function pickEpub(ctx: LibraryContextValue = libraryValue()) {
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

describe('ImportPanel — EPUB routing', () => {
  it('shows the confirm card instead of the normal import flow for a recognized book', async () => {
    installApi(ACCEPTED)
    await pickEpub()

    expect(await screen.findByText('Middlemarch')).toBeTruthy()
    expect(screen.getByText('by George Eliot')).toBeTruthy()
    expect(screen.getByText(/86 chapters/)).toBeTruthy()
    // Grouped by `toLocaleString`, so the separator is whatever the host locale
    // uses — the assertion is that the count is grouped, not which glyph does it.
    expect(screen.getByText(/316[.,\s\u00a0\u202f]059 words/)).toBeTruthy()

    // The cleanup/preview/title/category flow is skipped entirely — the book
    // lands in Uncategorized, so there is nothing to pick (§8).
    expect(screen.queryByLabelText('Title')).toBeNull()
    expect(screen.queryByLabelText('Category')).toBeNull()
    expect(screen.queryByLabelText('Review extracted text')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save & Open in Reader' })).toBeNull()
  })

  it('shows the experimental warning on the confirm card, before the user decides (PRD D6)', async () => {
    installApi(ACCEPTED)
    await pickEpub()

    const banner = await screen.findByRole('status', { name: 'EPUB import experimental warning' })
    expect(banner.textContent).toBe(alphaChrome.epubExperimentalBannerCopy)

    // Above the confirm/dismiss actions, so it is read before the decision.
    const addButton = screen.getByRole('button', { name: 'Add to Library' })
    expect(
      banner.compareDocumentPosition(addButton) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('shows no experimental warning on an EPUB refusal card, which offers no add action', async () => {
    installApi({ status: 'drm-protected', filePath: EPUB_PATH })
    await pickEpub()

    await screen.findByRole('alert')
    expect(screen.queryByRole('status', { name: 'EPUB import experimental warning' })).toBeNull()
  })

  it('discloses omitted images only when some were dropped', async () => {
    installApi(ACCEPTED)
    await pickEpub()

    expect(await screen.findByText(/3 images omitted/)).toBeTruthy()
  })

  it('says nothing about images for a book that had none', async () => {
    installApi({
      ...ACCEPTED,
      confirmation: { ...ACCEPTED.confirmation, imagesOmitted: 0 },
    })
    await pickEpub()

    expect(await screen.findByText('Middlemarch')).toBeTruthy()
    expect(screen.queryByText(/omitted/)).toBeNull()
  })

  it('omits the author line when the publisher supplied none', async () => {
    installApi({ ...ACCEPTED, confirmation: { ...ACCEPTED.confirmation, author: null } })
    await pickEpub()

    expect(await screen.findByText('Middlemarch')).toBeTruthy()
    expect(screen.queryByText(/^by /)).toBeNull()
  })

  it('names the unsegmented fallback rather than showing "0 chapters"', async () => {
    installApi({
      ...ACCEPTED,
      confirmation: { ...ACCEPTED.confirmation, chapterCount: 0, imagesOmitted: 0 },
    })
    await pickEpub()

    expect(await screen.findByText(/No chapters detected/)).toBeTruthy()
    expect(screen.queryByText(/0 chapters/)).toBeNull()
  })

  it('commits on confirm and lands in the book’s Contents view by returned id', async () => {
    const api = installApi(ACCEPTED)
    const ctx = libraryValue()
    const user = await pickEpub(ctx)

    await user.click(await screen.findByRole('button', { name: 'Add to Library' }))

    await waitFor(() => expect(ctx.openSegments).toHaveBeenCalledWith(IMPORTED_RECORD))
    expect(api.data.commitEpub).toHaveBeenCalledWith(EPUB_PATH)
    expect(ctx.refreshTexts).toHaveBeenCalled()
  })

  it('commits nothing when the card is dismissed', async () => {
    const api = installApi(ACCEPTED)
    const ctx = libraryValue()
    const user = await pickEpub(ctx)

    await user.click(await screen.findByRole('button', { name: 'Not now' }))

    expect(api.data.commitEpub).not.toHaveBeenCalled()
    expect(ctx.openSegments).not.toHaveBeenCalled()
    // Back on the ordinary import surface, untouched.
    expect(screen.getByLabelText('Title')).toBeTruthy()
  })

  it('re-renders as a refusal when commit disagrees with a clean parse', async () => {
    // The pair is stateless: the file can be replaced between the two calls.
    installApi(ACCEPTED, {
      status: 'malformed',
      filePath: EPUB_PATH,
      reason: 'container.xml is missing',
    })
    const ctx = libraryValue()
    const user = await pickEpub(ctx)

    await user.click(await screen.findByRole('button', { name: 'Add to Library' }))

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'This EPUB file is damaged.'
    )
    expect(ctx.openSegments).not.toHaveBeenCalled()
  })
})

describe('ImportPanel — EPUB refusals', () => {
  const cases: Array<{ name: string; verdict: Verdict; message: RegExp }> = [
    {
      name: 'drm-protected',
      verdict: { status: 'drm-protected', filePath: EPUB_PATH },
      message: /This file is copy-protected\./,
    },
    {
      name: 'oversized (container cap)',
      verdict: {
        status: 'oversized',
        filePath: EPUB_PATH,
        cap: 'container',
        limitBytes: 100 * 1024 * 1024,
      },
      message: /too large to import/,
    },
    {
      name: 'oversized (text cap)',
      verdict: {
        status: 'oversized',
        filePath: EPUB_PATH,
        cap: 'text',
        limitBytes: 50 * 1024 * 1024,
      },
      message: /too large to import/,
    },
    {
      name: 'malformed',
      verdict: { status: 'malformed', filePath: EPUB_PATH, reason: 'container.xml is missing' },
      message: /This EPUB file is damaged\./,
    },
  ]

  for (const { name, verdict, message } of cases) {
    it(`renders a distinct message for ${name} and offers no add action`, async () => {
      const api = installApi(verdict)
      await pickEpub()

      expect(await screen.findByRole('alert')).toHaveProperty(
        'textContent',
        expect.stringMatching(message)
      )
      expect(screen.queryByRole('button', { name: 'Add to Library' })).toBeNull()
      expect(api.data.commitEpub).not.toHaveBeenCalled()
    })
  }

  it('names DRM as protection rather than damage, and keeps it out of the danger tone', async () => {
    installApi({ status: 'drm-protected', filePath: EPUB_PATH })
    await pickEpub()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('This file is copy-protected.')
    expect(alert.className).not.toContain('danger')
    expect(screen.getByText(/WingletReader reads DRM-free books/)).toBeTruthy()
  })

  it('quotes the tripped cap in the oversized detail', async () => {
    installApi({
      status: 'oversized',
      filePath: EPUB_PATH,
      cap: 'container',
      limitBytes: 100 * 1024 * 1024,
    })
    await pickEpub()

    expect(await screen.findByText(/EPUB files up to 100 MB/)).toBeTruthy()
    expect(screen.getByRole('alert').className).toContain('danger')
  })

  it('distinguishes the text cap from the container cap', async () => {
    installApi({
      status: 'oversized',
      filePath: EPUB_PATH,
      cap: 'text',
      limitBytes: 50 * 1024 * 1024,
    })
    await pickEpub()

    expect(await screen.findByText(/up to 50 MB of text from one book/)).toBeTruthy()
  })

  it('surfaces the damaged file’s reason as detail', async () => {
    installApi({ status: 'malformed', filePath: EPUB_PATH, reason: 'container.xml is missing' })
    await pickEpub()

    expect(await screen.findByText('container.xml is missing')).toBeTruthy()
  })

  it('returns to the normal import surface when a refusal is closed', async () => {
    installApi({ status: 'drm-protected', filePath: EPUB_PATH })
    const user = await pickEpub()

    await user.click(await screen.findByRole('button', { name: 'Close' }))

    expect(screen.getByLabelText('Title')).toBeTruthy()
  })
})

describe('Import drop zone copy', () => {
  it('lists .epub among the loadable file types', async () => {
    installApi(ACCEPTED)
    const user = userEvent.setup()
    render(
      <LibraryContext.Provider value={libraryValue()}>
        <ImportPanel settings={settings} onSave={vi.fn()} onCancel={vi.fn()} />
      </LibraryContext.Provider>
    )
    await user.click(screen.getByRole('tab', { name: 'Upload File' }))

    expect(
      screen.getByText('Click or drag to load a .txt, .docx, .pdf, or .epub file')
    ).toBeTruthy()
  })
})

describe('AddChapterPanel — an EPUB is not a chapter', () => {
  /** The chapter-append host: no `onEpubBook`, so the hook speaks the refusal. */
  async function pickEpubIntoAddChapter() {
    const user = userEvent.setup()
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
    return user
  }

  it('refuses a picked .epub with a pointer to Import', async () => {
    installApi(ACCEPTED)
    await pickEpubIntoAddChapter()

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining(EPUB_BOOK_NOT_A_CHAPTER)
    )
  })

  it('never parses or commits the refused book, and loads nothing into the chapter field', async () => {
    const api = installApi(ACCEPTED)
    await pickEpubIntoAddChapter()

    await screen.findByRole('alert')
    expect(api.data.parseEpub).not.toHaveBeenCalled()
    expect(api.data.commitEpub).not.toHaveBeenCalled()
    // The text-file branch never ran: no extracted-text review appeared.
    expect(screen.queryByLabelText('Review extracted text')).toBeNull()
  })

  it('leaves the Import surface unaffected — there the same pick is a confirm card', async () => {
    installApi(ACCEPTED)
    await pickEpub()

    expect(await screen.findByText('Middlemarch')).toBeTruthy()
    expect(screen.queryByText(EPUB_BOOK_NOT_A_CHAPTER)).toBeNull()
  })
})
