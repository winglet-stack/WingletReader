# ADR-0023: Library origin-based segment vocabulary & user-only "Add Content"

**Date:** 2026-07-11
**Status:** Accepted
**Relates to:** ADR-0018 (Library Bundle & Seed loader — `seed_id` is the discriminator), ADR-0013 (Reader persistent frame — the same `Library`/`TextCard` renders in the in-frame browse), ADR-0004 (dead code archived, not deleted). Supersedes the `sourceType`-driven "chapters/parts" UI wording introduced with the segmenter.

## Context

The Library "Facelift" run reworks the vocabulary and affordances on library text cards and the segment list (`SegmentPanel`). A text's structural sub-units are the domain concept **Segment** (`CONTEXT.md`). Three separate origin-ish signals already exist on a `TextRecord`:

- **`seed_id`** — stamped by the Seed loader (ADR-0018) on curated books ingested from `resources/default-library.json`; absent on user-created/imported records. The only true "shipped-by-us vs. user-supplied" flag.
- **`sourceType`** (per segment) — `detected_heading` vs `generated_chunk`, which today drives the user-facing wording: the list header says "chapters" vs "parts", and each row carries a matching `chapter`/`part` badge.
- **`is_manual_book`** — set only in tests now; the old "Build Your Own Book" *creation* flow has no live entry point.

The draft requirements wanted to split the noun the user sees by **text origin** ("chapter" for default texts, "content(s)" for user texts). That collides head-on with the existing `sourceType`-driven "chapters/parts" split: a user text with detected headings would be both "content" (by origin) and "chapters" (by structure). Two overlapping vocabularies is more nuance than a reader can track, and the two axes disagree on the same object.

Separately, the "Add Chapter" affordance (`AddChapterPanel` → `appendSegment`) is still wired to *existing* texts via a card `+` shortcut and an in-view button, even though book *creation* is gone. It **appends** externally pasted/uploaded content as a new segment — it does not **split** an existing text.

## Considered Options

**Vocabulary axis:**
- **Origin only (`seed_id`) — chosen.** Seeded books say "chapter(s)"; all user texts say "content(s)", regardless of whether headings were detected. The `sourceType`-driven "chapters/parts" wording is retired from the UI. One rule; the two axes can never disagree because only one is consulted.
- **Keep both axes.** Rejected: origin decides on the card, structure decides inside the view — the reader must track two questions ("mine or shipped?" and "were headings found?") to predict the word.
- **Structure only (status quo).** Rejected: drops the draft's default-vs-user intent entirely.

**The "Add" affordance:**
- **User-only, relabeled "Add Content", append-only, in-view — chosen.** See Decision §2–§3.
- **Default-only (draft req 1 literal).** Rejected by the maintainer: bolting extra chapters onto a *complete, curated* seeded book is nonsense; a user's own text is theirs to grow. This **inverts** the draft's literal req 1 ("keep functionality locked to default texts") — the inversion is deliberate and is the main reason this ADR exists.
- **Retire Add entirely (reader is consume-only).** Rejected: users should retain a way to append to their own texts.
- **"Add Content" = split an existing text.** Rejected: manual splitting requires having already read the text to know the boundaries — backwards for a speed-reader, and near-zero real use. The "read in smaller pieces" need is served by **import-time auto-segmentation**, not by a manual split tool.

## Decision

### 1. Origin is the sole vocabulary axis
The user-facing noun for a text's segments is chosen **only** by `seed_id`:

- **Seeded / default** (`seed_id` present) → "**chapter(s)**".
- **User text** (`seed_id` absent) → "**content(s)**".

This governs *every* surface where the noun appears: the card "View" button, the card count line, the `SegmentPanel` header and its "Add" button, and the `AddChapterPanel` screen. The `sourceType`-driven "chapters/parts" wording and the per-row `chapter`/`part` badge are **removed** from the UI. `sourceType` remains load-bearing for *behavior* (chapter-nav, continue-reading, `segmentsHaveExtractedChapters`) — only its influence on *wording* is dropped.

Plural/singular follows the verb, symmetrically across both origins: **View Chapters / View Contents** (plural), **Add Chapter / Add Content** (singular).

### 2. The "Add" affordance is user-only and lives in the view
- **Card `+` shortcut is removed** for all texts (draft req 3). No add affordance on any card.
- The in-view "Add" button exists **only for user texts**, labeled "**+ Add Content**". Seeded texts have **no** add button.
- Behavior is unchanged: it **appends** pasted/uploaded content as a new segment (`appendSegment`). No split feature is introduced.
- Because only user texts reach it, the `AddChapterPanel` screen is **always** "Content" — heading, field labels, save button, and placeholder relabel with no origin branch.

### 3. "View" is always available; empty contents = the whole text
The card "View" button is shown for **every** text regardless of `segment_count` (draft req 5), where today it appears only when `segment_count > 0`. A user text with **0 stored segments** (short text, fewer than 2 detected pieces, or segmentation off at import) opens a contents view that presents **the whole text as a single content row** (readable), plus the "Add Content" button. The card's count line still renders only from real stored segments.

## Consequences

- **`CONTEXT.md` updated on decision** (this session): the **Segment** glossary entry records the origin-based "chapter(s)" / "content(s)" user-facing split; the `sourceType`-driven "chapters/parts" wording and the per-row badge are tombstoned under Deprecated terms.
- **One component, two hosts.** `TextCard` / `Library` render in both the standalone Library and the in-frame Reader browse (ADR-0013), so every card change propagates to both automatically.
- **Seeded branch is dormant in dev.** No `resources/default-library.json` ships in the repo, so until a bundle is dropped in, every text is a user text and the app reads entirely "contents". The "chapter" branch is real, gated code that only lights up once a bundle is present.
- **Summaries are out of scope.** The `AddChapterPanel` Summary field and the `SegmentPanel` per-segment summary panels are **left untouched**; the summary system is slated for its own later overhaul (outside the playback loop). Do not de-summarize the Library in these slices.
- **Scope boundary.** Vocabulary and affordance placement only. No change to `sourceType` behavior, the segmentation engine, the data model, or the ADR-0008 settings contract. `is_manual_book` is not revived.
- **Verification gate:** `npm run build` + `npm test`; do not increase the `tsc` baseline (105). Card affordance visibility, the origin-based wording, and the user-only Add button are exercised in `textCard`/`SegmentPanel` tests.
