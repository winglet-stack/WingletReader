# ADR-0028: Library card + controls-surface tile-face treatment

**Date:** 2026-07-14 (decided) · **Recorded:** 2026-07-18 (the original ADR file was drafted during the grill but never committed; this record reconstructs the decision from the shipped implementation)
**Status:** Accepted — implemented (commit `91c17b0`, "Add new library UI kit")
**Relates to:** ADR-0022 (DisplayKit visual layer — this extends the card-**face** treatment from hub tiles / Settings gateway cards to the Library), ADR-0027 (three-zone `TextCard` — this is a **presentation-only** skin over that structure; zones, the Resume resolver, data, and reading behaviour are unchanged), ADR-0013 (hub tile parity — the visual language being matched), ADR-0023 (Contents view / origin vocabulary — unaffected).

## Context

After ADR-0027 rebuilt `TextCard` into a lead/mid/trailing three-zone card, the Library still rendered as flat bordered rows with CSS-fill hover states and abstract action buttons — visually disconnected from the hub, whose tiles (ADR-0013/0022) carry baked theme-aware art. A maintainer grill (2026-07-13/14, `design/LibaryFacelift/`) decided to bring the Library display cards **and** the search/categories surface up to the hub's tiled-face treatment, using delivered art, with **minimum redundant effort** (no zone/resolver/data change, reuse the hub's face-token pattern).

Delivered art (per-theme, hub parity): 64×64 action-button faces (Resume / View-contents / Delete, each with an idle + hover variant) and a landscape background frame tile for the card strip and controls panel.

## Considered options

**Action-button faces — sprite art vs. CSS.** Chosen: baked per-theme PNG faces with a passive→active swap, retiring the prior `var(--sidebar-active)` fill and danger-red delete hover, for hub parity. Rejected: keep CSS-drawn buttons (stays visually detached from the hub).

**Background application — `border-image` (9-slice) vs. `background-size: cover`.** The grill plan specified `background-size: cover` (the exact hub mechanism). **As built, the card strip and controls surface use `border-image` 9-slice instead** — the delivered frame art is a thin bevel best preserved by slicing corners rather than uniformly scaling a landscape tile under `cover`. This is the one deliberate divergence from the written plan; it renders the frame 1:1 and lets the idle→hover weight change (3px single line → 6px double line) be expressed as a slice/width swap.

**Ink.** Chosen: card title / meta / Category chip keep `var(--text)` / `var(--text-muted)` — the tiles are theme-appropriate (dark tile + light glyph in dark, light tile + dark glyph in light), so no forced-ink override is needed.

## Decision

### 1. Card strip is a borderless flat tile (`border-image`)
`.text-card-main` drops its `border` and inter-button divider hairlines and reads as one continuous ~64px strip painted with the theme-aware background tile via `border-image` (`bg-tile-dark.png` in `:root`, `bg-tile.png` under `body[data-theme="light"]`; `slice 3 fill` / `border-image-width: 3px` idle). On `:hover` / `:focus-visible` it swaps to the `-hover` art at `slice 6 fill` / `6px` — a crisp double-line frame. The layout `border-width` stays constant so hover does not reflow the row.

### 2. Three 64×64 action faces with passive→active sprite swap
**Resume/Read**, **View-contents (⌗)**, and **Delete** become 64×64 square buttons, each rendered as **four stacked `<img>` faces** — idle/hover × light/dark — whose visibility is toggled by `body[data-theme]` + `:hover`/`:focus-visible` CSS (see `TextCard.tsx`). Read↔Resume state stays in `aria-label` + `title` (the existing `readLabel` logic); the icon does not change between Read and Resume.

### 3. Controls surface reuses the tile, passive only
`.library-controls-card` (search input + "Manage categories…" + category filter tabs) swaps its flat `var(--bg2)` fill + border for the same `bg-tile` `border-image`. It is a static container, so it uses the **passive** variant only and does **not** swap on hover. The search input keeps its own fill; the category tabs are unchanged.

### 4. Assets live under `assets/library-tiles/` (bundler imports)
Unlike the hub/Settings faces (which are `public/` URLs registered in `constants/designAssets.ts`), the library-tile art is imported through the bundler: `TextCard.tsx` imports the action PNGs directly, and `index.css` references the `bg-tile*` PNGs via `url('./assets/library-tiles/…')`. There are therefore **no `DESIGN_ASSETS` entries and no `--lib-*-face` CSS custom properties** for these — the theming is expressed inline per selector.

## Consequences

- **Presentation-only.** ADR-0027's zones, `getBookResumeTarget` resolver, `TextRecord` data, and all reading behaviour are untouched; the `.text-card-removing` fade and `prefers-reduced-motion` handling are preserved.
- **Divergence from the grill plan is intentional** (§ Considered options): `border-image` 9-slice, not `background-size: cover`; and four toggled `<img>` faces per button, not a single `background-image` face token. Future work matching this to the hub's `cover` mechanism would be a follow-up, not a bug.
- **Orphan asset removed.** `assets/library-tiles/card-frame.png` was delivered but never wired up (referenced only in CSS comments; the live `border-image-source` is `bg-tile*.png`), and was deleted as part of recording this ADR.
- **CONTEXT.md** gains a **Library card face** glossary entry recording the as-built treatment and the `border-image` divergence.
- **Tests.** `textCard.test.tsx` covers the three-zone markup and Resume routing (from ADR-0027); the reskin is visual and was verified in both themes via the Electron offscreen-screenshot harness (`border-image` weight cannot be reasoned about from the DOM alone).
- **Verification gate:** `npm run build` + `npm test`; do not increase the `tsc -b` baseline.
