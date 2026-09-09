# ADR-0004: Dead code archived, not deleted

> Location note: the archive moved from `src/renderer/src/_archived/` to repo-root `archive/` on 2026-07-20 — see the amendment at the end of this record.

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

---

## Amendment — 2026-07-20: archive relocated to repo-root `archive/`

**Status:** Accepted. The original decision (archive, do not delete) is unchanged; this amendment corrects two consequences that had gone stale and moves the archive out of `src/`.

### Corrections to the record above

Both entries below described the state in 2026-06-09 and were no longer true by 2026-07-20:

1. The Consequences entry "`App.tsx` still imports from `_archived/` — it is still compiled and bundled" is **obsolete**. The Script subsystem was unwired from `AppShell.tsx` during the foundation-cleanup pass, and the Summaries view lost its last render branch in wave-1 issue 11. Verified 2026-07-20: no file under `src/` imports anything in the archive.
2. The Notes entry describing `Script` as "benched … remains in the main source tree" is **obsolete**. Script was archived alongside Trailer and Primer; `CONTEXT.md`'s feature table has recorded it as *Dead / archived* since then. The status table, not this note, is authoritative.

### What changed

`src/renderer/src/_archived/` → repo-root **`archive/`**.

The archive was fully detached but still sat inside `src/`, which meant it was carried by every glob scoped to the source tree. Concretely, `vitest.config.ts` includes `src/**/*.test.ts{,x}`, so **roughly 1,800 lines of tests for shipped-to-nobody code ran on every `npm test`**, and `tsconfig.web.json` includes `src/renderer/src/**/*`, so the archive was typechecked. It also surfaced in every agent/editor search across `src/` — including the single largest file in the repo, `ScriptBuilder.tsx` (2,041 lines).

Moving it to the repo root drops it out of those globs *by construction*, with no new exclude rules to keep in sync. Only two references needed updating: `.fallowrc.json`'s `ignorePatterns` (which had been carrying `**/_archived/**` — the reason fallow reported zero dead files), and `docs/architecture-map.md`.

Imports that reached from the archive into the live tree were rewritten from depth-sensitive relative paths (`../../types`) to the `@renderer/*` alias, so they stay readable as reference and cannot rot again if the archive moves. Intra-archive relative imports are unchanged. The alias does not resolve from outside the tsconfig — intentional: the archive is reference material, not buildable code.

### Consequences

**Positive**
- `src/` contains only active code; agent and editor searches no longer traverse ~6,800 dead lines
- ~1,800 lines of archived tests no longer run on every `npm test`
- Archive exclusion is structural (outside the glob) rather than a rule that can drift
- Git history preserved — `git mv`, not delete; ADR-0004's core decision stands

**Negative**
- The archive no longer typechecks, so live-tree refactors will silently invalidate its `@renderer/*` imports. Accepted: it is reference material and has been unbuildable in practice since it was unwired.
- Contributors must look outside `src/` for the full historical view-state list
