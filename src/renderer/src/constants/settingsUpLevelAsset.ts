import { DESIGN_ASSETS } from './designAssets'

/**
 * Settings up-level corner sprite (SRQ-1 / ADR-0020, final art SRQ-5).
 *
 * The maintainer-supplied "Return" mark (dove + RETURN + arrow) replaces the
 * interim PLACEHOLDER data-URL. It stays intentionally distinct from the hub
 * dove (HOME) so the two corner controls never read as the same action.
 *
 * Canonical hand-authored source: resources/dove/ReturnButton.png (ADR-0010 —
 * shipped via electron-builder `files: resources/**`, not Vite-routed).
 * Renderer copy (Vite public): /ReturnButton.png — keep the two in sync.
 *
 * On-screen size is owned by CSS (`.up-level-control-sprite`,
 * `--home-dove-size`) so it stays in lockstep with the Home dove box; the
 * 144px source stays crisp up to ~72px.
 */
export const SETTINGS_UP_LEVEL_ASSET_URL = DESIGN_ASSETS.returnButton
