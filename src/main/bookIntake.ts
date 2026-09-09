/**
 * Book intake — one ladder, one envelope, one door per format
 * (`architecture-depth/05`).
 *
 * A structured book arrives as a path and leaves as a row in the library, and
 * every format takes the same route: **parse** recognizes the picked file and
 * reports what the confirm card should say, touching nothing; **commit** runs
 * the *same* ladder again from the bytes on disk and only then inserts. The pair
 * is deliberately stateless — no payload is stashed, no token is handed back —
 * so a file edited since it was parsed, or a duplicate that raced in between the
 * two calls, gets its own typed verdict instead of a stale insert.
 *
 * That route is written **once**, here. What a format brings is a
 * {@link BookIntakeAdapter}: given the store and a path, produce a derived book
 * or a refusal in its own words. Everything that differs between `.wbook` and
 * `.epub` — the duplicate check, the category merge, the metadata, the import
 * diagnostics, the refusal vocabulary — is **data the adapter supplies**, never
 * a branch this module takes on a format tag. There is no `switch (format)`
 * below, and adding a third format (the planned public-library API is one) costs
 * an adapter and nothing else; `__tests__/bookIntake.test.ts` proves that with a
 * fake one.
 *
 * **Chapters are never re-detected here.** Each format resolves them upstream —
 * the producer for `.wbook` (ADR-0033 §3.4), the publisher's table of contents
 * for EPUB (ADR-0034 §3) — and hands this module segments that are already
 * ordered, counted and offset. The intake stamps them `detected_heading` and
 * writes them; it never looks at the prose.
 */
import type { Database } from './database'
import type { BookCommitted } from '../shared/channelContract'

/**
 * The extra text-row fields a format contributes, beyond the title and content
 * every book has. Read off the store's own ordinary write path rather than
 * re-declared, so an adapter can only supply fields `saveText` actually takes.
 */
export type IntakeTextFields = Omit<Parameters<Database['saveText']>[0], 'title' | 'content'>

/** One chapter as its format derived it; order, count and offsets are final. */
export interface IntakeSegment {
  title: string
  content: string
  order: number
  word_count: number
  startWordOffset: number
  endWordOffset: number
}

/**
 * The derived shape every format converges on. `content` is the segments joined
 * — derived, never carried by the file — and the offsets are contiguous by
 * construction because every format counts with the same frozen word counter.
 */
export interface IntakeBook {
  title: string
  content: string
  /** Empty for a format's unsegmented last resort: a text row and nothing else. */
  segments: IntakeSegment[]
}

/** A derived book together with the row fields its format adds. */
export interface IntakeInsert {
  book: IntakeBook
  fields: IntakeTextFields
}

/**
 * What an adapter's ladder answers: this format's own refusal, or an accepted
 * book — the confirm card now, and the row on demand.
 *
 * The insert half is a thunk on purpose. Parse promises to write nothing, and
 * for at least one format resolving the row fields *does* write (`.wbook` merges
 * its category by name and may create it); deriving the book is also a
 * whole-book pass no parse needs. Only {@link BookIntake.commit} calls it.
 */
export type IntakeOutcome<Confirmation, Refusal> =
  | { accepted: false; refusal: Refusal }
  | { accepted: true; confirmation: Confirmation; prepare: () => IntakeInsert }

/**
 * One format at this door.
 *
 * The interface is small on purpose: a format is a ladder plus the words it
 * refuses in. Everything else — totality, re-validation, the insert, the
 * rollback, the success envelope — belongs to the intake and is not an
 * adapter's business.
 */
export interface BookIntakeAdapter<Confirmation, Refusal extends { status: string }> {
  /** Stable name for the door. Diagnostics and tests only; never user-visible. */
  readonly format: string

  /**
   * This format's whole acceptance ladder, from the bytes on disk. Called once
   * per parse **and again** per commit, so it must re-read the file every time
   * and consult the live store for any identity check it makes — that is what
   * makes the pair stateless.
   */
  derive(db: Database, filePath: string): Promise<IntakeOutcome<Confirmation, Refusal>>

  /**
   * This format's word for "that did not work, and the ladder has no rung for
   * it": an unusable path, or a store failure. Supplied by the adapter rather
   * than assumed by the intake, so the refusal vocabulary stays entirely the
   * format's own.
   */
  refuse(filePath: string, reason: string): Refusal
}

/** The parse half's success answer; the confirmation is the format's own shape. */
export interface BookAccepted<Confirmation> {
  status: 'accepted'
  filePath: string
  confirmation: Confirmation
}

/**
 * The parse-then-commit pair one adapter is wrapped into.
 *
 * Refusals are the adapter's own type; success is not. Commit answers
 * `BookCommitted` — *it committed, and here is the row it wrote* — read from
 * `src/shared/channelContract.ts` rather than restated here, because it is the
 * one part of the envelope no format gets to choose (ADR-0033 amendment; the
 * shape is ADR-0034 §2's).
 */
export interface BookIntake<Confirmation, Refusal> {
  /** Parse-only: reports what the confirm card should say. Writes nothing. */
  parse(db: Database, filePath: unknown): Promise<BookAccepted<Confirmation> | Refusal>
  /** Commit: re-runs the ladder from disk, then lands the book complete or not at all. */
  commit(db: Database, filePath: unknown): Promise<BookCommitted | Refusal>
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Inserts a derived book through the ordinary store paths — `saveText` then
 * `saveSegments`, the same two calls any import makes.
 *
 * Chapters are stamped `detected_heading` because they were resolved upstream
 * and behave as headings, not as word-count chunks. `word_count` is left to
 * `saveText` and `segment_count` to the segment rows, both of which count with
 * the same tokenization the derivation used, so the numbers cannot disagree.
 *
 * Throws only if the store itself fails; the rollback keeps that failure from
 * leaving half a book behind, and {@link createBookIntake} turns it into the
 * format's own refusal.
 */
function insertBook(db: Database, { book, fields }: IntakeInsert): number {
  const text = db.saveText({ ...fields, title: book.title, content: book.content })
  const textId = text.id!

  // A format's unsegmented last resort: a text row and nothing else — writing
  // zero segments would only clear rows that do not exist.
  if (book.segments.length === 0) return textId

  try {
    db.saveSegments(
      textId,
      book.segments.map((segment) => ({
        title: segment.title,
        content: segment.content,
        order: segment.order,
        sourceType: 'detected_heading' as const,
        word_count: segment.word_count,
        startWordOffset: segment.startWordOffset,
        endWordOffset: segment.endWordOffset
      }))
    )
  } catch (error) {
    // A chapterless book is worse than no book: take the text back out so the
    // failure surfaces as a refusal with the library untouched. (A category the
    // adapter's merge may have created is left alone — an empty folder is inert,
    // and removing it could delete one the user already had.)
    try {
      db.deleteText(textId)
    } catch {
      // The store is already failing; there is nothing further to try here.
    }
    throw error
  }

  return textId
}

/**
 * Wraps one adapter into the parse-then-commit pair the IPC layer registers.
 *
 * Both halves are **total**: every input — a non-string path, a hostile file, an
 * unexpected store failure — resolves to a typed verdict, so the IPC boundary
 * can never reject and the Import surface always has something to say. The two
 * outcomes the intake itself can produce are worded by the adapter's
 * {@link BookIntakeAdapter.refuse}, which is why nothing here knows a format.
 */
export function createBookIntake<Confirmation, Refusal extends { status: string }>(
  adapter: BookIntakeAdapter<Confirmation, Refusal>
): BookIntake<Confirmation, Refusal> {
  async function total<Answer>(
    filePath: unknown,
    run: (path: string) => Promise<Answer | Refusal>
  ): Promise<Answer | Refusal> {
    const path = typeof filePath === 'string' ? filePath : ''
    if (path === '') return adapter.refuse('', 'no file path')
    try {
      return await run(path)
    } catch (error) {
      return adapter.refuse(path, `unexpected failure: ${describeError(error)}`)
    }
  }

  return {
    parse: (db, filePath) =>
      total<BookAccepted<Confirmation>>(filePath, async (path) => {
        const outcome = await adapter.derive(db, path)
        if (!outcome.accepted) return outcome.refusal
        return { status: 'accepted', filePath: path, confirmation: outcome.confirmation }
      }),

    commit: (db, filePath) =>
      total<BookCommitted>(filePath, async (path) => {
        // Re-run from disk, never from what the parse call saw: this is where an
        // edited file or a raced duplicate is caught (ADR-0033 §4).
        const outcome = await adapter.derive(db, path)
        if (!outcome.accepted) return outcome.refusal

        let textId: number
        try {
          textId = insertBook(db, outcome.prepare())
        } catch (error) {
          // A store failure has no rung of its own on any format's ladder; the
          // adapter's catch-all refusal carries it, because letting the IPC call
          // reject would leave the Import surface with nothing to say.
          return adapter.refuse(path, `could not be saved: ${describeError(error)}`)
        }
        return { status: 'committed', filePath: path, textId }
      })
  }
}
