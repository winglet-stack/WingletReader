import type { BookCardContent } from './BookCard'

/**
 * What the one card says for an `.epub` verdict (ADR-0034 §8; EP-4a, folded onto
 * the shared card by `architecture-depth/05`).
 *
 * Sibling of `wingletBookVerdict.ts`: every rung of the container ladder, because
 * they all occupy the same slot on the Import surface. **The words are product
 * voice and are unchanged by the fold** — DRM in particular keeps its own copy
 * and its neutral tone rather than reading as damage (§1).
 *
 * The verdict type is read off the preload surface rather than re-declared, so
 * this stays pinned to the channel contract (which `src/main/epubImport.ts`
 * answers) without adding a third hand-maintained copy of the envelope.
 */
export type EpubBookVerdict = Awaited<ReturnType<typeof window.api.data.parseEpub>>

type EpubBookRefusal = Exclude<EpubBookVerdict, { status: 'accepted' }>

/** The format label the card puts above the title. */
export const EPUB_BOOK_LABEL = 'EPUB Book'

/** Rounded for copy, not for arithmetic — the caps are whole megabytes. */
function megabytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`
}

/** §8 wording, one entry per non-accepted rung of the ladder. */
function describeRefusal(verdict: EpubBookRefusal): BookCardContent {
  switch (verdict.status) {
    case 'drm-protected':
      return {
        kind: 'refusal',
        message: 'This file is copy-protected.',
        detail:
          'WingletReader reads DRM-free books. A copy without DRM — a Project Gutenberg ' +
          'download, for instance — imports normally.',
        // Not a failure: the file is intact and the user did nothing wrong —
        // WingletReader simply doesn't read protected books (§1).
        tone: 'neutral'
      }
    case 'oversized':
      return {
        kind: 'refusal',
        message: 'This EPUB is too large to import.',
        detail:
          verdict.cap === 'container'
            ? `WingletReader imports EPUB files up to ${megabytes(verdict.limitBytes)}.`
            : `WingletReader imports up to ${megabytes(verdict.limitBytes)} of text from one book.`,
        tone: 'danger'
      }
    case 'malformed':
      return {
        kind: 'refusal',
        message: 'This EPUB file is damaged.',
        detail: verdict.reason,
        tone: 'danger'
      }
  }
}

/**
 * 0 chapters is the ladder's unsegmented last resort, not an error — say so in
 * words rather than showing "0 chapters" (ADR-0034 §3).
 */
function chapterLabel(chapterCount: number): string {
  if (chapterCount === 0) return 'No chapters detected'
  if (chapterCount === 1) return '1 chapter'
  return `${chapterCount.toLocaleString()} chapters`
}

function wordLabel(wordCount: number): string {
  return wordCount === 1 ? '1 word' : `${wordCount.toLocaleString()} words`
}

/**
 * Only when something was actually dropped: a book with no images should not be
 * told about images at all (§4 — disclosed, never silently omitted).
 */
function imagesLabel(imagesOmitted: number): string | null {
  if (imagesOmitted === 0) return null
  return imagesOmitted === 1
    ? '1 image omitted'
    : `${imagesOmitted.toLocaleString()} images omitted`
}

/** Every `.epub` verdict as card content: the confirm card, or its refusal. */
export function describeEpubBook(verdict: EpubBookVerdict): BookCardContent {
  if (verdict.status !== 'accepted') return describeRefusal(verdict)

  const { title, author, chapterCount, wordCount, imagesOmitted } = verdict.confirmation
  const images = imagesLabel(imagesOmitted)
  return {
    kind: 'confirm',
    title,
    byline: author ? `by ${author}` : undefined,
    meta: [chapterLabel(chapterCount), wordLabel(wordCount), ...(images ? [images] : [])],
    detail:
      'Chapters come from the book’s own table of contents. It will be added to ' +
      'Uncategorized — you can move it afterwards.'
  }
}
