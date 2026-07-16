# Library Facelift run 2 — Bookmarks: implementation plan

**Decision of record:** [ADR-0024](../../docs/adr/0024-bookmarks-replace-stop-target.md). Glossary: **Bookmark**, **Goal bookmark** in [`CONTEXT.md`](../../CONTEXT.md); **Stop target** tombstoned.

**Gate:** pre-invite alpha code gate (rework-before-deployment, in v1). Verification: `npm run build` + `npm test`; do not raise the `tsc` baseline (105).

**Model (final):**
```
Bookmark = { id, textId, kind: 'normal'|'goal', wordOffset, label, createdAt }
```
- Anchor: stable `wordOffset` (never `stackIndex`). Resolve at use time via `resolveWordsToStackIndex`.
- Single goal per text = handler invariant (saving a goal deletes the prior goal).
- Goal forward-rule (`goal.wordOffset > savedReadingPosition.wordOffset`, never-read = 0) validated **renderer-side**.
- Goal self-deletes only on **playback crossing** (auto-stop), not on manual scrub.
- Cascade-delete with the text; clamp `wordOffset` to `[0, word_count-1]` on read; drop goal past end. No smart re-anchor.

---

## Slices (tracer-bullet, each ships green)

Order: **A → B → C** (B before C: C needs a goal to exist), then **D** and **E** (independent after A/B). D unblocks the disabled "set at selected" in B.

### Slice A — Bookmark data spine (no UI)
Thinnest end-to-end: persist and retrieve a bookmark.
- `database.ts`: `data.bookmarks` collection + `nextBookmarkId`; `getBookmarks(textId)`, `saveBookmark(textId, draft)` (if `kind==='goal'` delete existing goal first), `updateBookmarkLabel(id, label)`, `deleteBookmark(id)`. Clamp `wordOffset` on read. Cascade in `deleteText` (mirror the `readingPositions` filter at db line ~405).
- `ipcHandlers.ts`: `db:getBookmarks` / `db:saveBookmark` / `db:updateBookmarkLabel` / `db:deleteBookmark`.
- `preload/dbApi.ts` + `env.d.ts`: typed wrappers; `Bookmark` type in `shared/domainRecords.ts` (re-export via `types.ts`).
- Tests: `database.test.ts` — CRUD, single-goal replacement, cascade-on-delete, clamp-on-read.
- **Out of scope:** forward-rule (renderer-side, Slice B/C), any UI.
- Model rec: **Codex** (mechanical four-layer mirror of an existing pattern).

### Slice B — Reader bookmark control (create + browse + jump)
Repurpose the former stop-target button/popover into the Bookmark control.
- New `BookmarkPopover` replacing the `StopTargetPanel` body: **Set at current** (playhead→wordOffset), **Set at selected** (disabled — enabled in D), **browse** list (this text's bookmarks, inline; jump + delete). Kind radio `Normal`/`Goal`; optional label prefilled with auto-snippet (reuse `splitContentAtWord` / plain-text ctx). Goal forward-rule validated here (has stacks + saved position) → inline error on reject.
- Shared `BookmarkList` / `BookmarkRow` component (reused by E).
- Jump = `seekTo(resolveWordsToStackIndex(wordOffset, stacks))`.
- Wire load/save through Slice A API; keep the Escape-cascade close behavior.
- Tests: create normal/goal, goal-reject-when-behind, browse+jump, delete.
- Model rec: **Claude** (UX-shaped, validation logic, reuses several engine helpers).

### Slice C — Goal auto-stop + termination + gut the calculator
- Rewire `useSessionAutoStop` (`useReadingSessionLifecycle`) from `StopTarget` to the goal bookmark: resolve goal `wordOffset`→`stackIndex` each session; stop on crossing; **delete the goal row** on the stop event.
- `ReaderScrubber`: goal → prominent marker (reuse `reader-target-marker` style); normals → faint ticks.
- **Delete** `stopTargetCalculator.ts` + its tests + the `StopTarget` type + `%`/time/words remnants; remove dead props.
- Tests: goal-crossing stops + deletes; manual scrub past goal does not delete; markers render.
- Model rec: **Claude** (touches the reader lifecycle hotspot; careful deletion).

### Slice D — Plain-text word selection ("selected position")
- `TextViewPanel`: click-to-select a word → selected `wordOffset`, distinct marker (not the current-word highlight); playhead unchanged. Surface the selection to the reader so **"Set at selected"** (Slice B) enables.
- Tests: click sets selection; selection ≠ playhead; clears appropriately.
- Model rec: **Claude** (DOM word-index mapping in the `pre`/`splitContentAtWord` render).

### Slice E — Library Bookmarks section
- `SegmentPanel`: **Bookmarks** section **above** the contents/chapters list — goal pinned (distinct glyph + "Goal" tag), normals in offset order; per-row **Read-from** (jump the reader), **rename**, **delete**. Hidden when empty. Reuse `BookmarkList`/`BookmarkRow` from B.
- Read-from = engage text + `seekTo` the resolved index (via existing reader-open path).
- Tests: section renders/orders, goal pinned, rename/delete/read-from, hidden-when-empty.
- Model rec: **Claude** (two-host component reuse; wires into ADR-0023 SegmentPanel).

---

## Drip-feed note
`.scratch/active/` caps at 2 files. Promote slices two-at-a-time (A+B first). Each issue carries: atomic scope, Claude/Codex rec (above), and a copy-paste handoff-prompt-for-next-agent generated before the maintainer's commit-confirmation gate.
