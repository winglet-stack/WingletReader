# ADR-0033: Winglet Book file (.wbook) and manual import; launch seeding retired

**Date:** 2026-08-05
**Status:** Accepted (implemented; WB-1..WB-4 complete 2026-08-06; amended twice on
2026-08-12 — see Amendment: one book-intake commit envelope, and Amendment: §4's ladder is now
one shared book intake)

> **Cross-repo note.** Supersedes ADR-0018 **in part**: the Library Bundle v1 schema and the
> launch-time Seed loader are retired as the delivery model; `seed_id` and its store semantics
> survive unchanged. This repo now **owns** the contract (flipping v1's arrangement, where
> WingletBooks owned the schema and this repo mirrored it); WingletBooks vendors the contract
> module via its existing one-way sync. The portable narrative of the contract, written for
> the WingletBooks overhaul session, is `.internal/docs/winglet-books/compatibility-brief.md`
> (local-only); this ADR is the durable in-repo record.

## Context

The default-book concept is being re-introduced as **downloadable books**: a user downloads a
book file produced by WingletBooks and manually imports it — no fetch pipeline, no catalogue
service, no auto-update. No existing ingestion fits: file import (txt/docx/pdf) never
segments, `import:json` drops segments, and the ADR-0018 Seed loader is developer-baked and
launch-time only. The v1 bundle also carried mutually redundant fields (book `content`,
per-segment `order`/`word_count`/offsets — all derivable from the segments), which was
harmless under a trusted launch loader but creates a fields-disagree corruption class once
users import hand-editable downloaded files.

## Decision

1. **Launch seeding retires.** Manual import becomes the only channel for curated books.
   The launch call, `resources/default-library.json`, `seedLibrary.ts`, and the v1 mirror
   `src/shared/libraryBundle.ts` are removed (WB-4). Already-seeded books in user stores are
   left in place as ordinary texts; `seededIds` / `seededBundleVersion` become dormant
   tombstoned store keys (retained, never read — the ADR-0019 §4 pattern). `seed_id` remains
   the live marker for curated books and keeps driving ADR-0023 vocabulary and chapter-nav.
2. **The artifact is a single-book `.wbook` file** — UTF-8 JSON, no BOM:
   `{ format: 'winglet-book', schemaVersion: 2, book: { seedId, title, categoryRef?,
   segments: [{ title, content }] } }`. Minimum-only: no metadata block, no derived fields.
   `categoryRef` is a category **name** (`null`/absent ⇒ Uncategorized), as in v1.
3. **The Reader derives at import** — segment `order` (array position), `word_count` (`\s+`
   tokenization), cumulative `startWordOffset`/`endWordOffset`, and book `content`
   (segments joined `"\n\n"`), reproducing the v1 producer computation byte-for-byte.
   Derivation, not re-detection: chaptering is still never second-guessed. Offsets are
   correct by construction and always match the Reader's tokenizer.
4. **Detection ladder, explicit failures.** The `format` marker is authoritative; `.wbook`
   is advisory (picker filter/routing). Outcomes: foreign file → "isn't a Winglet Book";
   unsupported `schemaVersion` (incl. retired v1) → refused, newer versions with an "update
   WingletReader" message; structural failure → "damaged"; duplicate `seed_id` among
   **present** texts → skipped "already in your library"; valid → one confirm card (title,
   chapter count, category) on the unified Import surface, then the book lands complete.
   Never a crash, never a silent no-op.
5. **Producer owns normalization; the Reader never re-cleans a Winglet Book.** Cleanliness
   (UTF-8/LF, `\n\n` paragraphs, no soft wraps, dash conventions, trimmed segments,
   non-empty titles) is a contract obligation WingletBooks meets by running its vendored
   copy of `importTextCleanup` and curating on top. `content_display` stays dropped (v1
   decision holds).
6. **Tolerant-reader evolution.** Unknown fields are ignored; `schemaVersion` bumps only
   when an older Reader would import a file *incorrectly*. The Reader accepts every version
   from 2 up to current.
7. **Ownership.** The normative contract is this repo's `src/shared/wingletBook.ts` (WB-1:
   types, constants, validator, derivation) plus this ADR; WingletBooks vendors the module
   through `sync-reader.mjs` and pins it with its drift test.

## Amendment (2026-08-12) — one book-intake commit envelope

§4's commit answer changes shape. A successful `import:wbookCommit` no longer replays the
parse envelope (`status: 'accepted'` + the confirm-card `confirmation`); it reports
**`status: 'committed'` with the new `textId`** — the shape ADR-0034 §2 introduced for EPUB,
now the shared success envelope for every book-intake channel.

Why: only one of the two structured-book channels had adopted the better shape, and the
divergence propagated. The Import surface had to test a different status per format, and the
one landing path had to take a per-format match predicate so it could serve two identity
models. Both are gone: there is one success check, and both formats land the new book's
Contents view by the id they were handed.

What does **not** change:

- **Refusals.** Every refusal status, field, and piece of user-facing copy is exactly as §4
  states it — including the duplicate `seed_id` check against present texts, which happens
  before any insert and never involved the success envelope.
- **The stateless, re-validating commit.** Commit still re-reads and re-judges from disk, so
  a file edited since the confirm card or a duplicate raced in between the two calls is
  refused rather than inserted.
- **Parse.** The parse half keeps its envelope, `accepted` included; it is now a *separate
  type* from the commit envelope rather than the same one, mirroring how EPUB already does
  it.
- **`seed_id`.** It keeps every other role it has — curated-book identity, the ADR-0023
  "chapters" vocabulary, suppressing Add Content, chapter-nav, and the duplicate check
  above. It is removed from **one** role only: being the thing a just-committed book is
  re-found by.

Implemented as `architecture-depth/04`.

## Amendment (2026-08-12) — §4's ladder is now one shared book intake

`architecture-depth/05` folded the two structured-book channels into one intake module,
`src/main/bookIntake.ts`, with `.wbook` as one of two adapters in front of it. See the ADR-0034
§2 amendment for the reasoning and the adapter interface; the consequences for this ADR are
narrow:

- **§4's ladder is unchanged and still lives in `wingletBookImport.ts`** — bytes → JSON →
  contract verdict → present-texts `seed_id` duplicate check. What moved out is only the part
  that was never `.wbook`-specific: the parse-then-commit pair, the totality wrapper, the
  insert, the rollback and the success envelope.
- **Every refusal status, field and word is unchanged**, duplicate included, and is now pinned
  verbatim by `bookCardCopy.test.ts`. The `.wbook` confirm card is drawn by the one shared
  `BookCard`; `WingletBookCard.tsx` is gone, its copy is not.
- **One diagnostic string did change**, disclosed here because §4 does not name it: a *store*
  failure during commit now reports `could not be saved: …` rather than the generic
  `unexpected failure: …`. It is the `reason` on the existing `malformed` refusal — the card
  still reads "This Winglet Book file is damaged." — and it was previously EPUB's wording for
  the same event.
- **`seed_id`, the category merge by name, and the stateless re-validating commit** are all
  exactly as above.

## Considered Options

- **Keep launch seeding alongside manual import** (shared insert core) — rejected: two
  dedupe semantics around one marker; dormant machinery still has to be reasoned about.
- **Reuse the v1 LibraryBundle through the new door** — rejected: imports `bundleVersion`
  and whole-library granularity as documented dead weight into a contract the producer is
  rebuilding against anyway. (No v1 file ever reached a user, so refusing v1 costs nothing.)
- **Multi-book (`books[] 1..n`) envelope** — rejected: partial-failure import UX and a
  fuzzier file identity; a starter pack is just several files.
- **Carry derived fields + validate / + trust** — rejected: the validator is more code than
  the derivation; trust silently corrupts chapter-nav and bookmarks on edited files.
- **Defensive re-clean (or shadow clean-with-warning) at import** — rejected: undoes
  deliberate authoring; makes rendering depend on Reader-version heuristics.
- **Replace or duplicate on `seed_id` collision** — rejected: replace orphans reading
  positions/bookmarks; duplicates void identity. Corrections ship as delete-and-reimport or
  a new `seedId`.
- **Strict unknown-field rejection** — rejected: every additive change would force a
  lockstep two-repo release.
- **WingletBooks keeps schema ownership / neutral third-party spec** — rejected: contradicts
  Reader-first sequencing / creates an artifact no test pins.

## Consequences

**Positive** — one ingestion channel with one identity rule; the fields-disagree corruption
class is unrepresentable; offsets can never drift from the Reader's tokenizer; users control
what enters their library; the contract is small enough to state on one page.

**Negative** — corrected editions have no in-place upgrade path (accepted: the Reader cannot
distinguish correction from clobber without pristine-tracking); legacy curated books
linger in existing alpha stores until users delete them; retiring ADR-0018 machinery is a
sanctioned removal that must keep the dormant ledger keys parseable forever.

**Implementation** — completed as WB-1 contract module → WB-2a parse recognition → WB-2b
commit import → WB-3 import UI → WB-4 launch-seeding retirement. The originally named WB-5
documentation residue was folded into WB-4. Sizing and detail:
`.internal/docs/winglet-books/compatibility-brief.md` §8.

## Notes

Canonical term: **Winglet Book** (glossary). "Default books" is informal catalogue language;
"seeded" is tombstoned with the loader. Frozen identifiers touched by this decision:
`seed_id` stays frozen and live; `seededIds`/`seededBundleVersion` stay frozen as dormant
keys. Do not rename any of the three.
