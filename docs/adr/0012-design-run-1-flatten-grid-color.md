# ADR-0012: Design Run 1 — flat monochrome surfaces, grid hub, role-based colour

**Date:** 2026-06-19
**Status:** Accepted
**Supersedes (in part):** ADR-0011 §2.2, §2.3, §2.5, §2.6, §6, and hub-redesign slice 06's "keep the serif wordmark in the hub header".

After ADR-0011's console hub merged to `master` (`bdda1f4`), the maintainer reviewed the shipped result (the visual HITL that ADR-0011 left pending) and recorded a follow-up assessment (`.scratch/done/design-run-1/InitialAssessment`). A grill session (`/grill-with-docs` + `design-taste-frontend` + `redesign-existing-projects`, 2026-06-19) resolved it into the decisions below. Scope was deliberately constrained to the **Reader** and the **hub** (plus the inner-view chrome); in-reader reading mechanics (pain 2) remain deferred. This run **must land before the Phase 4 alpha invite** for the same reason ADR-0011 did: it is the first-impression surface.

The driver: the shipped hub reads as **over-layered and incoherent** (desk gradient → device-face panel → bezel → tiles → recessed LCD, each with its own depth), the **"WingletReader" wordmark is redundant** to a user already in the app, the **LCD detail strip has awkward contrast** and is an extra plane, and the colour language (cobalt-only accent, red reserved to the wordmark) does not give the **core reading features** visual primacy. The Reader also **redirects to the Library** when no text is engaged and carries a **slide-over text browser**, both of which the maintainer wants replaced by in-place flow.

This ADR keeps ADR-0011's load-bearing decisions: the hub as the device-identity home, mouse-first/click-through interaction with a keyboard fallback, Read's primacy by **position + default focus** (not a hero tile), the persistent **Home dove** on inner screens, the **Reader's full-screen exemption**, **both themes**, the **deterministic** hub identity (no `logo_style` branch), the **radius-0** sharp system, and the entire **Tier A** freeze (JSON store, frozen identifiers, ADR-0008 settings contract, reading engine/playback math).

## Considered Options

- **Keep ADR-0011's visual language, do a light touch-up.** Rejected: does not fix the over-layering, the redundant wordmark, or the buried-core-feature colour problem the maintainer named.
- **Hub: keep the single symmetric row of 5 tiles.** Rejected: the maintainer intends 6+ features; a wider single row gets cramped and confusing. Chosen: a grid now (3-wide, centered bottom row) that grows cleanly to 3×2.
- **Hub: keep the shared LCD detail strip (move-detail-on-focus).** Rejected: it is an extra plane with awkward contrast and the description belongs *in place*. Chosen: per-card description, strip removed.
- **Background: flatten depth but keep the desk/face two-plane device frame.** Rejected: the maintainer found the desk gradient's high contrast against the face the core problem. Chosen: drop the desk plane, flatten to one monochrome surface + cards.
- **Colour: keep cobalt-as-only-accent and red-as-wordmark-only.** Rejected: gives no surface to the core reading features. Chosen: a role system where red marks the two VIP reading modes + critical info, blue carries all other interaction.
- **Light theme: keep the warm "cobalt + cream" paper finish.** Rejected: pulls against the monochrome direction. Chosen: neutral monochrome light, one role system with the base swapped.
- **Reader: keep redirect-to-Library + slide-over browser.** Rejected: the maintainer wants text selection in place. Chosen: an in-place idle state machine; the standalone Library view stays for management.

## Decision

### 1. Flat monochrome surfaces (supersedes ADR-0011 §6, §2.5 materiality)
Surfaces are monochrome (black / white / gray), **flat**. Remove the hub's **desk gradient** plane entirely and collapse desk + device-face into **one flat surface** with cards sitting directly on it. Remove bezel/inset/drop-shadow depth from the hub. `--radius: 0` is retained.

### 2. Role-based colour (supersedes ADR-0011 §2.5 red-reservation)
- **Blue** (the existing cobalt `--accent`) is the **interactive accent**: card fill + hover, iconography, borders.
- **Red** is reserved for **(a) the two VIP reading features — Read and Read While Working** — and **(b) the most important information** (errors, destructive confirmations, warnings). Nothing else.
- **Gray** is **neutral connective tissue** only — muted text, disabled state, subtle borders/dividers, the resting chrome of non-VIP cards. Never an accent.
- The red **serif wordmark** is no longer the sole red; the wordmark leaves the in-app hub (see §4) but remains a splash/brand asset.

### 3. Hub is a grid of cards with in-place description (supersedes ADR-0011 §2.2, §2.3)
A **3-column grid**, centered bottom row, **Read top-left** (primacy by position + default focus, retained from ADR-0011 §2.4). The five tiles fill 3 + 2; a future 6th snaps into a clean 3×2. **Tiles become cards** that carry their **own short description in place**. The **shared LCD detail strip is removed** (hover/focus now highlights the card; the description is always visible). Mouse-first/click-through and the keyboard roving-`tabindex` fallback are retained, generalised to grid navigation.

### 4. Hub identity = dove logo + version (supersedes slice 06's wordmark retention)
The hub header shows the **dove logo mark + the app version**, not the "WingletReader" text. Identity stays **deterministic** (no `logo_style` branch — ADR-0011 §6 retained; only the Reader idle dove branches, per ADR-0011's 2026-06-19 amendment). The current dove PNG is an accepted **placeholder**; a hi-res/vector hub logo is a later **HITL** swap.

### 5. Reader in-place idle state machine (new)
The Reader stage replaces redirect-to-Library and the slide-over browser with in-place states:
- **Zero texts** → a large **Import** affordance that **redirects to the Import view** (no in-place import; routing to the empty Library would be pointless).
- **Texts exist, none engaged** → an **in-place compact picker** (recent texts + "Browse full library").
- **A text is engaged, idle** → resume UI + a quiet **"Pick another text"** that swaps the same stage into the picker.
- **Playing / paused** → reading, unchanged.

`TextBrowserSidebar` is **removed**. The **standalone Library view stays** (management: categories, rename, delete, chapters) — the picker coexists with it. The hub **Read card always opens the Reader** (no branch-to-Library); the Reader's `ReaderTopbar` is retained and its Back targets the hub.

### 6. Inner-view chrome = symmetric corner controls (supersedes ADR-0011's transitional ShellTopBar)
Delete `ShellTopBar`. Inner views carry only **two corner controls**: the **dove top-left → hub** (retained `HomeControl`, hidden on the hub) and a **gear top-right → Settings** (hidden on Settings). The **RWW Console nav link is removed** (the hub RWW card is the entry; a self-link inside the Console was the explicit absurdity). The persistent **version string drops** from inner views (hub + Settings still show it). The **Reader stays exempt** (its own chrome).

## Consequences

- **`CONTEXT.md` glossary updates on landing** (not before — `CONTEXT.md` documents shipped reality): **Tile** → grid **card** with in-place description; **LCD detail strip** entry removed; **Device face / Desk** entry loses "Desk" and the bezel/pixel-LCD language; **Hub** entry re-described as flat grid; **Home control (dove)** gains the gear/Settings corner counterpart and the hub-identity dove. The "Vocabulary to Avoid" rows for "block"/"detail panel" stay; add nothing implying the LCD strip.
- **`ShellTopBar.tsx` is deleted**; the shell test asserting it must move to asserting the corner controls (Tier C fallout, expected).
- **Splash → hub continuity** (slice 05's one-time settle) should be revisited: the hub backdrop is now flat monochrome rather than the dark cobalt desk; the dove hand-off still holds. Out of scope to redo the splash here.
- **`--brand-red` / `--danger` reconcile**: red now spans VIP features *and* critical info; keep `--danger` for error semantics and use the red role for VIP surfaces, or unify — an implementation call in the token slice.
- **Tier A untouched.** This is a Tier-B presentation/structure change plus Tier-C Reader-chrome fallout. Verification gate: `npm run build` + `npm test`; do not increase the `tsc` baseline (**105** as of hub-redesign slice 02).
- **Skill discipline carries over** from ADR-0011: `design-taste-frontend` for net-new surface with dials forced **low** (the grid stays centered/symmetric); `redesign-existing-projects` for inherited-surface audit and the **stack veto** (Electron + one vanilla `index.css`; no Tailwind/Motion/icon libs/new deps). Guardrail change: the serif-only-for-wordmark rule now has **no in-app wordmark** to protect — keep serif out of the app UI entirely (it remains a splash asset).
- Implementation plan: `.scratch/done/design-run-1/implementation-plan.md`; tracer-bullet issues: `.scratch/done/design-run-1/issues/`.
