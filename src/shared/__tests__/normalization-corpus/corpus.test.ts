/**
 * Normalization Conformance Corpus — vitest runner.
 *
 * Iterates every case from `allCases()` and emits:
 *   - `it()`        for `passing` and `characterized` (must be green)
 *   - `it.fails()`  for `aspirational` (green now, auto-red when the feature ships)
 *
 * `cleanup` cases are a single string assertion: `expect(runCase(c)).toBe(c.expected)`.
 * `parity` (Stage B, NCC-3) and `segmentation` (Stage C, NCC-4) are richer than one output
 * string, so each gets a dedicated assertion (`assertParity` / `assertSegmentation`) that
 * pins a canonical value AND checks invariants a single `.toBe` cannot express.
 *
 * Add cases as data in `cases.ts` (inline) or `fixtures/<dim>/` (file pairs) — never as
 * ad-hoc tests here.
 */
import { describe, expect, it } from 'vitest'
import { cleanupImportedText, countWords } from '../../importTextCleanup'
import type { CleanupOptions } from '../../importTextCleanup'
import { allCases, runCase, runSegmentation, serializeSegments } from './loader'
import type { CorpusCase } from './types'

/** A soft line wrap: a single `\n` not adjacent to another `\n`/`\f` — the exact pattern
 *  `convertSoftLineWraps` flattens to a space in the standard (content) variant. */
const SOFT_WRAP = /(?<![\n\f])\n(?![\n\f])/
const SOFT_WRAP_G = /(?<![\n\f])\n(?![\n\f])/g
const flattenSoftWraps = (s: string): string => s.replace(SOFT_WRAP_G, ' ')

/**
 * A parity case's `options`: the `CleanupOptions` payload plus a `parityMode` discriminator
 * that selects which relational invariant `assertParity` enforces. `CorpusCase.options` is
 * `unknown`, so the case literal carries `parityMode` with no excess-property friction and
 * the runner narrows here; `parityMode` is stripped before reaching `cleanupImportedText`.
 */
type ParityMode = 'soft-wrap' | 'structure-preserving'
interface ParityOptions extends CleanupOptions {
  /**
   * - `soft-wrap` (default, NCC-3): the standard variant fully flattens soft wraps, so the
   *   strict "standard has no single `\n`" + "flatten(display) reproduces standard" checks
   *   apply — the soft-wrap characterization.
   * - `structure-preserving` (NCC-5 bullets): the DESIRED standard content keeps structural
   *   (bullet) newlines, so it converges with the display variant. Those soft-wrap flatten
   *   checks would contradict the target, so they are skipped; instead the standard variant
   *   is pinned to equal `expected`. Word-count parity (the offset invariant) is asserted in
   *   BOTH modes.
   */
  parityMode?: ParityMode
}

/**
 * Stage B parity (NCC-3). The reader's plain-text highlight maps an RSVP word offset into
 * `content_display`; that only works if `content` (standard cleanup) and `content_display`
 * (`skipSoftLineWraps: true`) stay word-offset-aligned. A parity case asserts that
 * relational invariant — not a single output string — across both cleanup runs of one input.
 *
 * The always-on invariants (both modes):
 *   (pin) `display === expected`            — `expected` is reinterpreted as the desired
 *                                             content_display string (see `types.ts`).
 *   (a)   word-count parity                 — the offset-index invariant backing the highlight.
 *
 * Mode `soft-wrap` (NCC-3 default) adds:
 *   (c)   content flattens soft wraps       — the standard variant has no single `\n` left.
 *   (b+c) display preserves the newlines    — flattening display's soft wraps reproduces the
 *         that content flattens to spaces     standard content exactly.
 *
 * Mode `structure-preserving` (NCC-5 bullets, aspirational) instead pins:
 *   (d)   standard preserves structure      — `standard === expected`. For a real bullet list
 *                                             the desired standard content keeps the bullet
 *                                             newlines, so it equals the display variant; the
 *                                             soft-wrap flatten checks (c)/(b+c) do not hold and
 *                                             are intentionally not asserted. This is the check
 *                                             that fails TODAY (the standard path still flattens
 *                                             bullet newlines) and flips green when NCC-7 ships
 *                                             the line classifier — the reason the case is
 *                                             `aspirational`. See `.scratch/.../NCC-5-...md`.
 */
function assertParity(c: CorpusCase): void {
  const { parityMode = 'soft-wrap', ...opts } = (c.options as ParityOptions) ?? {}
  const standard = cleanupImportedText(c.input, opts).content
  const display = cleanupImportedText(c.input, { ...opts, skipSoftLineWraps: true }).content

  expect(display).toBe(c.expected)
  expect(countWords(display)).toBe(countWords(standard))

  if (parityMode === 'structure-preserving') {
    expect(standard).toBe(c.expected)
    return
  }

  expect(SOFT_WRAP.test(standard)).toBe(false)
  expect(flattenSoftWraps(display)).toBe(standard)
}

/**
 * Stage C segmentation (NCC-4). `segmentText` returns a `SegmentDraft[] | null`, not one
 * output string, so the case pins a canonical serialization (`serializeSegments`) AND — for
 * non-null results — the structural invariants that hold for EVERY segmentText output,
 * mirroring `assertParity`. These are integrity checks on the contract, not behaviour
 * assertions (NCC-1..5 observe only):
 *
 *   (pin)  serialize(result) === expected   — `expected` is reinterpreted as the canonical
 *                                             serialization (see `types.ts` / `loader.ts`).
 *   (a)    length > 1                        — segmentText returns null for <=1 segment.
 *   (b)    one uniform sourceType            — a single result carries one sourceType.
 *   (c)    order is sequential 0..n-1        — drafts are emitted in order.
 *   (d)    every title is non-empty          — the `title || `Part n`` fallback guarantees it.
 */
function assertSegmentation(c: CorpusCase): void {
  const result = runSegmentation(c)
  expect(serializeSegments(result)).toBe(c.expected)
  if (result === null) return
  expect(result.length).toBeGreaterThan(1)
  expect(new Set(result.map((d) => d.sourceType)).size).toBe(1)
  result.forEach((d, i) => {
    expect(d.order).toBe(i)
    expect(d.title.length).toBeGreaterThan(0)
  })
}

describe('normalization conformance corpus', () => {
  for (const c of allCases()) {
    const title = `[${c.dim}] ${c.id} (${c.status})`
    const run = (): void => {
      if (c.stage === 'parity') assertParity(c)
      else if (c.stage === 'segmentation') assertSegmentation(c)
      else expect(runCase(c)).toBe(c.expected)
    }
    if (c.status === 'aspirational') {
      // Asserts the DESIRED output, which the current pipeline does not yet produce.
      // it.fails() keeps the suite green and flips it red the day the case passes.
      it.fails(title, run)
    } else {
      it(title, run)
    }
  }
})
