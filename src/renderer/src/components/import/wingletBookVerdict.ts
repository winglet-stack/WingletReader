import type { BookCardContent } from './BookCard'

/**
 * What the one card says for a `.wbook` verdict (ADR-0033 §4; WB-3, folded onto
 * the shared card by `architecture-depth/05`).
 *
 * Every rung of the §4 ladder is here, because they all occupy the same slot:
 * whatever the Import surface would have shown for a picked `.wbook`, it shows
 * here. **The words are product voice** — they moved house in that fold, they
 * did not change.
 *
 * The verdict type is read off the preload surface rather than re-declared, so
 * this stays pinned to the channel contract (which `src/main/wingletBookImport.ts`
 * answers) without adding a third hand-maintained copy of the envelope.
 */
export type WingletBookVerdict = Awaited<ReturnType<typeof window.api.data.parseWingletBook>>

type WingletBookRefusal = Exclude<WingletBookVerdict, { status: 'accepted' }>

/** The format label the card puts above the title. */
export const WINGLET_BOOK_LABEL = 'Winglet Book'

/** §4 wording, one entry per non-accepted rung of the ladder. */
function describeRefusal(verdict: WingletBookRefusal): BookCardContent {
  switch (verdict.status) {
    case 'duplicate':
      return {
        kind: 'refusal',
        message: `“${verdict.title}” is already in your library.`,
        detail: 'Nothing was imported. Delete the existing book first if you want to re-add it.',
        // Just an answer, not a failure: a successful no-op should not read as
        // an error.
        tone: 'neutral'
      }
    case 'foreign':
      return {
        kind: 'refusal',
        message: "This file isn't a Winglet Book.",
        detail: 'Use Paste Text or Upload File for .txt, .docx, and .pdf documents.',
        tone: 'danger'
      }
    case 'unsupported-version':
      return verdict.newer
        ? {
            kind: 'refusal',
            message:
              'This Winglet Book was made for a newer version of WingletReader — please update.',
            detail: `The file uses format version ${verdict.schemaVersion}.`,
            tone: 'danger'
          }
        : {
            kind: 'refusal',
            message: "This Winglet Book uses a format version WingletReader can't import.",
            detail: `The file uses format version ${verdict.schemaVersion}.`,
            tone: 'danger'
          }
    case 'malformed':
      return {
        kind: 'refusal',
        message: 'This Winglet Book file is damaged.',
        detail: verdict.reason,
        tone: 'danger'
      }
  }
}

function chapterLabel(chapterCount: number): string {
  return chapterCount === 1 ? '1 chapter' : `${chapterCount.toLocaleString()} chapters`
}

/** Every `.wbook` verdict as card content: the confirm card, or its refusal. */
export function describeWingletBook(verdict: WingletBookVerdict): BookCardContent {
  if (verdict.status !== 'accepted') return describeRefusal(verdict)

  const { title, chapterCount, categoryName } = verdict.confirmation
  return {
    kind: 'confirm',
    title,
    // A curated book carries its own category, so the card names it rather than
    // offering a picker.
    meta: [chapterLabel(chapterCount), categoryName],
    detail: 'This book is already prepared — there is nothing to clean up or set up.'
  }
}
