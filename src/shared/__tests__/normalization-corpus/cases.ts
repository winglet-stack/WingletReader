/**
 * Inline (TS-table) corpus cases.
 *
 * Small / whitespace-precise cases live here with explicit escapes so invisible
 * characters are visible in review. Whole-document cases live as on-disk file pairs
 * under `fixtures/<dim>/` and are merged in by `loader.ts` (`allCases()`).
 *
 * NCC-1 seeds exactly one dimension — `soft-line-wrap` — across all three statuses
 * to prove the contract end-to-end. Seeds are mined from
 * `src/shared/__tests__/importTextCleanup.test.ts` (lines 44-53), not invented.
 *
 * NCC-2 adds the remaining 10 Stage-A cleanup dimensions (`bom`, `line-endings`,
 * `page-markers`, `unicode-spaces`, `tabs`, `soft-hyphen`, `dehyphenation`,
 * `trim-trailing`, `split-word-rejoin`, `blank-line-collapse`) plus extra `soft-line-wrap`
 * option-matrix cases. Every `characterized` expected below is the REAL pipeline output
 * (the suite proves it — a wrong paste turns the case red). Invisible characters are
 * written as explicit escapes so they are visible in review. Migrates the intent of the
 * 26 cases in `importTextCleanup.test.ts`; non-migrations are listed in that slice's
 * `## Comments` (`.scratch/import-format-normalization/NCC-2-cleanup-dimensions.md`).
 */
import type { CorpusCase } from './types'

// ── Segmentation (Stage C, NCC-4) shared fixtures ────────────────────────────────
// A 20-word body — exactly meets the segmenter's >=20-word "meaningful segment" filter,
// so a heading followed by one SEG_BODY survives detection. (Count the words: 20.)
const SEG_BODY =
  'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon'

// Settings subsets `segmentText` reads. Small threshold so short inputs clear the length
// gate; small chunk size so the chunk fallback splits; big chunk size so the fallback
// collapses to a single chunk (=> null) and isolates the detection-reject guards.
const SEG_LOW = { segmentation_threshold: 1, segmentation_chunk_size: 50, auto_chapter_detection: true }
const SEG_BIGCHUNK = { segmentation_threshold: 1, segmentation_chunk_size: 100000, auto_chapter_detection: true }

// 61 ALL-CAPS headings, each with a 20-word body — trips the `> 60 headings` reject guard
// in detectChapters (detection rejected => chunk fallback => one big chunk => null).
const SEG_MANY_HEADINGS = Array.from(
  { length: 61 },
  (_, i) => `HEADING NUMBER ${i + 1}\n\n${SEG_BODY}`
).join('\n\n')

export const inlineCases: CorpusCase[] = [
  {
    id: 'soft-line-wrap/prose-wrap-basic',
    dim: 'soft-line-wrap',
    stage: 'cleanup',
    status: 'passing',
    input: 'people are good\nintuitive grammarians',
    expected: 'people are good intuitive grammarians',
    note: 'A single soft wrap inside one sentence collapses to a space.'
  },
  {
    id: 'soft-line-wrap/paragraph-break-preserved',
    dim: 'soft-line-wrap',
    stage: 'cleanup',
    status: 'passing',
    input: 'First line\nwrap.\n\nSecond line\nwrap.',
    expected: 'First line wrap.\n\nSecond line wrap.',
    note: 'Soft wraps flatten to spaces while the blank-line paragraph break survives.'
  },
  {
    id: 'soft-line-wrap/dash-opener-flattened',
    dim: 'soft-line-wrap',
    stage: 'cleanup',
    status: 'characterized',
    input: 'Intro line\n- not a list item',
    expected: 'Intro line - not a list item',
    note:
      'CURRENT behaviour: convertSoftLineWraps flattens a leading-dash line into the ' +
      'previous line. Pinned, not endorsed — the bullet/prose-dash split is NCC-6/7.'
  },
  {
    id: 'soft-line-wrap/bullet-list-preserved',
    dim: 'soft-line-wrap',
    stage: 'cleanup',
    status: 'passing',
    input: 'Shopping list:\n- milk\n- eggs',
    expected: 'Shopping list:\n- milk\n- eggs',
    note:
      'DESIRED behaviour: real bullet lines keep their own line. Today they flatten to ' +
      '"Shopping list: - milk - eggs", so this is it.fails() until NCC-7 ships the ' +
      'line-classifier.'
  },

  // ── soft-line-wrap — option-matrix coverage (NCC-2) ──────────────────────────
  {
    id: 'soft-line-wrap/preserve-layout-keeps-single-newlines',
    dim: 'soft-line-wrap',
    stage: 'cleanup',
    status: 'passing',
    input: 'Title\nSubtitle\n\nBody line',
    expected: 'Title\nSubtitle\n\nBody line',
    options: { preserveLayout: true },
    note: 'preserveLayout skips the soft-wrap step entirely; single newlines survive. Migrates importTextCleanup.test.ts:62-66.'
  },
  {
    id: 'soft-line-wrap/skip-soft-wraps-keeps-structure',
    dim: 'soft-line-wrap',
    stage: 'cleanup',
    status: 'passing',
    input: 'Chapter 1\nTo Sleep\n\nChapter 2\nCaffeine',
    expected: 'Chapter 1\nTo Sleep\n\nChapter 2\nCaffeine',
    options: { skipSoftLineWraps: true },
    note: 'content_display path: skipSoftLineWraps preserves single newlines (and paragraph breaks). Migrates importTextCleanup.test.ts:80-86,106-110.'
  },

  // ── bom ──────────────────────────────────────────────────────────────────────
  {
    id: 'bom/leading-stripped',
    dim: 'bom',
    stage: 'cleanup',
    status: 'passing',
    input: '\uFEFFHello world',
    expected: 'Hello world',
    note: 'A leading UTF-8 BOM (U+FEFF) is stripped. Migrates the bom assertion in importTextCleanup.test.ts:5-10.'
  },
  {
    id: 'bom/interior-survives',
    dim: 'bom',
    stage: 'cleanup',
    status: 'characterized',
    input: 'Hello\uFEFFworld',
    expected: 'Hello\uFEFFworld',
    note: 'CURRENT behaviour: only a leading BOM is stripped (regex is /^\\uFEFF/). An interior ZWNBSP (U+FEFF) is not in the unicode-space set, so it survives unchanged.'
  },

  // ── line-endings ─────────────────────────────────────────────────────────────
  {
    id: 'line-endings/crlf-and-cr-to-lf',
    dim: 'line-endings',
    stage: 'cleanup',
    status: 'passing',
    input: 'One\r\nTwo\rThree',
    expected: 'One\nTwo\nThree',
    options: { skipSoftLineWraps: true },
    note: 'Both CRLF and a lone CR normalize to LF. skipSoftLineWraps isolates the step (otherwise the resulting single newlines collapse to spaces).'
  },
  {
    id: 'line-endings/crlf-then-soft-wrap-default',
    dim: 'line-endings',
    stage: 'cleanup',
    status: 'passing',
    input: 'One\r\nTwo\rThree',
    expected: 'One Two Three',
    note: 'Default mode: CRLF/CR → LF, then the soft-wrap step flattens the single newlines to spaces.'
  },

  // ── page-markers (form-feed) — both preservePageMarkers modes ─────────────────
  {
    id: 'page-markers/preserve-single-ff-kept',
    dim: 'page-markers',
    stage: 'cleanup',
    status: 'characterized',
    input: 'Page1\fPage2',
    expected: 'Page1\fPage2',
    options: { preservePageMarkers: true },
    note: 'CURRENT default (preservePageMarkers:true): a single form-feed is kept verbatim; only runs of 2+ are collapsed.'
  },
  {
    id: 'page-markers/preserve-collapses-ff-runs',
    dim: 'page-markers',
    stage: 'cleanup',
    status: 'characterized',
    input: 'Page1\f\fPage2',
    expected: 'Page1\fPage2',
    options: { preservePageMarkers: true },
    note: 'CURRENT default: a run of form-feeds (\\f{2,}) collapses to a single \\f. Pins the run-collapse heuristic.'
  },
  {
    id: 'page-markers/preserve-single-ff-amid-crlf',
    dim: 'page-markers',
    stage: 'cleanup',
    status: 'characterized',
    input: '\uFEFFOne\r\nTwo\r\fThree',
    expected: 'One Two\n\fThree',
    options: { preservePageMarkers: true },
    note: 'Multi-step migration of importTextCleanup.test.ts:5-10 — BOM stripped, CR/CRLF→LF, the One\\nTwo soft-wrap collapses to a space, while the single \\f survives and its adjacent \\n is left untouched (soft-wrap lookaround excludes \\f).'
  },
  {
    id: 'page-markers/expand-single-ff-to-blank-line',
    dim: 'page-markers',
    stage: 'cleanup',
    status: 'passing',
    input: 'Page1\fPage2',
    expected: 'Page1\n\nPage2',
    options: { preservePageMarkers: false },
    note: 'preservePageMarkers:false turns each form-feed into a paragraph break (\\n\\n).'
  },
  {
    id: 'page-markers/expand-ff-run-then-collapse',
    dim: 'page-markers',
    stage: 'cleanup',
    status: 'characterized',
    input: 'Page1\f\fPage2',
    expected: 'Page1\n\n\nPage2',
    options: { preservePageMarkers: false },
    note: 'CURRENT: in expand mode each \\f → \\n\\n independently (2 form-feeds → 4 newlines), then blank-line collapse caps it at \\n{4,}→\\n\\n\\n. Pins the cross-step interaction.'
  },

  // ── unicode-spaces ────────────────────────────────────────────────────────────
  {
    id: 'unicode-spaces/various-to-ascii-space',
    dim: 'unicode-spaces',
    stage: 'cleanup',
    status: 'passing',
    input: 'One\u00A0two\u2003three\u3000four',
    expected: 'One two three four',
    note: 'NBSP (U+00A0), em space (U+2003, in U+2000–U+200A), and ideographic space (U+3000) all normalize to a plain ASCII space.'
  },
  {
    id: 'unicode-spaces/zero-width-space-survives',
    dim: 'unicode-spaces',
    stage: 'cleanup',
    status: 'characterized',
    input: 'A\u200Bnap',
    expected: 'A\u200Bnap',
    note: 'CURRENT behaviour: U+200B (zero-width space) is outside the normalized set [U+2000–U+200A], so it is not converted and survives.'
  },

  // ── tabs — both preserveLayout modes (and the skipSoftLineWraps width) ─────────
  {
    id: 'tabs/default-single-space',
    dim: 'tabs',
    stage: 'cleanup',
    status: 'passing',
    input: 'Chapter\t1',
    expected: 'Chapter 1',
    note: 'Default (preserveLayout:false): each tab becomes a single space.'
  },
  {
    id: 'tabs/default-collapses-each-tab-independently',
    dim: 'tabs',
    stage: 'cleanup',
    status: 'characterized',
    input: 'a\t\tb',
    expected: 'a  b',
    note: 'CURRENT: each tab maps to one space independently (no column-aware collapse), so two tabs → two spaces.'
  },
  {
    id: 'tabs/preserve-layout-four-spaces',
    dim: 'tabs',
    stage: 'cleanup',
    status: 'passing',
    input: 'Chapter\t1',
    expected: 'Chapter    1',
    options: { preserveLayout: true },
    note: 'preserveLayout:true expands a tab to 4 spaces (indentation). Migrates importTextCleanup.test.ts:74-77.'
  },
  {
    id: 'tabs/skip-soft-wraps-still-single-space',
    dim: 'tabs',
    stage: 'cleanup',
    status: 'passing',
    input: 'Chapter\t1',
    expected: 'Chapter 1',
    options: { skipSoftLineWraps: true },
    note: 'skipSoftLineWraps does NOT imply preserveLayout: tabs still collapse to a single space (not 4). Migrates importTextCleanup.test.ts:112-115.'
  },

  // ── soft-hyphen ───────────────────────────────────────────────────────────────
  {
    id: 'soft-hyphen/stripped',
    dim: 'soft-hyphen',
    stage: 'cleanup',
    status: 'passing',
    input: 'soft\u00ADhyphen',
    expected: 'softhyphen',
    note: 'A discretionary soft hyphen (U+00AD) is removed, rejoining the word.'
  },
  {
    id: 'soft-hyphen/with-unicode-space-no-paragraph-flatten',
    dim: 'soft-hyphen',
    stage: 'cleanup',
    status: 'passing',
    input: 'One\u00A0two\u00AD\n\nThree',
    expected: 'One two\n\nThree',
    note: 'NBSP→space and soft hyphen removed, while the blank-line paragraph break survives. Migrates importTextCleanup.test.ts:18-24.'
  },

  // ── dehyphenation ─────────────────────────────────────────────────────────────
  {
    id: 'dehyphenation/lowercase-rejoined',
    dim: 'dehyphenation',
    stage: 'cleanup',
    status: 'passing',
    input: 'anti-\nclockwise movement',
    expected: 'anticlockwise movement',
    options: { skipSoftLineWraps: true },
    note: 'A hyphen at a line break before a lowercase letter is rejoined (hyphen + newline removed). skipSoftLineWraps isolates the step. Migrates importTextCleanup.test.ts:94-98.'
  },
  {
    id: 'dehyphenation/uppercase-continuation-not-rejoined',
    dim: 'dehyphenation',
    stage: 'cleanup',
    status: 'characterized',
    input: 'Anti-\nClockwise',
    expected: 'Anti-\nClockwise',
    options: { skipSoftLineWraps: true },
    note: 'CURRENT: the rejoin lookahead requires a lowercase letter, so a capitalized continuation is left as a hyphen + newline. Conservative to avoid merging proper nouns / new sentences.'
  },

  // ── trim-trailing ─────────────────────────────────────────────────────────────
  {
    id: 'trim-trailing/spaces-before-newline-removed',
    dim: 'trim-trailing',
    stage: 'cleanup',
    status: 'passing',
    input: 'Line one   \nLine two',
    expected: 'Line one\nLine two',
    options: { skipSoftLineWraps: true },
    note: 'Horizontal whitespace immediately before a newline is trimmed. skipSoftLineWraps keeps the newline so the trim is visible.'
  },
  {
    id: 'trim-trailing/tab-before-newline-trimmed-after-expansion',
    dim: 'trim-trailing',
    stage: 'cleanup',
    status: 'characterized',
    input: 'Line\t\nNext',
    expected: 'Line\nNext',
    options: { skipSoftLineWraps: true },
    note: 'CURRENT: the tab is first expanded to a space, then the trim step removes that trailing space before the newline.'
  },

  // ── split-word-rejoin ─────────────────────────────────────────────────────────
  {
    id: 'split-word-rejoin/suffix-continuation-merged',
    dim: 'split-word-rejoin',
    stage: 'cleanup',
    status: 'passing',
    input: 'seminar and ultimate\nly concluded',
    expected: 'seminar and ultimately concluded',
    note: 'A 4+ letter stem split before an allow-listed suffix (here "ly") is rejoined. Migrates importTextCleanup.test.ts:26-30.'
  },
  {
    id: 'split-word-rejoin/multi-char-continuation-merged',
    dim: 'split-word-rejoin',
    stage: 'cleanup',
    status: 'passing',
    input: 'develop\nment advances',
    expected: 'development advances',
    options: { skipSoftLineWraps: true },
    note: 'Legitimate multi-character continuation ("ment") still rejoins under skipSoftLineWraps. Migrates importTextCleanup.test.ts:38-42,100-104.'
  },
  {
    id: 'split-word-rejoin/preserve-layout-repairs-keeps-other-breaks',
    dim: 'split-word-rejoin',
    stage: 'cleanup',
    status: 'passing',
    input: 'A heading\nultimate\nly concluded',
    expected: 'A heading\nultimately concluded',
    options: { preserveLayout: true },
    note: 'Even in preserveLayout mode the split word is repaired, while the unrelated heading line break is preserved. Migrates importTextCleanup.test.ts:68-72.'
  },
  {
    id: 'split-word-rejoin/single-letter-not-merged',
    dim: 'split-word-rejoin',
    stage: 'cleanup',
    status: 'characterized',
    input: 'worlds\ny something',
    expected: 'worlds\ny something',
    options: { skipSoftLineWraps: true },
    note: 'CURRENT: a following standalone single-letter token ("y") is not an allow-listed suffix, so no merge. Migrates importTextCleanup.test.ts:32-36.'
  },
  {
    id: 'split-word-rejoin/non-listed-suffix-not-merged',
    dim: 'split-word-rejoin',
    stage: 'cleanup',
    status: 'characterized',
    input: 'beauti\nful day',
    expected: 'beauti\nful day',
    options: { skipSoftLineWraps: true },
    note: 'CURRENT: "ful" is not in the conservative suffix allow-list, so the real word "beautiful" is NOT rejoined. Pins the closed allow-list.'
  },
  {
    id: 'split-word-rejoin/short-stem-not-merged',
    dim: 'split-word-rejoin',
    stage: 'cleanup',
    status: 'characterized',
    input: 'tri\ned here',
    expected: 'tri\ned here',
    options: { skipSoftLineWraps: true },
    note: 'CURRENT: the stem must be 4+ letters ([\\p{L}]{4,}); a 3-letter stem before an allow-listed suffix ("ed") is left split. Pins the minimum-length guard.'
  },

  // ── blank-line-collapse ───────────────────────────────────────────────────────
  {
    id: 'blank-line-collapse/single-blank-line-preserved',
    dim: 'blank-line-collapse',
    stage: 'cleanup',
    status: 'passing',
    input: 'A\n\nB',
    expected: 'A\n\nB',
    note: 'A single blank line (one paragraph break) is below the \\n{4,} threshold and is preserved.'
  },
  {
    id: 'blank-line-collapse/four-plus-newlines-capped',
    dim: 'blank-line-collapse',
    stage: 'cleanup',
    status: 'characterized',
    input: 'A\n\n\n\n\nB',
    expected: 'A\n\n\nB',
    note: 'CURRENT: a run of 4+ newlines (5 here) collapses to exactly 3 (two blank lines). Pins the \\n{4,}→\\n\\n\\n cap.'
  },
  {
    id: 'blank-line-collapse/three-newlines-untouched',
    dim: 'blank-line-collapse',
    stage: 'cleanup',
    status: 'characterized',
    input: 'A\n\n\nB',
    expected: 'A\n\n\nB',
    note: 'CURRENT: exactly 3 newlines (two blank lines) are below the \\n{4,} threshold and pass through unchanged. Pins the threshold boundary.'
  },

  // ── parity (Stage B) — content / content_display word-offset invariant ─────────
  //
  // A parity case runs cleanup twice (standard vs `skipSoftLineWraps: true`) and the
  // runner asserts a RELATIONAL invariant, not just `expected`: word-count parity (the
  // RSVP highlight offset index), content flattening, and display newline preservation.
  // `expected` here is the desired content_display (skipSoftLineWraps) string — see the
  // `expected` doc in `types.ts` and `assertParity` in `corpus.test.ts`. Every `expected`
  // below is the REAL display output (a wrong byte turns the case red).
  {
    id: 'parity/prose-wraps',
    dim: 'parity',
    stage: 'parity',
    status: 'passing',
    input: 'people are good\nintuitive grammarians',
    expected: 'people are good\nintuitive grammarians',
    note: 'Plain prose soft wrap: content flattens the single \\n to a space; display keeps it; both have 5 words. Generalises the word-count-parity assertion in importTextCleanup.test.ts:117-124.'
  },
  {
    id: 'parity/paragraph-breaks',
    dim: 'parity',
    stage: 'parity',
    status: 'passing',
    input: 'First line\nwrap.\n\nSecond line\nwrap.',
    expected: 'First line\nwrap.\n\nSecond line\nwrap.',
    note: 'Soft wraps + a blank-line paragraph break: content flattens the single \\n to spaces, display preserves all newlines, and the \\n\\n paragraph break survives in both. 6 words each.'
  },
  {
    id: 'parity/dehyphenation-both-variants',
    dim: 'parity',
    stage: 'parity',
    status: 'passing',
    input: 'anti-\nclockwise movement',
    expected: 'anticlockwise movement',
    note: 'Dehyphenation runs BEFORE the soft-wrap step and is not gated by skipSoftLineWraps, so "anti-\\nclockwise" rejoins to "anticlockwise" in BOTH variants — content and display are identical here, 2 words each.'
  },
  {
    id: 'parity/split-word-rejoin-both-variants',
    dim: 'parity',
    stage: 'parity',
    status: 'passing',
    input: 'A heading\ndevelop\nment advances',
    expected: 'A heading\ndevelopment advances',
    note: 'Split-word rejoin ("develop\\nment" → "development") applies in BOTH variants; the unrelated "heading\\ndevelopment" soft wrap is flattened to a space in content but preserved in display. 4 words each.'
  },
  {
    id: 'parity/tabs',
    dim: 'parity',
    stage: 'parity',
    status: 'passing',
    input: 'Column\tA\nColumn\tB',
    expected: 'Column A\nColumn B',
    note: 'Tabs collapse to a single space (default) in BOTH variants; the soft wrap between the two rows is flattened in content, preserved in display. 4 words each.'
  },
  {
    id: 'parity/mixed-bom-nbsp-wraps',
    dim: 'parity',
    stage: 'parity',
    status: 'passing',
    input: '\uFEFFThe quick\u00A0brown fox\njumps over\n\nthe lazy dog',
    expected: 'The quick brown fox\njumps over\n\nthe lazy dog',
    note: 'A mix: leading BOM stripped + NBSP (U+00A0)→space in both, the "fox\\njumps" soft wrap flattened in content but kept in display, paragraph break preserved. 9 words each.'
  },

  // ── segmentation (Stage C, NCC-4) ──────────────────────────────────────────────
  //
  // Cases drive `segmentText(content, settings, blocks?)` (see textSegmenter.ts) and pin the
  // canonical serialization of its `SegmentDraft[] | null` outcome (`serializeSegments` in
  // loader.ts): `'null'` when rejected, else a `<sourceType> | <count>` header + one
  // `<order> | <title> | <word_count>` line per draft. The runner also asserts structural
  // invariants (sequential order, uniform sourceType, non-empty titles) — see
  // `assertSegmentation` in corpus.test.ts and the contract doc on `expected` in types.ts.
  // Every `expected` below is the REAL segmentText output (a wrong byte turns the case red).
  // `options` is `{ settings, blocks? }` (a `SegmentationOptions`).

  // ── seg-heading-detect — each heading flavour isHeadingLine recognises ──────────
  {
    id: 'seg-heading-detect/markdown-h1-h2',
    dim: 'seg-heading-detect',
    stage: 'segmentation',
    status: 'passing',
    input: `# Chapter One\n\n${SEG_BODY}\n\n## Chapter Two\n\n${SEG_BODY}`,
    expected: 'detected_heading | 2\n0 | "Chapter One" | 20\n1 | "Chapter Two" | 20',
    options: { settings: SEG_LOW },
    note: 'Markdown # / ## headings each with a 20-word body → two detected_heading segments; cleanHeadingTitle strips the # prefix.'
  },
  {
    id: 'seg-heading-detect/chapter-word-numerals',
    dim: 'seg-heading-detect',
    stage: 'segmentation',
    status: 'passing',
    input: `Chapter One\n\n${SEG_BODY}\n\nChapter Two\n\n${SEG_BODY}`,
    expected: 'detected_heading | 2\n0 | "Chapter One" | 20\n1 | "Chapter Two" | 20',
    options: { settings: SEG_LOW },
    note: '"Chapter One"/"Chapter Two" word-numeral headings detected.'
  },
  {
    id: 'seg-heading-detect/chapter-roman',
    dim: 'seg-heading-detect',
    stage: 'segmentation',
    status: 'passing',
    input: `Chapter I\n\n${SEG_BODY}\n\nChapter II\n\n${SEG_BODY}`,
    expected: 'detected_heading | 2\n0 | "Chapter I" | 20\n1 | "Chapter II" | 20',
    options: { settings: SEG_LOW },
    note: '"Chapter I"/"Chapter II" roman-numeral headings detected.'
  },
  {
    id: 'seg-heading-detect/part-numbered',
    dim: 'seg-heading-detect',
    stage: 'segmentation',
    status: 'passing',
    input: `Part 1\n\n${SEG_BODY}\n\nPart 2\n\n${SEG_BODY}`,
    expected: 'detected_heading | 2\n0 | "Part 1" | 20\n1 | "Part 2" | 20',
    options: { settings: SEG_LOW },
    note: '"Part N" headings detected.'
  },
  {
    id: 'seg-heading-detect/numbered-sections',
    dim: 'seg-heading-detect',
    stage: 'segmentation',
    status: 'passing',
    input: `1. Introduction\n\n${SEG_BODY}\n\n2.3 The Method\n\n${SEG_BODY}`,
    expected: 'detected_heading | 2\n0 | "1. Introduction" | 20\n1 | "2.3 The Method" | 20',
    options: { settings: SEG_LOW },
    note: 'Numbered section headings ("1. Introduction", "2.3 The Method") detected; the number prefix is kept in the title.'
  },
  {
    id: 'seg-heading-detect/all-caps',
    dim: 'seg-heading-detect',
    stage: 'segmentation',
    status: 'characterized',
    input: `INTRODUCTION\n\n${SEG_BODY}\n\nCONCLUSION\n\n${SEG_BODY}`,
    expected: 'detected_heading | 2\n0 | "INTRODUCTION" | 20\n1 | "CONCLUSION" | 20',
    options: { settings: SEG_LOW },
    note: 'CURRENT: standalone ALL-CAPS lines are treated as headings. Pinned, not endorsed — the ALL-CAPS heuristic is the most false-positive-prone branch of isHeadingLine.'
  },

  // ── seg-intro-detect — pre-first-heading content → "Introduction" ───────────────
  {
    id: 'seg-intro-detect/intro-promoted',
    dim: 'seg-intro-detect',
    stage: 'segmentation',
    status: 'passing',
    input: `${SEG_BODY}\n\n# Chapter One\n\n${SEG_BODY}\n\n# Chapter Two\n\n${SEG_BODY}`,
    expected:
      'detected_heading | 3\n0 | "Introduction" | 20\n1 | "Chapter One" | 20\n2 | "Chapter Two" | 20',
    options: { settings: SEG_LOW },
    note: 'A 20-word block before the first heading (>= the 20-word floor) is promoted to a leading "Introduction" segment.'
  },
  {
    id: 'seg-intro-detect/intro-too-short-dropped',
    dim: 'seg-intro-detect',
    stage: 'segmentation',
    status: 'characterized',
    input: `short intro line\n\n# Chapter One\n\n${SEG_BODY}\n\n# Chapter Two\n\n${SEG_BODY}`,
    expected: 'detected_heading | 2\n0 | "Chapter One" | 20\n1 | "Chapter Two" | 20',
    options: { settings: SEG_LOW },
    note: 'CURRENT: pre-heading content under 20 words ("short intro line", 3 words) is dropped — no Introduction segment. Pins the 20-word intro floor.'
  },

  // ── seg-chunk-fallback — no headings → chunkByWords ─────────────────────────────
  {
    id: 'seg-chunk-fallback/paragraphs-by-size',
    dim: 'seg-chunk-fallback',
    stage: 'segmentation',
    status: 'characterized',
    input: `${SEG_BODY}\n\n${SEG_BODY}\n\n${SEG_BODY}\n\n${SEG_BODY}`,
    expected:
      'generated_chunk | 4\n0 | "Part 1" | 20\n1 | "Part 2" | 20\n2 | "Part 3" | 20\n3 | "Part 4" | 20',
    options: { settings: { segmentation_threshold: 1, segmentation_chunk_size: 35, auto_chapter_detection: false } },
    note: 'CURRENT: no headings → chunkByWords. With chunk_size 35, two 20-word paragraphs (40) exceed it, so each paragraph becomes its own "Part N" generated_chunk. Pins the greedy chunk-boundary heuristic.'
  },
  {
    id: 'seg-chunk-fallback/oversized-paragraph-sentence-split',
    dim: 'seg-chunk-fallback',
    stage: 'segmentation',
    status: 'characterized',
    input:
      'One sentence here that is fairly long indeed. Two more words follow along now. Three sentences total make a big paragraph here. Four ends the oversized block of prose.',
    expected:
      'generated_chunk | 4\n0 | "Part 1" | 8\n1 | "Part 2" | 6\n2 | "Part 3" | 8\n3 | "Part 4" | 7',
    options: { settings: { segmentation_threshold: 1, segmentation_chunk_size: 8, auto_chapter_detection: false } },
    note: 'CURRENT: a single paragraph whose word count exceeds chunk_size (8) is split at sentence boundaries; the 4 sentences batch into 4 generated_chunk Parts. Pins the oversized-paragraph sentence-split branch.'
  },

  // ── seg-false-positive — the reject / null guards ───────────────────────────────
  {
    id: 'seg-false-positive/below-threshold-null',
    dim: 'seg-false-positive',
    stage: 'segmentation',
    status: 'passing',
    input: `${SEG_BODY}\n\n# Chapter One\n\n${SEG_BODY}\n\n# Chapter Two\n\n${SEG_BODY}`,
    expected: 'null',
    options: { settings: { segmentation_threshold: 100000, segmentation_chunk_size: 50, auto_chapter_detection: true } },
    note: 'content.length below segmentation_threshold → segmentText returns null up front, before any detection. Clear-cut.'
  },
  {
    id: 'seg-false-positive/single-heading-null',
    dim: 'seg-false-positive',
    stage: 'segmentation',
    status: 'characterized',
    input: '# Only One Heading\n\nshort body here',
    expected: 'null',
    options: { settings: SEG_LOW },
    note: 'CURRENT: a lone heading (< 2) fails detectChapters, falls to chunkByWords, which yields a single chunk for this short input → <=1 segment → null.'
  },
  {
    id: 'seg-false-positive/majority-tiny-reject',
    dim: 'seg-false-positive',
    stage: 'segmentation',
    status: 'characterized',
    input: `# A\n\ntiny\n\n# B\n\ntiny\n\n# C\n\n${SEG_BODY}`,
    expected: 'null',
    options: { settings: SEG_BIGCHUNK },
    note: 'CURRENT: 3 headings but only 1 has a >=20-word body, so meaningful (1) < headings/2 (1.5) → detection rejected as formatting; chunk fallback with a huge chunk_size collapses to one chunk → null.'
  },
  {
    id: 'seg-false-positive/too-many-headings-reject',
    dim: 'seg-false-positive',
    stage: 'segmentation',
    status: 'characterized',
    input: SEG_MANY_HEADINGS,
    expected: 'null',
    options: { settings: SEG_BIGCHUNK },
    note: 'CURRENT: 61 headings trip the "> 60 headings" guard (inline styling, not chapters) so detection is rejected; chunk fallback with a huge chunk_size collapses the whole doc to one chunk → null.'
  },

  // ── seg-block-detect — detectChaptersFromBlocks (docx ImportedBlock[] path) ──────
  {
    id: 'seg-block-detect/two-heading-blocks',
    dim: 'seg-block-detect',
    stage: 'segmentation',
    status: 'passing',
    input: 'ignored when blocks detect',
    expected: 'detected_heading | 2\n0 | "Chapter One" | 20\n1 | "Chapter Two" | 20',
    options: {
      settings: SEG_LOW,
      blocks: [
        { type: 'heading', text: 'Chapter One', order: 0 },
        { type: 'paragraph', text: SEG_BODY, order: 1 },
        { type: 'heading', text: 'Chapter Two', order: 2 },
        { type: 'paragraph', text: SEG_BODY, order: 3 }
      ]
    },
    note: 'Block path: two heading blocks each with a 20-word paragraph body → detected_heading from blocks (the content string is ignored when block detection succeeds).'
  },
  {
    id: 'seg-block-detect/intro-blocks',
    dim: 'seg-block-detect',
    stage: 'segmentation',
    status: 'passing',
    input: 'ignored when blocks detect',
    expected:
      'detected_heading | 3\n0 | "Introduction" | 20\n1 | "Chapter One" | 20\n2 | "Chapter Two" | 20',
    options: {
      settings: SEG_LOW,
      blocks: [
        { type: 'paragraph', text: SEG_BODY, order: 0 },
        { type: 'heading', text: 'Chapter One', order: 1 },
        { type: 'paragraph', text: SEG_BODY, order: 2 },
        { type: 'heading', text: 'Chapter Two', order: 3 },
        { type: 'paragraph', text: SEG_BODY, order: 4 }
      ]
    },
    note: 'Block path: a 20-word paragraph block before the first heading block is promoted to "Introduction".'
  },
  {
    id: 'seg-block-detect/tiny-bodies-rejected',
    dim: 'seg-block-detect',
    stage: 'segmentation',
    status: 'characterized',
    input: `${SEG_BODY}\n\n${SEG_BODY}\n\n${SEG_BODY}`,
    expected: 'null',
    options: {
      settings: SEG_BIGCHUNK,
      blocks: [
        { type: 'heading', text: 'Tiny A', order: 0 },
        { type: 'paragraph', text: 'tiny', order: 1 },
        { type: 'heading', text: 'Tiny B', order: 2 },
        { type: 'paragraph', text: 'tiny', order: 3 }
      ]
    },
    note: 'CURRENT: both heading blocks have sub-20-word bodies, so the meaningful-segment filter empties the result → block detection returns null; the content fallback (a huge chunk_size) collapses to one chunk → null.'
  },

  // ════════════════════════════════════════════════════════════════════════════════
  // NCC-5 seed → NCC-7 SHIPPED. These dimensions were seeded `aspirational` (it.fails())
  // and are now `passing`: NCC-7 implemented the ADR-0015 line classifier + dash taxonomy
  // in importTextCleanup.ts, so each `expected` (the DESIRED output) is now the real
  // pipeline output. The `characterized` guards below pin the negative space the
  // normalizer must NOT regress (correct dash usage / prose dashes left intact). The
  // per-case notes' "TODAY std = …" / "fails until NCC-7" phrasing is historical — it
  // records the pre-NCC-7 behaviour each case was built to change, not current behaviour.
  // ════════════════════════════════════════════════════════════════════════════════

  // ── bullet-lines — real bullets keep their own line (today they flatten to prose) ──
  // DESIRED: `convertSoftLineWraps` must NOT flatten a bullet's leading newline. Today the
  // single `\n` before each `- ` is a soft wrap and collapses to a space (probe std shown in
  // each note), so every case is aspirational until the NCC-7 line classifier ships.
  {
    id: 'bullet-lines/single-bullet-kept',
    dim: 'bullet-lines',
    stage: 'cleanup',
    status: 'passing',
    input: 'Buy this:\n- milk',
    expected: 'Buy this:\n- milk',
    note: 'DESIRED: a single bullet line stays on its own line. TODAY std = "Buy this: - milk" (the \\n flattens to a space), so this fails until NCC-7.'
  },
  {
    id: 'bullet-lines/block-not-flattened',
    dim: 'bullet-lines',
    stage: 'cleanup',
    status: 'passing',
    input: 'Steps:\n- First\n- Second\n- Third',
    expected: 'Steps:\n- First\n- Second\n- Third',
    note: 'DESIRED: a contiguous bullet block keeps each item on its own line. TODAY std = "Steps: - First - Second - Third" (all soft wraps flattened into one prose line).'
  },
  {
    id: 'bullet-lines/wrapped-continuation',
    dim: 'bullet-lines',
    stage: 'cleanup',
    status: 'passing',
    input: 'Tasks:\n- buy a very long\nlist of groceries\n- sleep',
    expected: 'Tasks:\n- buy a very long list of groceries\n- sleep',
    note: 'DESIRED: a soft-wrapped continuation line ("list of groceries") joins ITS bullet with a space, but the bullet-to-bullet newlines are preserved. The classifier must distinguish an intra-bullet soft wrap from a new bullet. TODAY std = "Tasks: - buy a very long list of groceries - sleep" (everything flattened).'
  },
  {
    id: 'bullet-lines/nested-indented',
    dim: 'bullet-lines',
    stage: 'cleanup',
    status: 'passing',
    input: 'List:\n- parent\n  - child',
    expected: 'List:\n- parent\n  - child',
    note: 'DESIRED: a nested (indented) bullet keeps its line and its leading indentation. TODAY std = "List: - parent   - child" (the \\n flattens to a space, leaving the 2-space indent stranded mid-line).'
  },
  {
    // The REQUIRED Stage-B parity bullet case (acceptance: a bullet must not break the
    // content/content_display word-count offset alignment). Uses `parityMode:
    // 'structure-preserving'` so `assertParity` skips the soft-wrap-only flatten checks and
    // instead pins `standard === expected` (see corpus.test.ts). TODAY: display already
    // preserves the bullet newlines (skipSoftLineWraps), and word-count parity already holds
    // (5 = 5) — but the STANDARD variant still flattens to "Menu: - soup - salad", so the
    // `standard === expected` assertion fails → it.fails() is green. It flips when NCC-7 makes
    // the standard path preserve bullet structure.
    id: 'bullet-lines/list-parity',
    dim: 'bullet-lines',
    stage: 'parity',
    status: 'passing',
    input: 'Menu:\n- soup\n- salad',
    expected: 'Menu:\n- soup\n- salad',
    options: { parityMode: 'structure-preserving' },
    note: 'DESIRED parity: a real bullet list keeps its newlines in BOTH content and content_display (they converge), so word-count parity holds without flattening. TODAY only the display variant preserves them; the standard variant flattens to "Menu: - soup - salad", which is why this is aspirational.'
  },

  // ── dash-taxonomy — canonicalise confusable dash codepoints (none touched today) ──
  // The pipeline does NOTHING with dashes today, so confusable codepoints (em U+2014, en
  // U+2013, hyphen-minus U+002D, minus U+2212) pass through verbatim. NCC-7's normaliser must
  // canonicalise the WRONG-glyph cases (aspirational) while leaving correct usage intact
  // (characterized guards). All variants written as explicit \uXXXX escapes — they are
  // visually confusable and the charter requires invisible/ambiguous chars be visible in diff.
  {
    id: 'dash-taxonomy/minus-sign-to-hyphen',
    dim: 'dash-taxonomy',
    stage: 'cleanup',
    status: 'passing',
    input: 'co−operative effort',
    expected: 'co-operative effort',
    note: 'DESIRED: a MINUS SIGN (U+2212) standing in for a hyphen in a compound normalizes to a hyphen-minus (U+002D). TODAY the U+2212 survives verbatim (no dash handling), so std = "co−operative effort" ≠ expected.'
  },
  {
    id: 'dash-taxonomy/double-hyphen-to-em',
    dim: 'dash-taxonomy',
    stage: 'cleanup',
    status: 'passing',
    input: 'Wait--stop there',
    expected: 'Wait—stop there',
    note: 'DESIRED: a typed double hyphen-minus ("--") used as an em-dash normalizes to a real EM DASH (U+2014). TODAY std = "Wait--stop there" (the "--" survives), so this fails. NCC-6 decides spacing policy (kept unspaced here).'
  },
  {
    id: 'dash-taxonomy/en-dash-range-preserved',
    dim: 'dash-taxonomy',
    stage: 'cleanup',
    status: 'characterized',
    input: 'pages 10–20 today',
    expected: 'pages 10–20 today',
    note: 'CURRENT == DESIRED: an EN DASH (U+2013) in a numeric range ("10–20") is correct usage and must be left intact. Pinned as a guard so NCC-7\'s dash normaliser does not rewrite ranges. Keeps dash-taxonomy at 0% capability (no passing).'
  },
  {
    id: 'dash-taxonomy/spaced-em-dash-pause-preserved',
    dim: 'dash-taxonomy',
    stage: 'cleanup',
    status: 'characterized',
    input: 'He paused — then left',
    expected: 'He paused — then left',
    note: 'CURRENT == DESIRED: a spaced EM DASH (U+2014) used as a sentence-internal pause is correct and is left intact. Guard against NCC-7 mangling a well-formed em-dash; the surrounding ASCII spaces are not unicode spaces, so the space-normaliser never touches them.'
  },
  {
    id: 'dash-taxonomy/hyphenated-compound-intact',
    dim: 'dash-taxonomy',
    stage: 'cleanup',
    status: 'characterized',
    input: 'a well-being focus',
    expected: 'a well-being focus',
    note: 'CURRENT == DESIRED: a genuine hyphen-minus (U+002D) in a compound ("well-being") must stay a hyphen. Guard so NCC-7 does not over-normalise real hyphens into em/en dashes.'
  },

  // ── prose-dash-vs-bullet — the hard NCC-6 ambiguity: same "- X" line, two meanings ──
  // The two cases share an identical trailing "- then wal…" line and differ ONLY in the
  // preceding line's context. NCC-6's line classifier must read that context: a line-ending
  // ":" / list-introducing line ⇒ the dash opens a bullet (preserve the newline); ordinary
  // prose ⇒ the dash is a prose dash/aside (flatten, as today). Seeds both target directions.
  {
    id: 'prose-dash-vs-bullet/list-context-preserved',
    dim: 'prose-dash-vs-bullet',
    stage: 'cleanup',
    status: 'passing',
    input: 'Steps to follow:\n- then walk on',
    expected: 'Steps to follow:\n- then walk on',
    note: 'DESIRED: the preceding line ends with ":" (a list-introducing context), so "- then walk on" is a BULLET and keeps its line. TODAY std = "Steps to follow: - then walk on" (flattened), so this is aspirational. Mirror of prose-context-flattened.'
  },
  {
    id: 'prose-dash-vs-bullet/prose-context-flattened',
    dim: 'prose-dash-vs-bullet',
    stage: 'cleanup',
    status: 'characterized',
    input: 'He paused\n- then walked on',
    expected: 'He paused - then walked on',
    note: 'CURRENT == DESIRED: the preceding line is ordinary prose (no list signal), so the leading dash is a prose dash/aside and the line correctly flattens into prose. Pinned so NCC-7\'s classifier keeps treating this as prose (the negative case). Mirror of list-context-preserved; the existing soft-line-wrap/dash-opener-flattened pins the same flatten from the soft-wrap angle.'
  }
]
