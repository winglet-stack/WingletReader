# ADR-0032: Reserved line box and anchor modes

**Date:** 2026-07-20
**Status:** Accepted
**Relates to:** the Viewport-safe layout cascade (VS-1..VS-5 — the fit solver whose sizing contract this ADR finally makes true in the DOM); ADR-0019 (Grid Layout owns the `lines_*` fields); ADR-0008 (mode-scoped settings store and the RWW override surface); ADR-0021 (Overlay Reader settings — deliberately *not* given an anchor control); ADR-0022 (design-system spacing for the new control).

## Context

Multi-line reading is configured by two fields — `lines_enabled` (a toggle) and `lines_count` (a stepper revealed by the toggle). Two separate problems surfaced against that model.

### 1. The line box is not reserved — the grid creeps

`buildDisplayRows` (`src/renderer/src/engine/stackLayout.ts`) builds **`currentLineIdx + 1`** rows:

```ts
Array.from({ length: currentLineIdx + 1 }, (_, rowIdx) => …)
```

Rows the reader has not yet reached are not rendered at all. `.reader-stack-rows` is a centred flex column with no reserved height, so the block's DOM height **grows by one row each time playback advances to a new line**. Because the block is centred, that growth pushes the whole grid **upward, beat by beat**, and then snaps back down when the block resets to `blockStart`.

The reader is a fixation-based display: the entire premise is that the eye does not have to search for the next word. A first row that drifts upward as the box fills, then jumps, defeats that premise. This is a latent bug, not a design choice — the fit solver (`solveReaderLayout`) has always computed content height for the **full** `linesCount`, so the solver and the DOM have simply disagreed since the box was introduced.

### 2. No control over where the box sits

Even once the box is reserved, its *screen position* still shifts with `lines_count`, because a centred box grows symmetrically about the stage centre: at `lines_count: 1` row 1 sits at the centre; at `lines_count: 3` it sits a row and a half above it. A reader who tunes line count is therefore also, unavoidably, moving their fixation point. Some readers want the box centred (a calm, symmetric stage); some want the **first row pinned to a fixed position at the top** so it never moves regardless of line count.

### 3. The toggle is redundant UI

`lines_enabled` and `lines_count` encode one concept: how many rows. A toggle plus a stepper whose minimum is 2 is a two-control expression of a one-control idea, and it consumes the vertical space in the Grid Layout card and Quick Settings popover where the new anchor control needs to live.

## Considered options & decisions

**Reserving the box:**
- **Render all `linesCount` rows, unreached rows as empty placeholders — chosen.** `buildDisplayRows` emits `linesCount` rows; rows past `currentLineIdx` are all-`null`, and each row carries an explicit `minHeight` derived from the solver's own `rowHeightAtFont`, exported so DOM and solver cannot drift apart. It is a pure change in an already-extracted, already-tested module, and it makes "the box fills up" literally true in the DOM. Rejected *a container `min-height` from the solved content height*: the rows would still be sized by CSS while the reserve is sized by the solver's `fontSize / 0.4` formula, so any divergence reintroduces partial creep. Rejected *accepting the drift*: it would make the new Top-anchored mode visibly more stable than the default, which is backwards.

**Anchor model:**
- **Two modes, `center` (default) and `top` — chosen.** Centred grows symmetrically about the stage centre (today's geometry, now stable); Top-anchored pins the box's top edge to the stage top so row 1 never moves as line count changes. In both modes rows fill top-to-bottom from the box's top edge. Rejected *pinning row 1 at the stage centre and growing downward* — it keeps the fixation point fixed but pushes the box into the lower half of the stage, wasting the upper half and reading as bottom-heavy. Rejected *an explicit square/aspect-constrained box* — the fit solver already owns geometry via the font → spacing → lines ladder, and a second constraint would fight it.
- **"Top" means flex-start inside the stage's existing padding — chosen.** No new inset constant, so the anchor stays inside the ADR-0022 spacing system.

**Interaction with `stack_vertical_offset`:**
- **Anchor-aware, asymmetric clamp — chosen.** `solveReaderLayout` takes an `anchor` input; `clampOffsets` yields `±slack/2` for `center` (unchanged) and `[0, slack]` for `top` — the offset can push the box down from the top but never off the stage. Rejected *ignoring the offset in top mode* — a control the user set in Reader defaults would silently stop working with no UI signal. Rejected *keeping the symmetric clamp* — a negative offset would translate row 1 above the stage top and clip it, which is precisely the failure class VS-1..VS-5 exists to eliminate.

**Behaviour at `lines_count: 1`:**
- **The anchor is inert; the solver forces `center` — chosen.** The control is hidden below 2 lines, so a stored `'top'` would otherwise move the single row to the top of the screen with no visible affordance explaining or undoing it. The stored value is left untouched, so raising the count restores the user's choice. The rule is stated once and shared: the setting is live exactly when its control is visible.

**Settings shape:**
- **`lines_anchor: 'center' | 'top'`, reader-scoped, default `'center'`, read with `?? 'center'` — chosen.** Added to `READER_SETTING_KEYS` and `ReaderConfig`; the nullish default means legacy stores and saved Profiles need no migration.
- **The Overlay Reader inherits it; no seventh `rww_*` key — chosen.** CLAUDE.md is explicit that override widening should move store-native rather than mint more flat `rww_*` projection keys, and in a small always-on-top overlay the box nearly fills the stage, so centred and top-anchored are near-indistinguishable there. Rejected *doing the store-native override widening now* — it drags a settings-store migration onto this feature's critical path.

**`lines_enabled`:**
- **Retained temporarily behind an accessor, then retired in LB-5 — chosen and complete.** The staged route first made the stepper the sole writer and funneled all reads through one accessor. Once LB-1..LB-4 had landed and verified, LB-5 removed the redundant field and migrated legacy disabled values to `lines_count: 1`. The sequencing kept the visible feature work off the store-migration path while still paying the debt immediately afterward.

## Decision (summary)

The multi-line grid becomes a **Line box**: a region of the reader stage that reserves height for all `lines_count` rows from the moment the block starts, and fills top-down as playback advances. Because the height is reserved, the box no longer creeps upward as it fills.

The box's placement on the stage is user-selectable via a new reader-scoped `lines_anchor`:

- **`center`** (default) — the box is centred on the stage and grows symmetrically about the centre as line count rises.
- **`top`** — the box's top edge is pinned to the stage top, so the first row holds a fixed screen position at any line count and the box grows downward.

`stack_vertical_offset` remains live in both modes, clamped symmetrically about the centre for `center` and to `[0, slack]` for `top`. The anchor is inert at `lines_count: 1`, matching the visibility of its control.

The UI drops the **Multiple lines** toggle. Grid Layout and Quick Settings show a **Line count** stepper with a minimum of **1** (where 1 means single-line reading), and reveal an **Anchor** segmented control — *Centred* / *Top-anchored* — only when the count exceeds 1. `lines_count` is the single source of truth; legacy `lines_enabled: false` values migrate to a count of 1 on load.

## Consequences

- **Positive:** the first row stops drifting, which is a correctness fix independent of the new feature; the solver's long-standing sizing assumption is finally honoured by the DOM; readers can keep a fixed fixation point while tuning line count; one control replaces two, freeing the space the anchor occupies.
- **Debt paid (LB-5, 2026-07-20):** `lines_enabled` and `rww_lines_enabled` are retired. A load-time compatibility migration preserves prior rendering in flat settings, every nested store scope, saved Profiles/playback presets, and old Transmute blobs. The RWW flat override surface is now five keys, with `rww_lines_count: 1` preserving a formerly disabled override.
- **Behavioural change on upgrade:** existing multi-line readers will see the grid stop moving. This is the intended fix, but it is a visible change to a surface they are used to.
- **Overlay Reader:** RWW inherits the reader-scope anchor and exposes no control for it. If overlay users later need an independent value, it must arrive via the store-native override widening the ADR-0008 comment reserves — not a seventh flat `rww_*` key.
- **Vocabulary:** **Line box** enters the CONTEXT.md glossary alongside Stack and Grid Layout.
- **Execution:** completed as the drip-fed `LB-1..LB-5` cascade.
