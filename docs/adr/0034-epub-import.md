# ADR-0034: EPUB import — structured ingestion of publisher books

**Date:** 2026-08-10
**Status:** Accepted (implemented; EP-1..EP-5 complete, maintainer smoke GREEN 2026-08-11).
Amended 2026-08-12 twice, both in §2: the shared book-intake commit envelope
(`architecture-depth/04`), then the fold of the cloned ladder and the two confirm cards into
one **book intake** with per-format adapters (`architecture-depth/05`).

> **Standing premise (decided upstream, not revisited here):** WingletReader will integrate
> a public-library API to read public-domain texts. Those libraries serve EPUB as the
> industry default. EPUB ingestion is therefore the cornerstone this ADR builds, and the
> import pipeline it defines must work headless (no human editing step) so the future API
> path can reuse it verbatim.

## Context

WingletReader has no e-book format support. The existing ingestion channels are: the
`FileParser` path (`txt`/`docx`/`pdf` → editable textarea → one flat `content` string, with
chapter *re-detection* by regex gated off by default), and the `.wbook` structured path
(ADR-0033: main-process parse/commit IPC pair → `TextRecord` + ordered `TextSegment[]`,
confirm card, refusal verdicts). An EPUB is a zip (OCF container) of XML manifests and XHTML
content that *hands us* publisher-resolved structure — spine order, a titled table of
contents, rich Dublin Core metadata. Flattening that to a string and regexing chapters back
out would destroy information we were given for free.

The maintainer named one invariant during design: **preserve the original text.** Import may
project styled XHTML to the plain-text store, but must never silently drop or rewrite the
publisher's words and punctuation.

## Decision

1. **Scope: EPUB 2 + EPUB 3 only, one `.epub` extension.** No `.mobi`/`.azw`/`.fb2`/etc. —
   Amazon formats are a second parser for zero library-API benefit. EPUB 2 vs 3 differ
   mainly in TOC location (NCX vs nav document); one parser handles both via a fallback
   ladder (nav wins when both exist). **DRM is a named refusal:** `META-INF/encryption.xml`
   covering content files → `drm-protected` verdict *before* any parse effort, with its own
   copy — not a generic "damaged" error.
2. **Structured import, `.wbook` shape.** A sibling main-process parse/commit IPC pair
   (`import:epubParse` / `import:epubCommit`) cloned from the `wingletBookImport.ts`
   skeleton: stateless commit re-runs the ladder from the path, total refusal handling,
   rollback if segment insert fails. No textarea edit step (you don't hand-edit a 90k-word
   novel; chapter fixes happen post-import). **EPUB does not reuse the `.wbook` contract or
   `seed_id`** — `seed_id` is frozen curated-book identity; an arbitrary EPUB is not a
   curated Winglet Book. `ContentSourceType` gains `'epub'`. One simplification over
   `.wbook`: commit returns the new `textId` directly instead of an identity to re-find.
   *(Amended 2026-08-12: `.wbook` adopted this shape too — `status: 'committed'` with the
   `textId` is now the shared book-intake success envelope, not an EPUB-only simplification.
   See the ADR-0033 amendment.)*
   *(Amended 2026-08-12 — the clone folded; see below.)*

   ### Amendment (2026-08-12) — the clone folds into one book intake

   The cloned skeleton above was the right call for **shipping** EPUB: cloning a proven
   ladder is cheap and reviewable, and there was nothing to fold it with while `.wbook` was
   the only structured format. It stops being the right call at two, and this ADR's own
   standing premise says a **third** is coming — the public-library API, which serves EPUB as
   the industry default and will arrive as another caller at this same door. Two clones make
   a seam worth drawing; a third written as another clone makes the duplication permanent.

   So the shared half is now one module, **`src/main/bookIntake.ts`** (glossary: **Book
   intake**), and each format is an adapter in front of it.

   **Behind the seam** — written once, for every format: the parse-then-commit pair and its
   totality wrapper, the stateless re-validate-from-disk rule, the insert through the
   ordinary store paths, the `detected_heading` chapter stamp, the segment-write rollback,
   and the shared `committed` success envelope.

   **The adapter interface** (`BookIntakeAdapter<Confirmation, Refusal>`) is three members:

   - `derive(db, filePath)` — the format's whole ladder, run from the bytes on disk. It
     answers either its **own** refusal, or an accepted outcome carrying the confirm-card
     data plus a `prepare()` thunk that produces the derived book and the extra `saveText`
     fields. The thunk is what keeps parse write-free: `.wbook`'s category merge can create
     a folder, and deriving costs a whole-book pass, so only commit calls it.
   - `refuse(filePath, reason)` — the format's word for an unusable path or a store failure,
     so even the refusals the intake itself raises are spoken in the format's vocabulary.
   - `format` — a name for diagnostics; never user-visible.

   Format differences are therefore **data the adapter supplies**, not branches the intake
   takes: `.wbook` supplies `seed_id`, a by-name category merge and a present-texts duplicate
   check; EPUB supplies `author`, `content_display`, `source_type: 'epub'` and its
   diagnostics, and supplies **no** identity check at all — §7's deliberate absence of
   dedupe is preserved by the adapter simply not having one. There is no `switch (format)`
   in the intake, and `src/main/__tests__/bookIntake.test.ts` drives the whole seam through
   an invented third format to prove a new one costs an adapter and no edit.

   **The two confirm cards folded too.** `WingletBookCard.tsx` and `EpubBookCard.tsx` are
   replaced by one `components/import/BookCard.tsx`; a format supplies copy
   (`describeWingletBook` / `describeEpubBook`) rather than a component. **No refusal wording
   or tone changed** — including DRM staying neutral rather than `--danger`, because nothing
   about a protected file is damaged and the user did nothing wrong (§1) — and every rung of
   both ladders is now pinned character-for-character by `bookCardCopy.test.ts`.

   **What did not change:** the container ladder, the preservation invariant, the reduced
   cleanup profile (§5), chapters coming from the publisher's TOC and never being
   re-detected (§3), the caps and security posture (§6), the metadata treatment (§7), the
   absence of EPUB dedupe, and every refusal status, field and string on both formats.
3. **Chapters: TOC-driven boundaries over spine order, no content dropped.**
   - Reading order = spine, `linear="yes"` items only (`linear="no"` is the publisher
     marking content out of the reading flow — the one sanctioned exclusion).
   - Segment boundaries = TOC entries (EPUB 3 nav → EPUB 2 NCX) resolved to spine
     positions; text between consecutive boundaries = one segment; title = TOC label.
   - Nested TOCs flatten to one ordered boundary list (a "Part I" entry becomes a short
     segment; the flat `TextSegment` model absorbs nesting without a level field).
   - **No-drop invariant:** linear-spine text before the first TOC entry becomes a leading
     "Front Matter" segment; junk-page skipping heuristics (cover/copyright detection) are
     rejected. `content` = segments joined `"\n\n"` with contiguous word offsets — the same
     shape `deriveWingletBook` produces, so Reader/bookmarks/resume work unchanged.
   - **Fallback ladder:** usable TOC → per-spine-file segments (title from the file's first
     heading, else "Section N") → single unsegmented text. Import never fails because
     chapters couldn't be resolved; chapter quality degrades gracefully.
4. **Extraction: markup structure becomes whitespace, nothing else.** Block elements
   (`p`, `div`, `h1`–`h6`, `li`, `blockquote`, `tr`) → `\n\n`; headings become plain
   paragraph text (the stack builder has its own headline detection). Inline formatting is
   inherently dropped (plain-text store); the characters survive untouched. Images are
   dropped but **counted in `import_diagnostics`** (confirm card says "N images omitted" —
   no `[Illustration]` placeholders). Tables become rows-as-lines, cells space-joined.
   In-flow footnote text stays where the publisher put it; no inlining machinery.
5. **Reduced cleanup profile — the preservation invariant applied to ADR-0015.** The full
   pipeline targets *plaintext* pathologies (hard-wrapped lines, split words, `--` faked
   dashes) that markup-extracted text does not have; running those passes could only mutate
   publisher text. EPUB gets character hygiene only: BOM strip, line endings, unicode
   spaces, tabs, soft-hyphen (U+00AD) strip, blank-line collapse. **Explicitly skipped:**
   soft-line-wrap conversion, dehyphenation, split-word joining, and the dash normalizer —
   a publisher's `--` or `----` stays verbatim. Soft hyphens are stripped because U+00AD is
   a rendering hint, not authorial text, and would break word tokenization. Since paragraph
   structure comes from markup, `content` ≡ `content_display` and word-count parity holds
   trivially.
6. **Parser: hand-rolled on `jszip` + `@xmldom/xmldom`, promoted to direct dependencies,
   main process only.** The npm EPUB ecosystem is a graveyard (epub.js is a paginated
   renderer we don't need; the parser wrappers are unmaintained shims over exactly these
   two libraries, which mammoth already pulls transitively). The needed surface is small:
   `container.xml` → OPF → spine/manifest → TOC → XHTML per spine item. Hostile-input
   posture: 100 MB container cap, 50 MB decompressed-text cap (zip-bomb backstop),
   in-memory reads only (zip-slip structurally impossible), no resolution of any href
   outside the archive (XXE inert by rule, not accident).
7. **Metadata: three fields, three treatments.** `dc:title` → `TextRecord.title` (filename
   fallback). `dc:creator` → new optional `TextRecord.author` — stored now, displayed
   nowhere yet (the one schema addition made ahead of need: the library-API future makes
   author inevitable, and capturing at import is free while re-deriving means re-parsing).
   `dc:identifier` → recorded in `import_diagnostics` only; **no dedupe** — wild identifiers
   are unreliable, and dedupe policy belongs to the library-API design. Consciously
   skipped: cover images (binary doesn't belong in the JSON store; ADR-0028 gave Library
   tiles their own identity), publisher, date, description, language.
8. **Surface behavior.** `file:open` gains the `epub` filter and a
   `{ kind: 'epub-book' }` discriminant (extension routing only); chapter-append hosts
   refuse ("a whole book, not a chapter", sibling of `WINGLET_BOOK_NOT_A_CHAPTER`);
   `ImportPanel` gets an `epubVerdict` takeover branch with confirm card (title, author,
   chapter count, word count, images-omitted). Lands in **Uncategorized** (no category
   picker on the card). **ADR-0023 vocabulary extends:** `seed_id || source_type === 'epub'`
   → "chapters" — EPUB chapters are publisher-intended, and a novel labeled "contents"
   reads as a bug. **"Add Content" is not suppressed:** the preservation invariant governs
   import fidelity, not what the owner does with their copy; an EPUB book is the user's
   text like any other import.
9. **Verification: fixtures-as-code, zero binaries in the repo.** Tests build in-memory
   `.epub` archives with `jszip` at test time via a declarative helper. Pure derivation
   (spine/TOC → segments) lives in `src/shared/epubBook.ts`, unit-tested without zips; the
   container ladder in `src/main/epubImport.ts` tests against generated archives — the
   `wingletBook.ts` / `wingletBookImport.ts` split. The normalization conformance corpus is
   **not** extended (it governs the ADR-0015 pipeline; the reduced profile gets its own
   tests). A manual smoke checklist (2–3 real Project Gutenberg EPUBs read end-to-end)
   gates the final issue. **No feature flag** — import formats are ungated today, as
   `.wbook` shipped.

## Considered Options

- **FileParser path (textarea shape)** — rejected: flattens publisher structure then
  re-detects it by regex; can never serve the headless library-API future.
- **An npm EPUB library** — rejected: epub.js solves rendering, not extraction; parser
  wrappers are abandoned middlemen over jszip + xmldom, which we already ship.
- **Junk-page skip heuristics (cover/copyright/TOC-page)** — rejected: silently deletes
  text and will misfire per-publisher; violates the preservation invariant. Users delete a
  junk segment themselves if it bothers them.
- **Full ADR-0015 cleanup pipeline** — rejected: wrap/dash passes exist for plaintext
  pathologies EPUB doesn't have and would rewrite authoritative publisher punctuation.
- **Reuse `.wbook` contract / `seed_id`** — rejected: `seed_id` is frozen curated identity
  with its own dedupe, vocabulary, and immutability semantics that don't fit user EPUBs.
- **Dedupe on `dc:identifier`** — rejected for now: wild identifiers are unreliable
  (random UUIDs, changing Gutenberg releases); evidence is preserved in diagnostics so the
  library-API design can add identity semantics later.
- **`.mobi`/`.azw` support** — rejected: different container, DRM-laden, no library-API
  benefit.
- **Binary EPUB test fixtures** — rejected: unreviewable diffs, sits badly with the public
  repo; fixtures-as-code keeps every scenario a readable TypeScript literal.

## Consequences

**Positive** — publisher chapter structure survives import intact; the pipeline is headless
and thus directly reusable by the future library-API fetch path; the preservation invariant
is mechanical (segments join to `content`, parity trivially holds); two small,
already-bundled dependencies instead of an abandoned parser; every refusal is named.

**Negative** — no cover art or rich metadata display (title/author only, author hidden until
a surface wants it); imported front matter can look noisy (accepted cost of no-drop — the
user can delete segments); hand-rolled parsing means we own EPUB edge cases ourselves
(mitigated by the fixture matrix + Gutenberg smoke gate); `TextRecord` gains an `author`
field ahead of any UI that shows it.

**Implementation** — completed as EP-1 contract module (`src/shared/epubBook.ts`, the §3
derivation ladder) → EP-2a extraction + reduced cleanup profile (`src/main/epubExtract.ts`,
`cleanupExtractedMarkupText`) → EP-2b container ladder + fixtures-as-code
(`src/main/epubImport.ts`, `__tests__/epubFixtures.ts`) → EP-3 IPC pair + store insert
(`import:epubParse` / `import:epubCommit`, `'epub'` source type, `TextRecord.author`,
EPUB diagnostics) → EP-4a import UI (`components/import/EpubBookCard.tsx`, picker filter and
`epub-book` discriminant) → EP-4b vocabulary + edges (`source_type` in the `getTexts`
projection, `isPublisherChapteredTextRecord`, `EPUB_BOOK_NOT_A_CHAPTER`) → EP-5 docs + smoke
gate. EP-2 was split into EP-2a/EP-2b and EP-4 into EP-4a/EP-4b during drip-feed to keep each
implementation slice independently reviewable; the seven slices are preserved in local
scratch history.
The §9 Gutenberg smoke checklist was run by the maintainer and recorded GREEN on 2026-08-11.

## Notes

Canonical term: **EPUB Book** (glossary). The preservation invariant and the reduced cleanup
profile are the deliberate divergence from ADR-0015's full pipeline; do not "fix" EPUB
import by re-enabling the dash normalizer or wrap heuristics without a new decision.
`seed_id` remains exclusively Winglet Book identity — do not stamp it on EPUB imports.
