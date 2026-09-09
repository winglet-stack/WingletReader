export interface WordPosition {
  start: number
  end: number
  text: string
}

/**
 * The **one walk** over a text's word sequence (`architecture-depth/08`).
 *
 * Splits on 2+ newlines (paragraph breaks), strips markdown-headline prefixes,
 * and tokenizes each paragraph with `/\S+/g`, invoking `visit` once per word
 * with its absolute character range and the 0-based index of the paragraph it
 * belongs to.
 *
 * `paragraphIndex` counts only paragraphs that contribute at least one word, so
 * it is a stable dense index into the paragraph sequence.
 *
 * **This is the definition `wordOffset` is anchored in.** The headline-prefix
 * rule below is deliberately identical to the one `tokenizeParagraph` applies in
 * `tokenizer.ts` — any run of hashes plus the whitespace after it, stripped from
 * every paragraph — so that the sequence of words this yields is the *same
 * sequence*, word for word, that `buildStacks` packs into Stacks, which is where
 * every persisted bookmark offset was produced.
 * `__tests__/wordIndex.test.ts` pins that equivalence directly.
 * Never fork a second tokenizer; if the two ever have to diverge, the divergence
 * belongs in a test that says so.
 *
 * The caller must pass content with `\f` already replaced by `\n\n` when it is
 * rendering (a `\f` is whitespace to both walks either way, so the word sequence
 * is unaffected — only paragraph boundaries move).
 */
export function forEachWord(
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

    // Markdown-headline prefix, stripped exactly as the tokenizer strips it —
    // any run of #, plus the whitespace after it, on every paragraph rather than
    // only on ones that look like headlines.
    const stripped = para.replace(/^#+\s*/, '')
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

export interface TextScan {
  /** Character ranges of every word, in document order. */
  wordPositions: WordPosition[]
  /** Word count of each content paragraph (one contributing ≥1 word), in order. */
  paragraphWordCounts: number[]
}

/**
 * The whole book in ONE `forEachWord` pass (OL-1): the word positions the plain
 * view renders and the per-paragraph word counts the pagination engine breaks
 * on. The sum of `paragraphWordCounts` equals `wordPositions.length`.
 * Empty / word-less content yields `{ wordPositions: [], paragraphWordCounts: [] }`.
 *
 * This is the raw scan. Consumers do not call it directly — they take a
 * {@link import('./wordIndex').TextWordIndex}, which caches this pass per
 * engaged text and answers the lookups built on top of it.
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
