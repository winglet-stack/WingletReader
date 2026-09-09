# ADR-0036: Stats integrity guards — credited frontier, gap-clamped active time, pinned goals

**Date:** 2026-08-13
**Status:** Implemented
**Amends:** ADR-0035 — the §2 **words read** and **active reading time** definitions, the §3 "time spent today" rule, and the §4 goal-snapshot effectivity ("today's day record is live"). Everything else in ADR-0035 stands unchanged, including the RWW/Transmute scope exclusion, the two-tier storage model, the Fluency/points/streak formulas, and the rewind-event definition.
**Relates to:** ADR-0026 (the Reading session boundary all measurement rides on), ADR-0007 (local-first — the numbers below never leave the device, which shapes the threat model), ADR-0012/0022 (role colour + design system for the goal editors' effectivity hints).

## Context

ADR-0035 shipped session/day stats, a daily quota, a weekly rest-day streak, and points. A same-week integrity sweep of the shipped measurement path found five ways **ordinary Reader use** — not an attacker — breaks the meaning of the numbers:

1. **Forward seeks inflate words read.** Words read is a raw high-water offset re-read from the live viewport index (`currentIndex`) at pause, stop, and the first post-seek beat (`useSessionStatsTracker.ts`). Holding skip-forward and then stopping credits the whole book with near-zero active time — an absurd measured WPM, Fluency 100, and quota/points/streak fallout from a single session record. Scrubber drags and bookmark jumps share the same sink.
2. **Tap-to-read idles as "playing".** In tap-to-read, no timer is scheduled (`usePlayback.ts`) but the play state stays `playing`, so active reading time accrues indefinitely while the user does nothing — farming Fluency toward 100 and dragging measured WPM.
3. **Wall time is unbounded.** `wallMs = endedAt − startedAt` with no pause subtraction, and it feeds scored surfaces: a Reader parked overnight banks a `longestSessionMs` highscore and inflates the hub banner's "time today".
4. **Goal edits re-score the present.** Today's day record is rebuilt with the live goal settings on every stats read, and the weekly rest-day budget takes the latest-in-week snapshot — so one slider drag re-scores today and the current week, and can mint points or resurrect a broken streak retroactively.
5. **The pause exemption is unbounded.** A counted pause is retro-exempted by *any* setup activity at *any* point before resume — pause, walk away for an hour, touch one setting, and the interruption never happened.

Already solid, and explicitly preserved by this ADR: the max-only re-read guard, the rewind-run collapse, the RWW/unstored-text gate (`shouldRecordSessionStats`), and the zero-word drop.

## Considered Options

**What the guards defend against:**
- **Integrity of the measurement path under honest use — chosen.** Guards live where stats are measured and folded (`useSessionStatsTracker`, `statsMath`, `database.ts`). Rejected: an anti-cheat posture (clock-roll hardening, import plausibility bounds, autoclicker detection) — this is a local, single-user app whose stats never leave the device (ADR-0007); a determined user self-cheating is unguardable and not worth complexity that can misfire on honest use. Recorded as explicit non-goals below.

**Words read under seeks:**
- **Monotone credited frontier — chosen.** One scalar; words credit only when displayed under playback advancement; a forward seek rebases the frontier without credit. Rejected: interval bookkeeping (crediting every word ever displayed via a set of read ranges) — it would credit backtracking into a skipped gap, but at the cost of real bookkeeping for a case that is rare and self-correcting (reading the gap normally from before it would have credited it); the conservative miss is accepted.
- Rejected: filtering seeks at the intent layer only — the fold paths also re-read the live index, so any single missed path re-opens the hole. The frontier moves the definition itself.

**Idle time:**
- **Gap clamp between advancement events — chosen.** Time between advancements counts up to a cap scaled to the nominal beat; beyond it, the reader has stopped reading regardless of play state. Rejected: window-focus/idle detection — ADR-0035's rejection of app-focus tracking stands; focus is a poor proxy (Overlay-style glancing, second monitors) and platform-fiddly.

**Goal-edit effectivity:**
- **Pin at day/week boundaries — chosen.** Symmetric (no raise-now/lower-later asymmetry), no re-scoring of the present, and edits before the first recorded session still apply immediately — so first-launch setup and "set a goal, then read" both feel live. Rejected: live recompute (the shipped behaviour — hole 4); asymmetric rules like "harder now, easier later" (two rules to explain instead of one).

## Decision

### 1. Posture

The guards defend the **meaning of the numbers under normal Reader use**. They live where stats are measured and folded — the renderer session tracker and the main-process fold/snapshot logic — not in input handlers scattered across the Reader. Clock manipulation, hand-edited import payloads, and autoclicker taps are accepted non-goals (see Non-goals).

### 2. Credited frontier replaces raw high-water for words read

A session tracks a **credited frontier**: the furthest word offset the session has *earned*, monotone, advanced only by an **advancement event** — a playback timer beat or a tap-to-read `step()`. **Words read = total frontier advance credited by advancement events**, replacing "high-water offset − start offset".

- **Manual seeks never credit.** Skip forward/back (±10/±30), scrubber drags, and bookmark jumps move the viewport, not the earned total.
- **A forward seek rebases the frontier to the seek target** (crediting nothing). The skipped gap sits *behind* the frontier and can never be credited retroactively.
- **A backward seek leaves the frontier where it is.** Credited progress is never taken away, and replaying already-credited text credits nothing (the frontier is already past it) — the ADR-0035 no-double-count property, preserved by construction.
- **`restart()` behaves as a backward seek**; `step()` is an advancement event.
- **Fold paths must never read the live viewport index for words.** Pause, stop, and session-end folds read the credited frontier; the shipped re-reads of `currentIndex` at those points are exactly hole 1 and are removed.
- **Accepted conservative edge:** after a forward skip, backtracking into the skipped gap and genuinely reading it credits nothing — the frontier is monotone and there is no interval bookkeeping. Reading on past the frontier credits normally from there.

### 3. Gap-clamped active time

**Active reading time = the sum of gaps between consecutive advancement events, each gap clamped** at

```
maxCreditedGapMs = max(GAP_CLAMP_FACTOR × nominalBeatMs, GAP_CLAMP_FLOOR_MS)
                 = max(4 × (60_000 / bpm), 10_000)
```

where `nominalBeatMs` uses the BPM in effect at the time of the gap. Timer-driven play at normal cadence is unaffected (beats arrive well inside the clamp); tap-to-read idling and timer-mode stalls (app suspend, lid close) stop accruing at the cap instead of banking unbounded "playing" time. This is deliberately **not** window-focus or OS-idle detection — ADR-0035's rejection of focus tracking stands; the clamp needs no platform signal beyond the advancement events the session already sees.

### 4. Active time is the scored currency; wall time is descriptive

Every user-facing **aggregated or scored** time number switches to active time: the hub banner's "time today", the `longestSessionMs` highscore, and any other surface that ranks, sums, or rewards time. `wallMs` stays on session records as **descriptive session-span data** (when the session ran, how long the Reader was open) and feeds no score. This amends ADR-0035 §3: "time spent on WingletReader today" is now the sum of session **active** times.

### 5. Goal edits pin at boundaries

Goal settings freeze for a scoring period at that period's first recorded activity; edits made after the pin apply to the next period. Before the pin, edits apply freely — covering first-launch setup and set-a-goal-then-read.

- **`daily_word_quota`** pins at the **first recorded session of the local day**; later edits take effect **tomorrow**.
- **`weekly_quota_days`** pins at the **first recorded day of the Monday-based week**; later edits take effect **next Monday**.
- The weekly rest-day budget snapshot switches **latest-in-week → first-in-week** accordingly.
- **Goal editors say so:** when the pin is set, the Settings group and the Dashboard steppers surface "takes effect tomorrow" / "takes effect next Monday".
- **Closed-day verdicts and points stay frozen as folded.** The rule is symmetric — no raise-now/lower-later asymmetry.

Today's day record remains live with respect to **new sessions** (ADR-0035 §4); what it no longer does is re-score against **new settings**.

### 6. The pause exemption is time-bounded

The ADR-0035 §2 retro-exemption of a counted pause (setup, not struggle) now applies **only when the first setup activity lands within 30 seconds of the pause start**. A pause whose first surface-open or setting-change comes later stays counted.

### 7. Integrity constants co-located

The three integrity constants — the gap-clamp factor (**4**), the clamp floor (**10 s**), and the exemption window (**30 s**) — live together, named and commented, in `statsMath` or one sibling constants module. No magic numbers at call sites.

### 8. No migration

Already-recorded sessions and day records keep their numbers; pre-guard inflation is accepted. New semantics apply **going forward only** — a closed day's wall-based `longestSessionMs` is historical fact, not recomputed, and no store migration or normalize-on-load rewrite ships with this ADR.

## Non-goals

Accepted and out of scope, on one shared rationale: **WingletReader is a local, single-user app; a determined user cheating their own reading stats is unguardable, and guarding against it would add complexity that can misfire on honest use.**

- **Clock rolls** — setting the system clock back/forward to farm days or streaks. ADR-0035's clamp-negative-deltas rule stands; nothing more.
- **Import plausibility bounds** — `data:importAll` replaces the stats collection verbatim; a hand-edited payload is the user's own file.
- **Autoclicker taps** — scripted tap-to-read is real input to the app; the gap clamp bounds its *time* credit, and no tap-pattern detection is attempted.

Also unchanged by this ADR: rewind counting, the Fluency formula, the points formula, the streak shape, and the existence of the setup-activity exemption (it stays, time-bounded per §6).

## Consequences

- **Implemented 2026-08-13.** The guards landed without widening the threat model or
  migrating historical records. Implementation clarified five mechanics from the
  decision: a non-manual forward index change credits without a `playing`-state gate so
  the natural-end final Stack is not lost; manual seeks rebase the frontier through the
  existing move revision; a gap uses the live BPM when it closes and manual seeks neither
  close nor re-anchor it; derived time view models are named `activeMs` while stored
  `wallMs` remains descriptive; and the first setup activity makes a sticky, inclusive
  (`<= 30 s`) pause-exemption verdict. Goal-pin state is derived on the existing stats
  overview envelope, with imported/out-of-order history normalized before the first
  day/week snapshot is selected.
- **`CONTEXT.md` updated on decision** (this session): **Credited frontier**, **Advancement event**, and **Active time vs wall time** glossary entries.
- **ADR-0035 carries four one-line "amended by ADR-0036" markers** at the superseded spots (§2 words read, §2 active reading time, §3 time-today, §4 goal-snapshot effectivity); its decision text is otherwise untouched.
- **Historical records keep pre-guard numbers** (§8): dashboards may show a wall-time-era `longestSessionMs` or a seek-inflated best day recorded before the guards landed. Accepted and not annotated in the UI.
- **Vocabulary:** the manual-advance control is **skip forward** — never "fast forward" — in all tracked docs and user-facing copy. Canonical guard terms: **credited frontier**, **advancement event**, **gap clamp**, **active time vs wall time**, **pinned goal snapshot**.
- **Measurement stays refs-only** (ADR-0035 §2): the frontier and gap accounting ride the advancement events the tracker already observes; no per-beat re-renders, no new IPC.
- **Verification gate:** `npm run build` + `npm test`; do not increase the `tsc -b` baseline (46). The frontier/clamp/pin math must land with exhaustive unit tests before any UI consumes it.
