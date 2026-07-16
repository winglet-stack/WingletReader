# ADR-0017: Overlay Reader — persistent standby window + flat console

**Date:** 2026-06-24
**Status:** Accepted design — ready to build (no source shipped in this ADR)

> Supersession note: Section 2 (the standalone flat Overlay Reader console / `rww-console` presentation) is superseded by ADR-0021. Section 1 (the standby pill window) remains accepted.

## Context

Read While Working (RWW) — the always-on-top overlay reading mode — is renamed
**user-facing** to **"Overlay Reader"** and gets a pre-launch overhaul. As with
Transmute → "Make Video," the rename is **surface-only**: `RWW`, the
`read_while_working_*` settings keys, the IPC channels, and the glossary code-term all
stay frozen. Renaming identifiers immediately before the alpha is pure risk and buys
nothing.

Two of the changes are recorded here not because they are costly to undo — both are
largely additive and reversible (the pill is flag-gated, self-contained code with no
data migration; the flat console is one component's presentation, with the calm-grid
version still in git and the persistence layer untouched) — but because the resulting
code will look **deliberately unlike its neighbours.** This ADR exists to record a
*deliberate deviation from the obvious path* and the *trade-off* behind it, so a future
reader does not "fix" the inconsistency back. Reversibility is the weakest of the three
ADR bars here, and intentionally so.

This ADR was produced in a `grill-with-docs` design session (2026-06-24). It records the
design only; **no source ships in this ADR.** Implementation is tracked as
`.scratch/active/pre-launch-trajectory/overlay-reader-implementation-plan.md` (slices
OR-1…OR-5).

### Fact 1 — armed RWW has no window today

When RWW is enabled it hides the main window fully to the tray and registers global
shortcuts (`src/main/index.ts` `enableReadWhileWorkingAndHide` /
`updateReadWhileWorkingRegistration`). A reading **session** only materialises a window
when the user presses the capture shortcut with text selected
(`openTemporaryReaderWindow`). So between sessions the *only* WingletReader surface is
the tray icon. There is no on-screen signal that the mode is live, and — by default
(`exit shortcut == capture shortcut == Ctrl+Space`, where the exit handler is
deliberately not registered, `index.ts:409-413`) — **the only way to exit the mode is
the tray menu.** That is the friction the maintainer named ("needs a manual UI button to
exit").

### Fact 2 — Overlay Reader settings reuse the Reader-defaults calm grid

The RWW console (`RwwSettingsBody`) currently mirrors the Reader-defaults editor: a calm
grid of cards (Playback / Text / Layout / Overlay & Shortcuts) that each **drill in** to
a focused editor (ADR-0013 §ReaderDefaults, ADR-0014 instrument taxonomy). On top sit two
more stacked sections (Readiness, Launch). The maintainer's complaint: the surface is too
tall, stacks options one-under-another "without sufficient reason," and the Start action
lacks prominence.

## Decision

**1. A persistent "standby pill" window for the whole armed duration.** While Overlay
Reader is armed, show a small **always-on-top, frameless, draggable pill** (default
bottom-right) that (a) signals the mode is running in the background and (b) **exits/
disarms** on click — reusing the existing `exitReadWhileWorkingMode` path (unregister
shortcuts, restore + focus the main window, navigate home). It is a third renderer root
(`standbyPill` query param, beside `temporaryReader`) driven by a new
`readWhileWorking.exit()` IPC. Visibility is gated by a new RWW-scoped setting
`read_while_working_show_standby_control` (**default on**); off falls back to today's
tray/shortcut exit. Its dragged position persists across sessions
(`read_while_working_standby_x/y`), clamped to the visible work area on create.

**2. The Overlay Reader console flattens away from the calm-grid pattern.** Replace the
drill-in cards + the stacked Readiness/Launch sections with a single **flat, two-column,
dense panel** (Reading · Overlay) showing every control at once, a **slim live preview**
strip, and a **hero VIP-styled Start button** (its own style, not `btn-primary`) with the
readiness dot folded in. This is a deliberate divergence: Overlay Reader settings will not
look like Reader-defaults settings.

## Considered Options

**Exit affordance — pill that disarms (chosen) vs. suspend-toggle vs. overlay-only button.**
A "suspend" toggle (return to the app but stay armed) would add a new armed-and-visible
state the codebase has never had, for a pre-launch nicety; rejected. Putting the exit
button only on the temporary-reader overlay was rejected because the overlay is absent
most of the time the user is "working" — the moment they want a presence cue and an exit
is exactly when no overlay exists. A persistent pill is the only affordance that covers
the armed-but-no-session state, which is RWW's steady state.

**Pill click — exit/disarm (chosen) vs. stay-armed.** The checklist verb is "exit," and an
empty-press fat-finger ejecting a *stay-armed* user would be worse than a clean disarm +
re-Start. Re-arming is one Start click away.

**Console — flat dense panel (chosen) vs. keep the calm-grid drill-in for consistency.**
Consistency with Reader-defaults (ADR-0013/0014) is real and was weighed. But the Overlay
Reader owns only six reader fields plus a handful of overlay options — small enough to show
at-a-glance — and the maintainer's compactness requirement (no tall single-column stacks)
is the stronger pull here. The calm-grid drill-in stays the pattern for the *full* Reader
defaults; Overlay Reader is the explicit exception.

## Consequences

- A new always-on-top window lifecycle in `src/main/index.ts`, created on arm and destroyed
  on exit/quit. Dev vs packaged tray behaviour (CONTEXT.md Architecture note) is unchanged;
  the pill is independent of the tray.
- `read_while_working_show_standby_control` + `read_while_working_standby_x/y` join the
  RWW-scoped key set (`RWW_ONLY_KEYS`, ADR-0008 flatten/split contract) — they must not bleed
  into the Standard Reader config.
- Overlay Reader and Reader-defaults settings diverge on purpose. **Do not** "restore"
  Overlay Reader to the calm-grid drill-in without revisiting this ADR.
- On implementation (OR-5), CONTEXT.md glossary gains the user-facing **"Overlay Reader"**
  name on the *RWW* entry and a **Standby pill** term, and the *Read While Working Console*
  entry drops its calm-grid description. Deferred until OR-5 ships so the glossary tracks
  shipped truth.
- Out of scope: the countdown contrast fix (OR-1) and the rename copy sweep (OR-2) are plain
  changes, not architectural — they need no ADR.
