# ADR-0031: Hard sentence boundaries — a period always ends a Stack

**Date:** 2026-07-18
**Status:** Accepted
**Supersedes:** ADR-0030's "sentence ends **soft**" decision and its Option-A pause logic (the rest of ADR-0030 — the balanced DP packer, the N cap, quadratic under-fill, paragraph/headline hard boundaries, atomic names, standalone markers — stands unchanged).
**Relates to:** ADR-0014 (words-per-stack range), ADR-0019 (`words_per_stack` is a grid parameter).

## Context

ADR-0030 made sentence ends **soft**: the balanced packer could cross a period when stopping there would drop a Stack below the preferred band, and pauses were attributed by "Option A" (a *crossed* sentence lost its breath). That kept word counts close to N, but it made the **period cadence non-deterministic** — a given sentence end sometimes terminated a Stack (and paused) and sometimes did not, depending on the surrounding word arithmetic. In reading, that variable breath is exactly what disrupts pace: the reader cannot settle into a rhythm when the between-sentence beat keeps moving.

The maintainer's judgment after living with the soft packer: **the regularity of the period matters more than squeezing every Stack up to N.** A period should *always* end a Stack — no exception — so the between-sentence breath lands predictably every time.

This reverses a core, explicitly-reasoned decision of ADR-0030, so it gets its own ADR rather than an in-place edit.

## Considered options & decisions

**Sentence boundary hardness (the reversal):**
- **Sentence ends hard — chosen.** A word ending in terminal punctuation (`.`/`!`/`?`, incl. trailing quotes/brackets) always terminates a Stack. Sentences join paragraphs, headlines, and standalone markers as pre-split points: the balanced DP now runs **per sentence**, never across one. *Keep soft (ADR-0030)* rejected — it is the source of the variable cadence. *A narrow "merge a sentence of ≤ K words" escape hatch* rejected — the maintainer explicitly wants **no exception**; an escape hatch reintroduces the non-determinism it removes.

**Consequence for short sentences (accepted, not mitigated):**
- **A standalone short sentence becomes a short Stack, held for one beat — accepted.** With no crossing allowed, *"He nodded."* at N=8 is a 2-word Stack; dialogue/staccato prose produces *more* short Stacks than the soft packer did. This is deemed **semantically correct** — a one-clause sentence *is* a beat — and it is the direct price of the deterministic cadence. The "avoid isolated rest bits" intent therefore scopes to **within-sentence** splitting only (see below); it cannot merge two sentences.

**Within-sentence uniformity (unchanged mechanism, re-confirmed intent):**
- **Lean on the existing quadratic-toward-N DP — chosen, no cost change.** A sentence longer than N is partitioned by the same `packStacks` DP (cap N, cost `(N − span)²`), which already yields *even* splits because squaring punishes the outlier: an 11-word sentence at N=8 → `[6,5]` not `[8,3]`; a 17-word → `[6,6,5]` not `[8,8,1]`. So "keep the thresholds, keep deviation low" needs **no new machinery** — it is what the DP does once sentences are the unit. `stackPacker.ts` and its balance-case tests are untouched.

**Timing (deferred idea dropped):**
- **Strict one-beat-per-Stack — chosen; proportional timing dropped entirely.** ADR-0030 left proportional timing as an owed follow-up to shrink a short Stack's dwell. It is now **rejected outright**, not merely deferred: one-beat-per-Stack *is* the metronome the maintainer wants. Shrinking a short Stack's dwell would even out words-per-minute at the cost of an **irregular beat** — the opposite of the goal. The whole change stays inside `tokenizer.ts`; `usePlayback.ts` is not touched.

**Pause attribution (Option A collapses):**
- **Every sentence-terminal Stack pauses — chosen.** With no crossed sentences left, Option A ("pause from the Stack's last word") degenerates to the trivial, uniform case: mid-sentence sub-Stacks are `normal` (no pause); the Stack that ends a sentence is `sentence-end` (its pause); the Stack that ends a paragraph is `paragraph-end`. `terminalStackType` already computes this from the last token — no code change, but the *outcome* is now uniform by construction. `pauseMs` values unchanged.

**Sentence detection (the price of "hard"):**
Promoting periods to hard makes a *false* period costly: under the soft packer a mis-detected period was a cheap break candidate the DP could ignore; now it **forces** a wrong split and a spurious pause — manufacturing the very isolated rest bit this ADR removes. So detection is hardened with two cheap, complementary guards on `isSentenceEnd` (`tokenizer.ts`):
- **Abbreviation blocklist — chosen.** A trailing-punctuation word is *not* a sentence end if its lowercased form (sans trailing quotes) is a known abbreviation: titles (`mr. mrs. ms. dr. prof. st. sr. jr.`), latinisms (`e.g. i.e. etc. vs. cf. al.`), and single-letter initials (`/^[a-z]\.$/i`, covering `A.`, `J.`, and each letter of `U.S.A.`). Curated, ~15 lines, no dependency, extensible. *Full NLP segmentation / decimals / URLs* rejected as disproportionate to an alpha.
- **Lowercase-continuation guard — chosen.** A word ending in terminal punctuation is a sentence end **only if** it is the paragraph's last word *or* the next word begins with a capital (or opening quote). This kills the **dialogue-tag** false positive — `"Are you sure?" he asked.` no longer force-splits into `["Are you sure?"]` + `[he asked.]` — which the abbreviation list cannot catch (a tag is not an abbreviation). Its only false *negative* is a sentence deliberately beginning lowercase (stylized prose, `iPhone shipped.`); that merely under-splits (safe — no isolated bit), the safe direction.

## Decision (summary)

Promote sentence ends from soft to **hard**: a period always terminates a Stack, no exception. The balanced DP runs **per sentence** instead of per paragraph; its cost function and the N cap are unchanged, so long sentences still split evenly and deviation stays low. Standalone short sentences become short Stacks held for one metronomic beat — accepted, not mitigated (proportional timing is dropped, not deferred). Option-A pause logic collapses to "every sentence-terminal Stack pauses." Two guards — an abbreviation blocklist and a lowercase-continuation check — harden `isSentenceEnd` so the hard split fires on real periods only. The change is confined to `tokenizer.ts`.

## Consequences

- **Positive:** the between-sentence breath is now perfectly regular — every period pauses, none is crossed; cadence is metronomic and predictable, the maintainer's stated goal. Within a sentence the DP still packs close to N with low deviation. Dialogue mis-splits and abbreviation mis-splits are largely gone.
- **Costs:** dialogue/staccato prose shows more short Stacks (each a real sentence, held one beat) than the soft packer did — the accepted trade for cadence regularity. `videoRenderer`/Transmute inherit the change (shared `buildStacks`) and their test expectations shift. Existing reader sessions change cadence on upgrade (intended). Sentence detection is still heuristic — the two guards cover the common cases, not every edge (rare mid-word dots, ellipsis-as-continuation).
- **Execution:** one AFK slice — **SP-5** (the three `tokenizer.ts` changes + both guards + test updates) — appended to the elastic-stack-packer cascade, landing **before** the still-open SP-4 feel gate, whose kickoff is amended to validate *this* behavior (metronomic cadence; no mid-dialogue splits) rather than ADR-0030's now-obsolete crossing/pause trade-off.
