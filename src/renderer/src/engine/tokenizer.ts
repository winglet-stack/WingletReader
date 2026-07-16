import type { WordStack, StackType, Settings } from '../types'

export const MAX_WORDS_PER_STACK = 7

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

// Default rules preserve all existing chunking behavior.
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
    const isSentenceEnd = /[.!?]["'"')]*$/.test(w) && !isLast

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

function collectHeadlineStacks(tokens: Token[], start: number): { stacks: WordStack[]; next: number } {
  const headlineWords: string[] = []
  let i = start
  while (i < tokens.length && tokens[i].isHeadlinePara) {
    headlineWords.push(tokens[i].text)
    const wasParagraphEnd = tokens[i].isParagraphEnd
    i++
    if (wasParagraphEnd) break
  }
  const stacks: WordStack[] = []
  for (let j = 0; j < headlineWords.length; j += MAX_WORDS_PER_STACK) {
    stacks.push({ words: headlineWords.slice(j, j + MAX_WORDS_PER_STACK), type: 'headline' })
  }
  return { stacks, next: i }
}

interface StackDraft {
  words: string[]
  type: StackType
}

function terminalStackType(t: Token): StackType | null {
  if (t.isParagraphEnd) return 'paragraph-end'
  if (t.isSentenceEnd) return 'sentence-end'
  return null
}

function shouldFlushBeforeToken(t: Token, stackWords: string[], rules: ChunkRules): boolean {
  if (t.isHeadlineFirst && rules.headlines) return true
  return rules.longWord && stackWords.length > 0 && t.text.length > LONG_WORD_CHAR_THRESHOLD
}

function isStandaloneMarker(t: Token, rules: ChunkRules): boolean {
  return (
    (rules.enumerations && isEnumerationMarker(t.text)) ||
    (rules.bullets && isBulletMarker(t.text))
  )
}

function appendStandaloneMarker(draft: StackDraft, t: Token): void {
  draft.words.push(t.text)
  if (t.isParagraphEnd) draft.type = 'paragraph-end'
}

function appendToken(draft: StackDraft, t: Token): boolean {
  draft.words.push(t.text)
  const terminalType = terminalStackType(t)
  if (!terminalType) return false
  draft.type = terminalType
  return true
}

function appendNameGroup(
  tokens: Token[],
  start: number,
  effectiveWPS: number,
  draft: StackDraft,
  rules: ChunkRules
): { handled: boolean; next: number; complete: boolean; flushFirst: boolean } {
  const token = tokens[start]
  if (!rules.names || token.nameGroupId === undefined) {
    return { handled: false, next: start, complete: false, flushFirst: false }
  }

  const groupEnd = nameGroupEnd(tokens, start)
  const groupSize = groupEnd - start
  const spaceLeft = effectiveWPS - draft.words.length

  if (groupSize > spaceLeft) {
    const flushFirst = draft.words.length > 0
    return { handled: flushFirst, next: start, complete: false, flushFirst }
  }

  for (let k = start; k < groupEnd; k++) draft.words.push(tokens[k].text)
  const terminalType = terminalStackType(tokens[groupEnd - 1])
  if (terminalType) draft.type = terminalType
  return { handled: true, next: groupEnd, complete: terminalType !== null, flushFirst: false }
}

function fillNormalStack(
  tokens: Token[],
  start: number,
  effectiveWPS: number,
  rules: ChunkRules
): { stack: WordStack | null; next: number } {
  const draft: StackDraft = { words: [], type: 'normal' }
  let i = start

  while (draft.words.length < effectiveWPS && i < tokens.length) {
    const t = tokens[i]

    if (shouldFlushBeforeToken(t, draft.words, rules)) break

    if (isStandaloneMarker(t, rules)) {
      if (draft.words.length > 0) break
      appendStandaloneMarker(draft, t)
      i++
      break
    }

    const nameGroup = appendNameGroup(tokens, i, effectiveWPS, draft, rules)
    if (nameGroup.flushFirst) break
    if (nameGroup.handled) {
      i = nameGroup.next
      if (nameGroup.complete) break
      continue
    }

    const completedByTerminal = appendToken(draft, t)
    i++
    if (completedByTerminal) break

    // Comma rule: end chunk after a word with a trailing comma.
    if (rules.commas && /,$/.test(t.text)) break
  }

  return {
    stack: draft.words.length > 0 ? { words: draft.words, type: draft.type } : null,
    next: i,
  }
}

export function buildStacks(
  text: string,
  wordsPerStack: number,
  rules: ChunkRules = DEFAULT_RULES,
  maxWordsPerStack = MAX_WORDS_PER_STACK
): WordStack[] {
  if (!text.trim()) return []

  const effectiveWPS = Math.min(wordsPerStack, maxWordsPerStack)

  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  const allTokens: Token[] = []
  for (const para of paragraphs) {
    const hl = isHeadline(para)
    allTokens.push(...tokenizeParagraph(para, hl))
  }

  if (rules.names) annotateNameGroups(allTokens)

  const stacks: WordStack[] = []
  let i = 0

  while (i < allTokens.length) {
    const tok = allTokens[i]

    if (tok.isHeadlineFirst && rules.headlines) {
      const { stacks: headlineStacks, next } = collectHeadlineStacks(allTokens, i)
      stacks.push(...headlineStacks)
      i = next
      continue
    }

    const { stack, next } = fillNormalStack(allTokens, i, effectiveWPS, rules)
    if (stack) stacks.push(stack)
    i = next
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
