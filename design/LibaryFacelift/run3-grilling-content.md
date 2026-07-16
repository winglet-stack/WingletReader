#WingletReader

## Library Facelift run 3 — Paged Text view (rendering engine)

Grilled 2026-07-12 → **ADR-0025**. Glossary term **Page *(text view)*** added to `CONTEXT.md`.
Plan: `run3-implementation-plan.md` · Handoff prompts: `run3-handoff-prompts.md` · Issues: `.scratch/_misc/queued/pg{1..4}-*.md`.

### Problem

- the plain-text **Text view** (`TextViewPanel`, the `showPlainText` surface) renders **one element per word for the whole book** (50k–150k+ nodes) and rebuilds them **every playback beat** → dominant lag on weak devices, and sluggish bookmark interactions

### Decisions

- render **one Page at a time**, not the whole document; discrete pages, **not** continuous virtualization (no layout measurement)
- **Page** = paragraph-aware slice of **~500 words** (never splits a paragraph); runaway single paragraph hard-cut at **~800**; fixed constant for v1 (not a setting yet)
- `pageStarts` computed **once at engage**, cached; page lookup = binary search; `buildWordPositions` memoized on content only, never per beat
- word-offset space is uniformly **whole-text** — shared by stacks / `plainTextCtx.wordOffset` / `buildWordPositions` / bookmark anchors
- visible Page **auto-follows** the playhead, flipping only on boundary crossing; internal `scrollIntoView` within a Page; paging never moves the playhead
- manual **prev / `Page N/M` / next** in the header (mouse-only v1) → **detaches** auto-follow; **Locate** (active while detached) or playback **catch-up** re-attaches
- bookmarks: existing placement/selection/jump become fast; **inline markers on bookmarked words of the current Page** (goal distinct); no new bookmark data/actions

### Out of scope (explicit no-s)

- Standard/RSVP Stack viewport · DOCX "Formatted" HTML view · segmentation engine · `usePlayback` · bookmark CRUD (ADR-0024) · `ReadingPosition`
- keyboard paging (`PageUp`/`PageDown`) · user-configurable Page size · smart re-anchoring

### Cascade

`PG-1` engine (Codex) → `PG-2` render swap + auto-follow (Claude) → { `PG-3` manual paging + detach (Claude), `PG-4` inline bookmark markers (Claude) }
Gate: `npm run build` + `npm test`; `tsc` baseline **46** not increased.
