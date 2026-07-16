# Architecture map

Optional deep reference for navigation — **not required on every agent session.** Read when you need file-level orientation in an unfamiliar area.

Stable vocabulary and layer names: [`CONTEXT.md`](../CONTEXT.md) glossary + Data Layer. Decisions: [`docs/adr/`](adr/).

```
Main process (Node.js)
  ├── database.ts              JSON file store
  ├── fileParser.ts / pdfExtraction.ts
  ├── importTextCleanup.ts
  ├── readWhileWorkingCore.ts
  ├── portableMode.ts / portableProvisioning.ts
  ├── ipcHandlers.ts
  ├── updater.ts / updaterCore.ts
  └── index.ts                 lifecycle, tray, windows

Preload → contextBridge → window.api

Renderer (React)
  ├── App.tsx / AppShell.tsx / appShell/
  ├── contexts/                Navigation → Settings → Library → Reader
  ├── components/
  │   ├── Reader.tsx + reader/     session orchestrator + vertical slices
  │   ├── readerConfig/            ReaderSettingsEditor, field registry
  │   ├── settings/                SettingsPanel, RwwSettingsEditor, instruments/
  │   ├── hub/ Library ImportPanel TransmuteView TemporaryReaderApp …
  │   └── _archived/               dead routes (do not wire back without ADR)
  ├── engine/                  pure logic (tokenizer, keymap, bindings, import, transmute…)
  └── hooks/                   usePlayback, useReadingSessionLifecycle, …
```

## Key entry files by area

| Area | Start here | ADR |
|------|------------|-----|
| Settings UI | `SettingsPanel.tsx`, `readerSettingsLayout.ts`, `rwwSettingsLayout.ts` | 0008, 0014, 0019, 0021 |
| Reader session | `Reader.tsx`, `readerSession.ts`, `useReadingSessionLifecycle.ts` | 0013 |
| Overlay Reader | `RwwSettingsEditor.tsx`, `readWhileWorkingCore.ts` | 0017, 0021 |
| Hub | `hub/HubView.tsx` | 0011, 0013 |
| Visual assets | `index.css`, `designAssets.ts`, `ChromeIcon.tsx` | 0022 |
| Import | `ImportPanel.tsx`, `importTextCleanup.ts` | 0015 |
| Portable | `portableMode.ts`, `PortableDriveSection.tsx` | 0016 |
| Data / settings persistence | `database.ts`, `settingsHandler.ts` | 0001, 0008 |

LOC counts drift — use the codebase, not this doc, for sizing refactors.
