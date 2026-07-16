# ADR-0021: Overlay Reader settings subview

**Date:** 2026-07-03
**Amended:** 2026-07-04 (Overlay Reader settings Run 3 closeout; Overlay tab shortcut rehoming); 2026-07-05 (Reader configuration layout: combined Layout card, single-column/second-column square preview, Start host 16px inset)
**Status:** Accepted
**Supersedes:** ADR-0017 section 2, the standalone flat Overlay Reader console.
**Relates to:** ADR-0006 (NavigationContext), ADR-0008 (RWW storage contract), ADR-0019 (two-tab settings editor), ADR-0020 (corner up-level navigation).

## Context

ADR-0017 moved Overlay Reader management into a standalone `rww-console` route with a flat, dense two-column console. That solved the immediate launch/readiness problem, but it now conflicts with the shipped Reader defaults model from ADR-0019: Settings subviews use the same up-level chrome and pinned two-tab editor structure.

Overlay Reader settings are still RWW-domain settings and must keep the ADR-0008 flat storage contract. The issue is presentation and navigation, not persistence.

## Decision

Overlay Reader settings become a nested Settings subview named `overlay-reader`.

- `NavigationContext` owns `settingsSubview: 'overlay-reader'` and exposes `openOverlayReaderSettings()`, which sets `view='settings'`, `settingsMode='global'`, and `settingsSubview='overlay-reader'`.
- The hub Overlay Reader tile opens that helper. The Settings landing Overlay Reader card opens the same subview in place.
- The top-left corner uses the ADR-0020 Settings up-level control on this subview; the Settings gear remains hidden while already in Settings.
- The top-right host chrome is a fixed square Overlay Reader control, approximately 108px (about 150% of the Settings up-level hit target). It replaces the earlier compact VIP Start pill.
  - The center target is the primary engage/disarm action: **Start Overlay Reader** when ready, disabled when readiness is blocked, and **Exit Overlay Reader** when armed.
  - Visible text inside the square is limited to the action state: **Start**, **Exit**, **Starting...**, or **Exiting...**. Full action names remain accessibility labels only.
  - The square carries readiness/state only, not shortcut recording. Shortcut rebinding belongs in the Overlay tab body so the tab can show the full management layout at a glance.
  - A compact state indicator sits directly below the square and is always visible. It uses terse state labels only: **Ready**, **Blocked**, **Armed**, **Starting**, or **Exiting**. In the blocked state, the square still shows the disabled action text **Start** while the indicator shows **Blocked** and the dot is red.
  - The square plus its state indicator remain fixed host chrome outside the editor body, but their top offset is controlled by the Overlay settings layout so they align vertically with the central Overlay settings stack rather than the generic page corner.
  - The host cluster appears on both tabs and keeps the same position while switching tabs.
  - Full readiness errors render as status text below the pinned tab bar, not as additional host-control copy.
- The body uses the pinned two-tab editor structure: **Overlay** first and selected by default, then **Reader configuration**. The second label is intentionally not "Playback & Grid Layout" on this subview.
- The pinned tab bar remains high and left in the Settings subview chrome. On the Overlay tab only, the three-block management stack is centered lower in the body area; the top-right host cluster aligns vertically to that stack, not to the tab bar. The Reader configuration tab uses a single control column that gains a dedicated square-preview second column when the preview is opened (see the 2026-07-05 amendment).
- The Overlay tab owns the three-block management stack: Standby pill, Shortcut settings, and Window size. The stack keeps a fixed-width console frame and may grow only vertically; implementation must guard the minimum-window no-scroll threshold, including collapsing other fold-down detail when a new one opens. These are inline setting groups, not navigation cards: the user changes the controls directly inside each block with no drill-in page, modal, drawer, or focused editor. Standby pill is always fully visible as a direct toggle. Shortcut settings is always fully visible with two labeled recorder rows, **Summon shortcut** and **Exit shortcut**, each showing the current chord as a keycap-style value plus a record/capturing state. During capture, the row prompts for a shortcut and Escape cancels. Window size is the only fold-down block: it defaults collapsed, shows the current size summary, and expands to reveal width and height controls. Expansion is UI-local and need not persist. The Restore clipboard control is removed from the UI; the stored key remains for back-compat and capture continues to restore the previous clipboard when appropriate.
- The three Overlay blocks get a dedicated Overlay-specific visual treatment rather than reusing the generic `settings-section` card styling. They still use the existing project tokens and square-corner system (`--radius: 0`), with no new design system or dependency.
- The Reader configuration tab owns speed, grid, and font-size controls, grouped as **Playback** above a single **Layout** card with **Grid Layout** and **Text** sub-headings (see the 2026-07-05 amendment). **Copy from Reader defaults** and Preview appear only on this tab; the live preview occupies a dedicated second column when opened rather than folding below the controls, and preserves the Reader-defaults no-scroll contract by shrinking to fit.
- The old standalone `rww-console` route and `RwwConsoleView` component are retired.
- The subview has `aria-label="Overlay Reader settings"` and no page `<h1>`, matching the Reader defaults subview chrome.

## Consequences

- There is one product-owned Overlay Reader settings destination, reached from both hub and Settings.
- The hub entry no longer behaves like a separate console destination; it drills into Settings and returns to the Settings landing via up-level.
- ADR-0017's standby pill decision remains accepted. Only its flat-console presentation decision is superseded.
- RWW storage remains unchanged: no new `rww_*` projection keys and no migration.
- `RwwSettingsEditor` is a parallel RWW-scoped editor, not a reuse of the Standard Reader defaults editor; the two share the pinned-tab host pattern and no-scroll expectations.

## Amendment — 2026-07-05 (Reader configuration layout closeout)

The Reader configuration tab's layout is refined from the original "two-column editor and folded preview" wording to the shipped model (Overlay Reader overhaul slices 02–06). Presentation only — no change to the ADR-0008 storage contract or the ADR-0006 navigation model.

- **Combined Layout card.** The left column stacks **Playback** above a single **Layout** card carrying two inline sub-headings: **Grid Layout** (`words_per_stack`, `stacks_visible`, `lines_enabled`, `lines_count`) and **Text** (`font_size`). Font size groups under **Text** on this subview only; Reader defaults still places it under Display → Text & Highlighting.
- **Preview column, not a fold.** The live preview no longer folds below Grid Layout. Preview closed → a single control column (Playback + Layout card) with no reserved empty track. Preview open → a dedicated second column hosting the preview.
- **Square shrink-to-fit preview.** The open preview stage is square (aspect ratio 1:1) and shrinks to the largest square that fits its column, so at the 800×600 minimum it gets smaller rather than forcing page scroll. Toggling the preview must not move the pinned tab bar, the **Copy from Reader defaults** / **Preview** pills, or the Start host cluster.
- **Start host 16px right inset (slice 02).** The fixed Start/Exit host aligns its right edge to the overlay-reader subview body's 16px horizontal padding rather than the 10px up-level dove inset. Its fixed top offset and vertical position stay constant across tab switches.

This supersedes the "keeps the current two-column editor and folded preview model" and "preview folded below Grid Layout" wording that previously appeared in the Decision above. `CONTEXT.md` → **Overlay Reader settings** already describes this model, so the two are consistent.

## Amendment — 2026-07-05 (shared left anchor; no-jump chrome)

Presentation-only follow-up closing three coupled layout defects: switching Overlay ⇄ Reader configuration shifted the body horizontally, the Copy/Preview pills folded outward toward — and risked misfiring — the top-right Start square, and toggling the preview slid the whole tab row leftward. No change to the ADR-0008 storage contract or the ADR-0006 navigation model.

- **One shared left anchor.** Both tabs' bodies anchor to the same left edge as the pinned tab bar. The Overlay three-block stack is now **left-anchored** (`margin: 0`, keeping its ~460px max-width), not centered — so its left edge matches the Reader configuration control column and the body no longer jumps on tab switch. This refines the earlier "the three-block management stack is centered lower in the body area" wording in the Decision to *left-anchored* (vertical position unchanged).
- **Un-centered subview.** The `overlay-reader` subview overrides the base `.view-container` centering (`max-width: 760px; margin: 0 auto`) to `max-width: none; margin-inline: 0` — a full-width, left-anchored container. This is what makes the anchor stable: a centered block re-centers (slides sideways) whenever available width changes, e.g. when a scrollbar appears as the preview opens, which was dragging the whole tab row — pills included — leftward. Anchored full-width keeps the left edge fixed; a scrollbar only eats from the right. Reader defaults keeps the base centered width (it has no Start host or gutter reservation).
- **Left-clustered action pills.** **Copy from Reader defaults** and **Preview** move from the right edge (previously `margin-left: auto`, parking the Preview pill under the Start square) to a left cluster immediately after the tab pills, behind a thin divider that distinguishes actions from nav tabs. They grow rightward into empty space, well clear of the Start square, removing the missed-click misfire risk. The reserved "Hide preview" sizer width still keeps the toggle from resizing across the on/off relabel, so — combined with the fixed left anchor — the Preview toggle stays put under the cursor and a second click undoes it without cursor travel.
