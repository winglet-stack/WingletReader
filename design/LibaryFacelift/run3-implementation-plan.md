# Library Facelift run 3 — Paged Text view: implementation plan

**Decision of record:** [ADR-0025](../../docs/adr/0025-paged-plain-text-view.md). Glossary: **Page *(text view)*** in [`CONTEXT.md`](../../CONTEXT.md).

**Gate:** pre-invite alpha code gate (rework-before-deployment, in v1). Verification: `npm run build` + `npm test`; do not raise the `tsc` baseline (**46**).

**Problem (final):** the plain-text `TextViewPanel` renders one element per word for the **whole book** (50k–150k+ nodes) and rebuilds them **every playback beat** (the `plainTextNodes` memo depends on `plainTextCtx.wordOffset`). This is the reader's dominant lag source on weak devices and makes ADR-0024 bookmark interactions in this view sluggish.

**Model (final):**
- **Page** = paragraph-aware slice of ~500 words (runaway single paragraph hard-cut at ~800). Render **one Page at a time**; the rest is never materialized.
- `pageStarts: wordOffset[]` derived **once at engage** (O(n), cached — never per beat). `buildWordPositions` memoized on `displayContent` only. Page lookup = binary search over `pageStarts`.
- Word-offset space is uniformly **whole-text** (shared by stacks / `plainTextCtx.wordOffset` / `buildWordPositions` / bookmark anchors).
- **Auto-follow** the playhead, flipping only on boundary crossing; internal `scrollIntoView` within a Page. Paging never moves the playhead.
- **Manual paging detaches**; **Locate** (active while detached) or **playback catch-up** re-attaches.
- Bookmarks: no new data/actions; existing flow becomes fast; **inline markers on bookmarked words of the current Page** (goal distinct).

**Scope — explicit no-s:** Standard/RSVP Stack viewport, DOCX "Formatted" HTML view, segmentation engine, `usePlayback`, bookmark CRUD (ADR-0024), and `ReadingPosition` are all **untouched**. Pages are view-only, no persistent identity, mouse-only for v1 (no `PageUp`/`PageDown`).

---

## Slices (tracer-bullet, each ships green)

**Cascade:** `PG-1 → PG-2 → { PG-3, PG-4 }`
Order rationale: PG-1 is the pure engine PG-2 consumes; PG-2 swaps the render path and kills the lag (demoable via auto-follow + existing Locate); **PG-3** (manual paging + detach) and **PG-4** (inline bookmark markers) are independent additive layers on PG-2.

### Slice PG-1 — Pagination engine (pure, no UI)
Thinnest end-to-end: turn a word array into Page boundaries and look them up.
- New `engine/textPagination.ts`:
  - `computePageStarts(words: WordPosition[] | string[], opts?: { targetWords?: number; hardCap?: number }): number[]` — paragraph-aware accumulation to ~500, break at paragraph end; hard-cut a single paragraph past ~800 (and any paragraph-less text). Returns ascending `wordOffset` start indices (always starts with `0`).
  - `pageForWordOffset(pageStarts: number[], wordOffset: number): number` — binary search → 0-based page index.
  - `pageRange(pageStarts: number[], pageIndex: number, totalWords: number): { startWord: number; endWord: number }`.
- Needs a paragraph signal: reuse the `\n{2,}` paragraph split already in `buildWordPositions` (factor a shared helper or pass paragraph-start offsets in). Keep the tokenization identical to `buildWordPositions` so indices align.
- Tests: `textPagination.test.ts` — paragraph accumulation lands near target, never splits a paragraph, runaway guard hard-cuts, paragraph-less text chunks by count, lookup at boundaries/ends, single-page (short) text → `[0]`.
- **Out of scope:** any React, any `TextViewPanel` change.
- Model rec: **Codex** (mechanical pure functions with a tight spec).

### Slice PG-2 — Render swap + auto-follow (the lag kill)
Repoint `TextViewPanel`'s plain-text path from whole-document to current-Page.
- Memoize `buildWordPositions(displayContent)` on **`displayContent` only** (not `wordOffset`); derive `pageStarts` once from it (PG-1).
- Track `currentPage`; when **attached**, `currentPage = pageForWordOffset(pageStarts, plainTextCtx.wordOffset)`. Render only `pageRange(...)`'s words as elements (the current-word `<mark>`, selection span, and click-to-select all stay, scoped to the Page).
- Auto-follow: flip Page only on boundary crossing; keep the current-word `scrollIntoView` (reuse `highlightRef`) inside the Page. Preserve the open/mode-change scroll-to-current effect.
- No manual paging UI yet (view always shows the playhead's Page); **Locate** keeps working.
- Tests: `textViewPanel.test.tsx` — only current-Page words render; Page flips on crossing; highlight/selection still work; `buildWordPositions` not recomputed per `wordOffset` change (assert stable memo).
- Model rec: **Claude** (touches the hot render path; careful memo dependency surgery).

### Slice PG-3 — Manual paging + detach/re-attach
- Header: **prev / `Page N / M` / next** cluster in `plain-text-ref` (mouse-only). Single-Page texts hide/disable prev/next.
- Detach: manual paging sets `currentPage` independent of the playhead → **detached**. Suspend auto-follow while detached.
- Re-attach: **Locate** snaps to the playhead's Page and re-attaches (Locate shown **active** while detached — doubles as "return to reading"); **or** auto-reattach when the playhead advances into the viewed Page.
- Tests: manual next/prev changes Page without moving playhead; detached state suppresses auto-follow; Locate re-attaches + snaps; catch-up auto-reattaches; nav hidden on single-Page text.
- Model rec: **Claude** (interaction state machine).

### Slice PG-4 — Inline bookmarked-word markers on the current Page
- Pass the text's bookmark list into `TextViewPanel` (from `Reader.tsx` state, already loaded for ADR-0024).
- Decorate any bookmarked word whose `wordOffset` falls on the current Page with an inline marker; the **goal** bookmark visually distinct from normals. Reuse the selection-style class family; no interaction on the markers (management stays in popover/Library).
- Independent of PG-3; needs PG-2.
- Tests: bookmarked word on current Page is marked; goal distinct from normal; markers absent when the bookmark is on another Page; no marker interaction.
- Model rec: **Claude** (small, but reuses ADR-0024 wiring).

---

## Drip-feed note
`.scratch/active/` caps at 2 files. Promote slices two-at-a-time (PG-1 + PG-2 first). Each issue carries: atomic scope, Claude/Codex rec (above), and a copy-paste handoff-prompt-for-next-agent generated before the maintainer's commit-confirmation gate.
