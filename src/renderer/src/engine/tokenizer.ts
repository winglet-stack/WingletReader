import type { WordStack, StackType, Settings } from '../types'
import { packStacks, type StackPackerUnit } from './stackPacker'

export const MAX_WORDS_PER_STACK = 7
const READER_MAX_WORDS_PER_STACK = 10

/** A word is "exceedingly long" if it exceeds this character count; end the current chunk early. */
export const LONG_WORD_CHAR_THRESHOLD = 15

export interface ChunkRules {
  longWord: boolean
  enumerations: boolean
  bullets: boolean
  commas: boolean
  names: boolean
  headlines: boolean
}

// Default rules keep headline detection on while the paragraph packer handles prose.
const DEFAULT_RULES: ChunkRules = {
  longWord: false,
  enumerations: false,
  bullets: false,
  commas: false,
  names: false,
  headlines: true, // existing behavior: headline paragraphs are grouped
}

/** Build a ChunkRules object from the relevant Settings fields. */
export function rulesFromSettings(
  s: Pick<
    Settings,
    | 'chunk_rule_long_word'
    | 'chunk_rule_enumerations'
    | 'chunk_rule_bullets'
    | 'chunk_rule_commas'
    | 'chunk_rule_names'
    | 'chunk_rule_headlines'
  >
): ChunkRules {
  return {
    longWord: s.chunk_rule_long_word,
    enumerations: s.chunk_rule_enumerations,
    bullets: s.chunk_rule_bullets,
    commas: s.chunk_rule_commas,
    names: s.chunk_rule_names,
    headlines: s.chunk_rule_headlines,
  }
}

/** Matches numbered (1. 12. 1) 12)) and single-letter (a. A. a) A)) enumeration markers. */
export function isEnumerationMarker(token: string): boolean {
  return /^(\d{1,3}[.)]|[a-zA-Z][.)])$/.test(token)
}

/** Matches common bullet/list marker characters. */
export function isBulletMarker(token: string): boolean {
  return token === '-' || token === '*' || token === '•' || token === '–'
}

// Title-case words excluded from name detection: common sentence-starters and function words.
const NON_NAME_WORDS = new Set([
  'The', 'A', 'An', 'In', 'On', 'At', 'To', 'Of', 'For', 'And', 'But',
  'Or', 'Nor', 'With', 'By', 'From', 'Into', 'As', 'Is', 'Was', 'Are',
  'Were', 'Be', 'Been', 'Being', 'It', 'Its', 'This', 'That', 'These',
  'Those', 'He', 'She', 'We', 'They', 'I', 'You', 'My', 'His', 'Her',
  'Our', 'Their', 'Your',
])

interface Token {
  text: string
  isSentenceEnd: boolean
  isParagraphEnd: boolean
  isHeadlineFirst: boolean
  isHeadlinePara: boolean
  nameGroupId?: number
}

// A word ends a sentence when it ends in terminal punctuation, possibly followed
// by closing quotes/brackets.
const TERMINAL_PUNCT_RE = /[.!?]["'"')]*$/
// Closing quotes/brackets stripped before the abbreviation lookup.
const CLOSING_QUOTE_RE = /["'"')]+$/
// A word begins a new sentence if it opens with a capital or an opening quote
// (straight or curly, single or double) or an opening parenthesis.
const SENTENCE_START_RE = /^[A-Z"'(“‘]/

// Known abbreviations that end in a period without ending a sentence (ADR-0031).
// Lowercased, closing quotes stripped, before lookup. Curated, no dependency.
const ABBREVIATIONS = new Set([
  // titles
  'mr.', 'mrs.', 'ms.', 'dr.', 'prof.', 'st.', 'sr.', 'jr.',
  // latinisms
  'e.g.', 'i.e.', 'etc.', 'vs.', 'cf.', 'al.',
])
// A single-letter initial (A., J.) or a dotted acronym (U.S.A.) — never a sentence end.
const INITIALS_RE = /^([a-z]\.)+$/i

/** Whether a trailing-punctuation word is a known abbreviation rather than a sentence end. */
function isAbbreviation(word: string): boolean {
  const bare = word.replace(CLOSING_QUOTE_RE, '').toLowerCase()
  return ABBREVIATIONS.has(bare) || INITIALS_RE.test(bare)
}

/**
 * Hard sentence-end test (ADR-0031). A word ending in terminal punctuation ends a
 * sentence only if it is (a) not a known abbreviation and (b) followed by a word
 * that begins a new sentence (capital or opening quote) — the one-token
 * lowercase-continuation lookahead that kills dialogue-tag false positives
 * (`"Are you sure?" he asked.`). `nextWord` is undefined at the paragraph end,
 * where the paragraph boundary already terminates the Stack.
 */
function isSentenceEndWord(word: string, nextWord: string | undefined): boolean {
  if (!TERMINAL_PUNCT_RE.test(word)) return false
  if (isAbbreviation(word)) return false
  if (nextWord === undefined) return false
  return SENTENCE_START_RE.test(nextWord)
}

function isHeadline(para: string): boolean {
  const line = para.split('\n')[0].trim()
  if (!line) return false

  if (/^#{1,6}\s/.test(line)) return true

  if (line === line.toUpperCase() && /[A-Z]{2,}/.test(line) && line.length >= 3) return true

  const isSingleLine = !para.includes('\n') || para.split('\n').filter((l) => l.trim()).length === 1
  if (
    isSingleLine &&
    line.length <= 80 &&
    line.split(/\s+/).length <= 10 &&
    !/[.!?,;]$/.test(line) &&
    !line.endsWith(':') === false
  )
    return false

  if (isSingleLine && /:\s*$/.test(line) && line.split(/\s+/).length <= 8) return true

  return false
}

function tokenizeParagraph(para: string, isHL: boolean): Token[] {
  const raw = para.replace(/^#+\s*/, '').trim()
  const words = raw.split(/\s+/).filter((w) => w.length > 0)
  const tokens: Token[] = []

  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    const isLast = i === words.length - 1
    const isSentenceEnd = !isLast && isSentenceEndWord(w, words[i + 1])

    tokens.push({
      text: w,
      isSentenceEnd,
      isParagraphEnd: isLast,
      isHeadlineFirst: isHL && i === 0,
      isHeadlinePara: isHL,
    })
  }

  return tokens
}

function isPotentialNamePart(t: Token): boolean {
  if (t.isHeadlinePara) return false
  // Title Case: uppercase first, lowercase second, only letters/apostrophes/hyphens.
  return /^[A-Z][a-zA-Z'-]+$/.test(t.text) && !NON_NAME_WORDS.has(t.text)
}

function annotateNameGroups(tokens: Token[]): void {
  let groupId = 1
  let i = 0
  while (i < tokens.length) {
    if (isPotentialNamePart(tokens[i])) {
      let j = i + 1
      while (
        j < tokens.length &&
        isPotentialNamePart(tokens[j]) &&
        !tokens[j - 1].isSentenceEnd &&
        !tokens[j - 1].isParagraphEnd
      ) {
        j++
      }
      if (j - i >= 2) {
        for (let k = i; k < j; k++) tokens[k].nameGroupId = groupId
        groupId++
        i = j
      } else {
        i++
      }
    } else {
      i++
    }
  }
}

/** Returns the index one past the last token in the name group starting at `start`. */
function nameGroupEnd(tokens: Token[], start: number): number {
  const gid = tokens[start].nameGroupId
  if (gid === undefined) return start
  let end = start + 1
  while (end < tokens.length && tokens[end].nameGroupId === gid) end++
  return end
}

function collectHeadlineStacks(
  tokens: Token[],
  start: number,
  effectiveWPS: number
): { stacks: WordStack[]; next: number } {
  const headlineWords: string[] = []
  let i = start
  while (i < tokens.length && tokens[i].isHeadlinePara) {
    headlineWords.push(tokens[i].text)
    const wasParagraphEnd = tokens[i].isParagraphEnd
    i++
    if (wasParagraphEnd) break
  }
  const stacks: WordStack[] = []
  for (let j = 0; j < headlineWords.length; j += effectiveWPS) {
    stacks.push({ words: headlineWords.slice(j, j + effectiveWPS), type: 'headline' })
  }
  return { stacks, next: i }
}

function terminalStackType(t: Token): StackType | null {
  if (t.isParagraphEnd) return 'paragraph-end'
  if (t.isSentenceEnd) return 'sentence-end'
  return null
}

function isStandaloneMarker(t: Token, rules: ChunkRules): boolean {
  return (
    (rules.enumerations && isEnumerationMarker(t.text)) ||
    (rules.bullets && isBulletMarker(t.text))
  )
}

function stackTypeFromLastToken(t: Token): StackType {
  return terminalStackType(t) ?? 'normal'
}

function stackFromTokens(tokens: Token[]): WordStack {
  return {
    words: tokens.map((t) => t.text),
    type: stackTypeFromLastToken(tokens[tokens.length - 1]),
  }
}

interface PackerTokenUnit extends StackPackerUnit {
  start: number
  end: number
}

/**
 * Whether the packer should *prefer* a break after the unit ending at `unitEnd`.
 * Sentence ends are hard pre-splits now (ADR-0031, handled in packParagraphTokens),
 * so only the opt-in `commas` / `long-word` rules fold in here as soft, crossable
 * candidates (SP-3) *within* a sentence.
 */
function preferredBreakAfterUnit(tokens: Token[], unitEnd: number, rules: ChunkRules): boolean {
  // Comma on: a trailing-comma word invites a break *after* it.
  if (rules.commas && /,$/.test(tokens[unitEnd - 1].text)) return true
  // Long-word on: a 15+ char word invites a break *before* it — i.e. after this unit
  // when the next token begins one. Name-group atomicity still wins: the next token
  // is always a unit boundary here, so a long word buried inside a group never fires.
  if (
    rules.longWord &&
    unitEnd < tokens.length &&
    tokens[unitEnd].text.length > LONG_WORD_CHAR_THRESHOLD
  ) {
    return true
  }
  return false
}

function packTokenRun(tokens: Token[], effectiveWPS: number, rules: ChunkRules): WordStack[] {
  if (tokens.length === 0) return []

  const units: PackerTokenUnit[] = []
  let i = 0
  while (i < tokens.length) {
    const groupEnd =
      rules.names && tokens[i].nameGroupId !== undefined ? nameGroupEnd(tokens, i) : i + 1

    units.push({
      start: i,
      end: groupEnd,
      wordSpan: groupEnd - i,
      preferredBreakAfter: preferredBreakAfterUnit(tokens, groupEnd, rules),
    })
    i = groupEnd
  }

  return packStacks(units, effectiveWPS).map((packed) => {
    const start = units[packed.startUnit].start
    const end = units[packed.endUnit - 1].end
    return stackFromTokens(tokens.slice(start, end))
  })
}

function pushPackedRun(
  out: WordStack[],
  run: Token[],
  effectiveWPS: number,
  rules: ChunkRules
): void {
  if (run.length === 0) return
  out.push(...packTokenRun(run, effectiveWPS, rules))
  run.length = 0
}

function packParagraphTokens(
  tokens: Token[],
  effectiveWPS: number,
  rules: ChunkRules
): WordStack[] {
  const stacks: WordStack[] = []
  const run: Token[] = []

  for (const token of tokens) {
    if (isStandaloneMarker(token, rules)) {
      pushPackedRun(stacks, run, effectiveWPS, rules)
      stacks.push(stackFromTokens([token]))
      continue
    }

    // Commas and long words are no longer hard pre-splits (SP-3); they enter the
    // packer as soft preferred breaks via preferredBreakAfterUnit.
    run.push(token)

    // Hard sentence boundary (ADR-0031): a period always ends a Stack. Flush the
    // accumulated sentence through the packer — like a standalone marker — so the
    // balanced DP runs per sentence and never spans a period.
    if (token.isSentenceEnd) {
      pushPackedRun(stacks, run, effectiveWPS, rules)
    }
  }

  pushPackedRun(stacks, run, effectiveWPS, rules)
  return stacks
}

export function buildStacks(
  text: string,
  wordsPerStack: number,
  rules: ChunkRules = DEFAULT_RULES,
  maxWordsPerStack = READER_MAX_WORDS_PER_STACK
): WordStack[] {
  if (!text.trim()) return []

  const effectiveWPS = Math.min(wordsPerStack, maxWordsPerStack)

  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  const stacks: WordStack[] = []

  for (const para of paragraphs) {
    const hl = isHeadline(para)
    const tokens = tokenizeParagraph(para, hl)
    if (rules.names) annotateNameGroups(tokens)

    if (tokens[0]?.isHeadlineFirst && rules.headlines) {
      const { stacks: headlineStacks } = collectHeadlineStacks(tokens, 0, effectiveWPS)
      stacks.push(...headlineStacks)
      continue
    }

    stacks.push(...packParagraphTokens(tokens, effectiveWPS, rules))
  }

  return stacks
}

/** Milliseconds to wait before showing the next stack */
export function pauseMs(
  type: StackType,
  beatMs: number,
  opts: { pauseAtSentences: boolean; pauseAtHeadlines: boolean }
): number {
  switch (type) {
    case 'headline':
      return opts.pauseAtHeadlines ? beatMs * 4 : beatMs
    case 'paragraph-end':
      return opts.pauseAtSentences ? beatMs * 3 : beatMs
    case 'sentence-end':
      return opts.pauseAtSentences ? beatMs * 2 : beatMs
    default:
      return beatMs
  }
}
