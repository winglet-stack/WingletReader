# ADR-0001: JSON file store over SQLite

**Date:** 2026-06-09  
**Status:** Accepted

## Context

The initial prototype used `better-sqlite3` for persistence. This required:
- Native compilation against Electron's Node ABI (`npm run rebuild`)
- Visual C++ Build Tools on Windows
- A dedicated rebuild step every time Electron was updated

WingletReader is a single-user local app. It stores texts, settings, and segments — no cross-table queries, no concurrent writers, no multi-user state. The relational model of SQLite provided no meaningful benefit over a structured JSON file.

## Decision

Replace `better-sqlite3` with a pure JSON file store: a single atomic-write `.json` file in Electron's `userData` directory. The entire data structure is read into memory on startup and written back as one serialised object on every mutation.

## Consequences

**Positive**
- No native compilation, no rebuild step, no build-tool prerequisite
- Distribution is simpler: no platform-specific binaries to bundle
- Data file is human-readable and easy to inspect or back up

**Negative**
- The full file is re-serialised on every write — acceptable for the current data volume; revisit if texts routinely exceed several MB each
- No query capabilities; all filtering/sorting happens in application code
- No transactions; a crash mid-write could corrupt the file (mitigated by atomic write: write to a temp file, then rename)

## Notes

Do not re-introduce SQLite or any native dependency without a superseding ADR. Any reference to `better-sqlite3` in documentation or comments is a stale artefact of the original prototype.
