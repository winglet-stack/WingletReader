# ADR-0003: React Context over external state library

**Date:** 2026-06-09  
**Status:** Accepted

## Context

App state for the library, reader, and settings was managed entirely inside `App.tsx` and passed down as props. As the component tree grew, prop drilling made it difficult to:
- Test a single component (e.g. `Library.tsx`) without mounting the full `App.tsx`
- Add a feature in one domain (e.g. reader position) without touching `App.tsx`

The architecture deepening PRD calls for extracting three context modules: `LibraryContext`, `ReaderContext`, and `SettingsContext`.

## Decision

Use **React Context + custom hooks** (`useLibrary()`, `useReader()`, `useSettings()`). Do not introduce Redux, Zustand, Jotai, MobX, or any external state management library.

## Rationale

WingletReader is a local, single-user, single-window application (with one additional overlay window for RWW). The state complexity is bounded. React Context is sufficient, requires no new dependency, and the hook-per-context pattern gives the same ergonomics as a selector-based library without the overhead.

## Consequences

**Positive**
- No new dependency
- Each context module is independently testable: mount the provider, assert the hook value
- `App.tsx` becomes a composition root with no domain state of its own

**Negative**
- Context providers re-render all consumers on every state change; use `useMemo`/`useCallback` to stabilise values where measured re-render cost is high
- If WingletReader ever becomes multi-window in a meaningful way (shared state across Electron windows), React Context will not suffice and this ADR should be reopened

## Notes

Cross-context dependencies (e.g. `ReaderContext` needing the active text from `LibraryContext`) are resolved by having the child context consume the parent hook — not by merging contexts or passing context values through props.
