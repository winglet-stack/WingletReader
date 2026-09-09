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

### Channel contract
The single source of truth for an IPC channel's name, argument tuple, and result type.
`src/shared/channelContract.ts` is pure TypeScript shared by Main, Preload, and Renderer; a
channel is declared once there, then handler registration, isolated-world preload binding,
renderer `window.api` typing, and exhaustive channel tests derive from that declaration.
**Every** family is on the contract — `app`, `db`, `file`, `data`, `video`,
`readWhileWorking` — and `window.api` *is* the contract-derived `WingletApi`; `env.d.ts` only
says where that surface attaches. A channel carries one of three **transports**, typed
distinctly: `invoke` (renderer→main request/response), `send` (renderer→main, no answer), and
`subscribe` (main→renderer event; the binding takes a callback and answers with an
unsubscribe function). Preload supplies the per-subscription adapter that turns raw event
arguments into the callback arguments the contract promises — the contract carries types, not
transport.

### Stack
The fundamental display unit of the reader. A Stack holds **up to** `words_per_stack` (N) words shown together in the reading viewport for one BPM beat; the reader advances one Stack per beat. The **elastic stack packer** (ADR-0030) balances each paragraph so Stacks stay close to N — N is a hard ceiling (never exceeded), with a preferred floor of N−2. Paragraphs, headlines, and **sentence ends** are hard boundaries a Stack never spans (ADR-0031 promoted the period from soft to hard: a period always ends a Stack, so the between-sentence breath is metronomic — a standalone short sentence becomes a short Stack held for one beat, accepted not mitigated). The balanced DP runs **per sentence**; when enabled, commas / long words remain soft, crossable preferred breaks *within* a sentence. Name groups are atomic; bullet/enum markers stand alone. A Stack's pause is decided by its **last** word (see `pauseMs`). Built off-thread by `buildStacks` (`engine/tokenizer.ts` → `engine/stackPacker.ts`).

`WPM = BPM × words_per_stack` is the **nominal** rate; real throughput is slightly lower because rare short residual Stacks and sentence/paragraph pauses cost time the formula ignores.

### Line box
The region of the reader stage that reserves height for all `lines_count` rows from the start of a block and fills them top-down as playback advances. Its `lines_anchor` is either **Centred** (`center`), placing the box at stage centre, or **Top-anchored** (`top`), pinning its top edge to the stage top. The anchor is inert at one effective line, so a single row stays centred while the stored preference remains available when the count rises again. **Tombstone:** `lines_enabled` was removed on 2026-07-20 (ADR-0032); `lines_count` is the single source of truth and a count of 1 means single-line reading. Legacy disabled values migrate to a count of 1 on load.

### Tap to Read
An advance mode (`tap_to_read: true`) where playback does not auto-advance on the BPM timer; the user presses a configured **advance key** (`tap_to_read_key`, default `Space`) to step one Stack. Mutually exclusive with BPM auto-advance for the same session. Key capture uses `BindingCaptureRow` and stores keyboard `e.code` values (e.g. `KeyJ`) or mouse `MouseN` tokens.

### Live rewind
During playback or pause, a bound key or mouse button (`live_rewind_key`, default `Mouse1`) rewinds by `live_rewind_stacks` stacks without leaving the session. Reserved keys owned by `readerKeymap.ts` cannot be bound; the advance key is also blocked when rebinding live rewind. Runtime dispatch lives in `Reader.tsx`; capture UI uses `LiveRewindKeyRow` / `BindingCaptureRow`.

### Input binding
Reader settings that store keyboard `e.code` strings or mouse tokens (`Mouse1` = primary, `Mouse2` = secondary, `Mouse3` = middle). Pure helpers in `engine/readerBindings.ts`; `readerKeymap.ts` resolves keyboard actions separately. `formatBindingCode` turns stored codes into display glyphs in settings UI.

### BPM
Beats per minute — the speed unit for the reader. One Stack is displayed per beat. Not to be confused with WPM; WPM is derived (nominally) from BPM and words_per_stack — see **Stack** for why real throughput runs slightly under `BPM × words_per_stack`.

### Segment
An auto-detected or user-navigable chapter/section of an imported text. The `textSegmenter` engine detects Segments from structural headings (markdown `#`, "Chapter N", "Part N", all-caps lines) or generates them by word-count chunking if no structure is found. Segments are stored in the data store and displayed in `SegmentPanel`. Users can rename Segments.

**User-facing noun is chosen by text origin (ADR-0023), not by structure.** A **Winglet Book** (`seed_id` present — see glossary) or an **EPUB Book** (`source_type: 'epub'` — ADR-0034 extension) calls its Segments **"chapters"**; other **user texts** call them **"contents"**. This origin axis governs the card "View" button, the count line, and the `SegmentPanel` header/Add button. The **"Add Content"** append affordance exists for **user texts only** (curated Winglet Books are complete works); the card `+` shortcut is gone — Add lives inside the view. `sourceType` (`detected_heading`/`generated_chunk`) still drives *behavior* (chapter-nav, continue-reading) but no longer drives *wording*.

### Winglet Book *(ADR-0033)*
A curated, chapter-resolved book produced by the separate **WingletBooks** program and delivered as a downloadable single-book **`.wbook`** file that the user **manually imports** — no fetch pipeline, no catalogue service, no auto-update. Recognized by its internal `format: 'winglet-book'` marker (the `.wbook` extension is advisory); marked in the store by `seed_id`, which drives the ADR-0023 "chapters" vocabulary, suppresses Add Content, and activates chapter-nav. Chapters ship **resolved by the producer and are never re-detected**; the Reader derives counts/offsets/joined content deterministically at import and never re-cleans the text ("what the curator authored is exactly what plays"). Identity is `seedId`: a book already present is skipped on import, never updated in place. Manual import supersedes the retired ADR-0018 launch-time delivery channel; "default books" is informal catalogue language, not a distinct concept. Contract owner: this repo (`src/shared/wingletBook.ts`); WingletBooks vendors it.

### EPUB Book *(ADR-0034)*
A publisher e-book (`.epub`, EPUB 2 or 3) the user imports as a whole, structured book: its
chapters come from the publication's own table of contents ("publisher-intended chapters"),
never re-detected. **Not a Winglet Book** — no `seed_id`, not curated, and fully the user's
text afterward (editable, appendable, categorizable like any import). Uses the "chapters"
noun (ADR-0023 rule extended: publisher-chaptered origins say "chapters"). Governing
invariant: **preserve the original text** — import projects styled markup to plain text but
never silently drops or rewrites the publisher's words and punctuation; anything omitted
(images) is counted and disclosed, and everything in the reading flow lands in the book
("Front Matter" included). DRM-protected files are refused by name. This import channel is
the cornerstone of the planned public-library API integration, which serves EPUB as the
industry default.

### Book intake
The one route a **structured book** takes from a picked file to a row in the library, and
the module that owns it: `src/main/bookIntake.ts`. It owns everything the formats share —
the parse-then-commit pair, its totality wrapper, the stateless re-validate-from-disk rule
(commit re-reads and re-judges, so an edited file or a raced duplicate is refused rather than
inserted), the insert through the ordinary store paths, the segment-write rollback, and the
single success envelope (`status: 'committed'` with the new `textId`).

A format is a **book intake adapter** (`BookIntakeAdapter`), and nothing else. It answers one
question — *given the store and a path, produce a derived book or a refusal* — plus one
catch-all refusal the intake uses for an unusable path or a store failure. Everything that
differs between formats is **data the adapter supplies**: its confirm-card shape, its own
refusal vocabulary, the extra `saveText` fields its books carry (`.wbook`'s `seed_id` and
by-name category merge; EPUB's `author`, `source_type`, diagnostics), and whether it makes an
identity check at all (`.wbook` dedupes on `seed_id`; EPUB deliberately does not). There is no
`switch (format)` inside the intake, and adding a format — the planned public-library API is
the next one — costs an adapter and no edit to the intake; `__tests__/bookIntake.test.ts`
proves that with a fake third format.

**Chapters are never re-detected at this seam.** Every format resolves them upstream — the
producer for a **Winglet Book**, the publisher's table of contents for an **EPUB Book** — and
hands the intake segments already ordered, counted and offset by the frozen shared word
counter. The intake stamps them `detected_heading` and writes them; it never reads the prose.

The renderer half of the same seam is the **channel** registry
(`components/import/bookChannels.ts`): one `ImportBookChannel` per format supplying its parse
and commit calls plus a `describe` that turns a verdict into copy for the **one** confirm card
(`components/import/BookCard.tsx`). Refusal wording is product voice and belongs to the
format's describer, not to the card. Decisions: ADR-0033 §4, ADR-0034 §2 (as amended).

### Category
A library-level folder-like grouping for texts. Each text belongs to exactly one Category (`category_id`), and the Library chip row filters the flat text list by Category. Categories do not split text content and do not replace chapters.

**Category reassignment lives in the Contents view, not the Library card (ADR-0027).** The Library card shows the assigned Category as an **inert display chip** only; changing a text's Category is done from its **Contents view** (above the title). The top-of-Library Category **filter tabs** are unaffected.

### Contents view *(ADR-0023 surface; navigation model ADR-0027)*
The per-text management surface (`SegmentPanel`) reached from a Library card — the standalone book screen listing its Segments (chapters/contents per the ADR-0023 origin vocabulary), its bookmarks, the user-text **"+ Add Content"** affordance, and (ADR-0027) the book's **Category** selector above the title. Hosted at `view === 'library'` with `libraryTab === 'chapters'`. Its top-left corner is the **up-level control** returning to the Library list (see Home control), **not** the dove; the former inline `← Library` header button is removed. The requirements doc's informal **"text card"** maps to this surface — prefer **Contents view**.

### Bookmark *(ADR-0024)*
A persistent, user-placed mark on a **specific place** in a text, anchored by a stable **`wordOffset`** (the `TextSegment.startWordOffset` precedent — never a `stackIndex`, which shifts when `words_per_stack` changes). Target record shape: `Bookmark = { id, textId, kind, wordOffset, label, createdAt }`. A **Normal** bookmark is a saved starting/reference position and a **targeted insertion mechanism** — the user jumps ("inserts") the reader's playhead to it; a text has **1..n** normals. See **Goal bookmark** for the other `kind`. Resolves to a live `stackIndex` only at use time via `resolveWordsToStackIndex`.

**The Reader owns the list** (`hooks/useBookmarkCollection.ts`), and the flow is one-directional:
the Reader loads it, the scrubber marks it, the Text view decorates from it, the **Reading
session** is handed its Target, and the popover is given it to render and mutate. Nothing is
pushed back up. **Tombstone:** the popover no longer loads bookmarks and announces them upward
through `onBookmarksChange` / `onGoalBookmarkChange` while the Reader mirrors them into component
state and pushes a `consumedBookmarkId` back down — a Target that consumes itself on crossing is
dropped by `collection.forget(id)` instead.

ADR-0024 is **fully implemented** — store CRUD (`database.ts`), IPC/preload/`env.d.ts`, reader popover (`BookmarkPopover`) with kind-picker + goal forward-rule, scrubber goal marker + normal ticks, text-view word selection, and the Library `SegmentPanel` bookmarks section — and the legacy stop target is removed.

### Goal bookmark *(ADR-0024)*
The `kind: 'goal'` **Bookmark** — the passage where the user intends to **stop** the current session. **Exactly one per text** (setting a new goal replaces the prior one; enforced as a handler invariant). Must be placed **ahead of the saved reading position** (a never-read text is treated as word offset 0; the forward rule is validated renderer-side, where the live stacks + saved position exist). When playback **crosses** it, playback stops and opens the **Session dialog** (Target variant — ADR-0026) and the goal **deletes itself**, freeing the slot; a **manual scrub** past it does not delete it. Inherits the auto-stop-on-crossing behavior formerly owned by the Stop target. User-facing label is **Target** (ADR-0024 amendment); `goal` is the code/`kind` term.

### Reading session *(ADR-0026)*
A single continuous reading run of one text, **and the module that owns it**:
`src/renderer/src/hooks/useReadingSession.ts`. It **begins** when playback starts from rest (Play or Resume-from-saved) and **ends** when playback stops (Stop, Target reached, or natural end) or the Reader is left. **Pausing and resuming do not end a session** and do not start a new one. Every session carries a **session baseline**.

The Reader consumes **one interface**: the session's observable state (stacks and the **word index** stack half, the live index and play state, the countdown, the session end, the saved-resume point, the Target's stack index) and the intents that change it — play, resume-saved, pause, resume, stop, restart, seek, rewind, step, commit, discard. Behind it sit the playback timer and index (`hooks/usePlayback.ts`), the position writes, the baseline and its commit/revert paths, goal-crossing detection and the goal's self-deletion, and natural-end handling. No member is a verb the caller supplied, and **restart and discard are single intents** — both were paired calls the component had to make in order. The pure decisions the session sequences stay in `engine/readerSession.ts`, which no longer says "orchestration stays in the component": every rule the session enforces is stated there, including the ADR-0026 §4 baseline re-capture exception (`shouldCaptureSessionBaseline`) and the no-id-no-persistence contract (`sessionPersists`).

**Host completion is named configuration, not a flag.** `SessionCompletion` selects which completion path a finished run takes: `session-dialog` (the standard Reader — pause-and-hold, then the **Session dialog**) or `host-completion` (the Overlay Reader — playback stops and the host owns the follow-up, so no session end is ever raised). It replaces the former `sessionEndEnabled` boolean, and only the session module reads it. **Tombstone:** do not reintroduce a boolean that means "may show a dialog", "pauses at the natural end" and "Stop holds instead of stopping" at once.

**A text with no `id` persists nothing.** The Overlay Reader host fabricates its `TextRecord` from a temporary session, so every position save, baseline commit and revert for it is a deliberate no-op — an explicit rule now, not a side effect of an early return.

### Session baseline *(ADR-0026)*
The saved reading position as it stood at the **start** of the current reading session — the point that **"Exit without saving"** restores so the reader can reread from their last deliberate save. Exactly **two positions** are tracked for an active session: this baseline and the live current position (continuously auto-saved on every pause/leave). There is no deeper history.

### Session dialog *(ADR-0026)*
The centered, focus-trapped **modal** shown inside the Reader stage when a reading session ends, giving the reader guided follow-up actions instead of an abrupt "Finished." Distinct from the anchored **Popovers** (BookmarkPopover, QuickSettingsPopover). Opening it **pauses playback and holds position** (no reset-to-start until the reader actually discards). Three variants: **Stop** (Save & Exit · Exit without saving · Abort), **Target** (Continue reading · Set a new target · Save & Exit · Exit without saving), and **End** — the natural finish (Save & Exit · Exit without saving). **Save & Exit** commits the current position; **Exit without saving** restores the session baseline; both route to the **Library**. The top-left dove is unchanged (routes to the **hub**, auto-saving on the way out). Actions are stacked safe-on-top and colour-coded by the ADR-0012 role system (blue primary, `--danger` destructive, neutral ghost). Component: `SessionDialog.tsx`, variant `stop | goal | end`.

### Session stats *(ADR-0035, amended by ADR-0036)*
The measured facts of one **Reading session** in the standard Reader: words read, wall duration, active reading time, counted pauses, and rewind events. **Words read is earned playback progress, not viewport position or exposure** — it is the positive advance of the session's **credited frontier**, so manual seeks never credit skipped words and re-reading after a rewind never double-counts. Session stats live only until their day closes, are then compacted into the **Day record**, and are discarded. Only standard-Reader sessions are measured; the Overlay Reader and Transmute are out of scope. A session that advanced zero words records nothing, and a discarded run ("Exit without saving") still counts — discard moves the resume point, not the activity.

### Active reading time *(ADR-0035, amended by ADR-0036)*
The gap-clamped time between playback **advancement events**, including the entry gap from Play/Resume and the exit gap to Pause, Stop, or session end. Each gap credits at most `max(4 × nominal beat interval, 10s)`, using the live BPM when the gap closes, so tap-to-read idling and suspended timer playback cannot bank unbounded time. Pauses, dialogs, countdowns, and setup surfaces are excluded. The denominator for measured reading speed (real WPM, distinct from the nominal `BPM × words_per_stack` setting) and for the interruption rate.

### Credited frontier *(ADR-0036)*
The furthest word offset a session has **earned**, and the sole source of its words read. Monotone: it advances — and credits words — only on an **advancement event**. A forward seek rebases it to the seek target *without* credit, so a skipped gap can never be credited, even by backtracking into it later (accepted conservative edge); a backward seek leaves it in place, so replaying already-credited text credits nothing. Fold paths (pause, stop, session end) read the frontier, never the live viewport index. Replaces ADR-0035's raw high-water offset.

### Advancement event *(ADR-0036)*
Playback actually displaying the next words: a timer beat, or a tap-to-read `step`. The only occasions that credit words to the **credited frontier**, and the ticks between which **active reading time** accrues (gap-clamped at `max(4 × nominal beat interval, 10s)`). Manual navigation — skip forward/back, scrubber seeks, bookmark jumps, restart — is never an advancement event.

### Active time vs wall time *(ADR-0036)*
**Active time is the scored currency; wall time is the descriptive span.** Every user-facing aggregated or scored time number — the hub banner's "time today", the longest-session highscore — uses active reading time. `wallMs` (session start → end) stays on session records as descriptive data and feeds no score. Pre-guard historical records keep their wall-based numbers (ADR-0036 §8).

### Counted pause *(ADR-0035, amended by ADR-0036)*
An explicit user pause that interrupts reading. Automatic pauses (entering browse, arming a Target pick, dialogs) never count. An explicit pause is exempted as setup, not struggle, only when its **first** reader-surface open or setting change happens within 30 seconds of the pause intent; that first activity makes the verdict final for the pause.

### Rewind event *(ADR-0035)*
One occasion of going back: a run of consecutive rewinds with no forward playback between them counts once, regardless of distance or input method. Scrubber seeks and restart are navigation, not rewind events.

### Reading Fluency *(ADR-0035)*
A 0–100 smoothness score for a session, derived from the **interruption rate** — (2 × rewind events + counted pauses) per active reading minute — as `100 / (1 + rate)`. 100 means uninterrupted reading; higher is better. Fluency improvement is rewarded through highscores, never through Points.

### Day record *(ADR-0035)*
The per-local-calendar-day aggregate of session stats: raw sums (never pre-computed averages) plus that day's quota snapshot and Points. Day records are the only stats that outlive their day; weekly, monthly, and lifetime views are always derived from them, never stored. A session spanning midnight belongs to the day it started.

### Daily quota *(ADR-0035, amended by ADR-0036)*
The user-set daily reading target, met when the day's words read reach it. Set and displayed in **quota pages** — 500 words each, deliberately the same size as the plain-text view's **Page** so "page" means one thing app-wide — and stored in words. Default 2 pages. Editable in Settings and on the Stats screen. The target pins at the day's first recorded session; later edits take effect tomorrow, while edits before any activity apply immediately.

### Streak *(ADR-0035, amended by ADR-0036)*
The count of quota-met days since the streak last broke, governed by a **weekly rest-day budget**: the user sets how many quota-met days a week should contain (**weekly target**, default 5 of 7), and each week's shortfall allowance is its **rest days**. The weekly target pins to the first recorded day of each Monday-based week; later edits take effect next Monday. A missed day consumes a rest day without breaking the streak; exceeding the week's rest days breaks it to zero.

### Points *(ADR-0035)*
The gamification currency, awarded when the daily quota is met: 100 × a streak multiplier that grows 10% per streak day and caps at 2×. Points reward consistency, never raw speed.

### Stats screen *(ADR-0035)*
The stats dashboard reached from the hub's **stats banner** (a long rectangular control in the hub header row, between the dove and the version block, previewing total words read, today's quota progress, and today's reading time). Two tabs: **Dashboard** (numbers — Points top-right, quota and Streak first, the goal steppers inside the cards they govern) and **Graphs** (one metric per screen across the Today/Week/Month/Total timeframes; Today drills into the day's sessions, and Points has no Today). No scrolling.

### Reader surfaces
The five things the reader can bring up over the reading stage — **quick settings**, the
**bookmark popover**, the **config drawer**, the **plain-text view** and the in-frame **library
browse** — and the module that decides which of them is open: `engine/readerSurfaces.ts` (the
policy) with `hooks/useReaderSurfaces.ts` (the owner). Two axes: the three **panels** share one
slot, so opening one closes the other two; the **stage** shows reading, the plain-text view or
browse, with browse winning. The owner also performs the consequences — entering browse pauses
(ADR-0013), arming a Target pick pauses — so no caller lists them.

**The Target pick is a mode, not a flag.** Arming is one intent that puts the reader into the
ADR-0024 §4 pick (popover open, plain-text view on the stage, playback paused); leaving it is one
intent, however it is left — cancel, Esc, the toolbar, another panel, or a saved Target. The pick
records **where it was armed from**, and a pick armed from the Session dialog's *Set a new
target* gives the stage back on the way out. **Tombstone:** the former
`returnFromSessionTargetPick` boolean, which two handlers read and each partly un-set, is gone;
do not reintroduce a flag that means "return somewhere later".

**Engaging a text establishes the surfaces**, it does not reset them: the state is keyed on the
engaged text, replacing three effects that fired on a text change purely to un-set what another
cluster had set. The config drawer is the one surface the owner commands but does not store — it
is route chrome in `NavigationContext`'s sibling `ReaderContext`, because leaving the reader route
closes it. Decisions: ADR-0013, ADR-0024 §4, ADR-0025 §4, ADR-0026.

**Surface descriptor** *(planned — extensible-core)*: each surface becomes one descriptor in the
policy module — its axis (panel or stage), its Escape priority, whether it is a popover, whether an
open one counts as **setup activity** for the counted-pause exemption, and whether it survives a
Target pick — and the owner derives every per-surface list from it. Adding a surface is one
descriptor and one component; no hand-maintained Escape chain, popover OR or setup-activity OR
survives.

### Reader action *(planned — extensible-core)*
One declaration per thing the reader can be told to do from the keyboard or the mouse, in one
table (`engine/readerActions.ts`): its trigger over a unified keyboard/mouse input, the key codes
it reserves from user binding, its keyhint copy, and what it performs against the **Reader host**.
The keymap resolver, the mouse resolver, the reserved-binding list, the keyhint strip and the
dispatch are all derived from the table; a new action is one row. Keyboard and mouse share the
vocabulary. Supersedes the split between `readerKeymap.ts` (decisions) and the component's dispatch
switch (effects), which had no compiler link between them.

### Reader host *(planned — extensible-core)*
The one typed value the Reader composes from its deep modules — the **Reading session**, the
**Reader surfaces**, the live settings, the **Reader frame**, the bookmark collection, the stats
summary and the action dispatch — and that every piece of Reader chrome and the stage read
instead of a hand-typed prop tuple. The Overlay Reader and the inert frame host the same value
(the inert frame with a zero host, not a second tuple). `Reader.tsx` is the composition root that
builds it and renders slots; it carries no coordination and no complexity suppression.

### Transmute
The video-export feature. Transmute converts an imported text into a speed-reading video file (MP4). `transmuteConfig.ts` is the sole write path for all Transmute configuration; callers do not write directly to localStorage or the data store. **"Make Video" is the user-facing label** for this feature on the hub tile and its launchpad; **"Transmute" remains the domain and code term.** Transmute persists only a global config blob (`fasttrack.transmute.readerConfig.v1`) — `textId`/`segmentId` are stripped on write, so there is **no persisted "last project"**; the Make Video launchpad therefore offers source selection (choose a saved text, or paste/upload new text without a Library save) rather than reopening a previous project.

### Read While Working (RWW)
Always-on-top overlay reading via `TemporaryReaderApp` while the user works elsewhere. **"Overlay Reader"** is the user-facing label; **RWW** / `read_while_working_*` keys / IPC names stay in code (ADR-0017). **File-naming rule** *(planned — extensible-core)*: existing modules keep their names; new files use `overlay*` for window/host modules (under `components/overlay/` in the renderer) and `rww*` for settings-scope modules, and no fourth name is minted. Hub tile and Settings card both open **Overlay Reader settings**; arming uses the main-process enable/hide-to-tray path. Packaged builds expose a persistent tray **Start Overlay Reader** item (Pass 2 **07**); dev builds show tray only while RWW is armed.

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
The right column of the editor's **Playback & Grid Layout** tab: the pure grid parameters (`words_per_stack`, `stacks_visible`, `lines_count`, `lines_anchor`). `words_per_stack` lives here — moved off Playback — because it shapes the grid, not the pace. Supersedes the calm grid's **Layout** card.

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
A hub-tile glyph asset pair (`idle` PNG + optional `hover` PNG/GIF) with fixed palette baked into the art. Lives under `assets/hub-tiles/`. Theme-agnostic — the same file renders in light and dark. Spec: `design/Design Overhaul/01-hub-tiles.md`.

### Card face
The theme-aware background PNG on hub tiles (`.hub-tile`) and Settings gateway cards (`.gsc-card`). CSS tokens `--hub-tile-face` / `--settings-tile-face` swap per theme; `--hub-tile` remains the fallback fill colour under the art.

### Library card face *(ADR-0028)*
The DisplayKit **face** treatment applied to the Library, one level down from the hub tiles. Presentation-only over ADR-0027's three-zone `TextCard` (zones/resolver/data unchanged). The card strip (`.text-card-main`) and the search/categories surface (`.library-controls-card`) drop their borders and flat fills and are painted with a theme-aware background frame tile; the three action buttons (**Resume/Read**, **View-contents ⌗**, **Delete**) are 64×64 baked PNG faces with a passive→active hover swap. Card title/meta/Category chip keep `var(--text)` (theme-appropriate tiles — no forced ink). Unlike the hub/Settings faces, the art lives under `assets/library-tiles/` (bundler imports + `index.css url()`), **not** `public/`, so there are no `DESIGN_ASSETS` entries or `--lib-*-face` tokens. **As built it uses `border-image` 9-slice, not the `background-size: cover` mechanism the hub uses** (idle `slice 3`/3px → hover `slice 6`/6px double-line); matching it to `cover` would be a follow-up.

### Chrome icon
A single-ink SVG control glyph drawn at 24×24, recoloured by CSS via `currentColor`. Used on Settings landing cards and future nav/reader chrome replacements. Component: `components/icons/ChromeIcon.tsx`. Spec: `design/Design Overhaul/02-chrome-icons.md`.

### Setting hint trigger
The circled **`?`** control on a settings row label that reveals static explain copy on hover or focus (`SettingHintTrigger`). Live readouts and validation stay always visible in the label's feedback slot (`SettingsLabel`).

### Preset row
A pinned named-Profile chooser that formerly sat at the top of settings editors. The Reader-defaults preset row (`readerConfig/ReaderPresetRow.tsx`, **Calm / Fast / Focus / Skim**) was removed from the live UI on 2026-07-03; the component file and its test lingered orphaned (test-only) and were deleted on 2026-07-13. The RWW built-in preset chips (**Glance / Subtle**, `settings/RwwPresetRow.tsx`) are removed by the Overlay Reader settings overhaul; the **Copy from Reader defaults** bridge survives as a compact secondary action, not a preset row.

### Summary — active flow and archived view
The word "summary" covers two separate concepts that must not be conflated:

- **Post-reading summary flow** — the active prompt → setup → save sequence offered when a reading session *ends*. This is part of a **reading session** and therefore belongs to the Reader, not the Library.
- **Summaries view** — an archived standalone screen that showed saved summaries for a chosen text. Wave 1 cut all Library entry points and moved `SummaryView.tsx` under `archive/components/`; issue 11 removed the active shell render branch. The `summaries` route token itself is now **gone from the view union** — it is not a hidden destination, it is not a destination (see **Route table**). New work should treat the standalone view as inactive until a future Reader/summaries design reactivates it.

These share the word "summary" but have different homes: the active flow is Reader domain; the archived view is not an active Library affordance.

### Alpha notice
The shared, non-dismissible warning banner that labels a **reachable-but-rough** feature for alpha testers: `components/AlphaNotice.tsx`, rendered through the existing ADR-0022 `.warnings-box` treatment as a `role="status"` region with a per-surface `aria-label`. Its copy is held as `alphaChrome.*ExperimentalBannerCopy` constants, each paired with an `*ExperimentalBannerEnabled` flag the component itself reads — it renders nothing when the flag is false, so no call site carries a conditional — and spacing is a call-site `style` prop, never a component opinion. `alphaChrome` values are module constants, not runtime toggles, so `npm run dev` and the packaged build show identical chrome. **Policy: a feature is either hidden by an `alphaChrome` flag or reachable with a notice — never reachable and unlabelled.** Four placements as of 0.2.1-alpha.1, one mechanism: **Transmute** (below the Make Video header, the original hand-rolled banner migrated onto the component), **Overlay Reader settings** (first child of the `RwwSettingsEditor` console, above the tab bar, so it is read before anything is changed), **EPUB import** (on the confirm card only — `ImportBookTakeover` gates it to the `epub-book` channel's `confirm` state, so Winglet Book cards and refusal cards carry none), and **Create Portable Drive** (Settings → Data, above the create action). A notice sits where the decision is made, not after it. Auto-update deliberately carries none (nothing actionable to tell a tester), and there is no first-run modal or global alpha strip. The three off-flags (`postReadingSummaryEnabled`, `importTextProcessingEnabled`, `importTileCreateVideoEnabled`) stay `false` — hidden is the other half of the policy, not an exception to it.

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

The **overlay-reader** Settings subview is reachable from **two** entry points (the hub Overlay Reader tile and the Settings landing card), so its up-level target is **origin-aware** (ADR-0027): entered from the hub it returns to the **hub**; entered from Settings it returns to the **Settings landing**. Origin is tracked as `settingsSubviewOrigin` in `NavigationContext`. All of the above is **declared**, not re-derived from token comparisons: see **Route table**.

### Route table
The one module that declares the app's destinations and everything the shell needs to know
about them: `src/renderer/src/appShell/routeTable.tsx`. Per destination it says **what renders
it**, **what chrome it carries**, and **whether it is live** — plus whether it owns the whole
window (the **Hub**) or mounts inside the shell frame. The `AppView` union *is* the table's key
set (`APP_VIEWS`), so a destination cannot exist as a token without an entry that renders it,
and `Record<AppView, RouteDefinition>` makes the set exhaustive — there is no `default` branch
rendering nothing. **Adding a destination is one table entry and no edit anywhere else**;
`__tests__/routeTable.test.tsx` proves it with a test-only destination.

**Chrome is a declaration, not a predicate.** Each entry's `chrome(state)` is given the rest of
the effective route — the Library tab, the Settings subview and its origin, the Overlay Reader
settings tab — and returns the corner control (none / dove / up-level **with its target as
data**), the gear, and the Overlay Reader host control. The **Home control (dove)** policy above
lives here and nowhere else; `AppShell` only performs what the table returns.

**Liveness has exactly one enforcement point.** `resolveRoute` maps a token to its destination,
falling back to the Library when the token is unknown or its destination is not live; the shell
calls it once, where it reads the table. The five archived alpha tokens (`showcase`,
`mode-choice`, `summaries`, `primer`, `trailer`) are **gone from the union**, so no typed caller
can reach them and the former `alphaChrome` dead-route set, the `NavigationContext` redirect and
the post-hoc shell effect are all retired.

**Route *state* is still `NavigationContext`'s** (ADR-0006 is not reopened) and `App` is still
the composition root (ADR-0005). What lives in the table is route *policy*.

### Reader persistent frame *(ADR-0013)*
Design Run 2's model for the Reader's surrounding flow, complete as of issue 04. The Reader is a persistent frame (`ReaderTopbar`, `ReaderScrubber`, `ReaderControls`, `ReaderKeyhints`) whose **stage** swaps among states; the live playback path in `Reader.tsx` still assumes an engaged `activeText` and the no-engaged-text states never run `usePlayback`. The shared no-text scaffold is `reader/ReaderInertFrame.tsx` (composes the extracted children with zeroed/inert props):
- **Empty library (zero texts):** `ReaderEmptyFrame` → inert frame with an import disclaimer; every inert control and the primary CTA route to Import.
- **Texts exist, none engaged:** the inert frame hosts the **in-frame library browse** (`ReaderLibraryBrowse`), where picking a text engages it.
- **Engaged text:** the live `Reader`. Its idle stage (`ReaderIdle`) keeps only the resume/ready summary; picking another text is no longer a local toggle there.

The in-frame library browse (`reader/ReaderLibraryBrowse.tsx`) hosts the **same** standalone `Library` list inside the frame — one list, two hosts (hub Library tile → standalone management; Reader → in-frame browse). The enter/exit is one **centered Browse-library ⇄ Back-to-reading** toggle in the control zone (`.reader-browse-btn`), a 60×60 theme-paired Library tile sprite rendered via `ReaderButtonIcon` (`assets/reader-tiles/library-toggle-{dark,light}.png`); the interim `ChromeIcon` `reader-browse-placeholder` is retired. Entering browse pauses playback. The former in-place recent-texts picker (`IdlePicker`, `ReaderEntryIdle`, the `.reader-idle-pick*`/`.reader-idle-entry*` CSS) is removed.

### Word index
The engaged text's word sequence, walked **once** and cached, and the module that owns it:
`src/renderer/src/engine/wordIndex.ts`. It serves every lookup the reader surfaces need —
word offset ⇄ stack index, offset → character range, offset → paragraph, offset → **Page**,
Page → word range, and the totals — so no consumer re-walks the book to answer one question.

**The anchored word definition.** A `wordOffset` is an index into *the reading word sequence*:
the words the tokenizer produces from the text, in document order, from 0. That is the space
every persisted offset already lives in — a **Bookmark**'s `wordOffset` (ADR-0024) and a saved
reading position are both written by converting a stack index through the index's
`offsetAtStack`. `forEachWord` (`wordHighlight.ts`) walks the same sequence over the text
itself and strips markdown-headline prefixes with the tokenizer's own rule, so the two agree
word for word; the agreement is asserted, not assumed. `content` and `content_display` also
carry the same words — they differ only in whitespace — so an offset crosses between them
safely.

**One definition stays outside it, deliberately:** the frozen `countWords`
(`src/shared/importTextCleanup.ts`) that derives a **Segment**'s `startWordOffset`/
`endWordOffset` at import. It splits on whitespace with no paragraph splitting and no headline
stripping, so a literal `#` heading marker costs it one extra word; it is shared with the
`.wbook` and EPUB derivations and their byte-parity fixtures and **must not be changed**. Both
structured formats produce heading-marker-free prose, where the two agree exactly.

**Two halves, two costs.** The *stack half* is prefix sums over the current tokenization —
built as soon as stacks land, and empty until they do, because stacks arrive asynchronously
from the off-thread builder. The *text half* is the whole-book walk and is **deferred** until a
surface that needs characters, Pages or paragraphs is shown (the paged Text view, the bookmark
popover); putting it back on the engage first-paint frame is the regression OL-1 removed.
`hooks/useWordIndex.ts` owns that latch — sticky, resolved during render, reset per text.

**In memory only.** Nothing here is persisted, no store field is added, and this does not
reopen the dropped OL-2 decision (ADR-0025) to persist page starts.

### Reader layout fit-solver
The live RSVP Stack viewport uses a pure fit-solver (`solveReaderLayout`) against the measured stage box, not a minimum-size stage lock. The solver keeps `stacks_visible` and `words_per_stack` unchanged, sizes font against the widest Stack in the current configured block, reclaims stack/row spacing by axis, may reduce visible line count for height pressure, and only drops below the 18px comfort floor as the final no-clip release valve. User offsets are clamped to the remaining slack so the rendered Stack grid stays fully inside the viewport. `document.fonts.ready` triggers a re-solve so late-loaded font metrics do not leave stale sizing.

### Reader frame
One complete description of what belongs on the reading stage for a single beat, produced by
`src/renderer/src/engine/readerFrame.ts` (`deriveReaderFrame`) from stacks, the current index,
the reader configuration and the measured stage box. It carries rows and slots — including the
**reserved-but-empty** ones the **Line box** holds open (ADR-0032) — plus per-slot reveal,
highlight, headline treatment and divider state, and the solved font size, gaps, line count,
anchor and clamped offsets from the **Reader layout fit-solver**.

**Painters make no geometric decision.** Anything that renders a frame — the live DOM grid
(`components/reader/StackGrid.tsx`), the canvas video exporter, the settings preview — maps the
description to its medium and nothing more; a painter that computes a size, a position, a class
or a reveal for itself is a bug, and the fix belongs in the frame module. The module also owns
the **two-pass configured-then-effective line count** (the block is derived at the configured
count so the solver measures the right strings, then re-derived at the count the solver
returns), and it takes the **sticky reveal** high-water mark as an explicit input and returns
the next one — reveal is frame state, never ambient state mutated while painting.
`hooks/useReaderFrame.ts` is the React home for that state and for the `document.fonts.ready`
re-solve.

### Reader idle logo (idle dove) — *protected brand surface*
The two-tone dove shown on the **Reader idle screen** (`ReaderIdle`, play state `idle`). It is **sanctioned brand identity, on the same footing as the Splash showcase** (2026-06-19, maintainer): a deliberate brand moment, not incidental chrome, and **must not be "cleaned up" into a plain text wordmark again.** UI-overhaul issue 10's pixel-identity pass had replaced it with a `.reader-idle-wordmark` text element that did not branch on identity; the maintainer reversed that for this surface only (`81eff20`).

The idle logo is now **canonical and deterministic** — a single hard-wired asset (`assets/logo-modern.png`), rendered with one `.reader-idle-logo` class. ADR-0029 removed the `logo_style` toggle: users switch **theme (light/dark) only**, never logo style. There is no per-style branch, no `body[data-logo-style]` mirror, and no `.reader-idle-logo--modern` / `--classic` CSS. This aligns the idle logo with the otherwise-deterministic identity rule (the **hub** identity and the favicon/showcase paths, ADR-0011 §6).

Do not reintroduce a stored logo-style branch or fold the idle logo into a plain text wordmark without a maintainer decision. Related: **Home control (dove)** above (a different dove — the Home affordance), and the **Splash** showcase (`docs/adr/0010-native-splash-window.md`).

## Feature Status

| Feature | Status | Notes |
|---|---|---|
| Standard Reader | **Active** | Core reading mode |
| Transmute (video export) | **Active** | `transmuteConfig.ts` is sole write path. Carries an **Alpha notice** (experimental export — the original banner, now rendered through the shared component). |
| Read While Working (RWW) | **Active — in development** | `TemporaryReaderApp` overlay window. Carries an **Alpha notice** at the top of Overlay Reader settings (0.2.1-alpha.1): capture/overlay behavior can change between builds and selections may be missed or mis-read in some apps. |
| Segmentation | **Active** | Auto-detect or chunk by word count |
| Winglet Book import | **Active — implemented** | Manual single-book `.wbook` import is the only curated-book ingestion channel (ADR-0033) |
| EPUB import | **Active — implemented** | ADR-0034; structured `.epub` (EPUB 2+3) import with publisher chapters from the publication's own TOC, the preservation invariant (reduced cleanup profile — no dash normalizer), named refusals incl. DRM, and the "chapters" vocabulary via `source_type`. Cascade EP-1..EP-5 complete; the Gutenberg smoke gate passed on 2026-08-11. Carries an **Alpha notice** on the import confirm card (0.2.1-alpha.1), because the preservation invariant ships publisher text without the usual cleanup and chapter quality depends on the book's own TOC. |
| Post-reading summary flow | **Off (alpha v1)** | Reader-owned setup/prompt/save flow; guarded by `alphaChrome.postReadingSummaryEnabled: false` (Pass 2 **01** done); re-enable post-alpha via flag |
| Bookmarks | **Active — implemented** | ADR-0024; word-offset Normal + Goal bookmarks replaced the session-only Stop target. Full cascade landed (store/IPC/reader popover/scrubber markers/text-view selection/Library section); `stopTargetCalculator.ts` + `StopTargetPanel.tsx` removed. |
| Standalone Summaries view | **Dead / archived** | Entry points cut in wave 1; `SummaryView.tsx` archived |
| Stats & Gamification | **Active — implemented** | ADR-0035 as amended by ADR-0036; credited-frontier words, gap-clamped active time, active time as scored currency, boundary-pinned goals, counted pauses, rewind events, Reading Fluency, quota/Streak/Points, Session-dialog stats block, hub stats banner + Stats screen (Dashboard + Graphs with the Today drill-in), Reading goals in Settings, stats in export/import. Standard Reader only; book-claim deferred as stretch. |
| Alpha installer / auto-update / feedback | **Partial — updater verified** | ADR-0007; `electron-builder` + NSIS `.exe` shipped (Pass 1); `electron-updater` packaged startup check shipped; in-app feedback not yet. **Installers are unsigned** — "updater verified" means the update *flow* was HITL-verified, not that publisher signatures are checked; `electron-updater` skips publisher verification on unsigned packages and testers get the SmartScreen prompt. Deferred deliberately, with scope, accepted costs and the signing trigger recorded in the ADR-0007 amendment (2026-09-09). |
| Portable USB mode | **Active — implemented** | ADR-0016; marker-gated `userData` redirect, `dist:portable`, Settings -> Data creator, and NSIS Portable-to-USB mode. Installer-mode real-machine HITL remains the operational gate before relying on it for testers; until it passes, **Create Portable Drive carries an Alpha notice** (0.2.1-alpha.1) telling the user the path is unverified end to end and to keep a backup. |
| Script Builder | **Dead / archived** | Code archived in `archive/` (ADR-0004 as amended) |
| Trailer Reader | **Dead** | Code archived in `archive/` (ADR-0004 as amended) |
| Primer Panel | **Dead** | Code archived in `archive/` (ADR-0004 as amended) |

---

## Data Layer

The data store is a **pure JSON file store** — a single atomic-write `.json` file in Electron's `userData` directory. In installed mode, Electron owns the normal per-user `userData` path. In portable USB mode (ADR-0016), `userData` is redirected before database construction to `<exe-dir>\data`, so the same JSON file, settings storage, logs, and Electron caches travel with the portable copy. There is no SQLite database and no native compilation step.

> The README and early commit history reference `better-sqlite3`. This was replaced. Do not re-introduce SQLite without an ADR.

Settings have two intentional shapes (ADR-0008): on disk and inside `database.ts`, `StoreData.settings` is the nested mode-scoped `SettingsStore`; compatibility APIs (`db.getSettings()`, `db.saveSettings()`, export/import) still expose or accept the legacy flat `Settings` shape via a lossless flatten/split bridge. Do not bypass `settingsStoreFromFlat`, `flattenSettingsStore`, or `settingsHandler.ts` when touching Settings persistence or RWW inheritance.

**Store schema version and migration ladder** *(planned — extensible-core; amends ADR-0001)*. The
store carries a `schemaVersion`. Shape changes are ordered, **once-run** migrations in one ladder,
never idempotent normalisers re-run on every load or read. Before any migration the file is copied
to `fasttrack-data.pre-v<K>.json` beside it and kept. A store written by a **newer** build is
refused by name (a Storage dialog; the app quits without writing), never opened best-effort.
Top-level keys the current build does not know are preserved through save. Every collection is
validated per record on load; malformed rows are dropped and counted, not loaded verbatim.

**Collection descriptor** *(planned — extensible-core)*. Each stored collection is one descriptor
— key, id counter, per-record validator, what happens to its rows when a text or segment is
deleted, and whether export carries it — and the store shape, the empty store, load validation,
the delete cascades and export/import are derived from the list of descriptors. Export is the
versioned store envelope itself and round-trips **every** collection; the former projection that
carried only texts, categories, settings and stats — and silently dropped chapters, bookmarks and
reading positions — is a tombstone.

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

### Complexity regression guard

New functions are gated at cyclomatic **20**, cognitive **15**, and CRAP **30** by the
Fallow pre-commit audit. The audit is intentionally `new-only`: inherited findings remain
visible in health reports without blocking unrelated commits. The oversized `Reader`
component is the explicit exception, marked inline. `architecture-depth/11-12` took its
*coordination* out — the **Reading session** and the **Reader surfaces** each own their own
interface now — so what the guard still measures there is **function size**: props in, JSX out
for a whole screen. Decomposing that is a codebase-health concern, not an interface one. Do not
widen the global thresholds to accommodate it, and do not add a second suppression.

Optional file-level map (entry points by area): [`docs/architecture-map.md`](docs/architecture-map.md).

---

## Deprecated terms — do not reintroduce

Concepts that were removed or superseded by a decision. They are kept here as tombstones so they are not re-invented; each points at the deciding ADR. None are live surfaces — describe current behaviour with the glossary above, not these.

- **Script** *(archived — ADR-0004)* — a compiled, time-stamped sequence of Stacks and pause beats meant to drive both live playback and the Transmute renderer. Built, then archived; the five files are preserved under `archive/`.
- **Seed loader** *(retired — ADR-0033)* — the ADR-0018 launch-time scan that read a developer-baked bundle from `resources/default-library.json`. Manual `.wbook` import is now the only curated-book ingestion channel; the loader, launch call, resource, and tests are removed.
- **Library Bundle** *(retired — ADR-0033)* — the multi-book v1 delivery contract formerly mirrored in `src/shared/libraryBundle.ts`. The single-book v2 `.wbook` contract in `src/shared/wingletBook.ts` supersedes it; v1 files are explicitly refused as unsupported.
- **`seeded` (curated-book vocabulary)** *(retired — ADR-0033)* — describe current books as **Winglet Books** or **curated books**. The frozen `seed_id` identifier remains live for origin behavior, while `seededIds` and `seededBundleVersion` remain parseable only as dormant legacy store keys; none may be renamed.
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
- **"chapters" / "parts" segment wording + per-row `chapter`/`part` badge** *(superseded — ADR-0023)* — the `SegmentPanel` header label and per-row badge that keyed the user-facing noun off `sourceType` (`detected_heading` → "chapters", `generated_chunk` → "parts"). The user-facing noun now keys off **text origin** (`seed_id`): curated Winglet Book → "chapters", user text → "contents". The per-row badge is removed entirely (redundant with the view header). `sourceType` is retained for *behavior* (chapter-nav, continue-reading) — it just no longer drives wording.
- **Card `+` "Add chapter" shortcut** *(removed — ADR-0023)* — the quick-action `+` on library `TextCard`s. Add now lives inside the view and only for user texts ("Add Content"); curated Winglet Books have no add affordance.
- **Stop target / `StopTarget` (`%` / time / words entry)** *(superseded — ADR-0024)* — the Reader-owned, **session-only** halt point entered as an abstract quantity (percentage / time / words) that `stopTargetCalculator.ts` resolved to a `stackIndex`, with an auto-stop effect and a scrubber marker. Replaced by the persistent, `wordOffset`-anchored **Goal bookmark** (see glossary). ADR-0024 removed the abstract-quantity entry model, `stopTargetCalculator.ts`, and `StopTargetPanel.tsx` entirely; the Goal bookmark inherits only the auto-stop-on-crossing behavior. Do not reintroduce the `%`/time/words stop entry.
- **Scale-lock (Reader stage minimum-size lock)** *(removed — VS-3 viewport-safe stack layout)* — the old Reader stage fit workaround forced a minimum stage size for dense Stack grids, which could make the stage wider/taller than its clipped parent and push text off-screen. The live Reader now uses the **Reader layout fit-solver** instead; do not restore a stage minimum-size lock for Stack fitting.
- **`lock_at_wpm` / `target_wpm` / `view_style` / `show_chunk_dividers`** *(de-UI'd but dormant — ADR-0019 §4)* — removed from every settings surface, including Quick Settings (Speed is always BPM). The stored keys are **retained, not migrated**; the reader no longer honours `view_style` (always `default`) or `show_chunk_dividers` (dividers always off), and `lock_at_wpm` was already ignored by playback. The focal-points render path and the divider render path are left dormant, not deleted. **`wpmSolver` is not dormant** — an earlier revision of this entry said it was, which was wrong: `engine/wpmSolver.ts` is live, with call sites in the reader-config speed rows (`readerConfig/PlaybackSpeedRows.tsx`), the settings metadata table (`settings/settingMetadata.ts`), and the reader-config patch builder (`engine/readerConfigPatches.ts`). What ADR-0019 §4 de-UI'd is the *`lock_at_wpm` toggle*, not the WPM math the target-WPM slider still runs on. **Exception:** the Transmute/RWW-entry `ReaderConfigPanel`/`ReaderConfigEditorCore` still expose `view_style`/dividers — an out-of-scope follow-up flagged in ADR-0019.

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
