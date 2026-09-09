# ADR-0035: Stats & Gamification — session/day activity tracking, quota, streak, points

**Date:** 2026-08-12
**Status:** Accepted (implemented; the eleven-issue stats-and-gamification drip-feed completed 2026-08-12 — 05 and 07 carry maintainer visual verdicts GREEN; maintainer closeout smoke GREEN 2026-08-13, all six items).
Drip-feed deviations, all 2026-08-12: the hub banner moved into the **hub header row** (§6, amended in place, on the maintainer's visual verdict); **Today became a fourth Graphs timeframe** (§6, amended in place); the two goal settings gained one renderer authority (`components/settings/readingGoals.ts`) consumed by both the Settings group and the Dashboard, whose cards host the goal steppers; the Session dialog widened 520 → 560px for its stats block. Left open, deliberately unbuilt: a spent/remaining rest-day figure on the Dashboard streak card (it would need a day-record read there, or a wider overview payload).
**Relates to:** ADR-0026 (Reading session — the measurement boundary and the dialog the summary lands in), ADR-0025 (Page — the quota page reuses its ~500-word size), ADR-0008 (settings storage — two new global keys), ADR-0007 (local-first — all stats stay on-device, no telemetry), ADR-0012/0022 (role colour + design system for the new surfaces), ADR-0013 (hub layout the banner sits above).

## Context

WingletReader plays text but gives the user no feedback about their reading: no sense of accomplishment after a session, no per-session or per-day history, no way to see whether comprehension-relevant behaviour (pausing, rewinding) is improving. The product promise — making reading improvement easy — needs a measurement and feedback loop. The source outline is `Reference Material/Stats Tab Feature Addition/Stats and Progress.md`; this ADR records the decisions that turned it into a buildable model.

Nothing exists today: no timestamps beyond `ReadingPosition.updatedAt`, no duration/pause/rewind counters, no completion flag, no charting code or dependency. What does exist and is reused: the ADR-0026 Reading session (exact start/end boundary), the word index (exact word offsets), the Session dialog (the natural summary surface), and the JSON store's normalize-on-load migration pattern.

## Considered Options

**Which surfaces count:**
- **Standard Reader only — chosen.** Every tracked session is an ADR-0026 Reading session with a defined end. RWW rejected for v1: it never raises a session end (`host-completion`), its fabricated text has no `id` ("no id → no persistence" is a documented invariant), and glance-reading would pollute fluency/speed averages. Transmute is video export, not reading.

**Session identity and the discard fork:**
- **1:1 with the ADR-0026 Reading session; discarded runs still count — chosen.** The reading physically happened; "Exit without saving" moves the resume point, not the activity. A session that advanced zero words records nothing. Rejected: erasing discarded runs (silently loses real activity, cheats streaks); one-record-per-Reader-visit (invents a second session concept).

**"Words read" under rewinds:**
- **High-water mark — chosen:** furthest offset reached − session start offset. Re-reads never double-count, so quota cannot be farmed by rewinding; a late rewind doesn't erase progress. Rejected: gross exposure (gameable), net displacement (words visibly go backwards).

**Fluency definition:**
- **0–100 score derived from an interruption rate — chosen.** Rate = (2 × rewind events + counted pauses) per active reading minute (the outline's weights, unit made explicit); Fluency = `100 / (1 + rate)`. Rejected: the outline's raw formula as the headline number (lower-is-better inverts the "grow your fluency" pitch); raw counts only (loses the one-number hook).

**Streak model:**
- **Weekly rest-day budget — chosen (maintainer, hybrid).** Streak counts quota-met days; the user sets a weekly target of N quota-met days (default 5/7); a missed day consumes one of the week's `7 − N` rest days; the streak breaks only when a calendar week's misses exceed its budget. Rejected: hard daily reset (punishes rest), consecutive-week streaks (loses the daily rhythm and the day-based multiplier).

**Storage:**
- **Two-tier, derive-on-read — chosen.** Per-day records with raw sums kept forever; full session records kept for the current day only, folded into their day record and pruned when the day closes. Weekly/monthly/lifetime/streak/averages are always derived at read time. Rejected: stored rollups (redundant, driftable — the outline's own "no stray data clusters" rule), sessions-forever (violates the outline's compaction rule).

**Charts:**
- **Hand-rolled SVG components — chosen** (line, bar, pie on design tokens). Data volume is ≤ a few hundred points per view. Rejected: a charting library (heavyweight dependency, restyling cost) and canvas (worse theming/accessibility for no benefit at this scale).

## Decision

### 1. Scope
Stats measure **standard-Reader Reading sessions only** (`SessionCompletion === 'session-dialog'`). RWW and Transmute are out of scope; widening to RWW is a future decision that must confront the no-id invariant explicitly.

### 2. Measurement definitions (per session)
- **Words read** = high-water word offset − session-start offset. *(Amended by ADR-0036: words read now come from the **credited frontier** — only playback advancement credits words; manual seeks never do.)*
- **Wall duration** = system-clock session start → end (`Date.now()`; negative deltas from clock changes clamp to 0).
- **Active reading time** = accumulated `playing`-state time only. *(Amended by ADR-0036: active time is now the gap-clamped sum between advancement events, so idle "playing" stops accruing.)*
- **Counted pauses** = explicit pause intents only (auto-pauses from browse/target-pick/dialogs never count), retroactively exempted if a reader surface opens or a reader setting changes before resume.
- **Rewind events** = maximal runs of consecutive rewind intents with no forward playback between them; scrubber seeks and restart excluded.
- **Measured WPM** = words read ÷ active reading minutes (distinct from the nominal `BPM × words_per_stack`).
- **Interruption rate** = (2 × rewind events + counted pauses) ÷ active reading minutes; **Reading Fluency** = `round(100 / (1 + rate))`.

Measurement lives in the session module as refs (no re-renders, no per-beat work — the Reader's performance is untouchable), and one IPC call at session end hands the raw record to the main process. Zero-word sessions are not recorded.

### 3. Time and day rules
System clock throughout. Days are **local calendar dates**; a session spanning midnight belongs entirely to the day it started. "Time spent on WingletReader today" = the sum of session wall durations (no app-focus tracking). *(Amended by ADR-0036: scored and aggregated time surfaces, "time today" included, now use active time; wall duration remains descriptive only.)*

### 4. Data model and compaction
One new `stats` key in `StoreData` (normalize-on-load defaults it; no schema version needed):
- **`days[]`** — one record per active day: raw sums (`wordsRead`, `wallMs`, `activeMs`, `pauses`, `rewinds`, `sessionCount`), per-day maxima for highscores (`longestSessionMs`, `bestSessionFluency`), snapshots (`quotaTargetWords`, `weeklyTargetDays`), `quotaMet`, `points`. Kept forever (~200 bytes/day). Averages are never stored — always derived from sums.
- **`sessions[]`** — full session records (`textId`, title snapshot, `startedAt`, `endedAt`, `activeMs`, `wordsRead`, `pauses`, `rewinds`) for **today only**. On the first stats operation of a new day, older sessions fold into their day records and are pruned.

The main process owns all day logic (date assignment, folding, pruning, points/streak evaluation). Today's day record is **live** — recomputed from today's sessions and the current quota on every fold, so a mid-day quota change behaves sanely; a closed day is frozen. *(Amended by ADR-0036: goal snapshots now pin at day/week boundaries — today stays live to new sessions, not to new settings.)* Deleting a text does **not** cascade into stats (history is history; the session's title snapshot keeps display working).

### 5. Quota, streak, points
- **Daily quota**: global setting stored in words, set/displayed in **quota pages** of **500 words** — the same size as the ADR-0025 Page, so "page" means one thing app-wide. Default 2 pages (1,000 words). No off-switch in v1.
- **Weekly target**: global setting, quota-met days per week, default 5, range 1–7.
- **Streak**: quota-met days since last break, with the weekly rest-day budget rule (see Considered Options). Derived from `days[]` + snapshots; no stored streak state.
- **Points**: on the day quota is met, `100 × min(1 + 0.1 × (streak − 1), 2.0)`, where streak includes that day. Points come from consistency only; fluency and speed are rewarded via highscores (best-day words, best session fluency, longest session, longest streak — all derived).

### 6. UI surfaces
- **Hub stats banner**: a long rectangular control **inside the hub header row**, between the dove and the Alpha/version block, previewing total words read, today's quota %, and today's reading time. Click → Stats screen. *(Amended 2026-08-12 on the maintainer's visual verdict: the original slot was its own row between the header and the tile grid, but the hub face is vertically centred, so a new row pushed the logo and version text up and the tile grid down. The header row is already the dove's height, so a banner inside it costs the face no height and every other element keeps its position. The 3×2 tile grid is untouched either way. The same pass squared the hub's chrome around it: the content column is now the grid's exact width (602px) so the banner spans it edge to edge, and the Alpha/version block was pushed 150px into a right-hand gutter, mirroring the dove's 150px left pull, so the hub reads as symmetric — dove · column · version. Both gutter elements clip equally on very narrow windows; neither scrolls.)*
- **Stats screen**: new `'stats'` route-table entry (shell layout, dove home, gear). Two tabs — **Dashboard** (numbers: Points top-right, quota/streak first, today + lifetime) and **Graphs** (one metric per screen; metric tabs × timeframe switch). No scrolling; the whole space is used (ADR-0021 precedent). *(Amended 2026-08-12 during implementation: **Today is a fourth timeframe**, not a separate day view — the switch reads Today/Week/Month/Total, and Today drills into the day's session list, capped at 8 rows. Points has no Today — points exist per day, not per session — and the metric switch falls back to Week rather than showing a dead tab. The quota donut answers the selected timeframe: today = words against the live quota setting, otherwise quota-met days ÷ elapsed days. Timeframe gating thresholds are pinned constants: Week needs 2 day records, Month 8, Total 2 calendar months.)*
- **Session dialog stats block**: all three variants gain a compact section — words, duration, measured WPM, pauses, rewinds, Fluency — each with a deviation indicator against a baseline: the average of today's earlier sessions, else the most recent prior active day's per-session averages, else hidden. The dialog may widen modestly; no separate window.
- **Settings**: an inline **Reading goals** group on the Settings landing (Appearance-pills precedent) with two steppers — quota (pages/day) and weekly target (days/week). The Stats screen edits the same keys.
- **Charts**: three hand-rolled SVG components (line/growth, bar, pie) on design-system tokens.

### 7. Export
The `stats` collection joins the existing `data:exportAll` payload and its import counterpart (replace-on-import). No new export UI.

### 8. Explicitly out of v1
- **Book claim** ("100%-completed text claimable once for size-scaled points") — deferred as a parked stretch issue; it needs persisted completion state and an anti-abuse design of its own.
- **RWW/Overlay Reader tracking**, streak freezes/grace tokens beyond the rest-day budget, a quota off-switch, and any stored aggregates.

## Consequences

- **`CONTEXT.md` updated on decision** (this session): Session stats, Active reading time, Counted pause, Rewind event, Reading Fluency, Day record, Daily quota, Streak, Points, Stats screen glossary entries + a Feature Status row.
- **Vocabulary**: the outline's "Fixations"/"Regressions" are **not** adopted — they collide with eye-tracking terminology (a fixation is normal reading). Canonical terms: **counted pauses** and **rewind events**.
- **Store change is additive** — normalize-on-load defaults `stats` for old files; old builds opening a new file ignore the key. One store write per session end (the store already rewrites whole-file per mutation; this adds no new write pattern).
- **Local-first intact** (ADR-0007): stats never leave the device; export is user-initiated.
- **The hub 3×2 tile grid and ADR-0012/0013 layout are not modified** — the banner is a new sibling above the grid, and the "Tile" glossary meaning is unchanged.
- **`sessionPersists` / no-id invariant untouched** — stats gating rides `SessionCompletion`, not text identity.
- **Verification gate:** `npm run build` + `npm test`; do not increase the `tsc -b` baseline (44). New pure math (fluency/streak/points/day-fold) must land with exhaustive unit tests before any UI consumes it.
