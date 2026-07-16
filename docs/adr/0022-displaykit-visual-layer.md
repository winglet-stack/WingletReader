# ADR-0022: DisplayKit visual layer — sprite card faces, theme-aware icons, instrument art

**Date:** 2026-07-08
**Status:** Accepted
**Builds on:** ADR-0012 (role colour, flat surfaces, `--radius: 0`), ADR-0013 (compact hub grid), ADR-0014 §3 (instrument taxonomy), ADR-0020 (corner sprites)
**Canonical reference:** [`docs/design-system.md`](../design-system.md)

## Context

Design Runs 1–2 (ADR-0012/0013) established flat monochrome surfaces, role-based colour, and the compact 3×2 hub. Settings restructure (ADR-0019) and Overlay Reader settings (ADR-0021) landed the instrument kit and card-grid landing, but the **visual asset layer** still mixed Unicode placeholder glyphs, single-theme playback PNGs, and ad-hoc CSS background URLs.

The maintainer supplied DisplayKit reference art (`Refernces/DesignKitReferences/`, `Refernces/New Sprites/`) and two hand-off specs (`Refernces/Design Overhaul/01-hub-tiles.md`, `02-chrome-icons.md`). A working-tree pass (2026-07-08) consolidates these into one documented visual system without changing Tier-A contracts.

## Considered Options

- **Keep Unicode/emoji glyphs on Settings landing cards.** Rejected: breaks parity with the DisplayKit hub tiles and the chrome-icon spec; reads as placeholder.
- **Introduce an icon library (Lucide, etc.).** Rejected: stack veto — one vanilla `index.css`, no new deps; bespoke pixel/console identity.
- **Single-theme reader buttons with CSS filter for light mode.** Rejected: muddy colour on the pixel-art sprites; maintainer exported explicit dark/light pairs.
- **Route all sprites through Vite imports only.** Rejected for instrument/card-face PNGs: large static art stays in `public/` for stable URLs and electron-builder parity; hub/reader sprites use Vite imports for cache-busting.

## Decision

### 1. Three asset classes

1. **DisplayKit tile sprites** — opaque PNG (optional GIF hover) with fixed palette; hub tile glyphs only.
2. **Theme-aware bitmaps** — dark/light PNG pairs selected by `body[data-theme]`; Reader playback + utility buttons.
3. **Chrome icons** — single-ink SVG with `fill="currentColor"`; Settings landing, nav, and future reader chrome replacements.

Instrument sprites (toggle thumb, slider knob) and card-face backgrounds remain **fixed PNG** in `public/`, referenced via CSS custom properties.

### 2. Card-face backgrounds

Hub tiles (`.hub-tile`) and Settings gateway cards (`.gsc-card`) share the same structural pattern:

- `background-color: var(--hub-tile)` as fallback fill.
- `background-image: var(--hub-tile-face)` or `var(--settings-tile-face)` — theme-aware `url(...)` tokens in `:root` / `body[data-theme="light"]`.

### 3. Settings landing uses chrome icons

Replace Unicode glyph placeholders on the five-card Settings landing with `ChromeIcon` SVGs from `assets/icons/settings/`. Appearance keeps inline theme pills on a static card.

### 4. Settings hint trigger

Static setting explanations use `SettingHintTrigger` (`?` control, 150ms show delay, focus/hover tooltip) via `SettingsLabel`. Live readouts stay always visible in the feedback slot.

### 5. Documentation home

`docs/design-system.md` is the canonical token, role, and asset reference. `CONTEXT.md` glossary entries point here; ADR history remains in `docs/adr/0012`–`0014` and this ADR.

## Consequences

- **`CONTEXT.md`** gains DisplayKit / card-face / chrome-icon glossary entries (done with this ADR).
- **`HANDOFF.md`** notes the design-system consolidation pass.
- **`constants/designAssets.ts`** centralises public asset URL strings for TypeScript consumers.
- **`ChromeIcon`** component owns inline settings SVG paths until maintainer art replaces them.
- **Hub tile roster label:** user-facing **Overlay Reader** (ADR-0017); hub asset filenames may retain `overlay-reader` / legacy `rww` code terms.
- **Tier A untouched.** Presentation-only; verification gate `npm run build` + `npm test`.
- **Future chrome-icon slices** (reader transport SVGs, gear SVG) can land incrementally; empty spec slots keep existing PNGs (safe fallback per maintainer spec).
