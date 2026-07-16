# ADR-0014: Settings overhaul — one design language, calm grid + power view, dedicated RWW settings

**Date:** 2026-06-19
**Status:** Accepted (§4 calm grid + power view superseded — see note)
**Supersedes (in part):** ADR-0008's UI concepts **Triplet** and **Simplified/Advanced density**; ADR-0009's flat-Settings presentation.
**Superseded (in part):** ADR-0019 supersedes §4 (the Reader-defaults **calm grid** + **power view** and the `calm`/`power` **tier** split) and §6's in-Reader "See more settings" target; the Reader defaults + drawer now share one two-tab editor. §3 instrument taxonomy and §5 RWW model **stand unchanged**.
**Amends:** ADR-0008's RWW **override (inheritance) semantics** (storage shape and resolver are untouched — see §5).

## Context

The maintainer reviewed every settings surface and recorded the assessment in `.scratch/done/settings-rework/Settings-Assessment-Transript.md`. With the hub (ADR-0011/0012/0013) redesigned, the settings were left as the most incoherent surfaces in the app — "extremely confusing to navigate through, even as a maintainer." A `/grill-with-docs` + `design-taste-frontend` + `redesign-existing-projects` session (2026-06-19) resolved the assessment into the decisions below.

The four surfaces and their named problems:

| Surface | Problem |
|---|---|
| **Quick Settings** (in-Reader popover) | Cramped "mumble-jumble"; instruments mismatched to their setting (3-way chips for things needing fine-tune, a slider that runs to 20 for a value no one takes past ~5); no order; no per-setting context; Lock-at-WPM stranded mid-list. |
| **General settings** | Save button hidden at the bottom (edits silently lost); sparse long scroll with unjustified whitespace. |
| **Reader defaults (advanced)** | Cramped, little explanation; Profiles/Palettes buried though they should be chosen *first*; an unordered jumble. |
| **Read While Working Console** | Same scroll/cramped problems; the **Simplified** mode "steals the freedom of the user… you're not faster because you don't know how fast you're going." |

The incentive: **beginner-friendly *and* maximally manipulable — cater to all audiences.** The grill established that these are reconciled by *explanation + good defaults + presets + instruments matched to each setting's range*, **not** by a dumbed-down mode that hides the real numbers.

## Considered Options

- **Keep the Simplified/Advanced density + named triplets, just restyle.** Rejected: the triplets are the core "instrument mismatch" the maintainer named, and Simplified hiding the real speed defeats RWW's purpose.
- **Aggressively delete niche settings for a minimal surface.** Rejected: contradicts "maximum manipulation for all audiences" and forces a data migration. The bloat is a *presentation* problem, not a *count* problem.
- **Collapse all four surfaces into one Settings destination.** Rejected: each serves a different *live context* (Quick = in-Reader live, Reader-defaults = pre-set, RWW = overlay, General = app). Chosen: one **design language**, four entry points.
- **RWW keeps the ADR-0008 delta/inherit model.** Rejected: reading *while working* is a genuinely different context from leisure reading; inheriting leisure defaults minus a few deltas is the wrong mental model and produced the awkward inherit/override UI.

## Decision

### 1. One design language, four entry points
Quick Settings, Reader-defaults, RWW Console, and General all share the same cards, instruments, previews, inline explanation rule, and auto-save. They remain distinct surfaces because each is edited where it is used.

### 2. Kill Simplified density + named triplets (supersedes ADR-0008 UI concepts)
The Simplified/Advanced density switch and the named-triplet chips (Speed/Words/Text-size as Slow·Med·Fast) are removed everywhere (`engine/simplifiedTriplets.ts`, `SettingsDensityToggle`, `SimplifiedReaderControls`, and the triplet code in `QuickSettingsPopover`/`RwwConsoleView` become removable). Every setting always shows its real value with one instrument. The **ADR-0008 storage contract is untouched** — this removes UI concepts, not the store, resolver, or RWW persistence.

### 3. Instrument taxonomy
Each setting is bound to the instrument that fits its data:

| Instrument | For |
|---|---|
| Toggle | booleans (multiple-lines, highlight on/off, tap-to-read, metronome, pause-at-*) |
| Stepper `[− n +]` | small bounded ints (words-per-stack 1–5, stacks-visible 1–5, lines 2–6) |
| Slider + numeric entry | wide/continuous (speed/wpm, font size, gaps, offsets) |
| Segmented | tiny enums (highlight mode, theme) |
| Colour / palette | colours |
| Preset chooser | Profiles, Palettes |

This retires the 3-way chips, the up-to-20 stacks slider, and the up-to-10 lines slider.

### 4. Calm grid + power view; nothing deleted
Reader-defaults is: a **preset row** pinned on top (Profiles + "+Save"); a **5-card calm grid** (Playback · Text · Layout · Highlight · Colours, laid out 3+2 like the hub). Clicking a card opens a **focused editor** that keeps a **persistent group switcher** (so editing several groups never bounces back to the grid) plus a large live preview. An **"Edit everything"** action flattens to one page and reveals the **Alignment** group and all *demoted* niche knobs (stack-gap, row-gap, vertical/horizontal offset, show-chunk-dividers, highlight-panning-chunk-size, view_style). **No setting is deleted** — niche knobs are demoted out of the calm view, never removed. Per-setting explanation appears only where a setting earns one (the abstract ones); each card carries an always-visible one-line description.

### 5. RWW owns dedicated, independent reader settings (amends ADR-0008 override semantics)
Read While Working gets a **complete, independent reader config** edited with the same calm-grid/instruments, plus a dedicated **Overlay & Shortcuts** card (window size, global shortcut, exit shortcut, restore-clipboard) and the Readiness/Launch console actions on top. It is independent by default — editing leisure Reader-defaults does **not** bleed into RWW — with a **"Copy from Reader defaults"** action to (re)seed on demand.

This **does not break the frozen ADR-0008 storage contract.** The store already types `rww` as `Partial<ReaderSettings> & RwwOnlyFields` and the resolver does `rww[field] ?? reader[field]`. "Dedicated" means `rww` carries a *complete* field set, so the `?? reader` fallback never fires for RWW. What changes is the **authoring model** and a one-time **seed** of existing users' currently-effective RWW values into a full `rww` set on migration. The six legacy `rww_*` flat projection keys and the resolver stay for back-compat.

### 6. Quick Settings = flat ordered live list
A single tidy column of the most-used live controls in reading-frequency order, using the new instruments. Lock-at-WPM is docked **under** Speed. Text size is a slider+# (no chips). "See more settings →" opens the full editor. When reading in the normal Reader it edits the active leisure config; in the RWW overlay it edits RWW's config.

### 7. General/Settings landing + auto-save
The Settings landing becomes a card grid in the same language (Appearance · Reader defaults · Read While Working · Import · Data). **Everything auto-saves** (the hidden Save button is removed); the grid fills its space instead of a sparse long scroll.

### 8. Built-in starter Profiles
Ship a small curated set of Profiles as the beginner on-ramp: Reader (Calm / Fast / Focus / Skim) and RWW (Glance / Subtle). They validate through the same path as user Profiles. Palettes remain built-in.

## Consequences

- **`CONTEXT.md` glossary updates on landing** (it documents shipped reality): mark **Triplet** and **Simplified/Advanced (density switch)** superseded/removed; revise **Settings (flat app preferences)** to the card-grid model; add terms for the **calm grid / power view ("Edit everything")**, the **instrument taxonomy**, the **preset row**, and the **focused editor**; revise **Read While Working Console** to describe dedicated independent settings + the copy bridge.
- **ADR-0008 status** gains a note that its Triplet/Simplified UI concepts are superseded here and its RWW override semantics are amended (storage contract intact).
- **Removable code** once landed: `engine/simplifiedTriplets.ts`, `settings/SettingsDensityToggle.tsx`, `settings/SimplifiedReaderControls.tsx`, and the triplet branches in `QuickSettingsPopover`/`RwwConsoleView`. Their characterization tests retarget to the new instruments.
- **Migration:** seed each existing user's effective RWW values into a complete `rww` field set on first load after the change; idempotent and lossless through `parseSettings`/`settingsStoreFromFlat`.
- **Tier A respected.** JSON store, frozen identifiers, the ADR-0008 *storage* contract, and the reading-engine/playback math are untouched. This is a Tier-B presentation/structure change plus the §5 authoring-model amendment.
- **Skill discipline carries over** (ADR-0012): `design-taste-frontend` with dials **low** for the calm grid (centered/symmetric, mirrors the hub), `redesign-existing-projects` for the inherited surfaces and the **stack veto** (Electron + one vanilla `index.css`; no Tailwind/Motion/icon libs/new deps); `--radius: 0` and the role-colour system retained.
- **Verification gate:** `npm run build` + `npm test`; do not increase the `tsc` baseline (**105**).
- Implementation/overhaul plan: `.scratch/done/settings-rework/implementation-plan.md`.
