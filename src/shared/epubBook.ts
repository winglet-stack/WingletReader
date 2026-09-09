/**
 * EPUB Book — the pure contract module for EPUB import (ADR-0034).
 *
 * Sibling of `wingletBook.ts`: types, verdicts, and the deterministic
 * derivation the Reader performs at import. Deliberately pure — no Electron,
 * no filesystem, no zip/XML libraries, no imports outside `src/shared/`. The
 * main-process container ladder (`src/main/epubImport.ts`) feeds this module
 * an already-extracted `EpubParseInput` and reports its verdicts.
 *
 * Governing invariant (ADR-0034 §3): **preserve the original text.** Nothing
 * in the reading flow is dropped — spine text ahead of the first table-of-
 * contents entry becomes a leading "Front Matter" segment, chapters may merge
 * when a publisher's TOC is coarse, but words are never discarded.
 *
 * NOT a Winglet Book: no `seedId`, no `categoryRef`, no curated identity.
 */
import { countWords } from './importTextCleanup'

/** Title of the leading segment holding spine text before the first TOC entry. */
export const EPUB_FRONT_MATTER_TITLE = 'Front Matter'

/** Hostile-input caps (ADR-0034 §6); enforced by the main-process ladder. */
export const EPUB_CONTAINER_BYTE_CAP = 100 * 1024 * 1024
/** Cumulative extracted-text cap — the zip-bomb backstop. */
export const EPUB_TEXT_BYTE_CAP = 50 * 1024 * 1024

/** One linear spine item's extracted, cleaned text. */
export interface EpubSpineItem {
  text: string
  /** First `h1`–`h6` in the file, if any — the per-file fallback chapter title. */
  firstHeading: string | null
}

/** One flattened table-of-contents entry, resolved to a spine position. */
export interface EpubTocEntry {
  label: string
  spineIndex: number
}

/**
 * What the container parser hands over. Everything is already resolved:
 * metadata picked, `linear="no"` spine items excluded, XHTML extracted and run
 * through the reduced cleanup profile, nested TOC nesting collapsed.
 */
export interface EpubParseInput {
  /** Resolved upstream: `dc:title`, else the filename sans extension. */
  title: string
  /** First `dc:creator`, if any. */
  author: string | null
  /** First `dc:identifier`, if any — diagnostics only; never a dedupe key. */
  identifier: string | null
  /** Linear spine items in reading order. */
  spine: EpubSpineItem[]
  /** Flattened TOC entries in resolution order (document order, depth-first). */
  toc: EpubTocEntry[]
}

export interface DerivedEpubSegment {
  title: string
  content: string
  /** Array position. */
  order: number
  word_count: number
  /** Cumulative word index into the book's content; end exclusive, next start = previous end. */
  startWordOffset: number
  endWordOffset: number
}

export interface DerivedEpubBook {
  title: string
  author: string | null
  identifier: string | null
  /** Segment contents joined with "\n\n" — or the joined spine when unsegmented. */
  content: string
  word_count: number
  /** 0 for the unsegmented last resort; `segments.length` otherwise. */
  segment_count: number
  segments: DerivedEpubSegment[]
}

/** Which hostile-input cap an `oversized` refusal tripped. */
export type EpubSizeCap = 'container' | 'text'

/**
 * The acceptance ladder as data, in the `WingletBookVerdict` style.
 * `drm-protected` is its own named refusal (ADR-0034 §1) rather than a generic
 * damage report; `malformed` carries a diagnostic reason for logs, not the UI.
 */
export type EpubVerdict =
  | { kind: 'drm-protected' }
  | { kind: 'oversized'; cap: EpubSizeCap; limitBytes: number; observedBytes?: number }
  | { kind: 'malformed'; reason: string }
  | { kind: 'valid'; book: DerivedEpubBook }

function isBlank(value: string): boolean {
  return value.trim() === ''
}

/** A segment before word counting — the shape both ladder rungs produce. */
interface RawSegment {
  title: string
  content: string
}

/**
 * Spine texts for `[from, to)` trimmed, blanks dropped, joined with "\n\n".
 * Dropping a whitespace-only file removes no words and no punctuation, so the
 * preservation invariant is untouched; trimming keeps the paragraph joins clean.
 */
function joinSpineRange(spineTexts: string[], from: number, to: number): string {
  const parts: string[] = []
  for (let i = from; i < to; i++) {
    const text = spineTexts[i].trim()
    if (text !== '') parts.push(text)
  }
  return parts.join('\n\n')
}

/**
 * TOC entries usable as segment boundaries: out-of-range positions are dropped,
 * several entries landing on one spine item collapse to the **first** in
 * resolution order (chapters may merge; text is never dropped — ADR-0034 §3),
 * and the survivors are sorted ascending.
 */
function resolveBoundaries(toc: EpubTocEntry[], spineLength: number): EpubTocEntry[] {
  const seen = new Set<number>()
  const boundaries: EpubTocEntry[] = []
  for (const entry of toc) {
    const index = entry.spineIndex
    if (!Number.isInteger(index) || index < 0 || index >= spineLength) continue
    if (seen.has(index)) continue
    seen.add(index)
    boundaries.push(entry)
  }
  return boundaries.sort((a, b) => a.spineIndex - b.spineIndex)
}

/** `firstHeading` when the publisher gave one, else the positional "Section N". */
function fallbackTitle(firstHeading: string | null | undefined, position: number): string {
  if (typeof firstHeading === 'string' && !isBlank(firstHeading)) return firstHeading.trim()
  return `Section ${position}`
}

/** TOC rung: text between consecutive boundaries is one segment, titled by its label. */
function segmentsFromBoundaries(
  boundaries: EpubTocEntry[],
  input: EpubParseInput,
  spineTexts: string[]
): RawSegment[] {
  const segments: RawSegment[] = []
  const push = (title: string, content: string, spineIndex: number): void => {
    if (isBlank(content)) return
    const resolved = isBlank(title)
      ? fallbackTitle(input.spine[spineIndex]?.firstHeading, segments.length + 1)
      : title.trim()
    segments.push({ title: resolved, content })
  }

  // No-drop invariant: anything ahead of the first boundary is Front Matter.
  // A boundary at spine index 0 leaves nothing before it, so none is created.
  const first = boundaries[0].spineIndex
  if (first > 0) {
    const content = joinSpineRange(spineTexts, 0, first)
    if (!isBlank(content)) segments.push({ title: EPUB_FRONT_MATTER_TITLE, content })
  }

  for (let i = 0; i < boundaries.length; i++) {
    const from = boundaries[i].spineIndex
    const to = i + 1 < boundaries.length ? boundaries[i + 1].spineIndex : spineTexts.length
    push(boundaries[i].label, joinSpineRange(spineTexts, from, to), from)
  }

  return segments
}

/** Fallback rung: one segment per spine item, titled by its first heading. */
function segmentsPerSpineItem(input: EpubParseInput, spineTexts: string[]): RawSegment[] {
  const segments: RawSegment[] = []
  for (let i = 0; i < spineTexts.length; i++) {
    const content = joinSpineRange(spineTexts, i, i + 1)
    if (isBlank(content)) continue
    segments.push({ title: fallbackTitle(input.spine[i].firstHeading, segments.length + 1), content })
  }
  return segments
}

function assemble(input: EpubParseInput, raw: RawSegment[]): DerivedEpubBook {
  let offset = 0
  const segments = raw.map((segment, index) => {
    const word_count = countWords(segment.content)
    const derived: DerivedEpubSegment = {
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
  const content = raw.map((segment) => segment.content).join('\n\n')
  return {
    title: input.title,
    author: input.author,
    identifier: input.identifier,
    content,
    word_count: countWords(content),
    segment_count: segments.length,
    segments
  }
}

/**
 * The ADR-0034 §3 derivation: publisher structure in, store-ready book out.
 *
 * Ladder — usable TOC boundaries → one segment per spine file → unsegmented
 * single text. Import never fails because chapters could not be resolved; only
 * chapter quality degrades. Word counting is the frozen `\s+` tokenization
 * (`countWords`), so offsets always agree with the Reader's own tokenizer and
 * are contiguous by construction, exactly as `deriveWingletBook` produces.
 */
export function deriveEpubBook(input: EpubParseInput): DerivedEpubBook {
  const spineTexts = input.spine.map((item) => item.text ?? '')

  const boundaries = resolveBoundaries(input.toc, spineTexts.length)
  let segments = boundaries.length > 0 ? segmentsFromBoundaries(boundaries, input, spineTexts) : []

  if (segments.length === 0) {
    // Per-file rung — worth taking only when it actually chapters the book.
    const perFile = segmentsPerSpineItem(input, spineTexts)
    segments = perFile.length >= 2 ? perFile : []
  }

  if (segments.length === 0) {
    // Last resort: one unsegmented text. `segments: []` / `segment_count: 0`
    // is the signal the store inserts a text row with no segment rows.
    const content = joinSpineRange(spineTexts, 0, spineTexts.length)
    return {
      title: input.title,
      author: input.author,
      identifier: input.identifier,
      content,
      word_count: countWords(content),
      segment_count: 0,
      segments: []
    }
  }

  return assemble(input, segments)
}
