/**
 * Winglet Book v2 — the normative single-book contract (ADR-0033).
 *
 * This module IS the contract: envelope types, detection marker, supported
 * schema version, the structural validator (the ADR-0033 §4 acceptance ladder
 * as typed verdicts), and the deterministic derivations the Reader performs at
 * import. WingletBooks vendors this file through its one-way `sync-reader.mjs`
 * and pins it with a drift test — keep it pure: no Electron, no filesystem,
 * no imports outside `src/shared/`.
 *
 * Supersedes the v1 Library Bundle (`libraryBundle.ts`, ADR-0018) as the
 * cross-repo delivery contract; v1 is refused as unsupported, never read.
 */
import { countWords } from './importTextCleanup'

/** Authoritative detection marker; the `.wbook` extension is advisory only. */
export const WINGLET_BOOK_FORMAT = 'winglet-book'

/**
 * Current contract generation. The Reader accepts every version from 2 up to
 * this one; bump only when an older Reader would import a file *incorrectly*
 * (tolerant-reader rule — additive optional fields need no bump).
 */
export const WINGLET_BOOK_SCHEMA_VERSION = 2

export interface WingletBookSegment {
  title: string
  content: string
}

export interface WingletBookPayload {
  /** The book's identity; opaque, compared by exact string match. */
  seedId: string
  title: string
  /** Category NAME, matched/merged by name; null ⇒ Uncategorized. Never a numeric id. */
  categoryRef: string | null
  /** The chapters, in reading order (array order is the order). */
  segments: WingletBookSegment[]
}

export interface WingletBookDocument {
  format: typeof WINGLET_BOOK_FORMAT
  schemaVersion: number
  book: WingletBookPayload
}

/**
 * The §4 acceptance ladder as data. `unsupported-version` distinguishes
 * `newer` (file made for a future Reader — "please update") from other
 * refused versions (v1 and any non-accepted value) so the UI can word the
 * message; `malformed` carries a diagnostic reason for logs, not for the UI.
 */
export type WingletBookVerdict =
  | { kind: 'foreign' }
  | { kind: 'unsupported-version'; schemaVersion: number; newer: boolean }
  | { kind: 'malformed'; reason: string }
  | { kind: 'valid'; book: WingletBookPayload }

function isBlank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim() === ''
}

/**
 * Structural validator. Tolerant reader: unknown fields at any level are
 * ignored, never a rejection — the returned payload is rebuilt from the
 * recognized fields only. Structure is all that is validated; prose quality
 * is the producer's obligation (§3.3) and is never checked here.
 */
export function validateWingletBook(input: unknown): WingletBookVerdict {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { kind: 'foreign' }
  }
  const doc = input as Record<string, unknown>
  if (doc.format !== WINGLET_BOOK_FORMAT) return { kind: 'foreign' }

  const version = doc.schemaVersion
  if (typeof version !== 'number' || Number.isNaN(version)) {
    return { kind: 'malformed', reason: 'schemaVersion missing or not a number' }
  }
  if (!Number.isInteger(version) || version < 2 || version > WINGLET_BOOK_SCHEMA_VERSION) {
    return {
      kind: 'unsupported-version',
      schemaVersion: version,
      newer: version > WINGLET_BOOK_SCHEMA_VERSION
    }
  }

  const book = doc.book
  if (typeof book !== 'object' || book === null || Array.isArray(book)) {
    return { kind: 'malformed', reason: 'book missing or not an object' }
  }
  const b = book as Record<string, unknown>
  if (isBlank(b.seedId)) return { kind: 'malformed', reason: 'book.seedId missing or blank' }
  if (isBlank(b.title)) return { kind: 'malformed', reason: 'book.title missing or blank' }

  // Present-but-wrong-type is damage; absent and null both mean Uncategorized.
  const categoryRef = b.categoryRef ?? null
  if (categoryRef !== null && typeof categoryRef !== 'string') {
    return { kind: 'malformed', reason: 'book.categoryRef not a string or null' }
  }

  if (!Array.isArray(b.segments) || b.segments.length === 0) {
    return { kind: 'malformed', reason: 'book.segments missing or empty' }
  }
  const segments: WingletBookSegment[] = []
  for (let i = 0; i < b.segments.length; i++) {
    const segment = b.segments[i] as Record<string, unknown> | null
    if (typeof segment !== 'object' || segment === null || Array.isArray(segment)) {
      return { kind: 'malformed', reason: `segments[${i}] not an object` }
    }
    if (isBlank(segment.title)) {
      return { kind: 'malformed', reason: `segments[${i}].title missing or blank` }
    }
    if (isBlank(segment.content)) {
      return { kind: 'malformed', reason: `segments[${i}].content missing or blank` }
    }
    segments.push({ title: segment.title as string, content: segment.content as string })
  }

  return {
    kind: 'valid',
    book: { seedId: b.seedId as string, title: b.title as string, categoryRef, segments }
  }
}

export interface DerivedWingletSegment {
  title: string
  content: string
  /** Array position; matches the v1 producer's 0-based `order`. */
  order: number
  word_count: number
  /** Cumulative word index into the book's content; end exclusive, next start = previous end. */
  startWordOffset: number
  endWordOffset: number
}

export interface DerivedWingletBook {
  seedId: string
  title: string
  categoryRef: string | null
  /** Segment contents joined with "\n\n" — the text the store persists and the engine reads. */
  content: string
  word_count: number
  segment_count: number
  segments: DerivedWingletSegment[]
}

/**
 * Everything the Reader stores that the file does not carry, derived
 * deterministically (§3.4). Word counting is the frozen `\s+` tokenization
 * (`countWords`), so offsets always agree with the Reader's own tokenizer —
 * correct by construction, byte-identical to what the v1 producer computed.
 */
export function deriveWingletBook(book: WingletBookPayload): DerivedWingletBook {
  let offset = 0
  const segments = book.segments.map((segment, index) => {
    const word_count = countWords(segment.content)
    const derived: DerivedWingletSegment = {
      title: segment.title,
      content: segment.content,
      order: index,
      word_count,
      startWordOffset: offset,
      endWordOffset: offset + word_count
    }
    offset += word_count
    return derived
  })
  const content = book.segments.map((segment) => segment.content).join('\n\n')
  return {
    seedId: book.seedId,
    title: book.title,
    categoryRef: book.categoryRef,
    content,
    word_count: countWords(content),
    segment_count: segments.length,
    segments
  }
}
