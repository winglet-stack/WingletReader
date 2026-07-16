# WingletReader Design System

Canonical visual reference for the shipped UI. Decisions live in ADR-0011 through ADR-0014, ADR-0019, ADR-0020, ADR-0021, and **ADR-0022** (DisplayKit visual layer). Domain terms for these concepts are in [`CONTEXT.md`](../CONTEXT.md).

**Stack guardrail:** Electron + React + one vanilla `index.css`. No Tailwind, Motion, icon libraries, or new styling dependencies.

---

## 1. Design read

WingletReader is a **local-first desktop speed-reading app** with a **device-console identity**: flat monochrome surfaces, sharp corners, role-based colour, and pixel-art sprites on interactive affordances. The aesthetic is intentionally **industrial and symmetric** (low design-variance dials) — centered grids, square tiles, and predictable corner chrome.

---

## 2. Foundations

### 2.1 Geometry

| Token | Value | Use |
|---|---|---|
| `--radius` | `0` | All rectangular surfaces — no rounded cards, inputs, or panels |
| Hub tile size | ~190px square | 3×2 grid, never column-collapse |
| Settings gateway card | min-height 148px | 3-column landing grid |
| Reader control button | 48×48px | Playback + utility row |
| Home / up-level corner | `--home-dove-size` (64px) | Fixed top-left navigation |

### 2.2 Typography

| Token | Stack | Use |
|---|---|---|
| `--font-sans` | system UI stack | All in-app UI |
| `--font-serif` | `'Times New Roman', Times, 'Liberation Serif', serif` | **Splash / brand assets only** — not in-app chrome |
| Base size | 15px / 1.5 line-height | `:root` default |

User-facing copy uses US spelling (**Colors**, not Colours). Frozen code identifiers are unchanged.

### 2.3 Motion

- Hover/focus transitions: **120–150ms** ease on colour, filter, border.
- Active press: **1px translateY** or **scale(0.94–1.05)** on buttons.
- Hub first-paint settle: one-time session flag; honour `prefers-reduced-motion`.
- No decorative infinite animations in product chrome.

---

## 3. Colour roles (ADR-0012)

One role system in both themes; only the neutral base swaps.

| Role | Token(s) | Meaning |
|---|---|---|
| **VIP red** | `--brand-red` | Read + Overlay Reader surfaces; critical reading affordances |
| **Interactive blue** | `--accent`, `--accent-hover`, `--brand-blue`, `--brand-sky` | Links, focus rings, non-VIP tile accents, selected controls |
| **Danger** | `--danger` | Errors, destructive actions, toasts — **not** VIP reading |
| **Neutral gray** | `--text-muted`, `--border`, `--bg*` | Connective tissue, disabled, dividers |
| **Surface** | `--bg`, `--bg2`, `--bg3`, `--hub-tile` | Page planes and card faces |

### Theme overrides

Dark is the default `:root`. Light applies via `body[data-theme="light"]`.

Accent shifts per theme so fills stay legible: bright sky on dark (`#6b7dd1`), deep cobalt on light (`#34459e`).

### Focus

`--brand-focus`: `0 0 0 3px rgba(107, 125, 209, 0.28)` — shared focus ring.

---

## 4. Surfaces & card faces (ADR-0022)

### 4.1 Hub tiles

- **Grid:** 3×2, ~190px squares, 16px gap, scroll-with-preserved-padding container.
- **Face art:** `--hub-tile-face` (theme-aware PNG in `public/`).
- **Glyphs:** DisplayKit sprite pairs per tile (`idle` + `hover`/`GIF`) in `assets/hub-tiles/`.
- **VIP modifier:** `.hub-tile--vip` — red focus outline + red glyph accent.
- **Text:** label + in-place description (no shared LCD strip).

Roster (thematic rows):

```
Read · Library · Overlay Reader     ← consume (Read + RWW = VIP red)
Import · Make Video · Settings      ← manage / produce
```

### 4.2 Settings landing cards

- **Face art:** `--settings-tile-face` (theme-aware PNG).
- **Glyphs:** single-ink SVG chrome icons (`currentColor`) — see §5.2.
- **Appearance card:** static (`.gsc-card--static`) — theme pills inline, no navigation.

### 4.3 Inner views

- **Top-left:** up-one-level control (dove → hub, or Return sprite on Settings sub-pages — ADR-0020).
- **Top-right:** gear → Settings (hidden on Settings landing).
- **Reader:** exempt — owns full-screen chrome.

---

## 5. Icon & sprite conventions (ADR-0022)

Three asset classes; do not mix semantics.

| Class | Format | Recolour | Location | Examples |
|---|---|---|---|---|
| **DisplayKit tile sprite** | PNG (optional GIF hover) | Fixed palette in art | `assets/hub-tiles/` | `read.png`, `read-hover.gif` |
| **Theme-aware bitmap** | PNG pair (dark + light) | Baked per theme | `assets/reader-buttons/`, `assets/reader-tiles/` | `play-dark.png`, `library-toggle-dark.png` |
| **Chrome icon** | SVG, `fill="currentColor"` | Inherited from CSS | `assets/icons/{nav,reader,settings}/` | gear, appearance, data |
| **Instrument sprite** | PNG | Fixed | `public/` (Vite static) | `toggle-on.png`, `slider-knob.png` |
| **Brand / frozen** | PNG (maintainer) | Fixed | `public/`, `resources/` | dove, ReturnButton, splash |

### 5.1 Theme-aware bitmaps

`ReaderButtonIcon` renders both dark and light `<img>` tags; CSS shows one set via `body[data-theme]`. Playback sprites (`assets/reader-buttons/`) export on black matte (`--reader-btn-matte`). The Reader **Library-browse toggle** (`.reader-browse-btn`, `assets/reader-tiles/library-toggle-{dark,light}.png`) reuses the same component, but its 60×60 art is a **full-bleed tile with its own baked face** (blue in dark theme, light in light theme) that fills the button rather than sitting on the matte — it replaced the interim `ChromeIcon` `reader-browse-placeholder`.

### 5.2 Chrome icons (SVG)

- **viewBox:** `0 0 24 24`, ~2px padding.
- **Ink:** `fill="currentColor"` — no baked palette.
- **Exception:** up-level Return badge (`ReturnButton.png`) is multi-tone and not recoloured.

Use `ChromeIcon` for settings landing glyphs.

### 5.3 Maintainer asset specs

Hand-off briefs for new art:

- Hub tiles: [`Refernces/Design Overhaul/01-hub-tiles.md`](../Refernces/Design%20Overhaul/01-hub-tiles.md)
- Chrome icons: [`Refernces/Design Overhaul/02-chrome-icons.md`](../Refernces/Design%20Overhaul/02-chrome-icons.md)

---

## 6. Instrument kit (ADR-0014 §3)

Shared controls in `components/settings/instruments/`:

| Instrument | Component | For |
|---|---|---|
| Toggle | `SettingToggleRow` + `.toggle` | Booleans |
| Stepper | `Stepper` | Small bounded ints (1–5, 2–6) |
| Slider + number | `SliderField` + `.range-slider` | Continuous / wide range |
| Segmented | `Segmented` + `.theme-pill` | Tiny enums |
| Colour | `ColorSettingRow` | Palette + custom colours |
| Hint | `SettingHintTrigger` | Static `?` tooltip on earned settings |

Toggle and slider thumbs use pixel-art PNG sprites (`--toggle-*`, `--slider-knob`).

---

## 7. CSS token map

All tokens live in `src/renderer/src/index.css` `:root`. Grouping:

```
Typography     --font-sans, --font-serif
Surfaces       --bg, --bg2, --bg3, --hub-tile, --reader-bg
Text           --text, --text-muted, --accent-text
Interactive    --accent, --accent-hover, --brand-blue, --brand-sky, --brand-focus
Semantic       --brand-red, --danger, --success
Chrome         --home-dove-size, --rww-host-size, --rww-tabbar-row
Card faces     --hub-tile-face, --settings-tile-face
Instruments    --toggle-active-fill, --range-thumb-size
Geometry       --radius, --shadow-rgb
```

TypeScript mirrors public asset URLs in `constants/designAssets.ts`.

---

## 8. Protected brand surfaces

Do not "clean up" without maintainer decision:

| Surface | Rule |
|---|---|
| Splash showcase | ADR-0010 — separate window, hand-authored assets |
| Hub identity badge | Enlarged cobalt dove+wordmark, same sticker both themes (ADR-0013 §1) |
| Reader idle dove | Branches on `logo_style`; only surface that does (ADR-0011 amendment) |
| Home dove vs Return | Distinct sprites — dove always means hub (ADR-0020) |

---

## 9. Verification

Presentation changes: `npm run build` + `npm test`. Do not increase the `tsc -b` error baseline.

Visual HITL checklist (800×600, UI zoom floor −2):

1. Hub 3×2 grid — tiles never clip; VIP red on Read + Overlay Reader.
2. Settings landing — card faces + chrome icons; Appearance static card.
3. Reader controls — theme-aware sprites; matte fringe invisible.
4. Settings instruments — toggle/slider sprites; hint tooltips on focus/hover.
5. Corner navigation — dove on top level; Return on Settings sub-pages.
