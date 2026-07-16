# ADR-0013: Design Run 2 — hub Library tile, enlarged badge, persistent Reader frame with in-frame library

**Date:** 2026-06-19
**Status:** Accepted (Reader-defaults calm-grid entry superseded — see note)
**Supersedes (in part):** ADR-0011 §2 (hub tile roster/order) and ADR-0012 §3 (5-tile ragged grid), §4 (hub identity = dove mark, *no* wordmark), §5 (no-engaged-text path is a separate component that redirects; "Browse full library" → standalone Library screen).
**Superseded (in part):** ADR-0019 supersedes this ADR's use of the Reader-defaults **calm grid** as the defaults entry surface (Reader defaults now open the two-tab Reader settings editor). The **persistent Reader-frame** model — this ADR's core — is untouched.

After ADR-0012 (Design Run 1) merged to `master`, the maintainer reviewed the shipped hub + Reader and recorded a second assessment (`.scratch/done/design-run-2/initial-review.md`). A grill session (`/grill-with-docs` + `design-taste-frontend` + `redesign-existing-projects`, 2026-06-19) resolved it into the decisions below. As with the previous runs, scope is constrained to the **hub** and the **Reader's surrounding flow** (not in-reader reading mechanics — pain 2 remains deferred), and this run is **first-impression surface**, so it lands before the Phase 4 alpha invite.

The driver: the shipped hub identity reads as **too small and wrong in light mode** (a `filter: invert(1)` on a self-contained cobalt badge produces muddy colour); the **tiles are oversized** (≈370px squares at full width) and **clip against the window border** when the window is cropped short; and the Reader's **no-text and library-browse flows leave the reading frame entirely** (a bare full-screen idle takeover for an empty library; a jump to the standalone Library screen with no path back to the text being read). The maintainer wants the Reader to behave as a **persistent frame** whose stage swaps content, and Library to be a **first-class hub destination**.

This ADR keeps every load-bearing decision from ADR-0011/0012: the hub as device-identity home, mouse-first/click-through with a keyboard fallback, **Read's primacy by position + default focus**, the persistent **Home dove** + **gear** corner chrome on inner views, the **Reader's full-screen exemption**, **both themes**, the **flat monochrome surfaces** and **role-based colour** (red = VIP reading + critical info, blue = interactive, gray = neutral), `--radius: 0`, and the entire **Tier A** freeze (JSON store, frozen identifiers, ADR-0008 settings contract, reading engine/playback math).

## Considered Options

- **Hub identity: enlarge the badge but keep the `invert(1)` light-mode treatment, or produce a separately-recoloured light badge.** Rejected: the badge is a *self-contained cobalt sticker* that already reads correctly on dark; the invert is the only bug, and a separate light asset is a needless HITL dependency. Chosen: drop the invert, show the identical enlarged badge in both themes.
- **Hub identity: crop a transparent dove out of the badge (programmatic) or commission a clean vector mark.** Rejected for this run: the maintainer chose to keep the cobalt badge **as a deliberate branded showcase object** (wordmark included). A hi-res/vector mark remains a later HITL swap.
- **Tiles: keep them square but shrink, or switch to shorter rectangles, or collapse columns at narrow widths.** Chosen: **keep square, shrink to ~190px**, hold **3 columns always**, never collapse — collapsing breaks the symmetric device identity, and at the 800×600 minimum window the compact grid already fits with padding.
- **Padding-on-crop: rely on the cards fitting at allowed window sizes.** Rejected as the *invariant*: chosen to make padding structural via a scroll-with-preserved-padding container so tiles can never touch or cross the window edge under any crop, display scaling, or future tile count.
- **Library: leave it off the hub (reachable only from the Reader/RWW exit) or fold it into Read.** Rejected: the maintainer wants Library to be its **own hub segment**. Chosen: Library becomes the **6th tile**, completing the clean **3×2** grid ADR-0012 §3 already anticipated.
- **Empty-library Reader state: keep the separate full-screen `ReaderEntryIdle` takeover (ADR-0012 §5).** Rejected: the maintainer wants it to read as a *paused Reader* with all chrome present. Chosen: render the full Reader frame with **inert** controls + an import disclaimer.
- **Empty-state implementation: un-assert `activeText` and run the live Reader with no text, or build a faux frame.** Rejected: surgery on the pinned playback orchestrator is high-risk; a faux frame drifts from the real look. Chosen: **compose the already-extracted Reader children** (`ReaderTopbar`/`ReaderScrubber`/`ReaderControls`) with zeroed/inert props — real visual parity, no change to the live playback path.
- **Library browse from the Reader: keep routing to the standalone Library screen (ADR-0012 §5), or re-introduce the deleted slide-over.** Rejected: the redirect strands the reader with no way back; the slide-over was already removed for good reason. Chosen: a **router-based in-frame library view** — the same list component, hosted inside the persistent Reader frame, chrome retained.
- **Return-to-reading affordance: an in-content "currently reading" banner in the standalone Library, or a third corner control.** Rejected: a third corner control breaks ADR-0012 §6's two-corner rule, and the banner became unnecessary once browse stays in-frame. Chosen: a **centered-bottom symmetric toggle** ("Browse library" ⇄ "Back to reading"), matching the mouse-first/centered-symmetric interaction model.

## Decision

### 1. Hub identity badge — enlarged, same sticker both themes (supersedes ADR-0012 §4)
The hub header keeps the existing cobalt dove+wordmark badge as a **deliberate branded showcase object**, **enlarged** (start ~64px, tune visually), with **`filter: invert(1)` removed** so the identical self-contained sticker renders in both themes. This **reverses ADR-0012 §4's "dove mark + version, no wordmark"**: the wordmark returns to the hub *inside the badge*, treated as an intentional brand object rather than redundant chrome. Identity stays **deterministic** (no `logo_style` branch — ADR-0011 §6 / ADR-0012 §4 retained; only the Reader idle dove branches). A hi-res/vector mark is a later HITL swap.

### 2. Hub tiles — compact squares, padding as an invariant (supersedes ADR-0012 §3 sizing)
Tiles are **~190px squares** (kept square — the gadget/button identity), centered. The `.hub` content area is a **scroll-with-preserved-padding** container: if content can ever exceed the viewport (tiny screen, OS display scaling, future tile count) it scrolls and tiles never touch or cross the window edge. **3 columns always — no column collapse.** The 800×600 window minimum (`src/main/index.ts`) already fits the compact grid with padding intact, so the scroll regime is a guarantee, not the normal case.

### 3. Library is the 6th hub tile → clean 3×2 grid (supersedes ADR-0011 §2 roster, ADR-0012 §3 ragged grid)
Library returns as a hub destination, becoming the **6th tile** and completing the **3×2** grid (retiring the `nth-child(4):nth-last-child(2)` trailing-row-centering hack). Tile layout is **thematic rows**:

```
Read · Library · RWW          ← reading / consume row (Read leftmost; Read + RWW = VIP red)
Import · Make Video · Settings ← manage / produce row
```

Read keeps primacy by **position (leftmost) + default focus**. Library is **blue/neutral** (management, not a VIP reading mode — not red). The Library tile opens the **standalone Library screen** (management home — categories, rename, delete, chapters), which is unchanged and keeps its dove (→ hub) + gear (→ Settings) corners.

### 4. Reader is a persistent frame; the stage swaps content (new model)
The Reader stops being all-or-nothing. The frame — `ReaderTopbar` + `ReaderScrubber` + `ReaderControls` — is **always present**; the **stage** swaps among: reading/paused (live playback, unchanged), idle/picker (text engaged), **empty** (zero texts), and **in-frame library browse**. Decisions §5–§7 are the new stage states.

### 5. Empty-library Reader state = full inert chrome + import disclaimer (supersedes ADR-0012 §5 zero-texts branch)
When there are **zero texts**, the Reader renders its **full frame with inert controls** — built by composing the **real extracted children** (`ReaderTopbar`/`ReaderScrubber`/`ReaderControls`) with zeroed/inert props (`playState='idle'`, `stacksLength=0`, no live `usePlayback`), so there is **no surgery on the live playback path**. The stage shows an **import disclaimer** carrying the real Import CTA, and **clicking any inert control also routes to Import** (no dead-end clicks). This replaces the separate full-screen `ReaderEntryIdle` takeover.

### 6. In-frame library browse via a router view (supersedes ADR-0012 §5 "Browse full library" → standalone screen)
"Browse library" from the Reader routes the **stage** to a library view **inside the persistent frame** (chrome retained) rather than navigating to the standalone Library screen. It **reuses the same library list component** as the standalone screen — one list, two hosts (hub tile → standalone management; Reader → in-frame browse/pick). Selecting a text engages it (existing `openReader`/`openSegmentInReader`) and the stage returns to reading. The standalone Library screen **stays** for management; there is no redundancy because the two hosts serve different contexts.

### 7. Return-to-reading = centered-bottom symmetric toggle (resolves the issue ADR-0012 §5 left)
The enter/exit of the in-frame library is **one centered-bottom symmetric control**: it reads **"Browse library"** while reading and **"Back to reading"** while browsing, sitting in the control zone for minimal mouse travel (mouse-first/centered-symmetric). This replaces the standalone-Library "currently reading" banner idea (unnecessary once browse stays in-frame) and adds **no third corner control** (ADR-0012 §6's two-corner rule preserved). Entering browse while playing pauses playback (consistent with the Standard-view toggle).

## Consequences

- **`CONTEXT.md` glossary updates on landing** (not before — `CONTEXT.md` documents shipped reality, per ADR-0012's own convention): **Hub** re-described as a 3×2 grid of six tiles; **Tile** roster gains **Library** (blue/neutral) and the thematic row order; **Hub identity** note re-adds the wordmark-bearing badge as a deliberate object (reversing §4); the **Reader** gains a "persistent frame / stage states" description (empty inert state, in-frame library browse, Browse-library/Back-to-reading toggle); the **Reader idle logo** protection is unaffected.
- **`ReaderEntryIdle` is folded into the persistent-frame model.** `ReaderIdle` / `ReaderEntryIdle` / `IdlePicker` unify under the stage-state model; dead `.reader-idle-entry*` and the hub `nth-child(4):nth-last-child(2)` CSS are removed.
- **Reader characterization tests change** (Tier C, deliberate): the empty-library full-screen takeover assertion becomes the inert-chrome assertion; new coverage for the in-frame library toggle and the Library hub tile.
- **`logo-on-dark.png` and the duplicate logo PNGs** (`logo-on-light`, `logo-primary`, `logo`, `logo-modern`, `logo-classic` are currently byte-identical) are untouched by this run; the light/dark split files are now moot for the hub since the invert is dropped. No asset edits — frozen brand assets.
- **Tier A untouched.** This is a Tier-B presentation/structure change plus Tier-C Reader-chrome fallout. Verification gate: `npm run build` + `npm test`; do not increase the `tsc` baseline (**105** as of Design Run 1).
- **Skill discipline carries over** from ADR-0011/0012: `design-taste-frontend` for net-new surface with dials forced **low** (grid stays centered/symmetric; the in-frame library + toggle are net-new); `redesign-existing-projects` for inherited-surface audit and the **stack veto** (Electron + one vanilla `index.css`; no Tailwind/Motion/icon libs/new deps). Guardrail change from ADR-0012: the "no in-app serif / no in-app wordmark" rule is **relaxed for the hub identity badge only** (§1) — the badge is a sanctioned brand object; serif stays out of all *other* app UI.
- Implementation plan: `.scratch/done/design-run-2/implementation-plan.md`; tracer-bullet issues: `.scratch/done/design-run-2/issues/`.
