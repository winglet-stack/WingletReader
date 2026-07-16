# ADR-0026: Session dialog — guided session-end follow-up + two-snapshot save model

**Date:** 2026-07-13
**Status:** Accepted
**Relates to:** ADR-0024 (Goal/Target bookmark auto-stop — this dialog is where the crossing now lands), ADR-0013 (Reader persistent frame; Reader is exempt from shell chrome and owns its own Back), ADR-0020 (dove always means hub — invariant preserved), ADR-0012 (role-based colour), ADR-0008 (`ReadingPosition` persistence — unchanged contract).

## Context

Two Reader session-end paths were abrupt and offered no guidance:

- **Stop** (`stop()` in `usePlayback.ts`) yanks the viewport index back to 0, sets `stopped`, and renders a bare `"Finished."` idle panel. Position *is* saved on the `playing → stopped` transition (`shouldSavePosition`), but the reset-to-0 plus the terminal panel *reads* as "progress lost," and the resume affordance does not refresh in place. The run4 brief's premise ("stop resets progress to the beginning") is imprecise, but the felt problem is real.
- **Target reached** (goal crossing, `useSessionAutoStop`) calls the same `stop()` and deletes the goal, then also shows `"Finished."`. There is no "continue" affordance today (contrary to the brief's assumption).

Both dump the user at a dead end with follow-up actions hidden elsewhere in the UI. Separately, **leaving mid-play** (top-left dove) does not reliably persist the current position.

The rework introduces a **Session dialog**: a centered modal offering guided follow-up, backed by a save model that lets a reader *deliberately discard* a run and reread from their last save — the one save decision users actually think about.

## Considered Options

**What "Exit without saving" reverts to (hard-to-reverse persistence choice):**
- **Session-start baseline — chosen.** Snapshot the saved position at the moment a session begins; "Exit without saving" restores it. This is the only model that makes "discard this run" real, because pausing/leaving auto-saves the current position mid-session (so there is no earlier value to fall back to otherwise).
- **No active revert** (just skip the final save). Rejected: mid-session pause already persisted a newer position, so "discard" would be a lie.
- **Text-engage baseline** (sticky across multiple play/stop cycles in one Reader visit). Rejected: broader than the user's mental model of "this run"; a second run in the same visit should be discardable to *its* start, not the visit's start.

**How many snapshots:**
- **Two — chosen (maintainer).** Session baseline + live current position. Keep history minimal and context-specific; no undo stack.

**Presentation:**
- **Centered modal (dialog) — chosen.** The brief asks for a static, centered box in the stage that guides the next action; matches the "one deliberate moment" nature of session end. Distinct from the anchored Popovers.
- **Inline idle-panel buttons.** Rejected: the follow-up actions (reroute to target-pick, exit routing) are too heavy for the idle summary, and the brief explicitly wants a dedicated surface.

**Exit destination:**
- **Session-dialog exits → Library; dove → hub — chosen.** The brief routes deliberate exits to the Library (pick the next book). The dove-→-hub invariant (ADR-0020) is untouchable, so the two affordances deliberately differ.

## Decision

### 1. Two-snapshot save model
An active **reading session** tracks exactly two positions: a **session baseline** (the saved position captured when the session starts) and the live **current position** (auto-saved on every pause/leave, as today). No deeper history.

### 2. Session boundary
A session **begins** when playback goes idle/stopped → playing (Play or Resume-from-saved) and **ends** on Stop, Target crossing, natural end, or leaving the Reader. **Pause/resume within a session does not** start a new session or move the baseline. The baseline is captured at the session-start transition.

### 3. Save-on-leave is unconditional; discard is the one exception
Any pause or leave (including the top-left dove → hub) persists the current position — the reader never loses their spot by accident. **"Exit without saving"** is the sole path that overrides this by restoring the session baseline. **"Save & Exit"** commits the current position.

### 4. Terminal transitions pause-and-hold (no reset-to-0)
Hitting Stop, crossing the Target, or reaching the natural end now **pauses and holds the current position** and raises a session-end signal (`stop | goal | end`). The viewport no longer jumps to index 0 on session end; the reset-to-start happens only if the reader actually chooses "Exit without saving" (which reverts to baseline) — the hold lets the dialog show real progress and lets "Continue reading" resume in place.

### 5. The Session dialog
A centered, focus-trapped modal inside the Reader stage, sized no wider than the controls row, nudging the idle logo up, showing a **progress metric only** (percentage + words; no text field). Actions are stacked **safe-on-top** and colour-coded via ADR-0012 roles (blue filled primary, blue outline secondary, `--danger` destructive, neutral ghost). Three variants:

| Variant | Trigger | Title (user-facing) | Actions (top → bottom) |
| --- | --- | --- | --- |
| **Stop** | Stop button (`S`) | **Stop reading?** | Save & Exit · Exit without saving · Abort |
| **Target** | Goal/Target crossing | **Target reached** | Continue reading · Set a new target · Save & Exit · Exit without saving |
| **End** | Natural finish | **Finished** | Save & Exit · Exit without saving |

All user-facing copy uses **Target**, never "Goal" (ADR-0024 amendment); `goal` / `kind: 'goal'` stays code-only.

- **Save & Exit** → commit current position → **Library**.
- **Exit without saving** → restore session baseline → **Library**.
- **Abort** (Stop only) → dismiss, stay in Reader **paused** at current position.
- **Continue reading** (Target) → resume at the crossing position, **paused** (no active target — it self-deleted on crossing).
- **Set a new target** (Target) → close the dialog and re-enter the ADR-0024 §4 arm-then-pick flow; after the new target is saved, land back at the crossing position, paused.

The **Target** variant uses the user-facing label **Target** (ADR-0024 amendment); code/`kind` stays `goal`. The **End** variant replaces the bare `"Finished."` terminal panel.

### 6. Interaction
Opening any variant pauses playback. **Esc** and **backdrop click** act as Abort (Stop) / dismiss (Target, End). **Space** is swallowed while open (no accidental resume). **Enter** activates the focused action. Fade-in honours `prefers-reduced-motion`. The box is static (no drag, no reflow).

### 7. Routing
Reader gains an **`onExitToLibrary`** entry point (→ `setView('library')`) distinct from `onBack` (→ hub, dove). The dove keeps its ADR-0020 meaning and now auto-saves on the way out.

## Consequences

- **`CONTEXT.md` updated on decision** (this session): new **Reading session**, **Session baseline**, **Session dialog** glossary entries; **Goal bookmark** amended to note the crossing now opens the Session dialog (Target variant).
- **Persistence contract unchanged in shape.** `ReadingPosition` stays `stackIndex`-anchored; the baseline is an in-session renderer value, not a new store field. No schema change, no ADR-0008 change.
- **`usePlayback.stop()` semantics change** (reset-to-0 moves out of the terminal path). Tests asserting index-0-on-stop (`readerSession.behavior.test.tsx`) are updated.
- **Post-reading summary flow seam.** The summary flow is off for alpha (`postReadingSummaryEnabled: false`). Post-alpha it slots in as a step reachable from **Save & Exit**; the dialog leaves room but no summary wiring ships now.
- **Overlay Reader (RWW) / Transmute** are out of scope: `TemporaryReaderApp` mounts the Reader with `backLabel="Close"` and its own finish path; the Session dialog is gated to the standard in-app Reader host and must not hijack the RWW close flow.
- **Verification gate:** `npm run build` + `npm test`; do not increase the `tsc -b` baseline (45). New coverage: baseline capture + commit/revert (readerSession), pause-and-hold terminal transition, SessionDialog variants/keyboard, and reader wiring for each action.
