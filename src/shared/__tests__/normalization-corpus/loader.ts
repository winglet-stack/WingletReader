/**
 * File-pair loader + case merge + stage runner.
 *
 * Whole-document cases live on disk as `fixtures/<dim>/<id>.in.txt` +
 * `<id>.expected.txt`. This module resolves those pairs into `CorpusCase`s and merges
 * them with the inline TS table from `cases.ts`. Both the vitest runner
 * (`corpus.test.ts`) and the scoreboard generator (`scoreboard.report.ts`) consume
 * `allCases()`, so the corpus has exactly one source of truth.
 *
 * `runCase()` drives a case through the right stage. NCC-1 wires only `cleanup`; later
 * slices extend the switch (parity → NCC-3, segmentation → NCC-4).
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cleanupImportedText } from '../../importTextCleanup'
import type { CleanupOptions } from '../../importTextCleanup'
import type { ImportedBlock } from '../../importTypes'
import type { Settings } from '../../settings'
// Cross-layer import (NCC-4): `textSegmenter` lives under `renderer/`, but every one of its
// own imports is `import type` (erased at build), so the runtime module is a self-contained
// set of pure functions that loads cleanly in the corpus's `node` vitest context. The corpus
// tests are not part of any `tsc -b` project (neither tsconfig includes `src/shared/__tests__`),
// so this import does not touch the build baseline. Recorded as an explicit decision in
// `.scratch/import-format-normalization/NCC-4-segmentation-dimension.md`.
import { segmentText } from '../../../renderer/src/engine/textSegmenter'
import type { SegmentDraft } from '../../../renderer/src/engine/textSegmenter'
import { inlineCases } from './cases'
import type { CorpusCase, Stage, Status } from './types'

const here = dirname(fileURLToPath(import.meta.url))
const fixturesRoot = join(here, 'fixtures')

/**
 * The `options` payload for a `segmentation` (Stage C, NCC-4) case. Carries the `Settings`
 * subset `segmentText` actually reads plus, for the docx path, the `ImportedBlock[]` input.
 * `CorpusCase.options` is `unknown`, so the segmentation runner narrows to this shape.
 */
interface SegmentationOptions {
  settings: Pick<
    Settings,
    'segmentation_threshold' | 'segmentation_chunk_size' | 'auto_chapter_detection'
  >
  blocks?: ImportedBlock[]
}

/** Metadata for an on-disk file-pair case. `input`/`expected` come from the files. */
interface FilePairSpec {
  /** local id within the dim folder; the full case id becomes `${dim}/${id}` */
  id: string
  dim: string
  stage: Stage
  status: Status
  options?: unknown
  note?: string
}

const filePairSpecs: FilePairSpec[] = [
  {
    id: 'doc-prose-paragraph',
    dim: 'soft-line-wrap',
    stage: 'cleanup',
    status: 'passing',
    note: 'Whole multi-paragraph document, loaded from disk to prove the hybrid file-pair path.'
  },
  {
    // Stage B parity on realistic multi-paragraph text. `.expected.txt` is the desired
    // content_display (skipSoftLineWraps) variant — generated from the real pipeline, so a
    // wrong byte turns the case red. Exercises dehyphenation across a wrap (communi-/cation,
    // which rejoins in BOTH variants) and a non-allow-listed split (refer/ence, left split).
    id: 'doc-design-writeup',
    dim: 'parity',
    stage: 'parity',
    status: 'passing',
    note: 'Whole multi-paragraph document; asserts the content/content_display parity invariant on realistic prose.'
  },
  {
    // Stage C segmentation on realistic multi-chapter prose. `.expected.txt` is the exact
    // serialization of the real `segmentText` outcome (intro + 3 detected chapters) — a
    // wrong byte turns the case red. Written with no trailing newline so the byte-for-byte
    // file-pair assertion matches `serializeSegments` exactly.
    id: 'doc-multi-chapter',
    dim: 'seg-heading-detect',
    stage: 'segmentation',
    status: 'passing',
    options: {
      settings: { segmentation_threshold: 1, segmentation_chunk_size: 1500, auto_chapter_detection: true }
    } satisfies SegmentationOptions,
    note: 'Whole multi-chapter document; pre-heading intro becomes Introduction, then one detected_heading segment per chapter in order.'
  }
]

// Git checks these fixtures out as CRLF on Windows even though they are stored LF, and an
// editor may save CRLF regardless. The cleanup pipeline normalizes input CRLF→LF anyway,
// but `expected` is asserted byte-for-byte, so we normalize EOLs on read to keep the
// file-pair assertion deterministic across platforms. Trailing newlines are preserved and
// still part of the assertion.
function readFixture(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
}

function loadFilePairCases(): CorpusCase[] {
  return filePairSpecs.map((spec) => {
    const base = join(fixturesRoot, spec.dim, spec.id)
    const input = readFixture(`${base}.in.txt`)
    const expected = readFixture(`${base}.expected.txt`)
    return {
      id: `${spec.dim}/${spec.id}`,
      dim: spec.dim,
      stage: spec.stage,
      status: spec.status,
      input,
      expected,
      options: spec.options,
      note: spec.note
    }
  })
}

/** The full corpus: inline TS cases + on-disk file-pair cases. Single source of truth. */
export function allCases(): CorpusCase[] {
  return [...inlineCases, ...loadFilePairCases()]
}

/**
 * Run a `segmentation` (Stage C, NCC-4) case through `segmentText`. Returns the raw
 * `SegmentDraft[] | null` so the runner can assert structural invariants; `runCase()`
 * serializes it for the scoreboard tally path.
 */
export function runSegmentation(c: CorpusCase): SegmentDraft[] | null {
  const opts = c.options as SegmentationOptions
  return segmentText(c.input, opts.settings, opts.blocks)
}

/**
 * Stable single-string serialization of a segmentation outcome — the form `runCase()`
 * returns and `CorpusCase.expected` is reinterpreted against for `stage: 'segmentation'`.
 * A segmentation result is a `SegmentDraft[]` (or `null` when rejected), not one output
 * string, so — following the NCC-3 parity precedent — we pin a canonical serialization
 * (titles + sourceType + count + per-segment word_count) and route the richer structural
 * invariants through `corpus.test.ts` (`assertSegmentation`) rather than widening the type.
 *
 * Format:
 *   - `null`                              when segmentText rejects (returns null)
 *   - `<sourceType> | <count>`            header line, then one line per draft:
 *     `<order> | <JSON-quoted title> | <word_count>`
 * Titles are JSON-quoted so any edge/invisible characters stay visible in the diff.
 */
export function serializeSegments(drafts: SegmentDraft[] | null): string {
  if (drafts === null) return 'null'
  const head = `${drafts[0].sourceType} | ${drafts.length}`
  const lines = drafts.map((d) => `${d.order} | ${JSON.stringify(d.title)} | ${d.word_count}`)
  return [head, ...lines].join('\n')
}

/**
 * Drive a case through its stage and return the produced output.
 *
 * For `parity` (NCC-3) the produced output is the **content_display** variant
 * (`skipSoftLineWraps: true`) — the string `expected` is reinterpreted against (see
 * `types.ts`). The cross-run relational invariants (word-count parity vs the standard
 * variant, content flattening, display newline preservation) are NOT expressible as one
 * returned string, so they are asserted in `corpus.test.ts`'s parity branch.
 *
 * For `segmentation` (NCC-4) the produced output is the `serializeSegments` canonical form;
 * the structural invariants (sequential order, uniform sourceType, non-empty titles) are
 * asserted in `corpus.test.ts`'s segmentation branch. `runCase()` stays a single-string
 * function so the scoreboard tally path is uniform across stages.
 */
export function runCase(c: CorpusCase): string {
  switch (c.stage) {
    case 'cleanup':
      return cleanupImportedText(c.input, (c.options as CleanupOptions) ?? {}).content
    case 'parity':
      return cleanupImportedText(c.input, {
        ...((c.options as CleanupOptions) ?? {}),
        skipSoftLineWraps: true
      }).content
    case 'segmentation':
      return serializeSegments(runSegmentation(c))
    default:
      throw new Error(`Stage not yet wired in this corpus build: ${c.stage}`)
  }
}
