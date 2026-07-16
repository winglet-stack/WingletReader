# ADR-0006: NavigationContext at the top of the provider tree

**Date:** 2026-06-09
**Status:** Accepted

## Context

The context extraction (ADR-0003) assigns rich user actions to the domain contexts — `openReader`, `openSegmentInReader`, `handleContinueReadingSource`, and similar. Inspection of the original `App.tsx` showed every one of these actions ends by navigating: `setView('reader')`, `setView('library')`, `setLibraryTab(...)`, etc.

If view state (`view`/`setView`) lived in `AppShell` — which sits *below* the providers — then no provider could navigate, because a provider cannot read state held by its own descendant. The actions would have to be hoisted out of the contexts and back into `AppShell`, re-introducing prop-threading for exactly the gnarliest logic and defeating ADR-0003.

A second, related force: the provider tree is ordered `Settings → Library → Reader`, so a child context can consume a parent's hook but never the reverse. Navigation is needed by *all* of them.

## Decision

Introduce a `NavigationContext` (`<NavigationProvider>` / `useNavigation()`) and place it at the **top** of the provider tree, above all domain contexts:

```
<NavigationProvider>      view, setView, settingsMode, openGlobalSettings, openTransmuteReaderSettings
  <SettingsProvider>
    <LibraryProvider>
      <ReaderProvider>
        <AppShell/>
```

It owns `view` and `settingsMode` and exposes `setView` plus the two settings-routing helpers. Because it is the outermost provider, every context and `AppShell` can call `useNavigation().setView(...)` from inside an action.

## Rationale

Navigation is genuinely global, cross-domain UI state with no dependencies of its own, so the top of the tree is its natural home. Putting it there is what makes the "actions live in the lowest context they write, and navigate via a hook" rule work uniformly — without it, the clean ADR-0003 split is not buildable.

The alternative considered — keep `view` in `AppShell` and let `AppShell` orchestrate all cross-cutting actions, with providers reduced to dumb state containers — was rejected because it pushes the hardest logic back into prop-threaded callbacks, the opposite of what ADR-0003 set out to achieve.

## Consequences

**Positive**
- Any context action can navigate through `useNavigation()`; no `setView` callbacks are threaded as props.
- `NavigationContext` is tiny and dependency-free, so it sits cleanly at the root.

**Negative**
- One more provider in the tree.
- View-routing is now a context concern rather than local component state; trivial route flips still go through the hook.

## Notes

`NavigationContext` holds *route* state only (which view, which settings mode). It must not accrue domain state. The "which text's summaries am I viewing" target (`summariesText`) is deliberately left in `AppShell`, not here, because it carries a domain payload (a `TextRecord`) rather than a pure route token.
