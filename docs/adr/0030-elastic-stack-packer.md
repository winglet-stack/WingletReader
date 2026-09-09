# ADR-0030: Elastic stack packer — honour `words_per_stack` with balanced, sentence-aware chunking

**Date:** 2026-07-17
**Status:** Accepted (partially superseded)
**Superseded by:** ADR-0031 — reverses the "sentence ends **soft**" decision and its Option-A pause logic; a period now always ends a Stack. The rest of this ADR (balanced DP packer, N cap, quadratic under-fill, paragraph/headline hard boundaries, atomic names, standalone markers) stands.
**Relates to:** ADR-0014 (words-per-stack range), ADR-0019 (words_per_stack is a grid parameter), the Viewport-safe layout cascade (fit-solver sizing — unchanged; this ADR reshapes *what* words land in a Stack, not how the Stack is fitted).

## Context

`words_per_stack` (N) is presented to the user as "the number of words shown per Stack." In practice the reader frequently shows far fewer, badly enough to disrupt reading flow: at N=8 a reader routinely sees a 2-word Stack held for a full beat.

Two independent causes, found in `engine/tokenizer.ts` + `hooks/usePlayback.ts`:

1. **Greedy boundary splitting.** `fillNormalStack` packs words greedily but cuts a Stack short at every sentence end, paragraph end, comma (opt-in), name group, long word, or headline. There is **no minimum-words floor** — a short sentence like *"He nodded."* becomes a 2-word Stack even at N=8.
2. **Flat per-Stack timing.** Every Stack is shown for one beat (`beatMs = 60000/bpm`) regardless of fill; a sentence-end Stack is held even longer. So a short Stack doesn't just look sparse — it *lingers*.

Two aggravating facts:
- `MAX_WORDS_PER_STACK = 7` hard-caps every Stack, but the `words_per_stack` stepper allows **1–10**. Any N > 7 was silently impossible — setting 8 always yielded ≤ 7.
- CONTEXT.md's Stack glossary asserted *"a fixed number of words … for exactly one beat"* and `WPM = BPM × words_per_stack`. That invariant was already false: short Stacks make real throughput lower than the formula claims.

The overriding intent: **the words shown should match the configured N most of the time**, with a bounded elasticity so we avoid both jarring short Stacks and over-long ones — while not destroying the sentence rhythm that aids comprehension.

## Considered options & decisions

**Primary lever (packing vs. timing):**
- **Packing fidelity — chosen.** Reshape *which* words fill a Stack so it stays close to N. Rejected *proportional timing alone* (scale a short Stack's duration): it still shows 2 words, just briefly — the maintainer's complaint was the short Stack itself, not only its dwell time. *Both* deferred (see residuals).

**Word-count band (elasticity threshold):**
- **Ceiling = N (upper tolerance U = 0) — chosen.** A Stack never exceeds N: the user asked for N, not N+1. This makes N a hard cap and retires the fixed `MAX_WORDS_PER_STACK = 7` (the cap now *tracks N*). *Fixed cap raised to 10* rejected — keeps cap and N as separate concepts. *Keep 7, lower the slider* rejected — refuses the maintainer's wish to read 8+.
- **Preferred floor = N−2 (lower tolerance L = 2), hidden constant — chosen.** Not a user setting for the alpha; one tuned constant, revisited after real reading. *Exposing an elasticity setting* rejected — adds UI/schema/migration to an already-dense editor for a value best tuned by feel.

**Structural boundaries (crossable vs. sacrosanct):**
- **Sentence ends soft, paragraph ends + headlines hard — chosen.** A Stack may span a sentence end when stopping there would drop below the band, but never spans a paragraph or headline (clean semantic resets). *Crossing headlines too* rejected — they are visually distinct and already grouped separately.

**Split policy within a paragraph:**
- **Balanced, sentence-aware — chosen.** Partition each paragraph so Stacks are as uniform and close to N as possible without exceeding N, preferring breaks that land on sentence ends when in-band. With U=0 a short residual is only forced for awkward paragraph lengths (e.g. 9–11, 17 words at N=8) — short Stacks become *rare* instead of routine. *Greedy fill + accept short tail* rejected — leaves a short tail ~5 paragraphs in 8. *Greedy + merge tiny tails* rejected — a weaker special-case of the balanced pass.

**Pause attribution (Option A):**
- **Pause is decided by a Stack's last visible word — chosen.** Ends on a sentence → sentence pause; on a paragraph → paragraph pause; mid-text → none. Sentences the packer *crossed* lose their breath. Rejected *pause after any Stack containing a sentence end* — the breath lands a beat late, mid-clause of the next sentence, which reads as a stutter. Rejected *tune the packer to rarely cross* — buys pauses by reintroducing the short-Stack stutter the change exists to remove. Rationale: natural flow needs breaths at *visible* breaks **and** an even cadence; A keeps both, and the balanced packer already lands most breaks on in-band sentence ends so most pauses survive.

**Opt-in chunk rules:**
- **Break rules (`commas`, `long-word`) fold into elasticity as soft, crossable preferred break points — chosen.** A comma-on user gets *more* good break candidates, not more stutter. *Honour literally (hard)* rejected — comma-heavy prose reinstates the exact stutter being fixed.
- **Structural rules stay hard — chosen.** A name group is atomic (a boundary can't fall inside it); a bullet/enum marker keeps its standalone position. These are formatting the user explicitly enabled, and rare enough not to hurt cadence.

**Residual short Stacks:**
- **Accept at one beat; timing code untouched — chosen.** Packing removes ~90% of short Stacks; survivors mostly sit at paragraph ends where a longer beat is the intended breath. Proportional timing stays a clean, separable follow-up if residuals still bother the reader in practice.

## Decision (summary)

Replace greedy chunking with an **elastic, balanced, sentence-aware packer**. Each paragraph is partitioned by a small per-paragraph cost-minimising pass (a DP): Stacks are capped at N (U=0), pulled toward N by a quadratic under-fill cost (self-balancing), and preferentially broken on sentence ends and — when enabled — commas / before long words (all soft, crossable within the band). Paragraphs and headlines are hard boundaries; name groups are atomic; bullet/enum markers stand alone. The fixed 7-cap is retired (cap tracks N). Pause type is taken from each Stack's last word. Timing is unchanged. Elasticity (L=2, U=0, break-penalty `B`) ships as tuned constants, not settings.

## Consequences

- **Positive:** shown words match N most of the time; the 2-words-for-a-full-beat stutter is gone for the common cases; N > 7 finally works; opt-in comma reading stops stuttering; the CONTEXT invariant becomes *approximately* true and is restated as nominal.
- **Costs / follow-ups:** `buildStacks` is shared with the Transmute video renderer, which inherits the new packer — deliberate (consistency), but `videoRenderer` test expectations shift. Existing reader sessions change cadence on upgrade (intended). `B` is the one tuning soft-spot, pinned by balance-case tests. Proportional timing for rare residuals remains an owed, optional follow-up.
- **Execution:** tracked as the drip-fed SP-1..SP-N cascade in `.scratch/active/elastic-stack-packer/issues/`.
