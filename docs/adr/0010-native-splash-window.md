# ADR-0010: Native splash window for cold start

**Date:** 2026-06-18
**Status:** Accepted

WingletReader's main window is created `show: false` and only `show()`s on `ready-to-show` (`src/main/index.ts:67-69`), so during a cold start the user sees nothing between process launch and React mounting. As pre-distribution alpha furnishing, we add a branded **splash** window that paints instantly to cover that gap and communicate the brand name. The implementation makes three non-obvious choices that a future reader would otherwise find surprising: the splash ships as a hand-written file *outside* the build pipeline, the main process owns the animation clock, and there is deliberately no renderer→main IPC.

## Considered Options

- **In-renderer overlay / reused React route.** Rejected: cannot paint until the heavy renderer has already loaded — i.e. *after* the cold-start gap it is meant to cover.
- **Second electron-vite renderer entry** (`rollupOptions.input: { main, splash }`). Type-checked and build-integrated, but routes the splash through Vite, adds config, and tempts creep toward a real React screen — contrary to "ultra-light, not the React bundle."
- **Splash renderer owns timing, reports beats over IPC** (`splash:beat-reached`). Requires a preload + IPC channel solely to report a frame counter that the main process can compute exactly, given deterministic fixed-fps playback.
- **Static asset outside the build + main-owned clock + no IPC** (chosen).

## Decision

Ship the splash as a static `resources/splash/splash.html` (inline canvas2d, ~40 lines) plus two spritesheet PNGs, resolved via `app.getAppPath()` exactly like `resources/logo.png`. It never touches electron-vite or React.

- **Outside the source guardrail, intentionally.** This raw `.js` lives under `resources/`, not `src/`. It is hand-authored and shipped as-is — it is **not** generated output, despite the repo's "edit `.ts` source only / `.js` is generated" rule (CONTEXT.md "Build Artifacts"). Do not TS-ify it or route it through Vite.
- **Main owns a deterministic clock.** Playback is fixed 15fps frame-stepping, so the main process computes the brand-floor moment as `floorFrame / 15` seconds after the splash's `did-finish-load`. No `splash:beat-reached` IPC; the splash window is inert with zero privileged surface (no preload).
- **Reveal gate.** Show the main window when `mainReady` **and** `brandFloor` are both true — `mainReady` (painted) a hard precondition, `brandFloor` (earliest settled+legible frame) a minimum, not the full intro. Keyboard-only skip via `before-input-event`, honored only after `mainReady`.
- **Cold-start only.** Splash logic lives inline in `app.whenReady()`; the other `createWindow` callers (second-instance, activate, RWW exit) are untouched and splash-free. The cold-start path uses `createWindow(false)` and the coordinator owns the single `mainWindow.show()`.
- **Fail-open + 12s max-timeout** (logged via `electron-log`) so the splash can never block or hang launch.

## Consequences

- A future engineer seeing raw JS in `resources/splash/` must treat it as hand-written and shipped — this ADR is the record that it is deliberately outside the TS build, not a stray artifact.
- The main process now holds startup animation-timing logic; the splash carries no app logic and cannot report state upward. Changing the fps or floor frame is a main-side constant plus a re-authored sheet, not an IPC contract change.
- The reveal path threads through `whenReady`/`createWindow` show-ownership; reverting the splash means restoring `createWindow(true)` on the cold-start path and removing the coordinator — not a one-line change.
- No electron-builder change: `build.files` already bundles `resources/**/*`.
- Brand floor is a fixed minimum on every cold start, so even the fastest boots show a short guaranteed brand window; this is an accepted latency cost for brand communication.
