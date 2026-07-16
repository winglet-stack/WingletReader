# ADR-0019: Reader settings — two-tab restructure, one editor across two hosts

**Date:** 2026-07-02
**Status:** Accepted
**Supersedes (in part):** ADR-0014 §4 (calm grid + power view, the `calm`/`power` tier split) and §6's "See more settings" target; ADR-0013's Reader-defaults **calm grid** as the defaults entry surface.
**Amends:** ADR-0014 §3 instrument taxonomy is retained unchanged; only the *grouping/navigation* on top of it changes.

## Context

ADR-0014 unified the settings *design language* but kept **two different taxonomies** for the same `Settings`:

- Settings → Reader defaults renders a **5-card calm grid** (Playback · Text · Layout · Highlight · Colours) → focused editor → an "Edit everything" **power view**.
- The in-Reader **"See more settings" drawer** (`ReaderConfigEditorCore`) renders an unrelated **Display · Text · Playback · Alignment** 4-tab taxonomy.

Editing the same fields under two different structures is a large part of why the maintainer still finds the settings "very confusing and difficult to navigate." Separately, the console rule — *all information visible without scrolling* — is violated by the always-on preview and the multi-screen drill-in (grid → focused editor → power view).

A `grill-with-docs` + `design-taste-frontend` session (2026-07-02) resolved `.scratch/SettingsRestructure/WingletReaderNewSettings.md` into the decisions below. The full field map and code change map live in `.scratch/SettingsRestructure/IMPLEMENTATION-PLAN.md`.

## Considered Options

- **Restyle the calm grid without changing structure.** Rejected: the confusion is structural (two taxonomies, a drill-in that hides fields off-screen), not cosmetic.
- **Restructure only the Settings defaults editor, leave the in-Reader drawer alone.** Rejected: keeps the two-taxonomy split — the root cause.
- **Fold *every* reader-config surface (incl. Quick Settings, Transmute) into the new structure.** Rejected: Quick Settings is a deliberate curated live shortlist, and Transmute/RWW-entry serve a different context. Chosen scope is the two surfaces that presented full, competing taxonomies.
- **Keep the "Edit everything" power view as an escape hatch.** Rejected: after this restructure only one niche knob (`highlight_panning_chunk_size`) would remain power-only — an almost-empty screen not worth the concept.
- **Full rip-out of the culled settings (delete keys + migrate).** Rejected: higher risk right before the alpha gate; the bloat is a *presentation* problem. Chosen: de-UI + neutralize, keys kept dormant, no migration (consistent with ADR-0014's "nothing deleted" instinct, but for *culls* it is "nothing deleted from the store").

## Decision

### 1. One editor, two hosts
A single new `ReaderSettingsEditor` renders in **both** the Settings "Reader defaults" host and the in-Reader "See more settings" drawer (the "one list, two hosts" pattern from the in-frame Library browse, ADR-0013). Host differences are props: the Settings host shows the preview toggle; the drawer host does not. The earlier top Profiles preset row was removed on 2026-07-03 because the functionality did not justify the vertical cost in the "see everything" Reader defaults screen. **Quick Settings, the RWW Console, and the Transmute/RWW-entry `ReaderConfigPanel` keep their own models** and are out of scope.

### 2. Two top tabs, no landing (supersedes ADR-0014 §4)
The editor opens directly on a **two-tab** layout — no calm-grid card landing, no power view. `ReaderDefaultsCalm`, `ReaderCalmGroupBody`, and `ReaderDefaultsPower` are removed.

- **Tab 1 — Playback & Grid Layout**, one screen in two columns: *Playback* (Advance mode, Speed [+ derived WPM readout], Metronome, Pause at sentences, Pause at headlines) and *Grid Layout* (Words per stack, Stacks visible, Multiple lines, Lines per screen).
- **Tab 2 — Display**, one screen in two columns: the left column stacks *Text & Highlighting* (font size, font family, highlight on/off, highlight mode, panning chunk size) above *Spacing* (row gap, stack gap, vertical/horizontal offset); the right column holds *Colors* (Palette + collapsed Custom colors disclosure for the four color rows).

`words_per_stack` moves from Playback to Grid Layout; `metronome_enabled` is promoted from power to a Playback toggle; `highlight_panning_chunk_size` relocates into *Text & Highlighting* as a reveal-row under Panning. The `calm`/`power` **tier concept is dissolved** — every retained setting has one home in the two tabs.

### 3. Preview folds in (supersedes the always-on preview)
The live preview is **collapsed by default**. A toggle button reveals it **in-place inside the
two-column console grid** — the page never grows vertically and never reintroduces a third preview
column:

- **Tab 1 (Settings host):** Playback | Grid Layout stay side-by-side; when open, preview renders
  **below Grid Layout** in the right column and flex-fills the remaining viewport height.
- **Tab 2 / Display (Settings host):** Text & Highlighting + Spacing stay stacked in the left
  column and Colors stays in the right column; when open, preview renders **below Colors** in that
  right column and flex-fills the remaining viewport height. There are no Display subtabs, no
  `.rse-display-nest`, and no 50/50 controls | preview split.
- **Fold is instant** (no height animation). Open/closed persists as a **UI preference**
  (localStorage), not a reader `Setting`.
- **Retired on the Settings host:** the old `.rcp-layout` squeeze (controls left | 300px sticky
  preview right) and the mistaken vertical stack (Playback above Grid Layout).

The **in-Reader drawer has no preview** — the live reader behind it *is* the preview.

### 4. Culls: de-UI + neutralize, keys dormant (no migration)
`lock_at_wpm`/`target_wpm`, `view_style`, and `show_chunk_dividers` are removed from every UI surface, including **Quick Settings** (the Lock row + Target-WPM swap leave; Speed is always BPM). The Reader **stops honoring** `view_style` (always `default`) and `show_chunk_dividers` (dividers always off) so no stored value can strand a user in a mode with no off switch; `lock_at_wpm` is already ignored by playback. **Stored keys are preserved**; `wpmSolver`, the focal-points render path, and the divider render path are left **dormant**, not deleted. No data migration.

### 5. Terminology
`Grid Layout` (was Layout), `Display` (new umbrella), `Spacing` (was Alignment), and `Text & Highlighting` become canonical. User-facing spelling standardises on **US "Colors"** (a small label pass renames other "Colour" strings); frozen code identifiers such as `text_color` are unchanged.

### 6. Sequencing
This lands **before** the Phase 4 alpha invite — the maintainer treats confusing settings as a presentation blocker on par with the earlier UI passes (ADR-0011/0012/0013). This ADR is ratified before code.

## Consequences

- **`CONTEXT.md` glossary updates on landing** (it documents shipped reality): retire **Calm grid**, **Focused editor**, **Power view ("Edit everything")**, and the `calm`/`power` **tier**; revise **Settings (flat app preferences)** to describe the two-tab Reader-defaults editor; add **Grid Layout / Display / Spacing / Text & Highlighting**; move **Alignment** and **Layout** to the deprecated-terms appendix; note `lock_at_wpm`/`view_style`/`show_chunk_dividers` as de-UI'd-but-dormant.
- **ADR-0014 status** gains a note that its §4 calm-grid/power-view/tier decision is superseded here; its §3 instrument taxonomy and §5 RWW model stand. **ADR-0013**'s calm-grid-as-defaults-entry is superseded; its Reader persistent-frame model is untouched.
- **Removable code once landed:** `readerConfig/ReaderDefaultsCalm.tsx`, `readerConfig/ReaderCalmGroupBody.tsx`, `readerConfig/ReaderDefaultsPower.tsx`, and calm-card summary helpers. `ReaderConfigEditorCore.tsx` + `ReaderConfigPanel.tsx` **survive** for the Transmute/RWW-entry path only.
- **Noted risk (out of scope):** the Transmute/RWW-entry editor still exposes `view_style`/dividers; if `view_style` is genuinely broken it ships a broken control there. Flagged for a follow-up decision, not blocked here.
- **Data untouched.** No `Settings` keys deleted, no migration; the JSON store, frozen identifiers, ADR-0008 storage contract, and reading/playback math are untouched. This is a Tier-B presentation/structure change.
- **Skill discipline carries over** (ADR-0012/0014): `design-taste-frontend` low dials (centered/symmetric, console look), the stack veto (Electron + one vanilla `index.css`; no new deps), `--radius: 0`, role-colour system.
- **Verification gate:** `npm run build` + `npm test`; do not increase the `tsc` baseline. Characterization tests (`quickSettings`, `readerConfigPanel`, `settingMetadata`, `readerContext`) retarget to the new structure.
- **Console fit:** verify Tab 1 fits without scroll at the min supported window size/zoom (interacts with the UI-zoom clamp, slice-06).
