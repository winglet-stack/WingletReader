# Library Facelift run 3 — Paged Text view: sequential handoff prompts

Paste-ready kickoff prompts for the Paged Text view cascade (**ADR-0025**). Work top to bottom, **one slice per agent window**. Tick each box when its slice is merged green (`npm run build` + `npm test`, `tsc` baseline **46** not increased), then move its scratch file to `.scratch/done/YYYY-MM-DD-<slug>.md` and update `.scratch/README.md`.

**Cascade:** `PG-1 → PG-2 → { PG-3, PG-4 }`
**Drip rule:** keep ≤ 2 files in `.scratch/active/` — promote the next slice from `_misc/queued/` only when a slot opens (note: `active/03-library-always-view-empty.md` currently occupies one slot).
**Every agent reads first:** `CLAUDE.md` → `CONTEXT.md` (**Page *(text view)***) → `HANDOFF.md` → `docs/adr/0025-paged-plain-text-view.md` → its assigned `_misc/queued/pgN-*.md`.

---

## ☑ 1. PG-1 — Pagination engine  ·  model: Codex  ·  blocked-by: none  ·  DONE 2026-07-12

```
Implement Paged Text view slice PG-1 (ADR-0025, Library Facelift run 3). Read the ADR and the CONTEXT.md **Page (text view)** entry first. Add a pure `engine/textPagination.ts` with `computePageStarts(...)` returning ascending `wordOffset[]` Page-start indices (always starts with 0): accumulate whole paragraphs until ~500 words then break at the paragraph end (never split a paragraph); hard-cut a single paragraph past ~800 words, and hard-cut paragraph-less text by count. Add `pageForWordOffset(pageStarts, wordOffset)` (binary search → 0-based page index) and `pageRange(pageStarts, pageIndex, totalWords)` → { startWord, endWord }. The paragraph split and word tokenization MUST match `buildWordPositions` exactly (reuse a shared helper — do not fork a second tokenizer) so Page indices align with the whole-text `wordOffset` space used by stacks and bookmarks. No React, no `TextViewPanel` change. Add `textPagination.test.ts`. Gate: `npm run build` + `npm test` green, `tsc` baseline 46 not increased. Next slice is PG-2.
```

---

## ☑ 2. PG-2 — Render swap + auto-follow  ·  model: Claude  ·  blocked-by: PG-1  ·  DONE 2026-07-12

```
Implement Paged Text view slice PG-2 (ADR-0025), building on PG-1. Read the ADR and the CONTEXT.md **Page (text view)** entry first. In `TextViewPanel`, stop rendering the whole document: memoize `buildWordPositions(displayContent)` on `displayContent` ONLY (not `wordOffset`), derive `pageStarts` from it once (PG-1), and render elements for only the current Page's word range (`pageRange`). While attached, `currentPage = pageForWordOffset(pageStarts, plainTextCtx.wordOffset)`. Keep the current-word `<mark>`, the selection span, and click-to-select, scoped to the visible Page. Auto-follow: flip the Page only on playhead boundary crossings (not per beat); within a Page keep the current-word `scrollIntoView` via `highlightRef`, and preserve the open/mode-change scroll-to-current effect. No manual paging UI yet; Locate keeps working. Do not touch the Standard/RSVP viewport, the DOCX "Formatted" view, bookmark data, or `usePlayback`. Update `textViewPanel.test.tsx`. Gate: `npm run build` + `npm test` green, `tsc` baseline 46 not increased. Next slices (independent): PG-3 and PG-4.
```

---

## ☐ 3. PG-3 — Manual paging + detach/re-attach  ·  model: Claude  ·  blocked-by: PG-2

```
Implement Paged Text view slice PG-3 (ADR-0025 §3), building on PG-2. Read the ADR and the CONTEXT.md **Page (text view)** entry first. Add a mouse-only prev / `Page N / M` / next cluster to the `TextViewPanel` header (`plain-text-ref`); hide or disable prev/next when the text is a single Page. Manual paging sets `currentPage` independently of the playhead and enters a detached state that suspends PG-2 auto-follow (so playback boundary crossings do not yank the view). Re-attach two ways: Locate snaps to the playhead's Page and re-attaches (and shows an active/highlighted state while detached, doubling as "return to reading"); and auto-reattach when the playhead advances into the Page being viewed. Paging never moves the playhead; no PageUp/PageDown in v1. Update `textViewPanel.test.tsx`. Gate: `npm run build` + `npm test` green, `tsc` baseline 46 not increased.
```

---

## ☐ 4. PG-4 — Inline bookmark markers  ·  model: Claude  ·  blocked-by: PG-2

```
Implement Paged Text view slice PG-4 (ADR-0025 §4), building on PG-2. Read the ADR, the CONTEXT.md **Page (text view)** entry, and ADR-0024 (Bookmarks) first. Pass the engaged text's bookmark list into `TextViewPanel` from `Reader.tsx` (reuse the state already loaded for ADR-0024 — no new IPC or CRUD). For any bookmark whose `wordOffset` falls on the current Page, render an inline marker on that word, with the goal bookmark visually distinct from normals (reuse the selection-style class family). Markers are decoration only — no click/hover interaction; management stays in the reader popover and Library `SegmentPanel` section. A bookmark on another Page shows no marker until paged to. Ensure the marker coexists cleanly with the current-word highlight and the selection marker. Update `textViewPanel.test.tsx`. Gate: `npm run build` + `npm test` green, `tsc` baseline 46 not increased.
```

---

### After the last slice
- [ ] All 4 scratch files moved to `.scratch/done/`; `.scratch/README.md` Paged Text view table cleared.
- [ ] `HANDOFF.md` updated (paged Text view shipped) — this was a pre-invite alpha code gate; confirm green before the Phase 4 tag.
- [ ] Manual pass on a large text (50k+ words): open Text view → renders one Page, no per-beat lag; auto-follow flips Pages during playback; manual prev/next detaches, Locate returns; bookmarked words marked on their Page (goal distinct); DOCX "Formatted" view unchanged.
