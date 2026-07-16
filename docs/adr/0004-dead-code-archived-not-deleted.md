# ADR-0004: Dead code archived in `src/renderer/src/_archived/`

**Date:** 2026-06-09  
**Status:** Accepted

## Context

Two features were built but subsequently gutted:

- **Trailer Reader** (`TrailerReader.tsx`, `trailerTokenizer.ts`, `useTrailerPlayback.ts`) — a preview reading mode that showed condensed sections before the main read. Removed from active navigation due to high implementation complexity relative to usage.
- **Primer Panel** (`PrimerPanel.tsx`, `textPrimer.ts`) — a pre-reading summary generator. Removed from active navigation because the extraction heuristics had too high a margin of error.

The code remained in the main source directories (`components/`, `engine/`, `hooks/`) with comments noting it was inactive. This made it ambiguous to future contributors whether these were work-in-progress or genuinely inactive.

## Decision

Move all dead code to `src/renderer/src/_archived/` with the original subdirectory structure preserved (`components/`, `engine/`, `hooks/`). A `README.md` in `_archived/` explains the archive.

Import paths within the archived files are updated to reference the main source tree for shared utilities (types, active engine modules, hooks). `App.tsx` import paths are updated to point into `_archived/`.

The code is **not deleted** because:
1. It may serve as reference for future feature work
2. The `App.tsx` view-state routing still references the `'primer'` and `'trailer'` view names, preserving the hooks for future reactivation

## Consequences

**Positive**
- Active source directories contain only active code; no ambiguity
- Code is preserved with full git history (moved, not deleted)
- TypeScript compilation continues to pass

**Negative**
- `App.tsx` still imports from `_archived/` — it is still compiled and bundled (dead at runtime, not at build time)
- Future contributors must look in two places if they need to understand the full view-state list

## Notes

The `Script` feature (`ScriptBuilder.tsx`, `scriptTypes.ts`, `useScriptPlayback.ts`) is **benched** (in-progress, not wired up) rather than dead. It remains in the main source tree. See `CONTEXT.md` for the feature status table.
