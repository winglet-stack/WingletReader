/**
 * Winglet Book import — the format adapter behind the shared book-intake door
 * (ADR-0033 §4; WB-2a + WB-2b, folded into one intake by
 * `architecture-depth/05`).
 *
 * The parse-then-commit pair, its totality wrapper, the store insert and the
 * segment-write rollback all live in `./bookIntake` and are shared with every
 * other format. What is left here is the part that is genuinely `.wbook`: the
 * §4 acceptance ladder over the bytes on disk, the present-texts `seed_id`
 * duplicate check, the by-name category merge, and the five words this format
 * refuses in.
 *
 * All contract judgement comes from `../shared/wingletBook` (WB-1); no
 * validation or derivation is re-implemented here. This module only adds the
 * three things the contract module cannot know about: the bytes on disk, the
 * user's currently-present library, and the store fields a curated book lands
 * with.
 */
import fs from 'fs'
import { UNCATEGORIZED_CATEGORY_ID, type Database } from './database'
import {
  createBookIntake,
  type BookIntakeAdapter,
  type IntakeOutcome,
  type IntakeTextFields
} from './bookIntake'
import {
  deriveWingletBook,
  validateWingletBook,
  type WingletBookPayload
} from '../shared/wingletBook'
import type {
  WingletBookCommitResult,
  WingletBookConfirmation,
  WingletBookParseResult,
  WingletBookRefusal
} from '../shared/channelContract'
export type {
  WingletBookCommitResult,
  WingletBookConfirmation,
  WingletBookParseResult,
  WingletBookRefusal
} from '../shared/channelContract'

/** Advisory extension — the `format` marker is what actually decides (§4). */
export const WINGLET_BOOK_EXTENSION = 'wbook'

/** Read guard; a curated book is JSON prose and never approaches this. */
const MAX_WBOOK_BYTES = 50 * 1024 * 1024

/** The ladder's own verdict — a refusal, or the validated book awaiting a use. */
type LadderResult = WingletBookRefusal | { status: 'valid'; book: WingletBookPayload }

/** Defensive BOM strip: the contract says no BOM, editors disagree (§3.1). */
function stripBom(raw: string): string {
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
}

/**
 * The category name the confirm card shows. Categories match/merge by exact
 * name, so a named ref resolves to itself whether or not it exists yet; only the
 * empty ref needs the store, for the built-in folder's own name.
 */
function resolveCategoryName(db: Database, categoryRef: string | null): string {
  const requested = typeof categoryRef === 'string' ? categoryRef.trim() : ''
  if (requested) return requested
  const uncategorized = db.getCategories().find((c) => c.id === UNCATEGORIZED_CATEGORY_ID)
  return uncategorized?.name ?? 'Uncategorized'
}

/**
 * Resolves a book's category NAME to a store category id, reusing the existing
 * by-name `importCategories` merge so a name already present (built-in or user)
 * is shared rather than duplicated. A null/blank ref ⇒ undefined, which
 * `saveText` resolves to the built-in Uncategorized category.
 *
 * This **writes** when the name is new, which is why the intake only reaches it
 * on the commit half — a parse must leave the library exactly as it was.
 */
function resolveCategoryId(db: Database, categoryRef: string | null): number | undefined {
  const name = typeof categoryRef === 'string' ? categoryRef.trim() : ''
  if (!name) return undefined
  // importCategories keys off numeric source ids; synthesize one and read it back.
  const idMap = db.importCategories([{ id: 1, name }])
  return idMap.get(1)
}

/** Reads the file as text, or reports the read failure as a ladder outcome. */
function readFile(filePath: string): { ok: true; raw: string } | { ok: false; reason: string } {
  try {
    const stat = fs.statSync(filePath)
    if (!stat.isFile()) return { ok: false, reason: 'not a file' }
    if (stat.size > MAX_WBOOK_BYTES) return { ok: false, reason: 'file exceeds 50 MB' }
    return { ok: true, raw: fs.readFileSync(filePath, 'utf-8') }
  } catch {
    // Missing, locked, or unreadable. From here that is indistinguishable from
    // damage, and the ladder has no sixth outcome to spend on it.
    return { ok: false, reason: 'file could not be read' }
  }
}

/**
 * The §4 ladder: bytes → JSON → contract verdict → present-texts identity check.
 * Read every time, by both halves of the pair — this is what makes commit
 * stateless, and what makes a file that changed between the calls fail honestly.
 */
function runLadder(db: Database, filePath: string): LadderResult {
  const read = readFile(filePath)
  if (!read.ok) return { status: 'malformed', filePath, reason: read.reason }

  let parsed: unknown
  try {
    parsed = JSON.parse(stripBom(read.raw))
  } catch {
    // Step 1: "not JSON" is "this isn't a Winglet Book", not damage.
    return { status: 'foreign', filePath }
  }

  const verdict = validateWingletBook(parsed)
  switch (verdict.kind) {
    case 'foreign':
      return { status: 'foreign', filePath }
    case 'unsupported-version':
      return {
        status: 'unsupported-version',
        filePath,
        schemaVersion: verdict.schemaVersion,
        newer: verdict.newer
      }
    case 'malformed':
      return { status: 'malformed', filePath, reason: verdict.reason }
  }

  const book = verdict.book
  if (db.hasSeedId(book.seedId)) {
    return { status: 'duplicate', filePath, seedId: book.seedId, title: book.title }
  }
  return { status: 'valid', book }
}

function confirmationFor(db: Database, book: WingletBookPayload): WingletBookConfirmation {
  return {
    seedId: book.seedId,
    title: book.title,
    chapterCount: book.segments.length,
    categoryName: resolveCategoryName(db, book.categoryRef)
  }
}

/**
 * What a curated book adds to the text row: its frozen `seed_id` identity, and
 * the category merged in by name. `is_manual_book` is deliberately left unset —
 * a Winglet Book is a curated work, and `saveText` defaults the flag to false.
 */
function storeFields(db: Database, book: WingletBookPayload): IntakeTextFields {
  return {
    seed_id: book.seedId,
    category_id: resolveCategoryId(db, book.categoryRef)
  }
}

/**
 * The `.wbook` adapter. Everything format-specific is supplied as data — the
 * refusal words, the confirm card, the row fields — so the intake never asks
 * which format it is running.
 */
const wingletBookAdapter: BookIntakeAdapter<WingletBookConfirmation, WingletBookRefusal> = {
  format: 'winglet-book',

  // The ladder's own catch-all rung, reused for anything the intake meets that
  // the ladder never sees: an unusable path, or a store failure.
  refuse: (filePath, reason) => ({ status: 'malformed', filePath, reason }),

  derive: async (
    db,
    filePath
  ): Promise<IntakeOutcome<WingletBookConfirmation, WingletBookRefusal>> => {
    const outcome = runLadder(db, filePath)
    if (outcome.status !== 'valid') return { accepted: false, refusal: outcome }

    const book = outcome.book
    return {
      accepted: true,
      confirmation: confirmationFor(db, book),
      // Derivation (§3.4) and the category merge are both commit-only work: one
      // costs a whole-book pass, the other can create a folder.
      prepare: () => ({ book: deriveWingletBook(book), fields: storeFields(db, book) })
    }
  }
}

const wingletBookIntake = createBookIntake(wingletBookAdapter)

/** Parse-only: reports what the confirm card should say. Writes nothing. */
export function parseWingletBookFile(
  db: Database,
  filePath: unknown
): Promise<WingletBookParseResult> {
  return wingletBookIntake.parse(db, filePath)
}

/**
 * Commit: re-runs the whole ladder from disk and, only on a still-valid and
 * still-new book, lands it complete — text with `seed_id`, chapters in order
 * with contiguous offsets, category created or merged by name — and answers
 * `committed` with the new text's id (ADR-0033 amendment). Any other outcome
 * leaves the store exactly as it was and keeps its own refusal verdict.
 */
export function commitWingletBookFile(
  db: Database,
  filePath: unknown
): Promise<WingletBookCommitResult> {
  return wingletBookIntake.commit(db, filePath)
}
