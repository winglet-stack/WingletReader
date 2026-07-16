/**
 * Public static asset URLs (Vite `public/` → served at `/`).
 * CSS mirrors these via `--*-face` custom properties in index.css.
 * @see docs/design-system.md §5, ADR-0022
 */
export const DESIGN_ASSETS = {
  hubTileFaceDark: '/hub-tile-dark.png',
  hubTileFaceLight: '/hub-tile-light.png',
  settingsTileFaceDark: '/settings-tile-dark.png',
  settingsTileFaceLight: '/settings-tile-light.png',
  sliderKnob: '/slider-knob.png',
  toggleOff: '/toggle-off.png',
  toggleOn: '/toggle-on.png',
  returnButton: '/ReturnButton.png',
} as const
