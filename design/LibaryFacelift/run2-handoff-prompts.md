# Library Facelift run 2 — Bookmarks: sequential handoff prompts

Paste-ready kickoff prompts for the Bookmarks cascade (**ADR-0024**). Work top to bottom, **one slice per agent window**. Tick each box when its slice is merged green (`npm run build` + `npm test`, `tsc` baseline 105 not increased), then move its scratch file to `.scratch/done/YYYY-MM-DD-<slug>.md` and update `.scratch/README.md`.

**Cascade:** `BK-1 → BK-2 → BK-3 → { BK-4 → { BK-5, BK-6 }, BK-7, BK-8 }`
**Drip rule:** keep ≤ 2 files in `.scratch/active/` — promote the next slice from `_misc/queued/` only when a slot opens.
**Every agent reads first:** `CLAUDE.md` → `CONTEXT.md` (Bookmark / Goal bookmark) → `HANDOFF.md` → `docs/adr/0024-bookmarks-replace-stop-target.md` → its assigned `_misc/queued/bkN-*.md`.

---

## ☐ 0. (Optional precursor) LF-03 — finish Library Facelift run-1 tail

> Recommended before starting BK-1, since it's already in flight. Its prompt lives in `.scratch/_misc/queued/03-library-always-view-empty.md`. Skip if you'd rather start Bookmarks immediately — they don't conflict.

---

## ☐ 1. BK-1 — Bookmark data spine  ·  model: Codex  ·  blocked-by: none

```
Implement Bookmarks slice BK-1 (ADR-0024). Read the ADR and the CONTEXT.md **Bookmark** / **Goal bookmark** entries first. Add a `Bookmark = { id, textId, kind: 'normal'|'goal', wordOffset, label, createdAt }` record (stable `wordOffset` anchor, never a `stackIndex`) and a new JSON-store collection with `nextBookmarkId`, mirroring the `segments`/`readingPositions` pattern: `getBookmarks`, `saveBookmark`, `updateBookmarkLabel`, `deleteBookmark`. Enforce single-goal-per-text in `saveBookmark` (a new goal replaces the prior goal). Cascade-delete bookmarks in `deleteText`. Clamp `wordOffset` to `[0, word_count-1]` on read and drop a goal past end. Wire IPC (`db:*`), preload, and `env.d.ts`. No UI in this slice; do not touch the stop target yet. Add `database.test.ts` coverage. Gate: `npm run build` + `npm test` green, `tsc` baseline 105 not increased. When done, the next slice is BK-2 (reader create-normal-at-current).
```

---

## ☐ 2. BK-2 — Create normal @ current  ·  model: Claude  ·  blocked-by: BK-1

```
Implement Bookmarks slice BK-2 (ADR-0024), building on BK-1. Read the ADR and CONTEXT.md **Bookmark** first. Replace the `StopTargetPanel` body with a `BookmarkPopover` in the same reader utilities slot (keep Escape-cascade close). Add one action, **Set at current position**: convert the live playhead to a stable `wordOffset` and create a `kind: 'normal'` bookmark via the BK-1 API, with an optional label prefilled from an auto-snippet (first ~4 words at that offset via the existing word-split/plain-text helpers). The button reflects whether this text has bookmarks. Leave the old auto-stop wiring inert and do NOT delete `stopTargetCalculator` yet (BK-5 does that). Out of scope: browse/jump/delete, goal, scrubber markers, selected-position, library. Update tests. Gate: `npm run build` + `npm test` green, `tsc` baseline 105 not increased. Next slice: BK-3 (browse + jump + delete).
```

---

## ☐ 3. BK-3 — Browse + jump + delete  ·  model: Claude  ·  blocked-by: BK-2

```
Implement Bookmarks slice BK-3 (ADR-0024), building on BK-2. Add an inline browse list to the Bookmark popover showing this text's bookmarks in `wordOffset` order (label + `%` position), built as a reusable `BookmarkList`/`BookmarkRow` (BK-8 will reuse it in the Library). Selecting a bookmark jumps the reader via `seekTo(resolveWordsToStackIndex(wordOffset, stacks))` — this is the "targeted insertion". Add per-row delete through the BK-1 API. Out of scope: goal, scrubber markers, selected-position, library. Update tests. Gate: `npm run build` + `npm test` green, `tsc` baseline 105 not increased. Next slice: BK-4 (goal kind + forward rule + scrubber goal marker).
```

---

## ☐ 4. BK-4 — Goal kind + forward rule + goal marker  ·  model: Claude  ·  blocked-by: BK-3

```
Implement Bookmarks slice BK-4 (ADR-0024), building on BK-3. Read CONTEXT.md **Goal bookmark** first. Add a `Normal`/`Goal` kind picker at set time. Validate the forward rule renderer-side: reject a goal whose `wordOffset` is not strictly greater than the saved `ReadingPosition` (convert its `stackIndex` to a word offset using the live stacks; a never-read text = offset 0), showing an inline error on reject. Setting a goal replaces any prior goal. Render the goal as a prominent scrubber marker (reuse the `reader-target-marker` style) and tag it "Goal" in the browse list. Do NOT wire auto-stop or delete `stopTargetCalculator` yet — that's BK-5. Out of scope: normal ticks, selected-position, library. Update tests. Gate: `npm run build` + `npm test` green, `tsc` baseline 105 not increased. Next slice: BK-5 (goal auto-stop + self-terminate + gut the calculator).
```

---

## ☐ 5. BK-5 — Goal auto-stop + self-terminate + gut calculator  ·  model: Claude  ·  blocked-by: BK-4

```
Implement Bookmarks slice BK-5 (ADR-0024), building on BK-4. Read CONTEXT.md **Goal bookmark** and the **Stop target** tombstone first. Rewire `useSessionAutoStop` (in `useReadingSessionLifecycle`) from the old `StopTarget` to the goal bookmark: resolve the goal `wordOffset`→`stackIndex` per session and `stop()` on crossing. On that stop event, delete the goal row via the BK-1 API; a manual scrub past the goal must NOT delete it (notification deferred). Then gut the stop target: delete `stopTargetCalculator.ts` + tests, the `StopTarget` type, and the `%`/time/words remnants and now-dead props — but keep the scrubber marker repurposed for the goal (BK-4). Update the reader session/auto-stop tests to the goal model. Out of scope: normal ticks, selected-position, library. Gate: `npm run build` + `npm test` green, `tsc` baseline 105 not increased. Next slices: BK-6, BK-7, BK-8 — all now unblocked.
```

---

## ☐ 6. BK-6 — Normal scrubber ticks  ·  model: Codex  ·  blocked-by: BK-4

```
Implement Bookmarks slice BK-6 (ADR-0024), building on BK-4. In `ReaderScrubber`, render each normal bookmark as a faint, thin, label-free tick at its `wordOffset`→`stackIndex` position, subordinate to the prominent goal marker, with the label exposed via `title`/`aria` on hover. No interaction on the ticks (jumping stays in the popover/library). Keep it uncluttered with many bookmarks. Update tests. Gate: `npm run build` + `npm test` green, `tsc` baseline 105 not increased.
```

---

## ☐ 7. BK-7 — Text-view selection + "Set at selected"  ·  model: Claude  ·  blocked-by: BK-3 (goals: also BK-4)

```
Implement Bookmarks slice BK-7 (ADR-0024), building on BK-3 (and BK-4 for goal-from-selection). Read ADR-0024 §3–§4 first. In `TextViewPanel`, add click-to-select a word → a selected `wordOffset` with its own marker (distinct from the current-word highlight), without moving the playhead. Surface the selected offset so the reader popover's "Set at selected position" action enables when a word is selected (disabled + tooltip otherwise) and creates a bookmark there, honoring the Normal/Goal picker and goal forward rule. Clear selection on text-view close / new text engage. Do not change playback, plain-text scroll/locate, or the DOCX view. Update tests. Gate: `npm run build` + `npm test` green, `tsc` baseline 105 not increased.
```

---

## ☐ 8. BK-8 — Library Bookmarks section  ·  model: Claude  ·  blocked-by: BK-3

```
Implement Bookmarks slice BK-8 (ADR-0024), building on BK-3. Read ADR-0024 §5 and CONTEXT.md **Bookmark** first. Add a Bookmarks section to `SegmentPanel` that leads **above** the contents/chapters list: goal pinned on top with a distinct glyph + "Goal" tag, normals below in `wordOffset` order, reusing the BK-3 `BookmarkList`/`BookmarkRow`. Per-row Read-from (engage text + seek to the bookmark via the existing reader-open path), rename, and delete via the BK-1 API. Hide the section when the text has no bookmarks. Do not change the contents/chapters list or its ADR-0023 behavior. Update tests. Gate: `npm run build` + `npm test` green, `tsc` baseline 105 not increased.
```

---

### After the last slice
- [ ] All 8 scratch files moved to `.scratch/done/`; `.scratch/README.md` Bookmarks table cleared.
- [ ] `HANDOFF.md` updated (stop target retired, Bookmarks shipped) — Bookmarks was a pre-invite alpha code gate; confirm it's green before the Phase 4 tag.
- [ ] Manual pass: set/browse/jump normals; set a goal, read into it → stops + self-deletes; goal rejected when behind saved position; markers render; Library section manages bookmarks.
