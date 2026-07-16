export interface WordPosition {
  start: number
  end: number
  text: string
}

/**
 * Single source of truth for splitting displayContent into words. Splits on
 * 2+ newlines (paragraph breaks), strips markdown-headline prefixes, and
 * tokenizes each paragraph with /\S+/g, invoking `visit` once per word with its
 * absolute character range and the 0-based index of the paragraph it belongs to.
 *
 * `paragraphIndex` counts only paragraphs that contribute at least one word, so
 * it is a stable dense index into the paragraph sequence. Both
 * `buildWordPositions` and the pagination engine build on this one pass, so
 * their word indexing is identical by construction — never fork a second
 * tokenizer. The caller must pass displayContent with \f already replaced by \n\n.
 *
 * Module-private: consumers use `buildWordPositions` or `buildParagraphWordCounts`.
 */
function forEachWord(
  displayContent: string,
  visit: (position: WordPosition, paragraphIndex: number) => void
): void {
  // Split by 2+ newlines while keeping separators so we can track offsets.
  // e.g. "a\n\nb" → ["a", "\n\n", "b"]
  const parts = displayContent.split(/(\n{2,})/)
  let offset = 0
  let paragraphIndex = -1

  for (const part of parts) {
    // Pure-newline separator: advance offset and move on.
    if (/^\n+$/.test(part)) {
      offset += part.length
      continue
    }

    const rawPara = part
    const para = rawPara.trim()

    if (para.length === 0) {
      offset += rawPara.length
      continue
    }

    // Where the trimmed content starts within rawPara.
    const trimStart = rawPara.indexOf(para)

    // Detect markdown headline (^#{1,6} ) and strip the prefix.
    const isHL = /^#{1,6}\s/.test(para)
    const stripped = isHL ? para.replace(/^#{1,6}\s+/, '') : para
    const hashLen = para.length - stripped.length

    // contentOffset = distance from the start of rawPara to the first word character.
    const contentOffset = trimStart + hashLen

    const wordRegex = /\S+/g
    let wm: RegExpExecArray | null
    let firstInPara = true
    while ((wm = wordRegex.exec(stripped)) !== null) {
      // Only bump the paragraph index once we know this paragraph yields a word,
      // so paragraphs that strip down to nothing don't consume an index.
      if (firstInPara) {
        paragraphIndex += 1
        firstInPara = false
      }
      const absStart = offset + contentOffset + wm.index
      visit(
        {
          start: absStart,
          end: absStart + wm[0].length,
          text: wm[0],
        },
        paragraphIndex
      )
    }

    offset += rawPara.length
  }
}

/**
 * Builds an array of word character positions in the display content, applying
 * the same paragraph-splitting and markdown-headline-stripping logic as the
 * tokenizer. The caller must pass displayContent with \f already replaced by \n\n.
 *
 * Headline paragraphs that begin with one or more # characters have their
 * leading #…\s prefix stripped before word positions are computed, matching
 * the tokenizer's behaviour. Words in the stripped prefix are not indexed.
 */
export function buildWordPositions(displayContent: string): WordPosition[] {
  const positions: WordPosition[] = []
  forEachWord(displayContent, (position) => positions.push(position))
  return positions
}

/**
 * Word counts for each content paragraph (one that contributes ≥1 word), in
 * document order, built from the same single tokenizer pass as
 * `buildWordPositions`. The sum equals `buildWordPositions(...).length`, and
 * the running prefix sums are the paragraph-start word offsets the pagination
 * engine breaks on. Empty / word-less content yields `[]`.
 */
export function buildParagraphWordCounts(displayContent: string): number[] {
  const counts: number[] = []
  forEachWord(displayContent, (_position, paragraphIndex) => {
    counts[paragraphIndex] = (counts[paragraphIndex] ?? 0) + 1
  })
  return counts
}

export interface TextScan {
  /** Character ranges of every word, in document order (== `buildWordPositions`). */
  wordPositions: WordPosition[]
  /** Per-paragraph word counts (== `buildParagraphWordCounts`). */
  paragraphWordCounts: number[]
}

/**
 * Both Text-view scans in ONE `forEachWord` pass (OL-1): the word positions the
 * plain view renders and the per-paragraph word counts the pagination engine
 * breaks on. `buildWordPositions` and `buildParagraphWordCounts` each walk the
 * whole book independently; a paged reader stage needs both, so computing them
 * together tokenizes the book once instead of twice. Values are identical to
 * calling the two functions separately — by construction, since all three share
 * `forEachWord`. Empty / word-less content yields `{ wordPositions: [],
 * paragraphWordCounts: [] }`.
 */
export function scanText(displayContent: string): TextScan {
  const wordPositions: WordPosition[] = []
  const paragraphWordCounts: number[] = []
  forEachWord(displayContent, (position, paragraphIndex) => {
    wordPositions.push(position)
    paragraphWordCounts[paragraphIndex] = (paragraphWordCounts[paragraphIndex] ?? 0) + 1
  })
  return { wordPositions, paragraphWordCounts }
}

/**
 * Returns the character range {start, end} of the word at wordIndex in
 * displayContent. Returns null when wordIndex is out of range.
 */
export function findWordCharRange(
  displayContent: string,
  wordIndex: number
): { start: number; end: number } | null {
  const positions = buildWordPositions(displayContent)
  if (wordIndex < 0 || wordIndex >= positions.length) return null
  const p = positions[wordIndex]
  return { start: p.start, end: p.end }
}

/**
 * Splits displayContent into three parts around the word at wordIndex so the
 * caller can wrap the middle part in a <mark> element. Returns null when
 * wordIndex is out of range.
 */
export function splitContentAtWord(
  displayContent: string,
  wordIndex: number
): { before: string; word: string; after: string } | null {
  const range = findWordCharRange(displayContent, wordIndex)
  if (!range) return null
  return {
    before: displayContent.slice(0, range.start),
    word: displayContent.slice(range.start, range.end),
    after: displayContent.slice(range.end),
  }
}

