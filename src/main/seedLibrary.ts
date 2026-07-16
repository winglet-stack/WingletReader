/**
 * Reader Seed loader (ADR-0018, mirroring WingletBooks ADR-0003).
 *
 * On launch, ingests a versioned Library Bundle from `resources/default-library.json`
 * and seeds curated default books. Strictly additive: it touches no existing import
 * path or surface. The bundle is the single source of truth — segments are seeded
 * exactly as carried (no re-detection, no offset recomputation).
 *
 * Dedupe is against a permanent ledger of every `seedId` ever inserted, NOT against
 * currently-present texts, so a user-deleted seeded book never resurrects. Seeding
 * is insert-only: an already-seeded `seedId` is skipped, never updated in place, so
 * user edits and deletions are never clobbered.
 */
import fs from 'fs'
import { join } from 'path'
import type { Database } from './database'
import { BUNDLE_SCHEMA_VERSION, type LibraryBundle } from '../shared/libraryBundle'

/** The bundle file the developer drops into the Reader's `resources/` by hand. */
export const SEED_RESOURCE_FILENAME = 'default-library.json'

export interface SeedResult {
  /** seedIds newly inserted by this run. */
  seeded: string[]
  /** seedIds present in the bundle but already in the ledger (skipped). */
  skipped: string[]
  /** False when the run early-out (no version bump / schema mismatch / no bundle). */
  ranScan: boolean
}

function emptyResult(): SeedResult {
  return { seeded: [], skipped: [], ranScan: false }
}

/**
 * Resolves a book's category NAME to a store category id, reusing the existing
 * by-name `importCategories` merge so a name already present (built-in or user)
 * is shared rather than duplicated. A null/blank ref ⇒ Uncategorized (undefined,
 * which `saveText` resolves to the built-in Uncategorized category).
 */
function resolveCategoryId(db: Database, categoryRef: string | null): number | undefined {
  const name = typeof categoryRef === 'string' ? categoryRef.trim() : ''
  if (!name) return undefined
  // importCategories keys off numeric source ids; synthesize one and read it back.
  const idMap = db.importCategories([{ id: 1, name }])
  return idMap.get(1)
}

/**
 * Seeds the given bundle into the store. Pure of any Electron/filesystem concern
 * (the file read lives in {@link loadLibraryBundle}) so it can be driven directly
 * in tests against a real {@link Database}.
 */
export function seedLibraryFromBundle(db: Database, bundle: LibraryBundle): SeedResult {
  // Schema gate — a bundle the Reader doesn't understand is a no-op, never a crash.
  if (bundle.schemaVersion !== BUNDLE_SCHEMA_VERSION) return emptyResult()

  // Version early-out — launches without a newer bundle skip the scan entirely.
  if (!(bundle.bundleVersion > db.getSeededBundleVersion())) return emptyResult()

  const ledger = new Set(db.getSeededIds())
  const seeded: string[] = []
  const skipped: string[] = []

  for (const book of bundle.books) {
    if (ledger.has(book.seedId)) {
      // Insert-only: an already-seeded book is skipped, never updated in place.
      skipped.push(book.seedId)
      continue
    }

    const categoryId = resolveCategoryId(db, book.categoryRef)
    const text = db.saveText({
      title: book.title,
      content: book.content,
      seed_id: book.seedId,
      category_id: categoryId
    })

    db.saveSegments(
      text.id!,
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

    db.addSeededId(book.seedId)
    ledger.add(book.seedId)
    seeded.push(book.seedId)
  }

  db.setSeededBundleVersion(bundle.bundleVersion)
  return { seeded, skipped, ranScan: true }
}

/** Minimal structural guard — enough to reject a file that isn't a bundle. */
function isLibraryBundle(value: unknown): value is LibraryBundle {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.schemaVersion === 'number' &&
    typeof v.bundleVersion === 'number' &&
    Array.isArray(v.categories) &&
    Array.isArray(v.books)
  )
}

/**
 * Reads and parses the bundle from `<resourcesPath>/default-library.json`.
 * Returns null when the file is absent, unreadable, or not a bundle — a missing
 * or malformed default library must never block launch.
 */
export function loadLibraryBundle(resourcesPath: string): LibraryBundle | null {
  const file = join(resourcesPath, SEED_RESOURCE_FILENAME)
  if (!fs.existsSync(file)) return null
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'))
    return isLibraryBundle(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * Launch entry point: load the bundle from `resources/` and seed it. Returns the
 * result for logging; swallows nothing here — callers wrap in try/catch so the
 * Reader still launches if seeding throws.
 */
export function runSeedLoader(db: Database, resourcesPath: string): SeedResult {
  const bundle = loadLibraryBundle(resourcesPath)
  if (!bundle) return emptyResult()
  return seedLibraryFromBundle(db, bundle)
}
