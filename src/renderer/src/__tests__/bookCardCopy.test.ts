/**
 * Book card copy, pinned verbatim (`architecture-depth/05`).
 *
 * `WingletBookCard.tsx` and `EpubBookCard.tsx` folded into one `BookCard` that
 * draws whatever the open channel describes. **The words did not move with the
 * markup — they are product voice.** So every rung of both ladders is asserted
 * here character for character against what the two card components said before
 * the fold: message, detail, and tone.
 *
 * Two of these are load-bearing beyond mere copy:
 *
 * - **DRM stays neutral.** Nothing about a copy-protected file is damaged and
 *   the user did nothing wrong, so it must never inherit the `--danger` tone
 *   the damaged/oversized rungs carry (ADR-0034 §1).
 * - **"already in your library" stays neutral** for the same reason: a
 *   successful no-op should not read as an error (ADR-0033 §4).
 *
 * Counts are compared through `toLocaleString()` rather than hard-coded, because
 * the grouping separator is the host's, not ours.
 */
import { describe, expect, it } from 'vitest'
import {
  WINGLET_BOOK_LABEL,
  describeWingletBook,
  type WingletBookVerdict
} from '../components/import/wingletBookVerdict'
import {
  EPUB_BOOK_LABEL,
  describeEpubBook,
  type EpubBookVerdict
} from '../components/import/epubVerdict'
import type { BookConfirmContent, BookRefusalContent } from '../components/import/BookCard'

const WBOOK_PATH = 'C:\\books\\the-lighthouse-keeper.wbook'
const EPUB_PATH = 'C:\\books\\middlemarch.epub'

function refusal(content: { kind: string }): BookRefusalContent {
  if (content.kind !== 'refusal') throw new Error(`expected a refusal, got ${content.kind}`)
  return content as BookRefusalContent
}

function confirm(content: { kind: string }): BookConfirmContent {
  if (content.kind !== 'confirm') throw new Error(`expected a confirm card, got ${content.kind}`)
  return content as BookConfirmContent
}

describe('Winglet Book card copy', () => {
  it('labels the door', () => {
    expect(WINGLET_BOOK_LABEL).toBe('Winglet Book')
  })

  it('confirms an accepted book with its chapter count and category', () => {
    const content = confirm(
      describeWingletBook({
        status: 'accepted',
        filePath: WBOOK_PATH,
        confirmation: {
          seedId: 'the-lighthouse-keeper',
          title: 'The Lighthouse Keeper',
          chapterCount: 12,
          categoryName: 'Fiction'
        }
      } as WingletBookVerdict)
    )

    expect(content.title).toBe('The Lighthouse Keeper')
    expect(content.meta).toEqual(['12 chapters', 'Fiction'])
    expect(content.detail).toBe(
      'This book is already prepared — there is nothing to clean up or set up.'
    )
    // A curated book has no author line; only EPUB fills that slot.
    expect(content.byline).toBeUndefined()
  })

  it('says "1 chapter", not "1 chapters"', () => {
    const content = confirm(
      describeWingletBook({
        status: 'accepted',
        filePath: WBOOK_PATH,
        confirmation: {
          seedId: 's',
          title: 'One',
          chapterCount: 1,
          categoryName: 'Uncategorized'
        }
      } as WingletBookVerdict)
    )

    expect(content.meta[0]).toBe('1 chapter')
  })

  const wingletRefusals: Array<{
    name: string
    verdict: Record<string, unknown>
    expected: BookRefusalContent
  }> = [
    {
      name: 'duplicate',
      verdict: {
        status: 'duplicate',
        filePath: WBOOK_PATH,
        seedId: 'the-lighthouse-keeper',
        title: 'The Lighthouse Keeper'
      },
      expected: {
        kind: 'refusal',
        message: '“The Lighthouse Keeper” is already in your library.',
        detail: 'Nothing was imported. Delete the existing book first if you want to re-add it.',
        tone: 'neutral'
      }
    },
    {
      name: 'foreign',
      verdict: { status: 'foreign', filePath: WBOOK_PATH },
      expected: {
        kind: 'refusal',
        message: "This file isn't a Winglet Book.",
        detail: 'Use Paste Text or Upload File for .txt, .docx, and .pdf documents.',
        tone: 'danger'
      }
    },
    {
      name: 'unsupported-version (newer)',
      verdict: { status: 'unsupported-version', filePath: WBOOK_PATH, schemaVersion: 3, newer: true },
      expected: {
        kind: 'refusal',
        message: 'This Winglet Book was made for a newer version of WingletReader — please update.',
        detail: 'The file uses format version 3.',
        tone: 'danger'
      }
    },
    {
      name: 'unsupported-version (retired v1)',
      verdict: {
        status: 'unsupported-version',
        filePath: WBOOK_PATH,
        schemaVersion: 1,
        newer: false
      },
      expected: {
        kind: 'refusal',
        message: "This Winglet Book uses a format version WingletReader can't import.",
        detail: 'The file uses format version 1.',
        tone: 'danger'
      }
    },
    {
      name: 'malformed',
      verdict: { status: 'malformed', filePath: WBOOK_PATH, reason: 'segments must not be empty' },
      expected: {
        kind: 'refusal',
        message: 'This Winglet Book file is damaged.',
        detail: 'segments must not be empty',
        tone: 'danger'
      }
    }
  ]

  for (const { name, verdict, expected } of wingletRefusals) {
    it(`renders ${name} in exactly the words the card used before the fold`, () => {
      expect(refusal(describeWingletBook(verdict as WingletBookVerdict))).toEqual(expected)
    })
  }
})

describe('EPUB Book card copy', () => {
  it('labels the door', () => {
    expect(EPUB_BOOK_LABEL).toBe('EPUB Book')
  })

  function acceptedEpub(overrides: Record<string, unknown> = {}): EpubBookVerdict {
    return {
      status: 'accepted',
      filePath: EPUB_PATH,
      confirmation: {
        title: 'Middlemarch',
        author: 'George Eliot',
        chapterCount: 86,
        wordCount: 316059,
        imagesOmitted: 3,
        ...overrides
      }
    } as EpubBookVerdict
  }

  it('confirms an accepted book with author, chapters, words and omitted images', () => {
    const content = confirm(describeEpubBook(acceptedEpub()))

    expect(content.title).toBe('Middlemarch')
    expect(content.byline).toBe('by George Eliot')
    expect(content.meta).toEqual([
      '86 chapters',
      `${(316059).toLocaleString()} words`,
      '3 images omitted'
    ])
    expect(content.detail).toBe(
      'Chapters come from the book’s own table of contents. It will be added to ' +
        'Uncategorized — you can move it afterwards.'
    )
  })

  it('drops the author line when the publisher supplied none', () => {
    expect(confirm(describeEpubBook(acceptedEpub({ author: null }))).byline).toBeUndefined()
  })

  it('says nothing about images for a book that had none', () => {
    const content = confirm(describeEpubBook(acceptedEpub({ imagesOmitted: 0 })))

    expect(content.meta.some((part) => part.includes('omitted'))).toBe(false)
  })

  it('names the unsegmented fallback rather than showing "0 chapters"', () => {
    expect(confirm(describeEpubBook(acceptedEpub({ chapterCount: 0 }))).meta[0]).toBe(
      'No chapters detected'
    )
  })

  it('keeps the singular forms', () => {
    const content = confirm(
      describeEpubBook(acceptedEpub({ chapterCount: 1, wordCount: 1, imagesOmitted: 1 }))
    )

    expect(content.meta).toEqual(['1 chapter', '1 word', '1 image omitted'])
  })

  const epubRefusals: Array<{
    name: string
    verdict: Record<string, unknown>
    expected: BookRefusalContent
  }> = [
    {
      name: 'drm-protected',
      verdict: { status: 'drm-protected', filePath: EPUB_PATH },
      expected: {
        kind: 'refusal',
        message: 'This file is copy-protected.',
        detail:
          'WingletReader reads DRM-free books. A copy without DRM — a Project Gutenberg ' +
          'download, for instance — imports normally.',
        // The one that matters most: protection is not damage.
        tone: 'neutral'
      }
    },
    {
      name: 'oversized (container cap)',
      verdict: {
        status: 'oversized',
        filePath: EPUB_PATH,
        cap: 'container',
        limitBytes: 100 * 1024 * 1024
      },
      expected: {
        kind: 'refusal',
        message: 'This EPUB is too large to import.',
        detail: 'WingletReader imports EPUB files up to 100 MB.',
        tone: 'danger'
      }
    },
    {
      name: 'oversized (text cap)',
      verdict: {
        status: 'oversized',
        filePath: EPUB_PATH,
        cap: 'text',
        limitBytes: 50 * 1024 * 1024
      },
      expected: {
        kind: 'refusal',
        message: 'This EPUB is too large to import.',
        detail: 'WingletReader imports up to 50 MB of text from one book.',
        tone: 'danger'
      }
    },
    {
      name: 'malformed',
      verdict: { status: 'malformed', filePath: EPUB_PATH, reason: 'container.xml is missing' },
      expected: {
        kind: 'refusal',
        message: 'This EPUB file is damaged.',
        detail: 'container.xml is missing',
        tone: 'danger'
      }
    }
  ]

  for (const { name, verdict, expected } of epubRefusals) {
    it(`renders ${name} in exactly the words the card used before the fold`, () => {
      expect(refusal(describeEpubBook(verdict as EpubBookVerdict))).toEqual(expected)
    })
  }
})

describe('the two formats keep their own vocabularies', () => {
  it('never renders one format’s refusal in the other’s words', () => {
    // Both ladders have a `malformed` rung; each says its own name.
    const wbook = refusal(
      describeWingletBook({ status: 'malformed', filePath: WBOOK_PATH, reason: 'x' } as WingletBookVerdict)
    )
    const epub = refusal(
      describeEpubBook({ status: 'malformed', filePath: EPUB_PATH, reason: 'x' } as EpubBookVerdict)
    )

    expect(wbook.message).not.toBe(epub.message)
  })
})
