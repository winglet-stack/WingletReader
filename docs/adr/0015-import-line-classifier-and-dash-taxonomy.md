# ADR-0015: Import normalization — bullet/prose-dash line classifier and dash taxonomy

**Date:** 2026-06-22
**Status:** Accepted

## Context

Post-import cleanup (`src/shared/importTextCleanup.ts`) runs eleven heuristic passes
over extracted text. The pass relevant here is `convertSoftLineWraps`: in the standard
(content) variant it flattens **every** single `\n` (a newline not adjacent to another
`\n`/`\f`) into a space, on the assumption that a lone line break inside extracted text is
a soft wrap, not a structural break. The reader's plain-text view uses a second variant,
`skipSoftLineWraps: true` (**content_display**), which preserves those single newlines.

Two long-known gaps motivated the Normalization Conformance Corpus
(`.scratch/done/import-format-normalization/`, NCC-1…7) and are now being extended test-first:

1. **Bullets are destroyed.** A real bullet list

   ```
   Shopping list:
   - milk
   - eggs
   ```

   flattens to `Shopping list: - milk - eggs` because each bullet's leading `\n` is a
   soft wrap. But a leading `- ` is genuinely ambiguous: `He paused\n- then walked on` is
   **prose** (a dash/aside) and *should* flatten, whereas `Steps:\n- then walk on` is a
   **bullet** and should keep its line. The signal that separates them is **context**, not
   the shape of the `- ` line itself.

2. **Confusable dash codepoints pass through verbatim.** The pipeline touches no dash
   today, so a mis-encoded minus sign (U+2212) standing in for a hyphen, or a typed `--`
   meant as an em dash, survive unchanged.

The hard constraint over both is the **content / content_display word-count parity
invariant** (Stage B of the corpus). The reader's RSVP highlight maps a word offset into
`content_display`; that mapping is only correct if `content` and `content_display` contain
the **same number of word tokens**. Any change to which newlines are flattened must not
break that invariant.

This ADR was written in the NCC-6 HITL slice (a `grill-with-docs` session, 2026-06-22)
that ratified the targets NCC-5 seeded as `aspirational` (`it.fails()`) cases in
`src/shared/__tests__/normalization-corpus/cases.ts`. The NCC-5 seeds front-loaded the
open questions; the maintainer resolved each below. **No source behaviour changes in this
slice** — `importTextCleanup.ts` and `textSegmenter.ts` are untouched; NCC-7 implements the
decisions here and flips the aspirational cases to `passing`.

> **Numbering note.** An earlier (gitignored, never-committed) draft of the corpus README
> referenced an ADR-0015 that did not exist. This file *is* that ADR; before it, the
> highest ADR in the repo was 0014 and ADR-0015 must not have been cited as accepted.

## Considered Options

**Line classifier — what makes a leading `- ` a bullet:**

- **Following-line shape ("any line starting `- ` is a bullet").** Rejected: the seed
  `prose-dash-vs-bullet/prose-context-flattened` (`He paused\n- then walked on`) must keep
  flattening as prose. The two seeds share an identical trailing `- …` line and differ only
  in the preceding context, which proves the shape of the `- ` line cannot be the signal.
- **Preceding-line context (`:`-anchored + active region).** **Chosen.** A `- ` line is a
  bullet iff its preceding line is a list-introducer (ends with `:`) or is itself an active
  bullet/continuation. Conservative: a prose dash is never wrongly promoted; matches every
  seed.
- **Also open a list on a run of 2+ bare `- ` lines (no `:` intro).** Deferred. It would
  catch intro-less lists (`- apples\n- oranges` with no header) but adds false positives
  where a prose dash is followed by another dash-opener line. Recorded as a future widening;
  for alpha an intro-less list stays prose (flattened), which is the safe failure direction.
- **Recognize a broad marker set (`*`, `•`, `+`, numbered `1.`).** Deferred. Each adds a
  distinct false-positive surface (a `*` mid-sentence, a numbered sentence) and numbered
  lists are a different classifier. Alpha is `- ` only; the README's lock is
  "hyphens/bullets before dense lists."

**Dash taxonomy:**

- **Space the `--`→em result for RSVP pacing (`Wait--stop` → `Wait — stop`).** Rejected for
  alpha: force-spacing is a heavier transform that reflows tokenization and would require
  amending the `double-hyphen-to-em` seed. Chosen instead: normalize the **glyph only**,
  never the surrounding spaces.
- **Convert an en-dash-used-as-a-pause to an em dash.** Deferred: it is context-dependent
  exactly like the bullet/prose split (a numeric range `10–20` must be preserved), and the
  range case is the common, correct one. All en dashes are left intact.

## Decision

### 1. Line classifier (preceding-line context, `:`-anchored + active region)

A single left-to-right line scan in the **standard (content) path** decides, per line,
whether each preceding single `\n` is **preserved** (structural) or **flattened** (soft
wrap, today's behaviour). A bullet line is matched by `/^\s*- /` — a hyphen-minus followed
by a space, optionally preceded by leading whitespace (so a nested bullet is recognized and
its indentation kept). Only `- ` is a bullet marker for alpha.

- **A list region opens** when a `- ` line's preceding line is a **list-introducer** — a
  line whose trailing non-space character is `:`.
- **Within an open region:**
  - a `- ` line (any indent) is a **bullet** → its leading `\n` is **preserved**;
  - a non-`-`, non-blank line is a **continuation** → it **joins** the current bullet (its
    leading `\n` flattens to a space), and the region **stays open** (the next `- ` line is
    still a bullet);
  - a **blank line** (paragraph break, `\n\n`) **closes** the region.
- **Outside a region**, a leading `- ` is a **prose dash** → its `\n` flattens, exactly as
  today.

Worked outcomes (the ratified NCC-5 seeds):

| Input | Standard `content` output |
|---|---|
| `Buy this:\n- milk` | `Buy this:\n- milk` |
| `Steps:\n- First\n- Second\n- Third` | `Steps:\n- First\n- Second\n- Third` |
| `Tasks:\n- buy a very long\nlist of groceries\n- sleep` | `Tasks:\n- buy a very long list of groceries\n- sleep` |
| `List:\n- parent\n  - child` | `List:\n- parent\n  - child` |
| `Steps to follow:\n- then walk on` | `Steps to follow:\n- then walk on` |
| `He paused\n- then walked on` | `He paused - then walked on` (prose dash, unchanged) |

**Known alpha limitations** (documented, not bugs): an intro-less list (no `:` header)
stays prose; a prose paragraph placed *directly* under a list with **no blank line** is
absorbed into the last bullet as a continuation. The blank-line terminator is the clean
exit and is the expected document shape.

### 2. Dash taxonomy (narrow, glyph-only normalizer)

A new cleanup step canonicalizes exactly two wrong-glyph cases and touches nothing else:

- **U+2212 (MINUS SIGN) → U+002D (HYPHEN-MINUS)**, unconditional. A lone minus sign in
  prose is virtually always a mis-encoded hyphen; this is a reading app, not a math
  renderer. `co−operative` → `co-operative`.
- **`-{2,}` (a run of two or more hyphen-minus) → a single U+2014 (EM DASH)**, **unspaced**.
  Covers `--` and `---`. `Wait--stop` → `Wait—stop`. The normalizer **never injects or
  removes spaces** around any dash — it touches the glyph, not the spacing.

**Preserved (the normalizer must not rewrite these):** en dash U+2013 in any position
(including numeric ranges `10–20`), an existing em dash U+2014 (spaced pause or otherwise),
and a genuine single hyphen-minus U+002D in a compound (`well-being`). Because the
normalizer is narrow — it only matches U+2212 and runs of `--` — these guards hold by
construction.

**Deferred:** en-dash-as-pause → em dash (needs range-vs-pause context detection);
spacing/pacing reflow of any dash.

### 3. Parity constraint (preserved by construction)

The classifier and dash normalizer must keep `content` and `content_display`
**word-count-parity** intact, because the reader highlight offset depends on it. They do,
**by construction**, under two rules NCC-7 must hold to:

1. **The classifier runs only in the standard path** (inside / immediately around
   `convertSoftLineWraps`), and maps each single `\n` to **exactly one whitespace
   separator** — either a space (flatten) or a kept `\n` (preserve). It never deletes a
   separator and never alters an adjacent token. Word tokenization splits on `\s+`, so
   swapping a `\n` for a space (or keeping it a `\n`) **cannot change the token count**.
   Therefore *any* line classification preserves word-count parity. The `skipSoftLineWraps`
   (content_display) path already preserves all single newlines and is **unchanged** by
   NCC-7 — the new behaviour lives entirely in the standard path.
2. **Dash normalization runs identically in both variants** and touches **no newline**, so
   it is parity-neutral.

Consequences for the two shapes:

- **Plain bullet list** — `content` and `content_display` **converge** (both keep the
  bullet newlines). This is the `bullet-lines/list-parity` case, which uses the
  `parityMode: 'structure-preserving'` seam (NCC-5) to assert `standard === expected`
  *and* word-count parity.
- **Wrapped continuation** — they **diverge**: `content` joins the continuation (newline →
  space) while `content_display` keeps the wrap (newline). Word count is still equal,
  because a space and a newline are each one separator.

### 4. Scope (alpha vs deferred)

**In:** `- ` bullets with `:`-anchored regions, continuation-join, nested-indent
preservation; U+2212→hyphen and `-{2,}`→em. **Deferred:** intro-less list run-detection,
broad marker set (`*`/`•`/`+`/numbered), en-dash-as-pause conversion, any dash spacing
reflow. Deferred items are documented future widenings, not rejected outright.

## Consequences

- **NCC-7 is the only behaviour slice.** It implements §1–§2 in `importTextCleanup.ts`
  (the classifier carving out `convertSoftLineWraps`, plus the new dash step), driving the
  red→green with `tdd`, then `code-review` (high) on the changed `convertSoftLineWraps`,
  then `verify` of the real in-app import because the parity invariant backs the live
  highlight. The aspirational cases that flip to `passing`: `bullet-lines/*` (5),
  `dash-taxonomy/minus-sign-to-hyphen`, `dash-taxonomy/double-hyphen-to-em`,
  `prose-dash-vs-bullet/list-context-preserved`, and the original
  `soft-line-wrap/bullet-list-preserved`. The `characterized` guards
  (`en-dash-range-preserved`, `spaced-em-dash-pause-preserved`, `hyphenated-compound-intact`,
  `prose-dash-vs-bullet/prose-context-flattened`, `soft-line-wrap/dash-opener-flattened`)
  must **stay green** — they pin the negative space the normalizer must not regress.
- **No NCC-5 seed is amended.** Every ratified `expected` value matches the design above;
  the corpus `cases.ts` is correct as committed.
- **No `CONTEXT.md` promotion.** Per the corpus graduation rule (README: "tooling, not
  domain — no CONTEXT.md entry"), and the skill's glossary-is-not-implementation rule, the
  line-classifier / bullet-region / prose-dash / dash-taxonomy terms are import heuristics,
  not domain vocabulary, and stay in this ADR. The pre-existing content / content_display
  word-count parity invariant is unchanged and already captured by the Stage-B corpus.
- **Parity is the invariant to watch in NCC-7.** If it breaks, switch to `diagnose`. The
  by-construction argument in §3 is the guard rail: a regression means the classifier
  deleted or split a separator, or ran in the wrong variant.
- **Tier A untouched.** JSON store, frozen identifiers, ADR-0008 settings contract, and the
  reading-engine/playback math are all untouched. This is a text-normalization heuristic
  decision.
- **Verification gate:** `npm run build` + `npm test`; do not increase the `tsc -b`
  baseline (**104** as of post-NCC-5). This decision slice changes no source, so build/test
  are unaffected.
- **Provenance:** charter `.scratch/done/import-format-normalization/00-charter.md`; resolved
  design `README.md`; slice `NCC-6-line-classifier-adr.md`; seeds and the
  `parityMode` seam in `src/shared/__tests__/normalization-corpus/`.
