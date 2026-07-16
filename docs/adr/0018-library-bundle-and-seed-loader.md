# ADR-0018: Reader Seed loader for the versioned Library Bundle

**Date:** 2026-06-27
**Status:** Accepted

> **Cross-repo note.** This decision originates in WingletBooks as **ADR-0003
> (Versioned Library Bundle + additive Seed loader)**. This is the WingletReader
> mirror, recording the consuming side. WingletBooks owns the bundle schema and
> generates the bundle; WingletReader owns the additive Seed loader implemented
> here. The load-bearing identifiers — `seededBundleVersion`, `seededIds`, and
> `seed_id` — are shared contract; do not rename them without a superseding ADR in
> both repos. WingletReader's `docs/adr/0003` is a different, unrelated decision
> (React Context), so the mirror takes the next free number here.

## Context

WingletBooks delivers curated, segmented **default books** into WingletReader. Two
foundation facts make a dedicated ingestion path necessary rather than reusing
import:

- The Reader **does not segment on import** — `ImportPanel` forces segmentation
  off (`alphaChrome.importTextProcessingEnabled: false`), so a marker-rich file
  imports as one unsegmented blob.
- The Reader's `import:json` path **drops segments** — it ingests only `texts` and
  `categories`.

So nothing the Reader currently ingests preserves authored chapters. WingletBooks
owns segmentation end-to-end (resolved, never re-detected) and emits a versioned
**Library Bundle**; WingletReader needs one new, strictly additive path to ingest
it. WingletReader is changed only by additive, developer-applied means — never by
WingletBooks at runtime.

## Decision

WingletReader gains one additive **Seed loader** (`src/main/seedLibrary.ts`) that,
on launch, ingests the bundle from `resources/default-library.json` and seeds
curated default books. It changes no existing surface.

**Frozen input contract** (source of truth: WingletBooks `src/shared/libraryBundle.ts`,
`BUNDLE_SCHEMA_VERSION = 1`), mirrored read-only in this repo at
`src/shared/libraryBundle.ts`:
`{ schemaVersion, bundleVersion, categories[], books[] }`, each book
`{ seedId, title, content, categoryRef, segments[] }`. `content` is clean prose
(chapters joined `"\n\n"`, gaps cut). `categoryRef` is a category **name**
(`null` ⇒ Uncategorized), resolved through the existing by-name `importCategories`
merge — no bundle-local numeric ids cross the boundary. Segments carry
`{ title, order, content, word_count, startWordOffset, endWordOffset }`; offsets
are contiguous, non-overlapping, cumulative against `content`, and are inserted
**as-is** (no recomputation, no re-detection).

**Ledger-based dedupe.** The store gains a permanent ledger `seededIds: string[]`
of every `seedId` ever inserted, plus `seededBundleVersion: number`. When
`bundle.bundleVersion > store.seededBundleVersion`, the loader inserts each book
whose `seedId` is **not in `seededIds`** (creating its categories by-name and its
segments stamped `sourceType: 'detected_heading'`), adds the inserted ids to the
ledger, then advances `seededBundleVersion` (a cheap early-out so launches without
a newer bundle skip the scan). Dedupe is against the **ledger, not currently
present texts** — otherwise a user-deleted book would resurrect on the next bump.

**Insert-only.** An already-seeded `seedId` is **skipped, never updated in place** —
the Reader has no pristine-vs-user-modified tracking, so an in-place update could
not distinguish a correction from clobbering a user edit. A correction therefore
reaches only fresh installs; to push it to existing users, ship it under a **new
`seedId`**. Seeding is idempotent, never overwrites user edits or settings, and
respects user deletions.

**Derived fields.** `TextRecord` gains an optional `seed_id` (existing records
simply lack it). The loader derives `word_count`/`segment_count` and sets
timestamps via the existing `saveText`/`saveSegments` paths, leaves
`is_manual_book` falsy (so the Reader's `segmentsHaveExtractedChapters` chapter-nav
behavior, gated on `endWordOffset !== undefined`, activates), and omits
`source_type`. A missing or malformed bundle is a no-op — it never blocks launch.

The developer copies the exported bundle into this repo's `resources/` by hand;
WingletBooks never writes into the Reader tree.

## Considered Options

- **Extend `import:json` to accept segments** — routes curated content through the
  user-facing import path and still lacks version-tracked seeding.
- **Ship a complete drop-in `fasttrack-data.json`** placed by the installer —
  all-or-nothing, owns the entire store (including settings), brittle against
  schema drift.
- **Rely on Reader re-detection of markers** — defeated by the import gating above;
  reintroduces the heuristic margin of error WingletBooks exists to remove.

## Consequences

**Positive**
- "What the developer segments is exactly what ships" — zero re-detection.
- Version-tracked seeding reaches existing users with new default books without
  clobbering their data; the bundle is just the books, so settings and user content
  are untouched.

**Negative**
- The bundle schema is a cross-repo contract — expensive to change once users have
  seeded data; it is versioned from day one (`schemaVersion`).
- Requires this one sanctioned additive Reader change (Seed loader + `seed_id`),
  tracked separately from the WingletBooks build.

## Notes

Mirrors WingletBooks ADR-0003. `seededBundleVersion`, `seededIds`, and `seed_id`
are the load-bearing identifiers; do not rename them without a superseding ADR in
both repos.
