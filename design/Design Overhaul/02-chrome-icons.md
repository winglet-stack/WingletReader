# Design Spec 02 — Chrome Icons

Drop SVGs into `src/renderer/src/assets/icons/{reader,nav,settings}/`. Empty slot = keeps old PNG/glyph (safe).

### Format
- **SVG**, single-ink, paths only (no `<image>`, no external refs).
- Draw in **one flat color** using `fill="currentColor"` — code recolors it (VIP red, neutral, disabled). Don't bake color.
- Exception: `settings-up-level.svg` may be multi-tone (it's a badge, not recolored).

### Dimensions
- **viewBox `0 0 24 24`**, centered, ~2 px padding.

### Palette
- **None to provide** — icons inherit their color from code (`currentColor`).
- For reference only, the inherited colors are: red `#d94f45`, cobalt `#4050A0`, neutral text `#ececec`.

### Files (14)
- `reader/` (7): `restart` · `rewind` · `play` · `pause` · `skip-forward` · `stop` · `target`
- `nav/` (2): `gear` · `settings-up-level`
- `settings/` (5): `appearance` · `reader-defaults` · `overlay-reader` · `import` · `data`

Dove / logo / splash = frozen, don't touch.
