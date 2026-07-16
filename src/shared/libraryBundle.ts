/**
 * Library Bundle — the frozen cross-repo contract consumed by the Seed loader
 * (ADR-0018, mirroring WingletBooks ADR-0003).
 *
 * The source of truth for this shape is WingletBooks `src/shared/libraryBundle.ts`
 * (`BUNDLE_SCHEMA_VERSION = 1`). These types are an additive, read-only mirror so
 * WingletReader can type the bundle it ingests without importing across repos.
 * Do not add or rename fields without a superseding ADR.
 */

/** Bump only with a superseding ADR — the Seed loader's schema gate keys off this. */
export const BUNDLE_SCHEMA_VERSION = 1

export interface BundleCategory {
  name: string
}

export interface BundleSegment {
  title: string
  order: number
  content: string
  word_count: number
  startWordOffset: number
  endWordOffset: number
}

export interface BundleBook {
  seedId: string
  title: string
  /** Chapters joined with "\n\n"; gaps already cut. Clean prose. */
  content: string
  /** Category NAME; null/omitted ⇒ Uncategorized. Never a numeric id. */
  categoryRef: string | null
  segments: BundleSegment[]
}

export interface LibraryBundle {
  schemaVersion: number
  /** WingletBooks bumps this per default-library generation. */
  bundleVersion: number
  /** Ordered, unique names; "Uncategorized" is NOT listed. */
  categories: BundleCategory[]
  books: BundleBook[]
}
