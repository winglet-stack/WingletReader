import type { UsePasteOrFileImportOptions } from '../../hooks/usePasteOrFileImport'
import type { BookCardContent } from './BookCard'
import {
  WINGLET_BOOK_LABEL,
  describeWingletBook,
  type WingletBookVerdict
} from './wingletBookVerdict'
import { EPUB_BOOK_LABEL, describeEpubBook, type EpubBookVerdict } from './epubVerdict'

/**
 * The structured-book import channels, as data.
 *
 * A structured book (`.wbook`, ADR-0033; `.epub`, ADR-0034 §8) skips the
 * cleanup/preview flow entirely: the pick resolves to one verdict, the verdict
 * takes over the Import surface as a card, and the card either commits the book
 * or says why it cannot. Both formats do exactly that, and the planned
 * public-library API will be a third caller at the same door.
 *
 * So the surface does not branch per format — it looks a channel up and renders
 * what the channel supplies. Everything that differs between `.wbook` and
 * `.epub` is a field on the descriptor below, and since
 * `architecture-depth/05` that includes the card copy: there is **one** card
 * component (`BookCard`), and a channel describes what it should say. Adding a
 * third channel is a registration in {@link IMPORT_BOOK_CHANNELS}, not another
 * branch in `ImportPanel` and not another card.
 *
 * This is the renderer half of the same seam the main process draws in
 * `src/main/bookIntake.ts`; a format is one adapter there and one channel here.
 */

/**
 * The least a verdict carries, whichever channel produced it: the status the
 * card switches its copy on, and the one every commit answer — success
 * included — is told apart by.
 */
export interface ImportBookVerdict {
  status: string
}

/**
 * The one shape every channel reports a successful commit in: it committed, and
 * here is the row it wrote (`architecture-depth/04`; ADR-0033 amendment).
 *
 * Read off the preload surface rather than re-declared, the same way the
 * describers read their verdicts — that keeps this pinned to the main-process
 * envelope without a second hand-maintained copy.
 */
export type BookCommitted = Extract<
  Awaited<ReturnType<typeof window.api.data.commitEpub>>,
  { status: 'committed' }
>

/**
 * The `usePasteOrFileImport` option a channel's pick arrives on. The hook routes
 * by file extension and hands the pick to the matching option; a channel names
 * the one it answers to (ADR-0034 §8).
 */
export type ImportBookPickOption = Extract<
  keyof UsePasteOrFileImportOptions,
  'onWingletBook' | 'onEpubBook'
>

/**
 * What a commit answered: either it committed — and every channel says so the
 * same way, carrying the new row's id — or it refused, and the answer is that
 * channel's own verdict for the card to draw.
 *
 * Success being one shape is the whole point (ADR-0033 amendment; the shape is
 * ADR-0034 §2's). Refusals stay per format because that is where the formats
 * really differ.
 */
export type ImportBookCommitAnswer<Verdict extends ImportBookVerdict = ImportBookVerdict> =
  | BookCommitted
  | Verdict

/**
 * The one success check on the whole Import surface. Nothing above this line
 * asks which format committed, and nothing below it needs to.
 */
export function isCommittedBook(answer: ImportBookCommitAnswer): answer is BookCommitted {
  return answer.status === 'committed'
}

export interface ImportBookChannel<Verdict extends ImportBookVerdict = ImportBookVerdict> {
  /** Stable identity for the open door. Not user-visible. */
  id: string
  /** The format label the card puts above the title. User-visible. */
  label: string
  pickOption: ImportBookPickOption
  /** Parse-only recognition of the picked path. Writes nothing. */
  parse(filePath: string): Promise<Verdict>
  /**
   * Commits the same path. Deliberately re-sends only the path: commit re-runs
   * the whole ladder from disk, so a duplicate raced in since the parse — or an
   * edited file — comes back as its own verdict instead of a stale insert.
   */
  commit(filePath: string): Promise<ImportBookCommitAnswer<Verdict>>
  /**
   * Everything the one card needs to draw this verdict — the confirm card, or
   * the refusal's message, detail and tone. This is where a format's product
   * voice lives.
   */
  describe(verdict: Verdict): BookCardContent
}

/**
 * Does this verdict offer the add action, or is it a refusal?
 *
 * Asked of the description rather than of the status, so "what the card draws"
 * and "what the confirm button is allowed to do" cannot drift apart: there is
 * one place a format decides a verdict is acceptable.
 */
export function offersAdd(channel: ImportBookChannel, verdict: ImportBookVerdict): boolean {
  return channel.describe(verdict).kind === 'confirm'
}

/**
 * Erases the per-format verdict type so the registry is one list the surface can
 * hold without knowing which door is open. Safe by construction: a channel only
 * ever meets its own verdicts — `parse` and `commit` are the only producers,
 * `describe` the only consumer, and the intake hook keeps the two together as
 * one `{ channel, verdict }` value.
 */
function registerBookChannel<Verdict extends ImportBookVerdict>(
  channel: ImportBookChannel<Verdict>
): ImportBookChannel {
  return channel as unknown as ImportBookChannel
}

const wingletBookChannel = registerBookChannel<WingletBookVerdict>({
  id: 'winglet-book',
  label: WINGLET_BOOK_LABEL,
  pickOption: 'onWingletBook',
  parse: (filePath) => window.api.data.parseWingletBook(filePath),
  // Both commits answer the shared envelope, so there is nothing left to map:
  // the channel hands the answer straight through to the one success check.
  commit: (filePath) => window.api.data.commitWingletBook(filePath),
  describe: describeWingletBook
})

const epubBookChannel = registerBookChannel<EpubBookVerdict>({
  id: 'epub-book',
  label: EPUB_BOOK_LABEL,
  pickOption: 'onEpubBook',
  parse: (filePath) => window.api.data.parseEpub(filePath),
  commit: (filePath) => window.api.data.commitEpub(filePath),
  describe: describeEpubBook
})

/** Registration order is the lookup order; the pick itself decides which one runs. */
export const IMPORT_BOOK_CHANNELS: readonly ImportBookChannel[] = [
  wingletBookChannel,
  epubBookChannel
]
