# ADR-0024: Bookmarks replace the stop target — word-offset anchored, Normal + Goal

**Date:** 2026-07-12
**Status:** Accepted
**Relates to:** ADR-0023 (Library Facelift run 1 — segment vocabulary; this is run 2), ADR-0018 (`seed_id` origin), ADR-0013 (Reader persistent frame — one `Library`/`SegmentPanel` renders in two hosts), ADR-0004 (dead code archived, not deleted). Supersedes the **stop target** feature (`StopTargetPanel`, `stopTargetCalculator`).

## Context

The Reader shipped a **stop target**: a Reader-owned, **session-only** halt point entered as an abstract quantity — **percentage / time / words** — that `stopTargetCalculator.ts` resolved into a `stackIndex`. An auto-stop effect fired `stop()` when playback crossed it; the scrubber drew a marker. It never persisted (plain React state in `useReadingSessionLifecycle`), so it evaporated on reload, and it could not express *"stop at this specific passage"* — only *"stop after this much."*

The Library Facelift run 2 reworks this into **Bookmarks**: persistent, user-placed marks on a *specific place* in a text. Two kinds:

- **Normal** — 1..n per text. A saved starting/reference position and a **targeted insertion mechanism**: the user jumps ("inserts") the reader's playhead to it. Lives across sessions.
- **Goal** — exactly one per text. The passage where the user intends to stop this session. Must be **ahead of the saved reading position**. When playback crosses it, playback stops (notify optional/deferred) and the goal **deletes itself**, freeing the slot for a new one. Lives across sessions until reached.

This majorly changes the reading experience and is treated as a **pre-invite alpha code gate** (rework-before-deployment), not post-alpha work.

## Considered Options

**Anchor (hard-to-reverse data choice):**
- **Stable `wordOffset` — chosen.** Matches the `TextSegment.startWordOffset` precedent. A bookmark records a word index into the text and resolves to a live `stackIndex` only at use time (jump, goal-crossing, scrubber marker).
- **`stackIndex` (status quo for stop target / `ReadingPosition`).** Rejected: a stack is `words_per_stack` words glued together, and `words_per_stack` is a user setting. A `stackIndex` saved under one grid points to a different passage after a retune — a latent corruption bug for anything that "lives across sessions."

**Kind modelling:**
- **One collection + `kind: 'normal' | 'goal'` discriminator — chosen.** Normal and Goal share everything (anchor, label, edit/remove, cross-session life). Single-goal is a handler invariant (setting a goal deletes the prior goal for that text); "terminates itself" is the ordinary delete path.
- **Split (normals in a collection, goal as a `TextRecord` field).** Rejected: bloats `TextRecord`, duplicates the delete/rename/render paths, and buys nothing.

**Relationship to the old model:**
- **Remove `%`/time/words entirely — chosen.** The abstract-quantity entry model and `stopTargetCalculator` are deleted; only the utility-button + popover *shell* is retained as the mount point for the bookmark control. The Goal bookmark inherits only the auto-stop-on-crossing behavior.
- **Keep both.** Rejected: an abstract stop point and an anchored stop point do not compose into coherent UI.

**Sequencing:**
- **In alpha v1, before the tag — chosen (maintainer).** It is a rework of the core reading experience and gates the tag.
- **Post-tag feature.** Rejected by the maintainer for this reason.

## Decision

### 1. Bookmarks are word-offset anchored, persisted, per text
`Bookmark = { id, textId, kind, wordOffset, label, createdAt }`, stored in a new JSON-store collection with a `nextBookmarkId` counter, exposed through the standard four layers (`database.ts` → `ipcHandlers.ts` `db:*` → `preload/dbApi.ts` → `env.d.ts`). Resolution to `stackIndex` is done in the renderer via the existing `resolveWordsToStackIndex`.

### 2. Single goal is a handler invariant
Saving a `goal` deletes any existing `goal` for that text first. The **forward rule** (`goal.wordOffset` must be strictly greater than the saved reading position's word offset; a never-read text is treated as offset 0) is validated **renderer-side**, because only the renderer holds the live stacks + saved position needed to convert. The goal **terminates itself** — the row is deleted — only when **playback crosses it** (the auto-stop event); a manual scrub past the goal does **not** delete it.

### 3. The stop target is gutted; its shell is repurposed
`stopTargetCalculator.ts` and the `%`/time/words panel body are removed. The reader utility button + popover become the **bookmark control** with a `Normal`/`Goal` segmented switch. Each kind shows only its own bookmark list plus one placement action: **Normal** sets a bookmark at the current live playhead (`wordOffset`), while **Goal** starts an arm-then-pick flow (see §4) and then confirms the picked word before saving the single goal. Both kinds keep the shared inline browse affordance for jump + delete, scoped to the active kind. An optional label is chosen at set time; for Goal, a typed label is preserved through picking, otherwise the picked word's snippet fills the label. The auto-stop machinery is rewired from `StopTarget` to the goal bookmark.

### 4. Goal placement is arm-then-pick, not passive selection
The Goal tab's **Set at selected position** action arms a one-shot pick while keeping the popover open: playback pauses, the plain Text view opens in Plain Text mode, and a top banner asks the user to click a word to set the goal. While armed, words hover-highlight and a word click captures a transient `wordOffset`; clicks on whitespace do nothing. The placement action becomes an in-place destructive **Cancel** button while awaiting a word. Cancel and the first Escape disarm the pick but leave the popover open on the Goal tab. Closing the popover, including via the bookmark toolbar toggle or a second Escape, also cancels the pick. The Text view banner is instruction-only; abort lives in the popover/Escape/toolbar-close paths.

Because the still-open popover overlays the Text view, its outside-mousedown click-away close is suppressed while the pick is armed so clicking a word does not dismiss the popover first. After a word click, the same open popover switches to the Goal tab confirmation state with the picked position, percentage, and a Save / Replace confirmation; click-away close resumes normally. A forward-rule violation stays inline in that popover and offers **Pick another word**, which re-arms the same stay-open flow. There is no persistent `selectedWordOffset` marker or always-on word-selection plumbing; outside the armed Goal flow, word clicks in `TextViewPanel` are inert.

### 5. Library surface
`SegmentPanel` gains a **Bookmarks** section that **leads before** the contents/chapters list. It is browse-only and grouped for parity with the reader popover: a pinned **Goal** subsection renders first when a goal exists, followed by a **Saved** subsection for normal bookmarks in offset order. Each subsection renders its own shared `BookmarkList`, preserving the shared row behavior. Per-row actions: **Read-from** (jump the reader to it), **rename label**, **delete**. The whole section is hidden when a text has no bookmarks. The bookmark-list + row component is shared with the reader popover (one component, two hosts).

### 6. Scrubber markers
The goal renders as a prominent marker (reusing the retired target-marker style — it is literally the "stop here" spot); normals render as faint ticks; the reread marker is unchanged.

## Consequences

- **`CONTEXT.md` updated on decision** (this session): new **Bookmark** and **Goal bookmark** glossary entries; **Stop target / `StopTarget`** and the `%`/time/words entry model tombstoned under Deprecated terms; **Passage / Passage Extract** amended (no longer used for stop-target calculation).
- **Content-mutation policy.** Deleting a text cascade-deletes its bookmarks (mirrors `readingPositions`/segments). "Add Content" append leaves pre-append offsets valid — no reconciliation. On shrink/re-import, `wordOffset` is clamped to `[0, word_count-1]` on read and a goal past the end is dropped. **No smart re-anchoring** (out of scope).
- **Two anchor models coexist deliberately.** `ReadingPosition` stays `stackIndex`-anchored (session resume, cheap); bookmarks are `wordOffset`-anchored (durable). The goal forward-check and marker rendering bridge the two in the renderer.
- **Notification on goal reach is deferred** (spec: optional). Reaching the goal stops playback and deletes the goal; a toast/notification is a later addition.
- **Scope boundary.** No change to the segmentation engine, the ADR-0008 settings contract, or `ReadingPosition` persistence. Summaries untouched.
- **Verification gate:** `npm run build` + `npm test`; do not increase the `tsc` baseline (105). New store CRUD + single-goal invariant + cascade tested in `database.test.ts`; reader auto-stop/termination and library section exercised in renderer tests.

## Amendment — UI labels (2026-07-13)

The **display labels** were relabeled during the Library Facelift; the **domain model is unchanged**. This ADR keeps **Normal** / **Goal** as the canonical concept names, so the button-label strings quoted in §3–§4 are historical (the wording, not the behavior). The current user-facing mapping is:

| Concept (this ADR, data `kind`) | User-facing label |
| --- | --- |
| Normal (`kind: 'normal'`) | **Bookmark** |
| Goal (`kind: 'goal'`) | **Target** |
| §3 "set at the current live playhead" action | **Set Bookmark** |
| §4 arm-then-pick action ("Set at selected position") | **Set Target** |
| §4 save/replace confirmation ("Save goal" / "Replace goal") | **Save target** / **Replace target** |
| §4 banner ("click a word to set the goal") | **Click a word to set your target** |
| §5 pinned goal subsection heading | **Target** |

Display-only rename: the persisted `kind` discriminator, the store schema, prop/state/CSS identifiers, and this ADR's terminology all still use `normal`/`goal`. The popover was also reordered (category tabs on top, shared bookmark list in the middle for both tabs); the ADR-0022 `Segmented` (`.theme-pill`) instrument is unchanged.
