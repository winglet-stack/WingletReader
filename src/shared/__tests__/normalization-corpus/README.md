# Normalization Conformance Corpus

A status-tagged fixture suite + generated scoreboard for the import-normalization
pipeline (`src/shared/importTextCleanup.ts`, and later `textSegmenter.ts`). It pins
current behaviour so nothing regresses silently, and seeds not-yet-built behaviour as
`it.fails()` cases that auto-flip when the feature ships.

Plan and history: `.scratch/import-format-normalization/` (gitignored, local-only).

## Vocabulary

**Stage** — which normalization step a case drives through:

| stage | runs through | wired by |
| --- | --- | --- |
| `cleanup` | `cleanupImportedText` | NCC-1 |
| `parity` | content vs content_display word-count parity | NCC-3 |
| `segmentation` | `textSegmenter` | NCC-4 |

**Status** — what a case asserts and whether it must be green:

| status | asserts | runner | green? |
| --- | --- | --- | --- |
| `passing` | the **desired** output | `it()` | must be green — the regression net |
| `characterized` | the **current** (maybe imperfect) output | `it()` | green by definition — pins behaviour so change is visible |
| `aspirational` | the **desired** output, not yet produced | `it.fails()` | green now, auto-**red** the day it starts passing → promote to `passing` |

**Capability %** — per dimension and overall: `passing / (passing + aspirational)`. The
number you watch climb as the extend phase lands. `characterized` does **not** move it.
Regression is **not** a gauge: any `passing`/`characterized` case breaking turns
`npm test` red.

## Files

- `types.ts` — the `Stage` / `Status` / `CorpusCase` contract. Single import source.
- `cases.ts` — inline (TS-table) cases with explicit escapes.
- `loader.ts` — resolves on-disk file pairs, merges them with the inline cases
  (`allCases()`), and runs a case through its stage (`runCase()`).
- `corpus.test.ts` — the vitest runner.
- `scoreboard.report.ts` — the scoreboard generator (runs under vitest; **not** a
  `*.test.ts`, so `npm test` does not regenerate the scoreboard).
- `fixtures/<dim>/<id>.in.txt` + `<id>.expected.txt` — whole-document file pairs.

## Commands

- `npm test` — runs `corpus.test.ts` (and the rest of the suite). Aspirational cases
  stay green via `it.fails()`.
- `npm run corpus:report` — runs `scoreboard.report.ts`, writing
  `.scratch/import-format-normalization/scoreboard.md`.

## How to add a case

### Inline (small / whitespace-precise) — most cases

Add an entry to `inlineCases` in `cases.ts`. Use explicit escapes so invisible
characters are visible in review (`'One two\nThree'`, not a wrapped string literal).

```ts
{
  id: 'soft-line-wrap/my-new-case', // stable, kebab, unique; convention is `<dim>/<slug>`
  dim: 'soft-line-wrap',
  stage: 'cleanup',
  status: 'passing',              // or 'characterized' / 'aspirational'
  input: 'people are good\nintuitive grammarians',
  expected: 'people are good intuitive grammarians', // see status rules below
  options: { skipSoftLineWraps: true }, // optional CleanupOptions / Settings subset
  note: 'why this case exists'
}
```

Pick `expected` by status:

- **passing** → the output you *want*. Must already be produced today.
- **characterized** → the output produced *today*. Run the pipeline and paste the real
  string. Pins current (possibly imperfect) behaviour.
- **aspirational** → the output you *want* but do **not** get yet. The runner emits it
  as `it.fails()`. When the feature ships and the case starts passing, the suite turns
  red — change its status to `passing` and delete this sentence's reason for existing.

### File pair (whole document) — only when escapes would be unreadable

1. Create `fixtures/<dim>/<id>.in.txt` and `fixtures/<dim>/<id>.expected.txt`. The loader
   normalizes CRLF→LF on read (so git/editor line-ending conversion can't flip the
   result), but **trailing newlines are preserved and are part of the assertion** — mind
   them.
2. Add a `FilePairSpec` entry to `filePairSpecs` in `loader.ts` with the `id` (the local
   filename stem, no extension), `dim`, `stage`, `status`, and optional `options`/`note`.
   The loader sets the full case id to `<dim>/<id>`.
