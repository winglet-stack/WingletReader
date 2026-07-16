import type {
  ImportCleanupAction,
  ImportDiagnostics,
  ImportSourceType,
  ImportSuspiciousSignal
} from './importTypes'

export interface CleanupOptions {
  preservePageMarkers?: boolean
  preserveLayout?: boolean
  /** When true, skip the soft-line-wrap conversion (single \n → space). All other
   *  cleanup steps still run. Used to produce content_display for the reader's
   *  plain text view, where structural newlines should be preserved. */
  skipSoftLineWraps?: boolean
}

export interface CleanupResult {
  content: string
  actions: ImportCleanupAction[]
}

function addAction(actions: ImportCleanupAction[], type: ImportCleanupAction['type'], count: number): void {
  if (count <= 0) return
  const existing = actions.find((a) => a.type === type)
  if (existing) existing.count += count
  else actions.push({ type, count })
}

function stripBom(content: string, actions: ImportCleanupAction[]): string {
  if (!content.startsWith('\uFEFF')) return content
  addAction(actions, 'bom', 1)
  return content.replace(/^\uFEFF/, '')
}

function normalizeLineEndings(content: string, actions: ImportCleanupAction[]): string {
  const crlfCount = (content.match(/\r\n|\r/g) ?? []).length
  if (!crlfCount) return content
  addAction(actions, 'lineEndings', crlfCount)
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function normalizePageMarkers(
  content: string,
  preservePageMarkers: boolean,
  actions: ImportCleanupAction[]
): string {
  if (preservePageMarkers) {
    const pageMarkerRuns = (content.match(/\f{2,}/g) ?? []).length
    if (!pageMarkerRuns) return content
    addAction(actions, 'pageMarkers', pageMarkerRuns)
    return content.replace(/\f{2,}/g, '\f')
  }

  const pageMarkers = (content.match(/\f/g) ?? []).length
  if (!pageMarkers) return content
  addAction(actions, 'pageMarkers', pageMarkers)
  return content.replace(/\f/g, '\n\n')
}

function normalizeUnicodeSpaces(content: string, actions: ImportCleanupAction[]): string {
  const unicodeSpaceMatches = content.match(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g) ?? []
  if (!unicodeSpaceMatches.length) return content
  addAction(actions, 'unicodeSpaces', unicodeSpaceMatches.length)
  return content.replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
}

function normalizeTabs(content: string, preserveLayout: boolean, actions: ImportCleanupAction[]): string {
  const tabMatches = content.match(/\t/g) ?? []
  if (!tabMatches.length) return content
  addAction(actions, 'tabs', tabMatches.length)
  return content.replace(/\t/g, preserveLayout ? '    ' : ' ')
}

function stripSoftHyphens(content: string, actions: ImportCleanupAction[]): string {
  const softHyphenMatches = content.match(/\u00AD/g) ?? []
  if (!softHyphenMatches.length) return content
  addAction(actions, 'softHyphen', softHyphenMatches.length)
  return content.replace(/\u00AD/g, '')
}

function dehyphenateLineBreaks(content: string, actions: ImportCleanupAction[]): string {
  const dehyphenMatches = content.match(/[\p{L}\p{N}]-\n[\p{Ll}]/gu) ?? []
  if (!dehyphenMatches.length) return content
  addAction(actions, 'dehyphenation', dehyphenMatches.length)
  return content.replace(/([\p{L}\p{N}])-\n(?=[\p{Ll}])/gu, '$1')
}

function trimSpacesBeforeNewlines(content: string): string {
  if (!(content.match(/[^\S\n\f]+\n/g) ?? []).length) return content
  return content.replace(/[^\S\n\f]+\n/g, '\n')
}

function joinSplitWordLineBreaks(content: string, actions: ImportCleanupAction[]): string {
  const splitWordLineBreakPattern = /([\p{L}]{4,})\n(tion|ment|ness|able|ible|ing|est|ed|ly|er)\b/gu
  const splitWordLineBreakMatches = content.match(splitWordLineBreakPattern) ?? []
  if (!splitWordLineBreakMatches.length) return content
  addAction(actions, 'splitWordLineBreaks', splitWordLineBreakMatches.length)
  return content.replace(splitWordLineBreakPattern, '$1$2')
}

/** A bullet line: a hyphen-minus + space at line start, optional leading indent (so a nested
 *  bullet is recognized and its indentation kept). `- ` is the only marker for alpha (ADR-0015 §1). */
const BULLET_LINE = /^\s*- /
/** A list-introducer: the line's trailing non-space character is a colon (ADR-0015 §1). */
const LIST_INTRODUCER = /:\s*$/

/**
 * Dash taxonomy (ADR-0015 §2). A narrow, glyph-only normalizer — it canonicalizes exactly two
 * wrong-glyph cases and touches nothing else (no spaces, no newlines), so it is parity-neutral
 * and runs identically in both the standard and content_display variants:
 *
 *   - U+2212 MINUS SIGN → U+002D HYPHEN-MINUS, unconditional (a reading app, not a math renderer).
 *   - a run of 2+ hyphen-minus (a typed em dash) → a single U+2014 EM DASH, unspaced.
 *
 * En dashes (U+2013, incl. numeric ranges), existing em dashes, and genuine single hyphens are
 * never matched, so they pass through untouched by construction.
 */
function normalizeDashes(content: string, actions: ImportCleanupAction[]): string {
  let count = 0
  let next = content

  const minusMatches = next.match(/−/g) ?? []
  if (minusMatches.length) {
    count += minusMatches.length
    next = next.replace(/−/g, '-')
  }

  const doubleHyphenMatches = next.match(/-{2,}/g) ?? []
  if (doubleHyphenMatches.length) {
    count += doubleHyphenMatches.length
    next = next.replace(/-{2,}/g, '—')
  }

  addAction(actions, 'dashNormalize', count)
  return next
}

/**
 * Convert soft line wraps to spaces (standard / content variant only), with a bullet-line
 * carve-out (ADR-0015 §1). A "soft wrap" is a single `\n` not adjacent to another `\n`/`\f` —
 * historically flattened unconditionally. A left-to-right line scan now classifies each one:
 * a genuine bullet line keeps its leading `\n` (structural), everything else flattens as before.
 *
 * A `- ` line is a bullet iff a list region is open — opened when its preceding line is a
 * list-introducer (ends with `:`) and kept open while bullets/continuations follow; a blank line
 * closes it. Outside a region a leading `- ` is a prose dash and flattens, exactly as today.
 *
 * Parity (ADR-0015 §3): this runs ONLY in the standard path (the `skipSoftLineWraps` /
 * content_display variant short-circuits and is untouched), and maps each single `\n` to exactly
 * one whitespace separator — a space (flatten) or a kept `\n` (preserve) — never deleting a
 * separator or altering a token, so `\s+` word-count parity holds for any classification.
 */
function convertSoftLineWraps(
  content: string,
  preserveLayout: boolean,
  skipSoftLineWraps: boolean,
  actions: ImportCleanupAction[]
): string {
  if (preserveLayout || skipSoftLineWraps) return content

  const lines = content.split('\n')
  if (lines.length < 2) return content

  let flattened = 0
  let preservedBullets = 0
  let regionOpen = false
  let result = lines[0]

  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1]
    const cur = lines[i]

    // Reproduce the original regex's notion of a soft wrap exactly: the `\n` between prev and
    // cur is a soft wrap iff the char immediately before and after it is neither `\n` nor `\f`.
    // An empty prev/cur stands for an adjacent `\n` — except a leading prev (i===1) or trailing
    // cur (last line), where the char before/after the break is the string boundary, not a `\n`.
    const charBeforeIsBreak = prev === '' ? i - 1 >= 1 : prev.endsWith('\f')
    const charAfterIsBreak = cur === '' ? i <= lines.length - 2 : cur.startsWith('\f')
    const isSoftWrap = !charBeforeIsBreak && !charAfterIsBreak

    if (!isSoftWrap) {
      // Not a soft wrap (blank-line paragraph break or form-feed adjacency): keep the `\n`
      // verbatim, exactly as the original regex left it. A blank line closes any list region.
      if (cur === '') regionOpen = false
      result += '\n' + cur
      continue
    }

    if (BULLET_LINE.test(cur)) {
      if (regionOpen || LIST_INTRODUCER.test(prev)) {
        // A real bullet: preserve its leading newline; the region is/stays open.
        regionOpen = true
        preservedBullets++
        result += '\n' + cur
        continue
      }
      // Outside a list region a leading `- ` is a prose dash → flatten (today's behaviour).
      result += ' ' + cur
      flattened++
      continue
    }

    // A non-bullet, non-blank line inside an open region is a continuation: it joins the
    // current bullet (newline → space) and the region stays open. Plain prose flattens too.
    result += ' ' + cur
    flattened++
  }

  addAction(actions, 'softLineWraps', flattened)
  addAction(actions, 'bulletLines', preservedBullets)
  return result
}

function collapseRepeatedBlankLines(content: string, actions: ImportCleanupAction[]): string {
  const repeatedBlankMatches = content.match(/\n{4,}/g) ?? []
  if (!repeatedBlankMatches.length) return content
  addAction(actions, 'blankLines', repeatedBlankMatches.length)
  return content.replace(/\n{4,}/g, '\n\n\n')
}

export function cleanupImportedText(raw: string, options: CleanupOptions = {}): CleanupResult {
  const preservePageMarkers = options.preservePageMarkers ?? true
  const preserveLayout = options.preserveLayout ?? false
  const actions: ImportCleanupAction[] = []
  let content = raw ?? ''

  content = stripBom(content, actions)
  content = normalizeLineEndings(content, actions)
  content = normalizePageMarkers(content, preservePageMarkers, actions)
  content = normalizeUnicodeSpaces(content, actions)
  content = normalizeTabs(content, preserveLayout, actions)
  content = stripSoftHyphens(content, actions)
  content = dehyphenateLineBreaks(content, actions)
  content = trimSpacesBeforeNewlines(content)
  content = joinSplitWordLineBreaks(content, actions)
  content = normalizeDashes(content, actions)
  content = convertSoftLineWraps(content, preserveLayout, options.skipSoftLineWraps ?? false, actions)
  content = collapseRepeatedBlankLines(content, actions)

  return { content, actions }
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export function countParagraphs(text: string): number {
  return text
    .replace(/\f/g, '\n\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean).length
}

export function detectSuspiciousSignals(
  content: string,
  pageCount?: number,
  extraSignals: ImportSuspiciousSignal[] = []
): ImportSuspiciousSignal[] {
  const signals: ImportSuspiciousSignal[] = [...extraSignals]
  const words = content.trim().split(/\s+/).filter(Boolean)
  const wordCount = words.length
  const pages = Math.max(pageCount ?? 0, 0)

  if (pages > 0 && wordCount / pages < 20) {
    signals.push({
      type: 'lowWordDensity',
      severity: 'warning',
      message: `Low word density (${Math.round(wordCount / pages)} words/page). Some pages may be scanned or image-based.`
    })
  }

  const longRuns = content.match(/[^\s\f]{80,}/g) ?? []
  if (longRuns.length > 0) {
    signals.push({
      type: 'longNoSpaceRun',
      severity: 'warning',
      message: `${longRuns.length} unusually long no-space run(s) found; extraction may have missed spaces.`
    })
  }

  if (wordCount >= 30) {
    const singleCharRatio = words.filter((w) => /^[\p{L}\p{N}]$/u.test(w)).length / wordCount
    if (singleCharRatio > 0.35) {
      signals.push({
        type: 'highSingleCharacterTokenRatio',
        severity: 'warning',
        message: `${Math.round(singleCharRatio * 100)}% of tokens are single characters; PDF text order or spacing may be poor.`
      })
    }
  }

  if (pages > 0 && content.replace(/\f/g, '').trim().length < 30) {
    signals.push({
      type: 'ocrLikely',
      severity: 'error',
      message: 'Little or no embedded text was found; this document likely needs OCR.'
    })
  }

  return signals
}

export function buildImportDiagnostics(args: {
  parser: string
  sourceExtension: ImportSourceType
  content: string
  fileSizeBytes?: number
  pageCount?: number
  cleanupActions?: ImportCleanupAction[]
  suspiciousSignals?: ImportSuspiciousSignal[]
}): ImportDiagnostics {
  const suspiciousSignals = detectSuspiciousSignals(
    args.content,
    args.pageCount,
    args.suspiciousSignals ?? []
  )
  return {
    parser: args.parser,
    sourceExtension: args.sourceExtension,
    fileSizeBytes: args.fileSizeBytes,
    charCount: args.content.length,
    wordCount: countWords(args.content),
    paragraphCount: countParagraphs(args.content),
    pageCount: args.pageCount,
    cleanupActions: args.cleanupActions ?? [],
    suspiciousSignals
  }
}
