# ADR-0020: Corner "up one level" navigation for nested Settings sub-pages

**Date:** 2026-07-03
**Status:** Accepted
**Amends:** ADR-0011 slice 04 (Home control / dove) and issue 05 (Gear control) — the top-left corner is generalised from "always the dove → hub" to "always up one level," of which the dove is the top-level instance. ADR-0011's hub, tile, and gear decisions are otherwise untouched.
**Relates to:** ADR-0019 (the Reader-defaults editor is the sub-page whose QA surfaced this), ADR-0006 (NavigationContext), ADR-0008/0009 (flat Settings surface).

## Context

A HITL QA pass on the Reader-settings restructure (`.scratch/SettingsRestructure/WingletReaderSettingsOverhaulQA.md`) found that the **Reader defaults** editor — a sub-page reached from the Settings landing — is "covered by the return to Home button": the fixed top-left **dove** (`position: fixed`, `top/left: 10px`) overlaps the editor's `<h1>Reader defaults</h1>` at normal and narrow widths.

The overlap is a symptom of a deeper redundancy. On every Settings sub-page (Reader defaults, and structurally Import and Data too) there are **two competing back affordances**:

- the fixed dove, which goes **all the way to the hub** (ADR-0011: "dove = all the way home"), and
- an in-flow text button — "Back to Settings" on Reader defaults, "← Settings" (`.rdc-back`) on Import/Data — which goes **up one level** to the Settings landing.

Two backs, one of which overlaps the title. The QA's proposed fix was to *rewire the dove itself* to go to Settings on this page. That was rejected in the grill session because it makes the dove **context-dependent** — the same glyph in the same corner would silently mean "hub" everywhere except here, breaking the ADR-0011 invariant that exists precisely to keep the dove's meaning constant.

The Reader-defaults sub-page is not a top-level `AppView`; it is local state (`readerDefaultsOpen`) *inside* the Settings view, and Import/Data are `openSection` state inside `GlobalSettingsBody`. So the shell (`AppShell`), which renders the corner control, currently has no way to know it is on a sub-page.

## Considered Options

- **Rewire the dove to go to Settings on this sub-page.** Rejected: makes the dove context-dependent (hub everywhere, Settings here) — the exact inconsistency the invariant guards against. A disguised dove is still a dove to the user.
- **Keep the dove (→ hub) and just fix the overlap + keep an in-flow local back.** Rejected: leaves two back affordances competing on every sub-page; the redundancy, not just the pixel overlap, is the complaint.
- **Promote Reader defaults to a top-level `AppView` token, sibling to the hub.** Rejected: it is a *child* of Settings, not a peer of the hub; `settingsMode` already sets the precedent of qualifying the Settings view rather than forking a new top-level route.
- **Swap in a visually distinct corner control (chosen).** On a nested sub-page the corner shows a **different sprite** (maintainer-supplied) wired to the parent page. The dove's meaning stays globally constant because the thing in the corner simply *is not the dove* on deeper pages.
- **Scope the swap to Reader defaults only.** Rejected: the ratified model is "the corner is always up one level." If Import/Data kept the dove-plus-in-flow-back idiom, that statement would be false the moment either opens. Unify all three.

## Decision

### 1. The corner is "up one level," not "the dove"
The fixed top-left corner slot holds a single **up-one-level** navigation control. Its identity depends on depth:

- **Top inner level** (Library, Make Video, Transmute, RWW Console, **Settings landing**): "up" is the **hub**, drawn as the two-tone **dove** — unchanged from ADR-0011.
- **Nested Settings sub-page** (Reader defaults, Import, Data): "up" is the **Settings landing**, drawn with a **distinct maintainer-supplied sprite — not the dove** — wired to return to Settings.

"Dove → hub" therefore remains globally constant: there is no page where the dove glyph means anything other than the hub. The replacement sprite must be **visually distinguishable** from the dove (an up/gear-ward motif, not a second bird); a look-alike would reintroduce the context-dependent-dove problem this ADR exists to avoid.

### 2. One back per sub-page — the corner is it
The in-flow "Back to Settings" (Reader defaults) and "← Settings" (`.rdc-editor-head` / `.rdc-back`, Import/Data) buttons are **removed**. The corner up-level control is the *only* back on these sub-pages. This resolves both the overlap and the two-backs redundancy in one move.

### 3. Depth becomes navigation state
`NavigationContext` gains a nullable **`settingsSubview`** (`'reader-defaults' | 'import' | 'data' | null`). `SettingsPanel` and `GlobalSettingsBody` set it on drill-in and clear it on back, replacing their local `useState`. `AppShell` reads it declaratively: when `view === 'settings'` and `settingsSubview` is set, it renders the up-level control (suppressing the dove); otherwise it renders the dove. This keeps a single corner control rendered at all times — never two in one slot.

### 4. Loss accepted: no one-tap home from a sub-page
Reaching the hub from a sub-page is now two hops (corner → Settings, then dove → hub). This is the deliberate trade for a consistent up-one-level corner and the removal of the redundant back. The sub-pages are only one level deep, so the cost is bounded.

### 5. Reader-defaults header
With the back button gone, the "Reader defaults" title is **centered** and sits below the fixed corner's zone (top padding bumped so it never slides under the sprite). Import and Data keep their lightweight in-body section headings; no centered page-title banner is added there.

## Consequences

- **`CONTEXT.md` glossary updated on decision** (done in the grill session): the **Home control (dove)** entry now describes the corner as an "up one level" slot with the dove as its top-level instance and the distinct sprite on nested Settings sub-pages.
- **New navigation state.** `settingsSubview` is the first sub-view qualifier on a `view`; it is a Settings-internal concern the shell reads only to choose the corner control. It is *not* a new `AppView` and does not affect `settingsMode` (entry path) or deep-link tokens.
- **Asset dependency.** The new sprite is maintainer-supplied; the implementing slice ships behind an asset seam with a placeholder so it is not blocked on final art.
- **Tests retarget.** `homeControl.test.tsx` and the RWW navigation tests update to the depth-aware corner; new coverage asserts the dove is suppressed and the up-level control returns to the Settings landing (not the hub) when `settingsSubview` is set.
- **Scope boundary.** This is shell/navigation chrome only. It does not touch the Reader (exempt from shell chrome), the two-tab editor's internals (ADR-0019), or the ADR-0008 storage contract. The presentation refinements found in the same QA (compact preset chips, the Colors "Custom colours" disclosure, the Display subtab nesting indent) are *not* covered here — they are ADR-0019-internal and need no decision.
- **Verification gate:** `npm run build` + `npm test`; do not increase the `tsc` baseline (25). Reader/Import/Data back-navigation exercised in the shell chrome tests.
