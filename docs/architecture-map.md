# Architecture map

Optional deep reference for navigation — **not required on every agent session.** Read when you need file-level orientation in an unfamiliar area.

Stable vocabulary and layer names: [`CONTEXT.md`](../CONTEXT.md) glossary + Data Layer. Decisions: [`docs/adr/`](adr/).

```
Main process (Node.js)
  ├── database.ts              JSON file store
  ├── fileParser.ts / pdfExtraction.ts
  ├── bookIntake.ts            one intake ladder; formats plug in as adapters
  ├── wingletBookImport.ts     .wbook adapter (§4 ladder, seed_id dedupe, category merge)
  ├── epubImport.ts            .epub adapter + container ladder (zip → OPF → TOC → text)
  ├── epubExtract.ts           XHTML → plain text, image counting
  ├── readWhileWorkingCore.ts  Overlay Reader pure decisions (leaf predicates)
  ├── overlayReader.ts         Overlay Reader sequencing behind OverlayReaderPort
  ├── trayMenu.ts / trayMenuTemplate.ts   tray attach + the menu as pure data
  ├── portableMode.ts / portableProvisioning.ts
  ├── ipcHandlers.ts
  ├── updater.ts / updaterCore.ts
  └── index.ts                 lifecycle, windows, splash; the real Overlay Reader adapter

Preload → contextBridge → window.api

Shared contract
  ├── importTextCleanup.ts     plain-text + markup-extracted cleanup profiles
  ├── wingletBook.ts           .wbook validation + deterministic derivation
  ├── epubBook.ts              EPUB spine/TOC → segments derivation + verdicts
  └── statsMath.ts             stats pure math: integrity constants, session metrics, day fold, streak/points, chart collation

Renderer (React)
  ├── App.tsx / AppShell.tsx / appShell/
  │   └── routeTable.tsx       destinations: renderer + chrome + liveness
  ├── alphaChrome.ts           alpha flags + notice copy (module constants — dev/packaged parity)
  ├── contexts/                Navigation → Settings → Library → Reader
  ├── components/
  │   ├── AlphaNotice.tsx          the one alpha notice (.warnings-box); placed at 4 surfaces
  │   ├── Reader.tsx + reader/     session + surfaces consumer, vertical slices
  │   ├── readerConfig/            ReaderSettingsEditor, field registry
  │   ├── settings/                SettingsPanel, RwwSettingsEditor, instruments/
  │   ├── import/                  bookChannels + BookCard (one card, per-format copy)
  │   ├── stats/                   StatsView (Dashboard + Graphs tabs) + charts/ SVG primitives
  │   └── hub/ Library ImportPanel TransmuteView TemporaryReaderApp …
  ├── engine/                  pure logic (tokenizer, word index, keymap, bindings, import…)
  └── hooks/                   useReadingSession (the session), useReaderSurfaces (what is open), useSessionStatsTracker (session stats sensor), …
```

Dead-by-design code lives outside `src/` at repo-root `archive/` (ADR-0004 as
amended) — excluded from the build, the test run, and typecheck. Do not wire
anything back into `src/` without an ADR.

## Key entry files by area

| Area | Start here | ADR |
|------|------------|-----|
| Settings UI | `SettingsPanel.tsx`, `readerSettingsLayout.ts`, `rwwSettingsLayout.ts` | 0008, 0014, 0019, 0021 |
| Reading session | `hooks/useReadingSession.ts` (the interface), `engine/readerSession.ts` (pure decisions), `hooks/usePlayback.ts` (engine), `Reader.tsx` (consumer) | 0026, 0013 |
| Reader surfaces | `engine/readerSurfaces.ts` (the policy), `hooks/useReaderSurfaces.ts` (the owner), `Reader.tsx` (consumer) | 0013, 0024, 0025, 0026 |
| Bookmarks | `hooks/useBookmarkCollection.ts` (Reader-owned list), `reader/BookmarkPopover.tsx` + `hooks/useBookmarkPopover.ts` (the surface) | 0024 |
| Reader frame | `engine/readerFrame.ts`, `hooks/useReaderFrame.ts` | 0032 |
| Frame painters | `reader/StackGrid.tsx` (DOM), `engine/videoRenderer.ts` (canvas), `StackPreviewGrid.tsx` (preview) | 0032 |
| Overlay Reader | `overlayReader.ts` (sequencing + the port), `readWhileWorkingCore.ts` (pure decisions), `index.ts` (the Electron adapter), `RwwSettingsEditor.tsx` | 0017, 0021 |
| Hub | `hub/HubView.tsx` | 0011, 0013 |
| Shell routing | `appShell/routeTable.tsx`, `AppShell.tsx`, `contexts/NavigationContext.tsx` | 0005, 0006, 0020, 0027 |
| Visual assets | `index.css`, `designAssets.ts`, `ChromeIcon.tsx` | 0022 |
| Import | `ImportPanel.tsx`, `wingletBookImport.ts`, `wingletBook.ts`, `importTextCleanup.ts` | 0015, 0033 |
| Book intake | `bookIntake.ts`, `import/bookChannels.ts`, `import/BookCard.tsx`, `useImportBookIntake.ts` | 0033, 0034 |
| EPUB import | `epubImport.ts`, `epubExtract.ts`, `epubBook.ts`, `import/epubVerdict.ts`, `segmentVocabulary.ts` | 0034 |
| Word index | `engine/wordIndex.ts`, `engine/wordHighlight.ts`, `engine/textPagination.ts`, `hooks/useWordIndex.ts` | 0024, 0025 |
| Stats & gamification | `src/shared/statsMath.ts` (pure math + integrity constants), `database.ts` + `channelContract.ts` (stats collection + pinned goal snapshots), `hooks/useSessionStatsTracker.ts` (credited-frontier and gap-clamped session sensor), `components/settings/readingGoals.ts` (shared goal effectivity), `components/stats/` (StatsView, Dashboard, Graphs, charts) | 0035, 0036 |
| Portable | `portableMode.ts`, `PortableDriveSection.tsx` | 0016 |
| Alpha chrome | `alphaChrome.ts` (flags + copy), `components/AlphaNotice.tsx` (the notice); placements in `TransmuteView.tsx`, `settings/RwwSettingsEditor.tsx`, `import/ImportBookTakeover.tsx`, `settings/PortableDriveSection.tsx` | 0007, 0022 |
| Data / settings persistence | `database.ts`, `settingsHandler.ts` | 0001, 0008 |

LOC counts drift — use the codebase, not this doc, for sizing refactors.
