# ADR-0005: App / AppShell composition layer

**Date:** 2026-06-09
**Status:** Accepted

## Context

The architecture-deepening work (ADR-0003) extracts `SettingsContext`, `LibraryContext`, and `ReaderContext` out of `App.tsx`. Those contexts are consumed via hooks (`useSettings`, `useLibrary`, `useReader`).

A single React component cannot both render a context provider and call that context's hook in the same render — the hook would resolve against the provider's default (and our hooks deliberately throw when used outside their provider). But `App.tsx` historically did both: it was the composition root **and** the holder of all view state and JSX that reads that state. As soon as the first provider is introduced, App can no longer read the values it just provided.

## Decision

Split the root into two layers:

- **`App.tsx`** — pure composition root. Renders only the provider tree:
  `<NavigationProvider><SettingsProvider><LibraryProvider><ReaderProvider><AppShell /></ReaderProvider></LibraryProvider></SettingsProvider></NavigationProvider>`. Holds no view state and no view JSX.
- **`AppShell.tsx`** — the former App body. Lives *inside* the provider tree, consumes the hooks, owns the application-shell state that belongs to no domain (`error`, `loading`, `fullscreenActive`, the Summaries-view route), and renders all views. View-routing (`view`, `settingsMode`) lives in `NavigationContext` (see ADR-0006), not in `AppShell`.

`AppShell` is introduced in Issue 04 (SettingsContext) and reused unchanged by Issues 05 and 06.

## Rationale

This is the conventional React provider/consumer arrangement. The alternative — wrapping each provider around only the minimal subtree that consumes it — fails here because WingletReader's views are interleaved across all three domains (e.g. `SegmentPanel` consumes both Library and Reader), so no clean minimal subtrees exist. A single shell consuming all hooks is simpler and matches how the views are actually composed.

The split is also what makes the contexts extractable **one issue at a time**: during each migration, `AppShell` re-supplies props to not-yet-migrated components from the hooks it already consumes, so each issue can rewire only the props it owns without breaking the others.

## Consequences

**Positive**
- Providers and consumers are cleanly separated; the hooks can safely throw outside their provider.
- `App.tsx` is a trivial, stable composition root that rarely changes.
- Incremental, drip-feedable context extraction is possible.

**Negative**
- One extra indirection layer (`App` → `AppShell`) to learn.
- `AppShell` is temporarily large during the migration (it still holds re-supplied props) and only slims down once all three contexts are extracted.

## Notes

`AppShell` is a shell, not a domain owner. The only state it should retain long-term is genuine application-shell state: global loading/error, fullscreen, and the Summaries-view target. The current view/route itself lives in `NavigationContext` (ADR-0006) so that context actions can navigate. Domain state belongs in a context.
