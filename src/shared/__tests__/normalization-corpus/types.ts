/**
 * Normalization Conformance Corpus — data contract.
 *
 * Set by NCC-1, imported unchanged by every later slice (NCC-2..7). This is the
 * single source of the `CorpusCase` shape; do not redefine it elsewhere.
 *
 * See `.scratch/import-format-normalization/00-charter.md` for the full rationale.
 */

/** Which normalization stage a case drives through. NCC-1 wires `cleanup`; `parity`
 *  (NCC-3) and `segmentation` (NCC-4) are reserved and wired by those slices. */
export type Stage = 'cleanup' | 'parity' | 'segmentation'

/**
 * - `passing` — asserts the *desired* output, green now. The regression net.
 * - `characterized` — asserts the *current* (possibly imperfect) output, green by
 *   definition. Pins behaviour so a change is visible, not silent.
 * - `aspirational` — asserts the *desired* output, RED now → emitted as `it.fails()`
 *   so the suite stays green and auto-flips red the day the feature ships.
 */
export type Status = 'passing' | 'characterized' | 'aspirational'

export interface CorpusCase {
  /** stable, kebab, unique (e.g. 'soft-line-wrap/prose-wrap-basic') */
  id: string
  /** rendering dimension (e.g. 'soft-line-wrap', 'bullet-lines') */
  dim: string
  stage: Stage
  status: Status
  /** escaped — invisible chars MUST be visible in the diff */
  input: string
  /**
   * - `cleanup`: the single output string `runCase()` is asserted against — desired output
   *   (passing/aspirational) OR current output (characterized).
   * - `parity` (NCC-3): reinterpreted as the desired **content_display** string (the
   *   `skipSoftLineWraps: true` variant). A parity case is a *relational* invariant between
   *   two cleanup runs of the same input (standard vs display), not a single output, so the
   *   runner's parity branch asserts the cross-run invariants (word-count parity, content
   *   flattening, display newline preservation) in addition to `display === expected`.
   *   `runCase()` returns the display variant so the scoreboard tally path stays uniform.
   *   See `corpus.test.ts` (assertParity) and the contract-extension note in
   *   `.scratch/import-format-normalization/NCC-3-parity-dimension.md`.
   * - `segmentation` (NCC-4): reinterpreted as the canonical **serialization** of the
   *   `segmentText` outcome (`serializeSegments` in `loader.ts`): `'null'` when rejected, else
   *   a `<sourceType> | <count>` header + one `<order> | <title> | <word_count>` line per
   *   draft. A segmentation result is a `SegmentDraft[] | null`, not one string, so the
   *   runner's segmentation branch also asserts the structural invariants (sequential order,
   *   uniform sourceType, non-empty titles). `runCase()` returns the serialization so the
   *   scoreboard tally path stays uniform. See `corpus.test.ts` (assertSegmentation) and
   *   `.scratch/import-format-normalization/NCC-4-segmentation-dimension.md`.
   */
  expected: string
  /** CleanupOptions or a segmentation Settings subset, per stage */
  options?: unknown
  note?: string
}
