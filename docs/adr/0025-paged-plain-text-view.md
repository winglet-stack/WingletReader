# ADR-0025: Paged rendering for the plain-text Text view

**Date:** 2026-07-12
**Status:** Accepted
**Relates to:** ADR-0024 (Bookmarks — word-offset anchor this reuses; the payoff surface), ADR-0013 (Reader persistent frame — the Text view is a reader stage). Library Facelift **run 3**.

## Context

The reader's **plain-text Text view** (`TextViewPanel`, the `showPlainText` stage — *not* the Standard/RSVP Stack viewport, *not* the DOCX "Formatted" tab) renders **one React element per word for the entire document** inside a single `<pre>` (`plainTextNodes`). A `TextRecord` holds the **whole book's** content — segments are only `wordOffset` markers, not separate records — so this is routinely **50k–150k+** word-elements. Worse, the memo that builds them depends on `plainTextCtx.wordOffset`, which changes **every playback beat**, so the whole span forest is rebuilt and re-diffed per beat. On low-end hardware this is the reader's dominant source of lag, and it makes every bookmark interaction in this view (word selection for "Set at selected", jump-to-bookmark, marker rendering) inherit the full-document cost.

Library Facelift run 3 changes the rendering **engine** of this one surface so live DOM stays bounded, primarily to reduce lag on weak devices, and secondarily to make the ADR-0024 bookmark flow in the Text view feel dynamic rather than sluggish.

## Considered Options

**Rendering model (hard-to-reverse engine choice):**
- **Discrete Pages — chosen.** The document is divided into fixed-size **Pages** and the view materializes **exactly one Page at a time**; the rest is never rendered. No layout measurement, no scroll-anchoring. A Page maps cleanly to a `wordOffset` range, so every downstream feature (auto-follow, Locate, bookmark markers) is simple arithmetic over `pageStarts`.
- **Continuous virtualized scroll** (one tall scroll area, spacers + a materialized viewport window). Rejected: requires live text-height **measurement** and scroll-anchor bookkeeping — exactly the reflow work that is expensive on the weak devices this targets — and the word-count-per-window is unstable across resize/font changes.

**Page-size derivation:**
- **Fixed ~500-word Page, constant for v1 — chosen.** Chunk the word array by count. Zero measurement (fastest on weak hardware), deterministic, and `wordOffset → page` is a cheap lookup. "A4 page" is a *feel*, approximated by the word count, not measured.
- **Viewport-fit Page** (measure how many words fill the panel). Rejected: reintroduces the per-layout measurement cost the change exists to remove, and the Page unit changes on every resize.
- **User-configurable Page size.** Deferred — a constant keeps v1 scope tight; may graduate to a setting later.

**Page boundaries:**
- **Paragraph-aware with a runaway guard — chosen.** Accumulate whole paragraphs until ~500 words, then break at the paragraph end (never split a paragraph mid-sentence); if one paragraph exceeds a hard cap (~800 words, or a text with no paragraph breaks), hard-cut inside it. Boundaries (`pageStarts: wordOffset[]`) are computed **once when the text is engaged** and cached — a single O(n) pass, never per beat.
- **Hard word cut** (exactly 500 every time). Rejected: splits sentences across the page boundary, undermining a surface whose whole point is comfortable reading.

## Decision

### 1. The plain-text view renders one Page at a time
A **Page** is a paragraph-aware slice of ~500 words (runaway paragraphs hard-cut at ~800). `pageStarts` is derived once per engaged text from the same whole-text word array that stacks, `plainTextCtx.wordOffset`, `buildWordPositions`, and bookmark anchors all index. `buildWordPositions` is computed **once** (memoized on `displayContent`, not on `wordOffset`); only the current Page's words are turned into elements. Page lookup for a `wordOffset` is a binary search over `pageStarts`.

### 2. The visible Page auto-follows the playhead
During playback the view shows the playhead's Page and **flips only on boundary crossings**; within a Page the current-word highlight moves with an internal `scrollIntoView` (reusing today's `highlightRef` logic). Paging is a **view** concept only — it never moves the playhead.

### 3. Manual paging detaches; Locate or catch-up re-attaches
The header gains **prev / `Page N/M` / next** (mouse-only for v1). Manually paging away from the playhead's Page puts the view in a **detached** state (auto-follow suspended, so reading elsewhere isn't yanked). It **re-attaches** when the user presses **Locate** (which snaps to the playhead's Page and is visibly active while detached) **or** when playback advances into the Page currently being viewed.

### 4. Bookmarks in the Text view
No new bookmark data or storage actions. Goal placement uses ADR-0024's arm-then-pick flow inside the current Page; jump-to-bookmark moves the playhead and, when attached, auto-follows to the bookmark's Page. Additionally, **bookmarked words on the current Page are marked inline** (the goal bookmark visually distinct from normals), which is cheap now that only one Page is rendered. Management stays in the popover / Library `SegmentPanel` section (ADR-0024 §3, §5).

## Consequences

- **`CONTEXT.md` updated on decision** (this session): new **Page *(text view)*** glossary entry. No tombstones — this changes an implementation engine, not a vocabulary.
- **Scope boundary — explicit no-s.** No change to the **Standard/RSVP Stack viewport**, the **DOCX "Formatted"** HTML view, the segmentation engine, `usePlayback`, bookmark data/CRUD (ADR-0024), or `ReadingPosition`. Pages are view-only and carry **no persistent identity** — nothing is stored per Page; a bookmark's Page is derived from its `wordOffset` at render time.
- **Word-offset space is uniformly whole-text.** `content = text.content` feeds both `usePlayback` and the Text view unconditionally; `segmentCtx` supplies labels only. `pageStarts` is computed over that one array, so it stays consistent with stacks and bookmark anchors by construction.
- **Goal picking is one-shot.** There is no persistent selected-word marker in the paged view. When ADR-0024's Goal flow is armed, only words on the currently rendered Page can be picked; paging first, then clicking a word, captures the desired off-playhead goal position.
- **Single-Page texts.** Texts under one Page hide/disable the prev/next affordance.
- **Page size is a constant, not a setting** — deferred, not designed against. Widening to a user setting later is additive.
- **Verification gate:** `npm run build` + `npm test`; do not increase the `tsc` baseline (current **46**). Pagination engine unit-tested (paragraph accumulation, runaway guard, lookup); render/auto-follow/detach and inline markers exercised in `textViewPanel` renderer tests.

## Run 4 — Text Console (Library Facelift)

Runs 1–3 above shipped the paging **engine** and put the pager + Locate in a header band above the text. Run 4 (tracer-bullet cascade TC-1…TC-7) keeps that engine unchanged and reshapes the surface: the paging affordances move into the reader's bottom console, the state layer becomes a reusable hook, and the plain view gains an "A4 sheet" feel. Scope is still this one surface — the Standard/RSVP viewport, the DOCX "Formatted" view, `usePlayback`, and bookmark data are untouched.

### Pager + Locate relocated into the `ReaderControls` console
The header band above the text (`plain-text-ref`: the duplicate **title**, the **detail** line, the header pager, and the header Locate) is **removed** from `TextViewPanel`. Its two controls move into the shared bottom console (`ReaderControls`), which gains two **additive** node slots — `leftSlot` (left column, replacing the empty spacer) and `transport` (center column, replacing the five playback buttons). `ReaderControls` stays paging-agnostic: it just renders whatever nodes it's handed, and with neither slot passed its RSVP/Formatted output is byte-identical to before.

`Reader` passes those slots **only** in plain paged mode (`showPlainText && textViewMode === 'plain'`):
- **left** — `TextConsoleLocateButton`: the Locate button, keeping its detached-active styling (`aria-pressed`, highlighted while detached).
- **center** — `TextConsolePager`: `‹ Page N / M ›`, where the page indicator sits exactly where play/pause was. Prev reuses the **rewind** sprite, next the **skip-forward** sprite (`ReaderButtonIcon`, `ctrl-btn`). The five playback buttons are not rendered in this mode.

Single-page texts render `Page 1 / 1` with both arrows disabled (never an empty console). On the DOCX **Formatted** tab and in the RSVP reader the console shows the normal playback controls, unchanged.

### The paging state layer is an engine-pure reusable hook
The state layer is extracted into `engine/useTextPaging.ts` — `useTextPaging(displayContent, currentWordOffset)` returning `{ wordPositions, totalWords, pageStarts, totalPages, currentPage, detached, canBack, canForward, currentRange, goPrev, goNext, locate }`. It owns the `buildWordPositions` / `computePageStarts` memos (still keyed on `displayContent` only, never `wordOffset` — the anti-lag invariant from §1 holds), the `playheadPage` derivation, the `detachedPage` state, and the reset-on-text-change + re-attach-on-catch-up effects. `locate()` clears detach and does **not** scroll — DOM/ref work (the `highlightRef`, `scrollIntoView` auto-follow, scroll-to-position) stays in the panel.

**Reader owns the single hook instance** and `TextViewPanel` becomes a controlled renderer that receives the `paging` state as a prop. This is the seam that lets the console (owned by Reader) and the panel share one source of paging truth. **Reuse rationale:** the hook's inputs are only the rendered text and the playhead's whole-text word offset — things any reader stage already has — so a future paged reader stage can consume the same hook without depending on `TextViewPanel`.

### Playback keeps running underneath
Entering plain paged Text view changes the *controls* the console shows, not the *playhead*. Playback continues; auto-follow, detach, and Locate stay meaningful exactly as in §2–§3. Swapping the transport cluster for the pager is purely a view concern.

### A4 floating sheet (plain view only)
The plain current-page container (`.plain-text-content`) is styled as a centered floating "A4 sheet": a readable measure (`width: min(100%, 72ch + gutters)`, `margin: … auto`), its own lifted surface (`--bg2`), a `1px` border, a **subtle static** `box-shadow`, and generous inner padding. The area behind the sheet uses the darker reader background (`--reader-bg`, applied to the panel when it holds plain content) so the sheet reads as paper floating on a desk. It is pure static CSS — no JS, no measurement, nothing on the per-beat path — and adapts to light/dark via existing tokens. Auto-follow `scrollIntoView`, word click-to-select, and inline bookmark markers are unaffected. The DOCX **Formatted** view keeps its own layout and is untouched.

### Arrow-key paging
In plain paged Text view, `←` / `→` flip to the previous / next Page (and detach, per §3) instead of rewinding / skipping the playhead; `Space` still pauses/resumes and the INPUT/TEXTAREA/SELECT guard is preserved. The decision stays in the pure keymap table: `ReaderKeyInput` gains a `pagedPlainActive` flag (`showPlainText && textViewMode === 'plain'`) and `resolveReaderKeyAction` maps the arrows to two new `page-prev` / `page-next` actions (both `preventDefault`) ahead of the existing `rewind` / `seek-forward` cases; outside that mode arrow behavior is exactly as before. `Reader`'s dispatch switch wires the two actions to `paging.goPrev()` / `paging.goNext()`. The now-redundant header title/detail was removed with the band above (the title already lives in `ReaderTopbar`).

### Run 4 consequences
- No `CONTEXT.md` change: the existing **Page *(text view)*** glossary entry still covers the vocabulary; Run 4 introduced no new terms.
- No new bookmark, playback, or persistence surface — Run 4 relocates controls and extracts state; the engine, `pageStarts`, and word-offset space are the same as Runs 1–3.
- **Verification:** `npm run build` + `npm test` green; `tsc` baseline held at **46**. `useTextPaging` has its own unit test (attach, `goPrev`/`goNext` detach + clamp, re-attach on catch-up, `locate()` clears detach, reset on text change); pager/console assertions live in the `ReaderControls` / text-mode tests; arrow mapping is covered in `engine/__tests__/readerKeymap.test.ts`.

## Addendum — Standard view retired (Library Facelift QA-1)

The former **"Standard view"** reading mode — a separate `StandardReader.tsx` sub-view with a resizable box, its own paginator, and click-to-seek page turns, toggled from a bottom-left `Standard view` button — is **removed**. It is superseded by this paged **Text view**: auto-follow paging plus the A4 floating sheet (Run 4) cover the comfortable-reading intent, and the scrubber + bookmarks (ADR-0024) cover positional navigation. **No behavior was ported** — there is no click-to-seek and no resizable-box port; the scrubber, bookmarks, and A4 sheet cover those affordances.

Removed with the mode: the `StandardReader` component, its `showStandardReader` state and `.std-reader-toggle-btn` toggle in `Reader.tsx`, the floating-vs-embedded QuickSettings split (embedded footer QuickSettings is now the only variant), the `standardReaderOpen` keymap input / `close-standard-reader` action / "Standard-reader modal" branch in `engine/readerKeymap.ts`, the `showStandardReader` param in `engine/readerDisplayScale.ts`, and all `std-reader-*` CSS. The reader now has exactly three mutually-exclusive stages: the RSVP stack stage, this Text view, and library Browse. No `CONTEXT.md` change — Standard view was never a glossary term. The domain term **"Standard Reader"** (RSVP config / Profiles) is unrelated and untouched.
