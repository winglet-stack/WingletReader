# ADR-0008: Unified Settings handler — mode-scoped store with an RWW override model

**Date:** 2026-06-15
**Status:** Accepted (2026-06-15) — shipped in wave 1 issues 03–05 (merged `a009ee6`). **The storage model below remains the contract.** Its *UI concepts* (Triplet, Simplified/Advanced density) are superseded and its *RWW override semantics* are amended by **ADR-0014** (RWW now owns a complete, independent `rww` field set rather than inheriting via deltas — storage shape and resolver unchanged).

## Context

Settings were a single flat `Settings` object (`src/shared/settings.ts`, `DEFAULT_SETTINGS`) persisted as one `settings` row in the JSON store (ADR-0001). The Settings UI organised this by *subsystem tabs* (General / Chunking / RWW / Transmute), and Read While Working (RWW) playback overrides were encoded as ad-hoc parallel keys — `rww_bpm`, `rww_words_per_stack`, `rww_stacks_visible`, `rww_lines_enabled`, `rww_lines_count` — merged over the reader fields by hand inside `ipcHandlers.ts` (`rww:getTemporarySession`: `bpm: rww_bpm ?? bpm`, …).

The Settings overhaul (PRD session 2026-06-15) re-organises Settings around **modes** rather than subsystems, with a per-mode storage contract:

| Mode | Storage role |
|---|---|
| **Global** | App / import / data / chunking fields only — no reader playback or display |
| **Standard Reader** | The full reader field set |
| **Read While Working** | **Override model** — persists only deltas over Standard Reader plus RWW-only fields |
| **Transmute** | **Deferred** (wave 1) — reserved, still served by `transmuteConfig.ts` |

Two problems had to be solved before any UI work (issues 04–05):

1. The flat blob has no notion of "which mode owns this field", so a mode-scoped editor cannot be built on top of it cleanly.
2. RWW inheritance lived as hand-written merge logic in one IPC handler. Any second consumer (a renderer-side preview, Quick Settings) would have to duplicate that merge, inviting drift.

## Decision

Introduce a **mode-scoped settings store** plus a **pure resolver** (the "unified Settings handler"). The flat `Settings` object remains the canonical *effective* shape consumed by the reader engine and existing UI; the store is the new *authoring/persistence* shape.

### Store shape

```ts
type SettingsMode = 'global' | 'reader' | 'rww'

interface SettingsStore {
  global: GlobalSettings              // app/import/data/chunking + read_while_working_enabled
  reader: ReaderSettings              // full Standard Reader profile
  rww: Partial<ReaderSettings> & RwwOnlyFields  // overrides (deltas) + overlay/tray fields
  // transmute: reserved — not owned by the store in wave 1
}
```

The scope membership of every flat key is declared once in `src/shared/settings.ts` as `GLOBAL_SETTING_KEYS`, `READER_SETTING_KEYS`, and `RWW_ONLY_KEYS`. These three lists are disjoint and together cover every key in `DEFAULT_SETTINGS` **except** the six flat `rww_*` override keys, which are not owned by any scope: they are projections of reader fields handled separately by `RWW_OVERRIDE_FLAT_TO_READER` (see below). So the projection is lossless because the scope partition is total over the non-override keys *and* the override map accounts for the remaining six.

### Field classification

- **Global:** `theme`, `logo_style`, segmentation (`segmentation_*`, `auto_chapter_detection`), `summaries_initialized`, chunk rules (`chunk_rule_*`), `read_while_working_enabled` (app feature toggle, per PRD), `custom_transmute_presets` (parked here while Transmute is deferred).
- **Standard Reader:** all playback/display fields (`bpm`, `words_per_stack`, `stacks_visible`, `stack_gap`, `font_*`, `pause_at_*`, `highlight_*`, `highlighting_mode`, `lines_*`, `view_style`, `show_chunk_dividers`, `stack_*_offset`, `metronome_enabled`, `tap_to_read*`, `lock_at_wpm`, `target_wpm`) plus reader preset collections (`custom_palettes`, `custom_text_presets`, `custom_font_presets`, `custom_playback_presets`, `custom_reader_configs`).
- **RWW-only:** `read_while_working_shortcut`, `read_while_working_exit_shortcut`, `read_while_working_window_width`, `read_while_working_window_height`, `read_while_working_restore_clipboard`, `custom_rww_playback_presets`.
- **RWW overrides (wave 1):** six flat `rww_*` keys map to their reader-field counterparts via `RWW_OVERRIDE_FLAT_TO_READER`: `rww_bpm`→`bpm`, `rww_words_per_stack`→`words_per_stack`, `rww_stacks_visible`→`stacks_visible`, `rww_lines_enabled`→`lines_enabled`, `rww_lines_count`→`lines_count`, and `rww_font_size`→`font_size`. The first five are legacy keys; `rww_font_size` was minted in wave 1 for Quick Settings triplet parity. The store type permits a full `Partial<ReaderSettings>`, but future override expansion should prefer store-native persistence over adding more flat keys.

### Override (inheritance) semantics

`store.rww` persists **only the reader fields it overrides**. A reader field **absent** from `store.rww` inherits the **live** Standard Reader value **at read time** — there is no copy-on-write of the reader blob into RWW. Clearing an override **deletes the key** (rather than writing the inherited value), so subsequent Standard Reader edits keep flowing through.

### Resolver (single source of truth)

`src/shared/settingsHandler.ts` is pure (no IO, Electron, or React) so it is shared by main and renderer:

- `resolveEffectiveSettings(mode, store): Settings` — `global`/`reader` return the full flat projection of the store (`flattenSettingsStore`); `rww` applies overrides over the live reader value (`rww[field] ?? reader[field]`), **exactly reproducing** the historical `rww_x ?? x` merge.
- `setRwwOverride(store, field, value)` / `clearRwwOverride(store, field)` / `hasRwwOverride(store, field)`.

`ipcHandlers.ts` `rww:getTemporarySession` now delegates to the resolver; the hand-written merge is deleted.

### Persistence and migration

- On disk, `StoreData.settings` is the **nested store**. `database.ts` migrates on load via `settingsStoreFromFlat`, which accepts **either** a legacy flat `settings` object **or** an already-nested store and normalises both through `parseSettings`.
- The bridge keeps every existing consumer unchanged: `db.getSettings()` returns `flattenSettingsStore(store)` (flat) and `db.saveSettings(patch)` re-projects → merges the flat patch → re-splits (so `rww_*` patches route into `rww` overrides). `db.getSettingsStore()` / `db.saveSettingsStore()` expose the native store for the handler.
- **Idempotent:** `settingsStoreFromFlat(flattenSettingsStore(store))` deep-equals `store`; `flattenSettingsStore(settingsStoreFromFlat(flat))` deep-equals `parseSettings(flat)`.

### Export / import shape

`export:all` / `import:json` continue to use the **flat** `Settings` payload (via `db.getSettings()` / `db.saveSettings()`), so exported files stay backward/forward compatible across this change. The nested shape is an on-disk and in-memory concern only.

## Relationship to ADR-0002

ADR-0002 (preset-based settings UI) is **superseded as a UI pattern** by the ADR-0008 storage model and the later ADR-0009 shell/UI changes. The issue 04–05 mode-chip + Simplified/Advanced Settings UI was an intermediate authoring surface; issue 09 flattened Settings into app preferences, moved Reader tuning to the Reader defaults editor / live Reader drawer, and moved RWW management to the Read While Working Console. The durable part of this ADR is the mode-scoped store, resolver, RWW override semantics, and lossless flat/nested bridge.

ADR-0002's *schema/validation* stance (single `DEFAULT_SETTINGS`, `parseSettings`) is **retained and reused** here — `parseSettings` remains the validation funnel. ADR-0002 is not deleted; this ADR records the storage-model supersession.

## Consequences

**Positive**
- RWW inheritance is defined in exactly one pure function, shared by main and renderer.
- Mode-scoped editing (issues 04–05) has a real data contract instead of guessing field ownership from a flat blob.
- Legacy users migrate transparently; no export-format change.

**Negative**
- Two shapes (flat effective vs nested store) coexist; the flatten/split bridge must stay lossless (guarded by idempotency tests).
- Wave-1 RWW overrides use six flat projections, including the wave-1 `rww_font_size` key. Widening the override set further should move toward store-native persistence rather than minting more `rww_*` flat keys.
- Transmute still uses the separate `transmuteConfig.ts` localStorage seam; the store reserves a Transmute slot but does not own it yet.

## Notes

- Frozen `fasttrack` identifiers and "no data leaves the device" (ADR-0007) are untouched: this is an internal storage reshape with no new network path and no identifier changes.
- Historical note: issue 04 added **panel-local** chip state (`'global' | 'reader' | 'rww'`), but issue 09 removed those mode chips from the Settings page. Do not reintroduce them from this ADR. `NavigationContext.settingsMode` remains current and still selects only the *entry path* (`'global' | 'transmute'`) for main Settings vs the Transmute reader-config editor.
