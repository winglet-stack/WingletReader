# Design Spec 01 — Hub Tiles

Drop into `src/renderer/src/assets/hub-tiles/`. One file per tile. Empty slot = keeps old glyph (safe).

### Format
- **PNG**, opaque, full-bleed square. Same file used in light + dark themes (no per-theme variant).
- Text (label + description) is drawn by code on top — leave the **bottom 40%** low-detail/dark.

### Dimensions
- **512 × 512 px** (renders at ~190 px).

### Palette
| Tiles | Base face | On-tile text |
|---|---|---|
| `read.png`, `rww.png` (VIP) | **red `#d94f45`** | `#ffffff` |
| `library.png`, `import.png`, `make-video.png`, `settings.png` | **cobalt `#4050A0`** → deep `#2A3580` / neutral `#1a1a1a` | `#ececec` |

Accents available: sky `#6B7DD1`, pale `#c8d0ec`.

### Files (6)
`read` · `rww` · `library` · `import` · `make-video` · `settings`
Optional per file: `<name>-hover.png`, `<name>-disabled.png`.
