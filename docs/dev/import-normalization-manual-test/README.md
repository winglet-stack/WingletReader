# Import normalization — manual test documents

Hand-importable fixtures for eyeballing the **NCC-7 / ADR-0015** import-cleanup behaviour
(bullet-line preservation, soft-wrap continuation join, and dash normalization) in the
real app. The automated proof is the conformance corpus
(`src/shared/__tests__/normalization-corpus/`, 100% capability); this folder is for a human
to confirm it *looks* right in the reader.

> These `.txt` files are developer test fixtures, not product content. They are safe to
> import and delete.

## What shipped (the behaviour you're checking)

On import, `cleanupImportedText` (`src/shared/importTextCleanup.ts`) now:

1. **Preserves real bullet lines.** A `- ` line keeps its own line when it sits in a list
   region — opened by a preceding line that ends in `:`, and continuing across further
   bullets. Previously every bullet's line break was flattened into the line above.
2. **Joins a wrapped continuation into its bullet.** A plain (non-`- `) line inside an open
   list merges into the bullet above it with a space, while the bullet-to-bullet breaks stay.
3. **Normalizes confusable dashes (glyph only, no spacing change):** a stray `−` MINUS SIGN
   (U+2212) → `-` hyphen, and a typed `--` (or `---`) → a real `—` em dash. En dashes (`–`,
   e.g. `10–20`), existing em dashes, and real hyphens (`well-being`) are left untouched.

A leading `- ` in ordinary prose (preceding line does **not** end in `:`) is treated as a
prose dash and still flattens — see fixture **05**.

## How to run the test

1. `npm run dev` to launch the app.
2. Open the import flow. Either:
   - **Paste tab (most direct):** open a `.txt` below, copy its contents, paste into the
     paste box, give it a title, and save. *(Paste exercises the classifier directly.)*
   - **File tab:** import the `.txt` file itself.
   Both routes run the same save-time cleanup, so either is valid.
3. Open the imported text and look at the **standard / plain-text reader view** — that's
   where line breaks are visible. Compare against "Expected" below.
4. The **RSVP (stack) reader** is where the word-count *parity* matters: the highlight maps
   each word offset into `content_display`. Every fixture below reports equal word counts in
   both variants, so the highlight stays aligned; scrub through and confirm the highlighted
   word tracks the text.

Each "Expected" block is the **actual** saved content captured from the real import
composition (`ImportPanel` lines 114–139), not a hand-written guess.

---

### 01-bullet-list.txt — bullets keep their own lines

```
Shopping list:
- milk
- eggs
- bread
- a wedge of sharp cheddar cheese

Steps to follow:
- preheat the oven
- mix the dry ingredients
- fold in the wet ingredients
```
Both `:`-introduced lists keep every bullet on its own line. Parity 33/33. ✅

### 02-wrapped-continuation.txt — continuation joins its bullet

```
Tasks for the weekend:
- buy a very long list of groceries from the corner store
- finish reading the chapter on intuitive grammar and take notes
- sleep at least eight hours
```
The wrapped second lines (`list of groceries…`, `intuitive grammar…`) merge **into their
bullet** with a space, while the bullet breaks survive. In the RSVP view the words still
flow in reading order. Parity 33/33. ✅

### 03-nested-bullets.txt — nested bullets keep line + indent

```
Project outline:
- research phase
  - read the source material
  - interview three subjects
- drafting phase
  - write the first pass
  - revise for clarity
```
Indented (`  - `) sub-bullets keep both their line break and their leading indentation.
Parity 26/26. ✅

### 04-dash-taxonomy.txt — dash normalization

```
The co-operative was founded on a simple idea. (The dash in "co-operative" is a stray
MINUS SIGN, U+2212, and should normalize to an ordinary hyphen.)

Wait—stop there for a moment. (The typed double hyphen "—" should become a real em dash.)

These should all be LEFT ALONE: the meeting ran 10–20 minutes (en dash range), a strong
sense of well-being (real hyphen compound), and she paused — then continued (an existing,
correctly spaced em dash).
```
`co−operative` → `co-operative` (minus→hyphen); `Wait--stop` → `Wait—stop` (double-hyphen→em).
The `10–20` en dash, `well-being` hyphen, and the spaced `—` are unchanged. *(Note: the `--`
inside the parenthetical explanation also becomes `—` — that's the normalizer working on
every `--`, doubling as a live demo.)* Parity 82/82. ✅

### 05-prose-dash-guard.txt — prose dash still flattens (negative guard)

```
He paused - then walked on without another word.

This is the GUARD case. The line above starts with "- " but the preceding line is ordinary
prose (it does not end in a colon), so it is a prose dash, NOT a bullet. It must FLATTEN
into the previous line, exactly as before:

He paused - then walked on without another word.
```
Because `He paused` does **not** end in `:`, the `- then walked on` line is a prose dash and
flattens into the line above — unchanged from the old behaviour. This is the case that must
**not** regress. Parity 63/63. ✅

### 06-mixed-realistic.txt — everything together

A realistic short document mixing prose paragraphs, two `:`-introduced bullet lists, a
wrapped continuation (`mix flour and water and let it rest for about an hour…`), a `--`→`—`
(`time--often` → `time—often`), a `−`→`-` (`co−operative` → `co-operative`), and preserved
`10–20` / `well-being` / spaced `—`. Bullets stay on their lines, the continuation joins,
dashes normalize, paragraph breaks survive. Parity 126/126. ✅

---

## Documented limitations (intended, not bugs — see ADR-0015 §1)

These keep word-count parity (so they never break the highlight); they're just the
conservative edges of the `:`-anchored heuristic:

- **Intro-less list** (`- a` / `- b` with no `:` header line) stays prose and flattens.
- **A non-list line that happens to end in `:`** followed by `- …` will over-preserve that
  line as a bullet.
- **A prose paragraph placed directly under a list with no blank line** is absorbed into the
  last bullet as a continuation. A blank line is the clean list terminator.
