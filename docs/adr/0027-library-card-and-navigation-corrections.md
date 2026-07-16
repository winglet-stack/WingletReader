# ADR-0027: Library card restructure & navigation layout corrections

**Date:** 2026-07-13
**Status:** Accepted
**Amends:** ADR-0020 (corner "up one level" navigation) — generalises the corner up-level control from a Settings-only concern to a shared `UpLevelControl` that also serves the Library **Contents view**, and makes the overlay-reader subview's up-level target **origin-aware**. ADR-0020's dove-→-hub invariant is preserved, not weakened.
**Relates to:** ADR-0013 (Reader persistent frame; in-frame library browse toggle relocated here), ADR-0023 (Contents view surface + origin vocabulary; Category display), ADR-0021 (Overlay Reader settings subview — the second entry point that motivates origin-aware return), ADR-0008 (`ReadingPosition` persistence — read-only new resolver, no schema change), ADR-0022 (`ChromeIcon` used as the relocated toggle's placeholder glyph).

## Context

Four navigation/layout discrepancies surfaced in a maintainer grill (`Refernces/BasicLayoutChanges/layoutoverhaul-grilling-material.md`). None change data or reading behaviour; all are chrome/affordance corrections that had drifted from the intended model.

1. **Reader "library" button is misplaced.** The in-frame library **browse toggle** (`reader-browse-btn`, "Library"/"Reading") sits in `reader-topbar-center` — *above* the scrubber, visually detached from the transport it belongs with. `CONTEXT.md` (ADR-0013) already *claimed* this toggle lives "in the control zone," so the code had drifted from the glossary.

2. **Library card entry is a hidden affordance.** The only way to "enter" a text is clicking its **title**, which is unlabelled and, worse, overloaded: `openReader` sends segmented books to the Contents view and single-segment texts to the Reader. There is no explicit, labelled "start/continue reading" control, and no book-level resume at all — reading positions are stored per `textId`, and each chapter of a segmented book is its own text record tagged `source: 'segment'`, which `getLatestResumeCandidate` explicitly *excludes*.

3. **Contents view has a redundant, squished back.** The Contents view (`SegmentPanel`, `libraryTab === 'chapters'`) shows an inline `← Library` button crammed above the book title, *and* the shell renders the dove (→ hub) in the corner — two competing backs, exactly the redundancy ADR-0020 resolved for Settings sub-pages but never extended to the Library.

4. **Overlay Reader subview forgets where you came from.** The overlay-reader Settings subview is reachable from **two** entry points (the hub Overlay Reader tile via `openOverlayReaderSettings`, and the Settings landing card via `setSettingsSubview('overlay-reader')`), but the corner up-level control unconditionally does `setSettingsSubview(null)` → Settings landing. Entering from the hub and pressing back strands the user in Settings.

## Considered Options

**Category reassignment location (hard-to-reverse affordance choice):**
- **Contents view only, card chip inert — chosen.** The Library card shows the assigned Category as a read-only chip; changing it requires opening the book's Contents view (via mid-section click or the ⌗ contents button). Frees card space, kills the inline expand-and-reflow picker, and gives category-change a single obvious home next to the book's other management (Add Content, bookmarks).
- **Keep the inline expand picker on the card.** Rejected: it reflows the card, competes with the new lead actions, and clutters exactly the row the restructure is trying to simplify.
- **A third redirect: clicking the display chip routes to the Contents view.** Rejected: muddies the "open the book to manage it" path with a redundant entry; the chip stays inert.

**Resume semantics for segmented books (the real trade-off):**
- **Full book-level resume — chosen.** A new read-only resolver finds the most-recent `source:'segment'` reading position among a book's segments and resumes that chapter at that position; a never-read book opens chapter 1 at the start. This is the only version where "Resume" is truthful for chaptered books — and *every* seeded book is chaptered.
- **Minimal (single-segment only).** Rejected: for segmented books Resume would just re-open the Contents view, duplicating the ⌗ button and the mid-section click and doing nothing distinct on the books that matter most.

**Contents-view back (extends ADR-0020):**
- **Generalise the corner up-level control to the Contents view — chosen.** The corner shows the up-level sprite (→ Library list) at `libraryTab === 'chapters'`, dove otherwise; the inline `← Library` is removed. Mirrors ADR-0020's Settings sub-page rule exactly and keeps "dove → hub" globally constant (the dove simply is not shown one level down).
- **Keep the inline back and just restyle it.** Rejected: leaves the two-backs redundancy ADR-0020 already ruled against.

**Overlay-reader return (extends ADR-0020):**
- **Origin-aware up-level target — chosen.** Track `settingsSubviewOrigin`; hub entry returns to hub, Settings entry returns to Settings landing. This does *not* make the corner control ambiguous the way a context-dependent dove would: the control is already the depth-aware up-level slot, and "up" genuinely differs by entry path for this dual-entry subview.
- **Always return to Settings landing (status quo).** Rejected: it is the bug.
- **Always return to hub.** Rejected: wrong for the in-Settings user, who expects to land back in Settings.

## Decision

### 1. Reader browse toggle relocates to the control zone
The in-frame library browse toggle moves from `ReaderTopbar` center into `ReaderControls` `leftSlot`: bottom-left, **square**, sized to the play button's footprint, **horizontally aligned with the back button, vertically aligned with the playback row**. It keeps its toggle behaviour (Library ⇄ Reading, pauses playback on entry, `--active` state while browsing) and stays **engaged-Reader-only**. Its glyph is a **`ChromeIcon` placeholder** behind an asset seam (maintainer will supply final art). `reader-topbar-center` / the `reader-topbar--browse` modifier are removed. The red-arrow → hub Back is **unchanged**.

### 2. Library card is a three-zone card
`TextCard` is rebuilt into:
- **Lead** — two actions: **Resume/Read** and **⌗ contents** (Contents view).
- **Mid** — title + description (`words · chapters`); clicking it opens the **Contents view** (for now — the deliberate current wiring).
- **Trailing** — an **inert** Category display chip, then **delete**.

The former inline Category picker (`text-card-category-row` expand + `+N` overflow) is removed from the card.

### 3. Resume always lands in the Reader; book-level resume resolver
The **Resume** action opens the Reader at a resolved position, never the Contents view:
- **Single-segment text** → `getReadingPosition(textId)`; none/0 → start.
- **Segmented book** → a **new read-only resolver** (`getBookResumeTarget`) returns the most-recent `source:'segment'` position among the book's segments as `{ segmentId, stackIndex }`; **never-read → chapter 1 at start**.

Label is **"Resume"** when a saved position resolves, **"Read"** when starting fresh. The resolver is additive (db helper + IPC + preload + `env.d.ts` + types); it does **not** change `ReadingPosition` shape, and `getLatestResumeCandidate`'s `source:'segment'` exclusion (used by the hub Read tile) is untouched.

### 4. Category reassignment moves to the Contents view
The book's Category selector sits **above the title** in the Contents view — the exact slot the removed inline `← Library` button vacated (§5). It opens a contained popover to reassign, without reflowing. The Library card's chip is display-only (§2). Top-of-Library Category **filter tabs** are unaffected.

### 5. Contents-view back is the corner up-level control (`UpLevelControl`)
The inline `← Library` header button is **removed**. `SettingsUpLevelControl` is generalised into a shared **`UpLevelControl`** (configurable `onNavigateUp` + label/title, same sprite). `AppShell` renders it — suppressing the dove — when `view === 'library' && libraryTab === 'chapters'`, wired to `setLibraryTab('list')`; the dove shows otherwise. Reaching the hub from the Contents view is the same two-hop as ADR-0020 sub-pages (up → Library, dove → hub). Settings sub-pages keep the identical behaviour through the renamed component.

### 6. Overlay-reader subview back is origin-aware
`NavigationContext` gains **`settingsSubviewOrigin: 'hub' | 'settings'`** (default `'settings'`). `openOverlayReaderSettings()` stamps `'hub'`; every in-Settings drill-in stamps `'settings'`. The corner up-level control, when on the **overlay-reader** subview, branches: `'hub'` → `setView('hub')`; `'settings'` → `setSettingsSubview(null)`. Other subviews (`reader-defaults`, `import`, `data`) are single-entry and always resolve to the Settings landing — unchanged. The `readWhileWorking.onExited → library` disarm flow (armed overlay window closing) is a separate concern and is **left unchanged**.

## Consequences

- **`CONTEXT.md` updated on decision** (this session): new **Contents view** glossary entry; **Category** amended (reassignment lives in the Contents view; card chip inert); **Home control (dove)** amended (corner up-level extended to the Contents view via `UpLevelControl`; overlay-reader return is origin-aware via `settingsSubviewOrigin`).
- **New read-only resolver, no schema change.** `getBookResumeTarget` reads existing `readingPositions`; `ReadingPosition` shape and ADR-0008 storage contract are unchanged.
- **ADR-0020 generalised, not overturned.** The corner is still "up one level"; the dove still only ever means hub. This ADR widens the rule's reach (Library Contents view) and adds one origin qualifier for the single dual-entry subview.
- **Asset seam.** The relocated Reader toggle ships a `ChromeIcon` placeholder behind a seam so final art doesn't block the slice — same pattern ADR-0020 used for its sprite.
- **Tests retarget.** `textCard.test.tsx` (new lead/mid/trailing + Resume routing + inert chip), `segmentPanel.test.tsx` (category selector, inline back removed), `homeControl.test.tsx` / RWW nav tests (Contents-view up-level, origin-aware overlay-reader return), and the Reader browse-toggle tests (new control-zone location). New coverage for the `getBookResumeTarget` resolver.
- **Scope boundary.** Chrome/affordance/navigation only. No change to reading playback, the two-tab editors (ADR-0019), Transmute, or the armed overlay window. `TemporaryReaderApp` is untouched.
- **Verification gate:** `npm run build` + `npm test`; do not increase the `tsc -b` baseline (45).
