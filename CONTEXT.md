# WingletReader — Domain Context

## App Identity

**WingletReader** is a local-first desktop speed-reading application built with Electron, React, and TypeScript. The primary target platform is Windows 10/11.

**"Offline" means _no user data leaves the device_** (ADR-0007), not zero network traffic. Installed packaged builds run one startup `electron-updater` check against the public binary-only GitHub Releases repo; dev builds and portable-mode packaged builds skip the updater. There is still no in-app feedback sender. ADR-0007 accepts two alpha carve-outs, neither of which may send user data: the updater version check and a future user-initiated "Send feedback" action. Do not describe feedback as shipped until it exists. Adding any automatic telemetry, analytics, or crash reporting contradicts the local-first promise and requires an ADR.

> The package name `fasttrack` and any file references to "FastTrack" are legacy artefacts of the original working title. The canonical name is **WingletReader**.
>
> ⚠️ **Some `fasttrack` identifiers are frozen for back-compat — do NOT rename them.** Renaming them orphans every existing user's data/config. Frozen: the data filename `fasttrack-data.json`, the AppUserModelId `com.fasttrack.reader`, and the localStorage keys `fasttrack.transmute.*` (all in `src/main/index.ts` and `transmuteConfig.ts`/`TransmuteView.tsx`).
>
> Separately, **user-facing "FastTrack" strings are bugs** and should read "WingletReader". Pass 1 issue 03 replaced the known leaks in window/document title, loading/sidebar labels, showcase copy, idle logo alt, summary setup copy, and export/import dialog titles. Internal filenames such as `FastTrackShowcase.tsx` may remain because they are not user-facing. Do not rename frozen storage identifiers while fixing user-facing copy.

### How this document is organized

This file is the project's **domain reference**: stable vocabulary, invariants,
and tombstones (removed concepts kept as reminders). It is deliberately durable —
it does not track day-to-day work state.

For the reasoning behind individual decisions, see the numbered records in
[`docs/adr/`](docs/adr/). For the visual language, see
[`docs/design-system.md`](docs/design-system.md). For a file-level map of where
each feature lives, see [`docs/architecture-map.md`](docs/architecture-map.md).

---

## Glossary

### Stack
The fundamental display unit of the reader. A Stack is a fixed number of words (configured by `words_per_stack`) shown together in the reading viewport for exactly one BPM beat. The reader advances one Stack per beat.

`WPM = BPM × words_per_stack`

### Tap to Read
An advance mode (`tap_to_read: true`) where playback does not auto-advance on the BPM timer; the user presses a configured **advance key** (`tap_to_read_key`, default `Space`) to step one Stack. Mutually exclusive with BPM auto-advance for the same session. Key capture uses `BindingCaptureRow` and stores keyboard `e.code` values (e.g. `KeyJ`) or mouse `MouseN` tokens.

### Live rewind
During playback or pause, a bound key or mouse button (`live_rewind_key`, default `Mouse1`) rewinds by `live_rewind_stacks` stacks without leaving the session. Reserved keys owned by `readerKeymap.ts` cannot be bound; the advance key is also blocked when rebinding live rewind. Runtime dispatch lives in `Reader.tsx`; capture UI uses `LiveRewindKeyRow` / `BindingCaptureRow`.

### Input binding
Reader settings that store keyboard `e.code` strings or mouse tokens (`Mouse1` = primary, `Mouse2` = secondary, `Mouse3` = middle). Pure helpers in `engine/readerBindings.ts`; `readerKeymap.ts` resolves keyboard actions separately. `formatBindingCode` turns stored codes into display glyphs in settings UI.

### BPM
Beats per minute — the speed unit for the reader. One Stack is displayed per beat. Not to be confused with WPM; WPM is derived from BPM and words_per_stack.

### Segment
An auto-detected or user-navigable chapter/section of an imported text. The `textSegmenter` engine detects Segments from structural headings (markdown `#`, "Chapter N", "Part N", all-caps lines) or generates them by word-count chunking if no structure is found. Segments are stored in the data store and displayed in `SegmentPanel`. Users can rename Segments.

**User-facing noun is chosen by text origin (ADR-0023), not by structure.** A **seeded / default** text (`seed_id` present, from the ADR-0018 bundle) calls its Segments **"chapters"**; a **user text** (`seed_id` absent) calls them **"contents"**. This single `seed_id` axis governs the card "View" button, the count line, and the `SegmentPanel` header/Add button. The **"Add Content"** append affordance exists for **user texts only** (seeded books are complete curated works); the card `+` shortcut is gone — Add lives inside the view. `sourceType` (`detected_heading`/`generated_chunk`) still drives *behavior* (chapter-nav, continue-reading) but no longer drives *wording*.

### Category
A library-level folder-like grouping for texts. Each text belongs to exactly one Category (`category_id`), and the Library chip row filters the flat text list by Category. Categories do not split text content and do not replace chapters.

**Category reassignment lives in the Contents view, not the Library card (ADR-0027).** The Library card shows the assigned Category as an **inert display chip** only; changing a text's Category is done from its **Contents view** (above the title). The top-of-Library Category **filter tabs** are unaffected.

### Contents view *(ADR-0023 surface; navigation model ADR-0027)*
The per-text management surface (`SegmentPanel`) reached from a Library card — the standalone book screen listing its Segments (chapters/contents per the ADR-0023 origin vocabulary), its bookmarks, the user-text **"+ Add Content"** affordance, and (ADR-0027) the book's **Category** selector above the title. Hosted at `view === 'library'` with `libraryTab === 'chapters'`. Its top-left corner is the **up-level control** returning to the Library list (see Home control), **not** the dove; the former inline `← Library` header button is removed. The requirements doc's informal **"text card"** maps to this surface — prefer **Contents view**.

### Bookmark *(ADR-0024)*
A persistent, user-placed mark on a **specific place** in a text, anchored by a stable **`wordOffset`** (the `TextSegment.startWordOffset` precedent — never a `stackIndex`, which shifts when `words_per_stack` changes). Target record shape: `Bookmark = { id, textId, kind, wordOffset, label, createdAt }`. A **Normal** bookmark is a saved starting/reference position and a **targeted insertion mechanism** — the user jumps ("inserts") the reader's playhead to it; a text has **1..n** normals. See **Goal bookmark** for the other `kind`. Resolves to a live `stackIndex` only at use time via `resolveWordsToStackIndex`. ADR-0024 is **fully implemented** — store CRUD (`database.ts`), IPC/preload/`env.d.ts`, reader popover (`BookmarkPopover`) with kind-picker + goal forward-rule, scrubber goal marker + normal ticks, text-view word selection, and the Library `SegmentPanel` bookmarks section — and the legacy stop target is removed.

### Goal bookmark *(ADR-0024)*
The `kind: 'goal'` **Bookmark** — the passage where the user intends to **stop** the current session. **Exactly one per text** (setting a new goal replaces the prior one; enforced as a handler invariant). Must be placed **ahead of the saved reading position** (a never-read text is treated as word offset 0; the forward rule is validated renderer-side, where the live stacks + saved position exist). When playback **crosses** it, playback stops and opens the **Session dialog** (Target variant — ADR-0026) and the goal **deletes itself**, freeing the slot; a **manual scrub** past it does not delete it. Inherits the auto-stop-on-crossing behavior formerly owned by the Stop target. User-facing label is **Target** (ADR-0024 amendment); `goal` is the code/`kind` term.

### Reading session *(ADR-0026)*
A single continuous reading run of one text. It **begins** when playback starts from rest (Play or Resume-from-saved) and **ends** when playback stops (Stop, Target reached, or natural end) or the Reader is left. **Pausing and resuming do not end a session** and do not start a new one. Every session carries a **session baseline**.

### Session baseline *(ADR-0026)*
The saved reading position as it stood at the **start** of the current reading session — the point that **"Exit without saving"** restores so the reader can reread from their last deliberate save. Exactly **two positions** are tracked for an active session: this baseline and the live current position (continuously auto-saved on every pause/leave). There is no deeper history.

### Session dialog *(ADR-0026)*
The centered, focus-trapped **modal** shown inside the Reader stage when a reading session ends, giving the reader guided follow-up actions instead of an abrupt "Finished." Distinct from the anchored **Popovers** (BookmarkPopover, QuickSettingsPopover). Opening it **pauses playback and holds position** (no reset-to-start until the reader actually discards). Three variants: **Stop** (Save & Exit · Exit without saving · Abort), **Target** (Continue reading · Set a new target · Save & Exit · Exit without saving), and **End** — the natural finish (Save & Exit · Exit without saving). **Save & Exit** commits the current position; **Exit without saving** restores the session baseline; both route to the **Library**. The top-left dove is unchanged (routes to the **hub**, auto-saving on the way out). Actions are stacked safe-on-top and colour-coded by the ADR-0012 role system (blue primary, `--danger` destructive, neutral ghost). Component: `SessionDialog.tsx`, variant `stop | goal | end`.

### Transmute
The video-export feature. Transmute converts an imported text into a speed-reading video file (MP4). `transmuteConfig.ts` is the sole write path for all Transmute configuration; callers do not write directly to localStorage or the data store. **"Make Video" is the user-facing label** for this feature on the hub tile and its launchpad; **"Transmute" remains the domain and code term.** Transmute persists only a global config blob (`fasttrack.transmute.readerConfig.v1`) — `textId`/`segmentId` are stripped on write, so there is **no persisted "last project"**; the Make Video launchpad therefore offers source selection (choose a saved text, or paste/upload new text without a Library save) rather than reopening a previous project.

### Read While Working (RWW)
Always-on-top overlay reading via `TemporaryReaderApp` while the user works elsewhere. **"Overlay Reader"** is the user-facing label; **RWW** / `read_while_working_*` keys / IPC names stay in code (ADR-0017). Hub tile and Settings card both open **Overlay Reader settings**; arming uses the main-process enable/hide-to-tray path. Packaged builds expose a persistent tray **Start Overlay Reader** item (Pass 2 **07**); dev builds show tray only while RWW is armed.

### Standby pill
A small, frameless, always-on-top **draggable pill window** shown for the whole duration that Overlay Reader is armed (ADR-0017). It signals the mode is running in the background and, on click, **exits/disarms** the mode (reusing `exitReadWhileWorkingMode`). Gated by the RWW-scoped setting `read_while_working_show_standby_control` (default **on**); off falls back to the tray/shortcut exit. Its dragged position persists across sessions (`read_while_working_standby_x/y`), clamped to the visible work area on create. **Target shape:** rectangular (low-priority visual pass; current shipped shape may remain pill-like until that pass lands).

### Overlay Reader settings *(formerly Read While Working Console)*
The Settings subview for arming/configuring RWW — not the overlay window itself. Entry: Settings → Overlay Reader or hub tile (opens Settings at this subview). Same subview chrome as Reader defaults (up-level back, no gear). **Top-right host cluster:** square Start/Exit control + terse state indicator (**Ready** / **Blocked** / **Armed** / **Starting** / **Exiting**). Two tabs: **Overlay** (Standby pill, shortcut recorders, window size) then **Reader configuration** (RWW-scoped playback/grid/font via `RwwSettingsEditor`). Layout/chrome/no-scroll contracts: **ADR-0021**. Code: `RwwSettingsBody.tsx`, `RwwSettingsEditor.tsx`, `rwwSettingsLayout.ts`.

### TemporaryReaderApp
The floating overlay window component used by Read While Working. Rendered as a separate Electron window with minimal chrome.

### Passage / Passage Extract
A contiguous slice of the Stack array used for plain-text context windows. (ADR-0024 removed the former stop-target calculation from this path.)

### Page *(text view)*
The rendering unit of the **plain-text view** (`TextViewPanel`, the reader's `showPlainText` surface — not the RSVP Stack viewport, and not the DOCX "Formatted" view). The plain-text view materializes **one Page at a time** instead of the whole document, so live DOM stays bounded on low-end hardware. A Page is a **paragraph-aware slice of ~500 words** (whole paragraphs accumulated until the target is reached, never splitting a paragraph; a runaway single paragraph is hard-cut at a larger cap). Page boundaries are derived **once when a text is engaged** and cached; they are not recomputed per playback beat. During playback the visible Page **auto-follows the playhead** (flips forward as reading crosses a boundary); the user may also page **prev/next** manually and use **Locate** to snap back to the playhead's Page. A Page is a *view* concept only — paging never moves the playhead. Bookmarks still anchor to a stable `wordOffset` (see **Bookmark**); a bookmark's Page is looked up from its `wordOffset`, so Pages carry no persistent identity of their own.

### Palette
A named colour scheme for the reading viewport (background, text, highlight colours). Defined in `palettes.ts`.

### Profile
A named snapshot of the **full** Standard Reader field set (playback + display). Backed by `custom_reader_configs` (`reader-configs.ts`) for legacy saved data and Transmute reuse; the former top Profiles row in Settings → Reader defaults was removed on 2026-07-03 so the defaults editor can stay a cohesive "see everything" screen. Profiles replace the former per-dimension preset lists.

### Settings (flat app preferences)
Flat app-preferences surface (ADR-0008/0009/0014): **5-card landing** (Appearance · Reader defaults · Overlay Reader · Import · Data). Auto-save everywhere — no Save button. No mode chips or Simplified/Advanced density. Reader tuning → **Reader settings editor**; RWW tuning → **Overlay Reader settings**. Storage contract unchanged (ADR-0008); `NavigationContext.settingsMode` is entry-path only (`global` vs `transmute`).

> ⚠️ **`SettingsMode` is two different types.** The **entry-path** `SettingsMode` (`NavigationContext.tsx`) is `'global' | 'transmute'`. A **separate, unrelated** store-scope `SettingsMode` (`src/shared/settings.ts`, re-exported by `settingsHandler.ts`) is `'global' | 'reader' | 'rww'` — the persistence/inheritance scope. Same name, different value sets; import the one that matches your layer (nav vs store) and do not conflate them.

### Reader settings editor (two tabs, two hosts) *(ADR-0019)*
Single Standard Reader config editor (`ReaderSettingsEditor.tsx` + `readerSettingsLayout.ts`). **Two hosts:** Settings → Reader defaults (optional live preview) and in-Reader drawer (preview off). **Two tabs:** Playback & Grid Layout · Display. No calm-grid drill-in, no top Profiles row. Quick Settings and Transmute-entry `ReaderConfigPanel` are separate. RWW uses parallel **`RwwSettingsEditor`**. Full layout: ADR-0019.

### Grid Layout
The right column of the editor's **Playback & Grid Layout** tab: the pure grid parameters (`words_per_stack`, `stacks_visible`, `lines_enabled`, `lines_count`). `words_per_stack` lives here — moved off Playback — because it shapes the grid, not the pace. Supersedes the calm grid's **Layout** card.

### Display
The editor's second top tab — a two-column screen, not a subtab switcher. The left column stacks **Text & Highlighting** above **Spacing**; the right column contains **Colors** and, in the Settings host only, the optional live preview below Colors.

### Text & Highlighting
The Display section for word rendering and the active-stack highlight: font size, font family, highlight on/off, highlight mode, and the panning chunk-size reveal-row (relocated from the retired power view).

### Spacing
The Display left-column section for stage geometry: row gap, stack gap, and the vertical/horizontal stack offsets. Supersedes the **Alignment** group.

### Instrument taxonomy
The shared control kit (ADR-0014 §3) used throughout the Settings and RWW Console surfaces (`settings/instruments/` — `SliderField.tsx`, `Stepper.tsx`, `Segmented.tsx`). Types: **Toggle / Stepper / Slider+number / Segmented / Colour / Preset chooser** — each setting is bound to the instrument that fits its data range.

### Design system *(ADR-0022)*
The canonical visual reference is [`docs/design-system.md`](docs/design-system.md). It consolidates role-based colour (ADR-0012), card/surface patterns, the **instrument kit**, and three **asset classes**: **DisplayKit tile sprites** (hub glyph PNG/GIF pairs), **theme-aware bitmaps** (Reader playback dark/light PNG pairs via `ReaderButtonIcon`), and **chrome icons** (single-ink SVG via `ChromeIcon`, `fill="currentColor"`). Card **faces** use theme-aware background PNGs (`--hub-tile-face`, `--settings-tile-face`). Static setting explanations use **`SettingHintTrigger`** (`?` tooltip) on **`SettingsLabel`**. Protected brand surfaces (splash, hub badge, idle dove, Return vs Home dove) are listed in the design-system doc §8.

### DisplayKit tile sprite
A hub-tile glyph asset pair (`idle` PNG + optional `hover` PNG/GIF) with fixed palette baked into the art. Lives under `assets/hub-tiles/`. Theme-agnostic — the same file renders in light and dark. Spec: `Refernces/Design Overhaul/01-hub-tiles.md`.

### Card face
The theme-aware background PNG on hub tiles (`.hub-tile`) and Settings gateway cards (`.gsc-card`). CSS tokens `--hub-tile-face` / `--settings-tile-face` swap per theme; `--hub-tile` remains the fallback fill colour under the art.

### Chrome icon
A single-ink SVG control glyph drawn at 24×24, recoloured by CSS via `currentColor`. Used on Settings landing cards and future nav/reader chrome replacements. Component: `components/icons/ChromeIcon.tsx`. Spec: `Refernces/Design Overhaul/02-chrome-icons.md`.

### Setting hint trigger
The circled **`?`** control on a settings row label that reveals static explain copy on hover or focus (`SettingHintTrigger`). Live readouts and validation stay always visible in the label's feedback slot (`SettingsLabel`).

### Preset row
A pinned named-Profile chooser that formerly sat at the top of settings editors. The Reader-defaults preset row (`readerConfig/ReaderPresetRow.tsx`, **Calm / Fast / Focus / Skim**) was removed from the live UI on 2026-07-03; the component file and its test lingered orphaned (test-only) and were deleted on 2026-07-13. The RWW built-in preset chips (**Glance / Subtle**, `settings/RwwPresetRow.tsx`) are removed by the Overlay Reader settings overhaul; the **Copy from Reader defaults** bridge survives as a compact secondary action, not a preset row.

### Summary — active flow and archived view
The word "summary" covers two separate concepts that must not be conflated:

- **Post-reading summary flow** — the active prompt → setup → save sequence offered when a reading session *ends*. This is part of a **reading session** and therefore belongs to the Reader, not the Library.
- **Summaries view** — an archived standalone screen (`view === 'summaries'`) that showed saved summaries for a chosen text. Wave 1 cut all Library entry points and moved `SummaryView.tsx` under `src/renderer/src/_archived/components/`; issue 11 removed the active shell render branch. The dead `summaries` route token now redirects to Library through `alphaChrome.resolveAlphaView`. New work should treat the standalone view as inactive until a future Reader/summaries design reactivates it.

These share the word "summary" but have different homes: the active flow is Reader domain; the archived view is not an active Library affordance.

### Splash
The branded startup window shown during **cold start only** — the gap between process launch and the main window being ready to paint. Its job is brand communication, not progress reporting. It is a separate, deliberately lightweight window, not an in-app screen or a reused Reader route, because it must appear *before* the main renderer exists. Not shown on tray re-show, second-instance relaunch, or Read While Working temporary-reader windows. The canonical term is **splash** (the brainstorm word "bootloader" is informal only — avoid it in code and docs, as it collides with the firmware sense).

### Portable USB mode
Run-in-place distribution (ADR-0016): `WingletReader.portable` marker beside `process.execPath` redirects `userData` to `<exe-dir>\data` before the JSON store opens. Frozen `fasttrack` identifiers unchanged. Assembly: `npm run dist:portable`; in-app **Create Portable Drive**; NSIS portable installer mode. Portable skips `electron-updater`.

### Brand floor
The earliest splash animation frame at which the brand is both *legible* and *looks intentional as a stopping point*. It is the **minimum** the splash must reach before the app is allowed to reveal the main window. It is a floor, not a fixed cut point: the reveal happens once the main window is ready **and** the brand floor has been reached, whichever is later. (Supersedes the brainstorm's "brand beat," which conflated the floor with the full intro end.)

### Hub
The console-style launcher that is the application's home surface (the default `AppView`, `view === 'hub'`), replacing the former Library-as-home and the removed `ShellTopBar`. The shipped Design Run 2 hub (ADR-0013 issues 01-02) is a flat monochrome, centered **3x2** grid of compact square **tiles/cards** with descriptions in place on each card; there is no shared LCD strip, desk gradient, or bezel plane. Reading is the star by position and default focus: the Read tile is top-left and opens the Reader directly, resuming the saved session when one exists. The hub identity is the enlarged cobalt dove+wordmark badge rendered identically in both themes (no light-mode invert). The **Library** tile is the sixth tile and opens the standalone Library management screen.

### Tile
One of the equal, square, sharp-edged buttons/cards on the **hub**. Current shipped roster/order: **Read · Library · RWW** / **Import · Make Video · Settings**. Read and RWW are VIP red; Library is blue/neutral because it is a management destination, not a VIP reading mode. Tiles carry terse labels plus short in-place descriptions. Interaction is mouse-first (hover/focus highlights, click activates) with a secondary keyboard fallback.
_Avoid_: "block" (the design-charter's informal word), "menu item". Not to be confused with the dissolved Library list/import/chapters tabs.

### Home control (dove)
The small two-tone dove mark fixed in the **top-left** corner of inner screens (Library, Make Video, Transmute, RWW Console, and the Settings landing) that returns to the **hub**. It is *additive* to any screen-local "back" (dove = all the way home; local back = up one level). Inner screens also carry the mirrored top-right gear control to Settings, except Settings itself. The **Reader** is exempt from shell chrome and keeps its own full-screen chrome and Back; ADR-0013 keeps that exemption while changing the Reader's internal stage model.

The top-left corner is, more generally, an **"up one level"** slot. At the top inner level "up" is the hub, so the corner shows the dove. On a **nested Settings sub-page** (Reader defaults, Import, Data) "up" is the **Settings landing**, and on the Library **Contents view** "up" is the **Library list** — so in both cases the corner instead shows an **up-level control drawn with its own distinct sprite — not the dove** — that returns one level up. The shared component is **`UpLevelControl`** (ADR-0027 generalised it from the former Settings-only control), configured per host with its own label/target and the same sprite. This keeps "dove → hub" globally constant: the dove never silently changes destination, and there is no nested page where the same dove glyph means two things. On these sub-pages/sub-views the corner control *is* the back — it replaces both the dove and any separate in-flow back button.

The **overlay-reader** Settings subview is reachable from **two** entry points (the hub Overlay Reader tile and the Settings landing card), so its up-level target is **origin-aware** (ADR-0027): entered from the hub it returns to the **hub**; entered from Settings it returns to the **Settings landing**. Origin is tracked as `settingsSubviewOrigin` in `NavigationContext`.

### Reader persistent frame *(ADR-0013)*
Design Run 2's model for the Reader's surrounding flow, complete as of issue 04. The Reader is a persistent frame (`ReaderTopbar`, `ReaderScrubber`, `ReaderControls`, `ReaderKeyhints`) whose **stage** swaps among states; the live playback path in `Reader.tsx` still assumes an engaged `activeText` and the no-engaged-text states never run `usePlayback`. The shared no-text scaffold is `reader/ReaderInertFrame.tsx` (composes the extracted children with zeroed/inert props):
- **Empty library (zero texts):** `ReaderEmptyFrame` → inert frame with an import disclaimer; every inert control and the primary CTA route to Import.
- **Texts exist, none engaged:** the inert frame hosts the **in-frame library browse** (`ReaderLibraryBrowse`), where picking a text engages it.
- **Engaged text:** the live `Reader`. Its idle stage (`ReaderIdle`) keeps only the resume/ready summary; picking another text is no longer a local toggle there.

The in-frame library browse (`reader/ReaderLibraryBrowse.tsx`) hosts the **same** standalone `Library` list inside the frame — one list, two hosts (hub Library tile → standalone management; Reader → in-frame browse). The enter/exit is one **centered Browse-library ⇄ Back-to-reading** toggle in the control zone (`.reader-browse-btn`), a 60×60 theme-paired Library tile sprite rendered via `ReaderButtonIcon` (`assets/reader-tiles/library-toggle-{dark,light}.png`); the interim `ChromeIcon` `reader-browse-placeholder` is retired. Entering browse pauses playback. The former in-place recent-texts picker (`IdlePicker`, `ReaderEntryIdle`, the `.reader-idle-pick*`/`.reader-idle-entry*` CSS) is removed.

### Reader layout fit-solver
The live RSVP Stack viewport uses a pure fit-solver (`solveReaderLayout`) against the measured stage box, not a minimum-size stage lock. The solver keeps `stacks_visible` and `words_per_stack` unchanged, sizes font against the widest Stack in the current configured block, reclaims stack/row spacing by axis, may reduce visible line count for height pressure, and only drops below the 18px comfort floor as the final no-clip release valve. User offsets are clamped to the remaining slack so the rendered Stack grid stays fully inside the viewport. `document.fonts.ready` triggers a re-solve so late-loaded font metrics do not leave stale sizing.

### Reader idle logo (idle dove) — *protected brand surface*
The two-tone dove shown on the **Reader idle screen** (`ReaderIdle`, play state `idle`). It is **sanctioned brand identity, on the same footing as the Splash showcase** (2026-06-19, maintainer): a deliberate brand moment, not incidental chrome, and **must not be "cleaned up" into a plain text wordmark again.** UI-overhaul issue 10's pixel-identity pass had replaced it with a `.reader-idle-wordmark` text element that did not branch on identity; the maintainer reversed that for this surface only (`81eff20`).

The idle logo is now **canonical and deterministic** — a single hard-wired asset (`assets/logo-modern.png`), rendered with one `.reader-idle-logo` class. ADR-0029 removed the `logo_style` toggle: users switch **theme (light/dark) only**, never logo style. There is no per-style branch, no `body[data-logo-style]` mirror, and no `.reader-idle-logo--modern` / `--classic` CSS. This aligns the idle logo with the otherwise-deterministic identity rule (the **hub** identity and the favicon/showcase paths, ADR-0011 §6).

Do not reintroduce a stored logo-style branch or fold the idle logo into a plain text wordmark without a maintainer decision. Related: **Home control (dove)** above (a different dove — the Home affordance), and the **Splash** showcase (`docs/adr/0010-native-splash-window.md`).

## Feature Status

| Feature | Status | Notes |
|---|---|---|
| Standard Reader | **Active** | Core reading mode |
| Transmute (video export) | **Active** | `transmuteConfig.ts` is sole write path |
| Read While Working (RWW) | **Active — in development** | `TemporaryReaderApp` overlay window |
| Segmentation | **Active** | Auto-detect or chunk by word count |
| Post-reading summary flow | **Off (alpha v1)** | Reader-owned setup/prompt/save flow; guarded by `alphaChrome.postReadingSummaryEnabled: false` (Pass 2 **01** done); re-enable post-alpha via flag |
| Bookmarks | **Active — implemented** | ADR-0024; word-offset Normal + Goal bookmarks replaced the session-only Stop target. Full cascade landed (store/IPC/reader popover/scrubber markers/text-view selection/Library section); `stopTargetCalculator.ts` + `StopTargetPanel.tsx` removed. |
| Standalone Summaries view | **Dead / archived** | Entry points cut in wave 1; `SummaryView.tsx` archived |
| Alpha installer / auto-update / feedback | **Partial — updater verified** | ADR-0007; `electron-builder` + NSIS `.exe` shipped (Pass 1); `electron-updater` packaged startup check shipped; in-app feedback not yet. |
| Portable USB mode | **Active — implemented** | ADR-0016; marker-gated `userData` redirect, `dist:portable`, Settings -> Data creator, and NSIS Portable-to-USB mode. Installer-mode real-machine HITL remains the operational gate before relying on it for testers. |
| Script Builder | **Dead / archived** | Code archived in `src/renderer/src/_archived/` |
| Trailer Reader | **Dead** | Code archived in `src/renderer/src/_archived/` |
| Primer Panel | **Dead** | Code archived in `src/renderer/src/_archived/` |

---

## Data Layer

The data store is a **pure JSON file store** — a single atomic-write `.json` file in Electron's `userData` directory. In installed mode, Electron owns the normal per-user `userData` path. In portable USB mode (ADR-0016), `userData` is redirected before database construction to `<exe-dir>\data`, so the same JSON file, settings storage, logs, and Electron caches travel with the portable copy. There is no SQLite database and no native compilation step.

> The README and early commit history reference `better-sqlite3`. This was replaced. Do not re-introduce SQLite without an ADR.

Settings have two intentional shapes (ADR-0008): on disk and inside `database.ts`, `StoreData.settings` is the nested mode-scoped `SettingsStore`; compatibility APIs (`db.getSettings()`, `db.saveSettings()`, export/import) still expose or accept the legacy flat `Settings` shape via a lossless flatten/split bridge. Do not bypass `settingsStoreFromFlat`, `flattenSettingsStore`, or `settingsHandler.ts` when touching Settings persistence or RWW inheritance.

---

## Build Artifacts — edit source only

The `composite: true` tsconfigs (no `outDir`) make TypeScript emit a `.js` + `.d.ts` next to **every** `.ts`/`.tsx` source file (e.g. `transmuteConfig.js` beside `transmuteConfig.ts`). These may exist on disk locally but are **gitignored** (`src/**/*.js`, `src/**/*.d.ts`).

- **Always edit the `.ts`/`.tsx`.** Any sibling `.js`/`.d.ts` is stale generated output — never edit it.
- The one hand-written exception is `src/renderer/src/env.d.ts` (un-ignored, tracked).
- Both **vitest** and the **electron-vite renderer** set `resolve.extensions` so `.tsx`/`.ts` win over a stray sibling `.js`. Don't reorder either.
- Portable installer layout files under `build/portable-layout/` are generated by `scripts/generate-portable-layout.mjs` from `scripts/portable-layout.mjs` and are gitignored. `build/installer.nsh` is the hand-authored NSIS include and must be tracked source.

---

## Architecture

Three layers: **Main** (Node/Electron, JSON store, IPC, RWW windows) → **Preload** (`window.api`) → **Renderer** (React provider tree: Navigation → Settings → Library → Reader).

Context write rule: outside `LibraryContext`, call only `setActiveText`, `openSegments`, `refreshTexts`.

Optional file-level map (entry points by area): [`docs/architecture-map.md`](docs/architecture-map.md).

---

## Deprecated terms — do not reintroduce

Concepts that were removed or superseded by a decision. They are kept here as tombstones so they are not re-invented; each points at the deciding ADR. None are live surfaces — describe current behaviour with the glossary above, not these.

- **Script** *(archived — ADR-0004)* — a compiled, time-stamped sequence of Stacks and pause beats meant to drive both live playback and the Transmute renderer. Built, then archived; the five files are preserved under `src/renderer/src/_archived/`.
- **Preset** *(superseded as a UI concept — ADR-0008)* — formerly per-dimension named bundles (`custom_text_presets`, `custom_font_presets`, `custom_playback_presets`, `custom_rww_playback_presets`). Issue 05 removed these lists from the UI in favour of full **Profiles** plus separate **Palettes**. The stored keys and `*-presets.ts` engine modules remain for back-compat/validation (via `presetValidation.ts`) but are no longer surfaced; built-in **Palette** presets are the only named-bundle list still shown.
- **Triplet** *(superseded — ADR-0014)* — a named three-option control (Speed · Words per stack · Text size) shown in the old Simplified density. Both consumers were removed (issues 05, 06b) and `engine/simplifiedTriplets.ts` is deleted. The **instrument taxonomy** replaces it everywhere.
- **Simplified / Advanced density switch** *(removed — ADR-0014)* — an in-place toggle that changed control density without changing the route. Removed from every surface (issues 05, 06b); `components/settings/SettingsDensityToggle.tsx` is deleted. All settings surfaces now use the instrument taxonomy directly.
- **LCD detail strip** *(superseded — ADR-0012)* — ADR-0011's shared fixed "screen" below the tile row. ADR-0012 removed it; hub descriptions now live in place on each tile/card. Do not reintroduce a shared strip unless a future ADR reverses ADR-0012. (See also the Vocabulary to Avoid table below.)
- **Device face / Desk** *(superseded material model — ADR-0012)* — ADR-0011's terms for a contained console surface on a darker backdrop. ADR-0012 flattened the hub to one monochrome surface with square cards: no desk gradient, no bezel/inset depth, no pixel/LCD motif. Keep `--radius: 0` and the role-based colour system from ADR-0012/0013 (red = VIP reading + critical info, blue = interaction, gray = neutral).
- **Calm grid** *(superseded — ADR-0019)* — the Reader-defaults 5-card overview (Playback · Text · Layout · Highlight · Colours, `readerConfig/ReaderDefaultsCalm.tsx`) that drilled into a focused editor per card. Replaced by the two-tab **Reader settings editor**; the calm/power **tier** split is dissolved. Component removed.
- **Focused editor** *(superseded — ADR-0019)* — the per-group drill-in reached from a calm-grid card (`ReaderCalmGroupBody.tsx`). Gone with the calm grid; the two-tab editor shows every group without a drill-in. Component removed.
- **Power view ("Edit everything")** *(superseded — ADR-0019)* — the flattened all-groups escape hatch (`readerConfig/ReaderDefaultsPower.tsx`). Retired: after the restructure only `highlight_panning_chunk_size` was power-only, so it relocated into **Text & Highlighting** and the concept was dropped. Component removed.
- **Layout (Reader-config group)** *(renamed — ADR-0019)* — the calm grid's "Layout" card. Its grid parameters now live under **Grid Layout** in the Playback & Grid Layout tab. (The `SettingGroup` code key `'layout'` in `settingMetadata.ts` is retained as an internal grouping key — not user-facing.)
- **Alignment (Reader-config group)** *(renamed — ADR-0019)* — the calm grid's "Alignment" group (row/stack gap + offsets). Renamed to **Spacing** as a Display left-column section. (The `SettingGroup` code key `'alignment'` is retained internally.)
- **Unicode glyph placeholders (Settings landing)** *(superseded — ADR-0022)* — interim `◐`/`▤`/emoji badges on `.gsc-glyph`. Replaced by **`ChromeIcon`** SVGs recoloured via `currentColor`.
- **"chapters" / "parts" segment wording + per-row `chapter`/`part` badge** *(superseded — ADR-0023)* — the `SegmentPanel` header label and per-row badge that keyed the user-facing noun off `sourceType` (`detected_heading` → "chapters", `generated_chunk` → "parts"). The user-facing noun now keys off **text origin** (`seed_id`): seeded → "chapters", user → "contents". The per-row badge is removed entirely (redundant with the view header). `sourceType` is retained for *behavior* (chapter-nav, continue-reading) — it just no longer drives wording.
- **Card `+` "Add chapter" shortcut** *(removed — ADR-0023)* — the quick-action `+` on library `TextCard`s. Add now lives inside the view and only for user texts ("Add Content"); seeded books have no add affordance.
- **Stop target / `StopTarget` (`%` / time / words entry)** *(superseded — ADR-0024)* — the Reader-owned, **session-only** halt point entered as an abstract quantity (percentage / time / words) that `stopTargetCalculator.ts` resolved to a `stackIndex`, with an auto-stop effect and a scrubber marker. Replaced by the persistent, `wordOffset`-anchored **Goal bookmark** (see glossary). ADR-0024 removed the abstract-quantity entry model, `stopTargetCalculator.ts`, and `StopTargetPanel.tsx` entirely; the Goal bookmark inherits only the auto-stop-on-crossing behavior. Do not reintroduce the `%`/time/words stop entry.
- **Scale-lock (Reader stage minimum-size lock)** *(removed — VS-3 viewport-safe stack layout)* — the old Reader stage fit workaround forced a minimum stage size for dense Stack grids, which could make the stage wider/taller than its clipped parent and push text off-screen. The live Reader now uses the **Reader layout fit-solver** instead; do not restore a stage minimum-size lock for Stack fitting.
- **`lock_at_wpm` / `target_wpm` / `view_style` / `show_chunk_dividers`** *(de-UI'd but dormant — ADR-0019 §4)* — removed from every settings surface, including Quick Settings (Speed is always BPM). The stored keys are **retained, not migrated**; the reader no longer honours `view_style` (always `default`) or `show_chunk_dividers` (dividers always off), and `lock_at_wpm` was already ignored by playback. `wpmSolver`, the focal-points render path, and the divider render path are left dormant, not deleted. **Exception:** the Transmute/RWW-entry `ReaderConfigPanel`/`ReaderConfigEditorCore` still expose `view_style`/dividers — an out-of-scope follow-up flagged in ADR-0019.

## Vocabulary to Avoid

| Avoid | Use instead | Reason |
|---|---|---|
| "FastTrack" (user-facing/new code) | WingletReader | Legacy working title — but some `fasttrack` *identifiers* are frozen; see the App Identity caveat before renaming anything |
| "SQLite" / "better-sqlite3" | JSON file store | Replaced; re-introducing needs an ADR |
| "chunk" (user-facing) | Stack | "chunk" is internal to the segmenter |
| "RSVP" (user-facing) | speed-reading | Internal comment term only |
| "bootloader" / "boot animation" (code/docs) | splash | Informal brainstorm word; collides with the firmware sense |
| "brand beat" (operational) | brand floor | "Beat" conflated the cut minimum with the full intro end |
| "block" (hub navigation) | tile / card | "Block" is the design-charter's informal word; current hub terminology is **tile** (often described as a square card in ADR-0012/0013) |
| "detail panel" / "caption" / "LCD strip" (current hub) | in-place tile description | ADR-0012 removed the shared LCD detail strip; current hub copy lives on each tile/card |
| "Colour" / "Colours" (user-facing labels/copy) | Colors / color | ADR-0019 §5 standardises user-facing spelling on US "Colors"; frozen code identifiers (`text_color`, the `'Colour'` instrument, `'colours'` group key, `colourDefaults`) are unaffected |
| "calm grid" / "focused editor" / "power view" / "calm-power tier" (Reader defaults) | two-tab Reader settings editor | Superseded by ADR-0019; the Reader defaults + in-Reader drawer share one two-tab editor with no drill-in |
