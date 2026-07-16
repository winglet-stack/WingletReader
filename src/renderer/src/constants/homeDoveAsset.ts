/**
 * Home control dove asset (hub-redesign slice 06).
 *
 * The maintainer-supplied "Return to Hub" mark replaces the interim splash
 * spritesheet frame (issue 06, ADR-0011 §6). It is a self-contained cobalt
 * tile (dove + HOME + arrow), used only by the persistent corner Home control.
 * The hub header uses a separate identity mark (logo-on-dark.png, slice 04).
 *
 * Canonical hand-authored source: resources/dove/ReturntoHub.png (ADR-0010 —
 * shipped via electron-builder `files: resources/**`, not Vite-routed).
 * Renderer copy (Vite public): /ReturntoHub.png — keep the two in sync.
 *
 * On-screen size is owned by CSS (`--home-dove-size`, default 64px) so the
 * button box and the top-bar padding stay in lockstep; the 144px source stays
 * crisp up to ~72px. To go larger, bump `--home-dove-size` and supply a ≥256px
 * source.
 */
export const HOME_DOVE_ASSET_URL = '/ReturntoHub.png'
