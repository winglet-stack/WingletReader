# ADR-0009: Hub-and-launched-mode UI

**Date:** 2026-06-17
**Status:** Accepted — **partially superseded by ADR-0011** (2026-06-18). The launched-mode model below still holds (Reader and Transmute launch from content, not as static global destinations). What ADR-0011 supersedes is this ADR's *global-chrome* decision: "Home/Library is the home hub" and "the global shell exposes a top bar of Home/Library, RWW Console, Settings, Resume." The home surface is now the console **hub** (`docs/adr/0011-console-hub-launcher.md`), the `ShellTopBar` is removed, and Library is one tile among five rather than the home.

WingletReader's alpha UI moves from persistent left-rail destinations to a hub-and-launched-mode structure: Library is the home hub, Read While Working Console and Settings are management destinations, while Reader and Transmute are launched from content rather than exposed as global navigation peers. This is a mandatory pre-distribution IA change because a static Reader destination is empty without selected content, Transmute is experimental and source-scoped, and RWW needs a management surface distinct from the overlay itself.

## Considered Options

- Keep the current left rail with Library, Reader, Transmute, and Settings as peer destinations.
- Replace the left rail with top-bar global chrome but keep Reader and Transmute as global destinations.
- Use a hub-and-launched-mode model: Library and Import are source hubs; Reader, Transmute, and the RWW overlay launch from content or explicit actions; RWW Console and Settings remain management destinations.

## Decision

Adopt the hub-and-launched-mode model. The global shell should expose Home/Library, Read While Working Console, Settings, and contextual Resume when available; it should not expose Reader or Transmute as static destinations. Saved Library texts can launch Reader or Transmute from their cards, and unsaved pasted/uploaded content can launch Transmute from Import without first becoming a Library record.

## Consequences

- `NavigationContext` may still hold route tokens such as `reader` and `transmute`, but global chrome must not present them as primary destinations.
- Transmute remains route-backed during migration, but entry becomes source-scoped: Library card for saved texts, Import for unsaved pasted/uploaded content.
- Read While Working Console becomes a first-class management destination, distinct from the RWW overlay window.
- Settings can flatten into app preferences because Reader tuning moves beside the live Reader and RWW management moves to its Console; ADR-0008 remains the storage contract, not a requirement to preserve mode chips in the UI.
