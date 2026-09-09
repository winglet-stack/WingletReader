/**
 * EPUB extraction — an XHTML content document projected to plain text (ADR-0034 §4).
 *
 * Markup structure becomes whitespace, **nothing else**. Block elements open and
 * close paragraph boundaries, `<br>` is one line break, inline formatting is
 * unwrapped character-for-character. The governing invariant is *preserve the
 * original text*: this module never rewrites a publisher's words or punctuation,
 * and the one thing it removes outright — images — is counted so the import
 * surface can disclose it rather than silently swallow it.
 *
 * Main-process only. `@xmldom/xmldom` is a direct dependency (ADR-0034 §6) and
 * this module is its only reader; hrefs are never resolved, so nothing outside
 * the archive is ever fetched. Output is meant to be piped through
 * `cleanupExtractedMarkupText` — the reduced character-hygiene profile (§5) —
 * before it reaches an `EpubParseInput`.
 */
import { DOMParser } from '@xmldom/xmldom'

export interface ExtractedXhtml {
  /** The rendered text a reader sees, block structure projected onto blank lines. */
  text: string
  /** Images dropped from the flow: `img` plus SVG `image`. No placeholders (§4). */
  imageCount: number
  /** Text of the first `h1`–`h6`, if any — EP-1's per-file fallback chapter title. */
  firstHeading: string | null
}

const ELEMENT_NODE = 1
const TEXT_NODE = 3
const CDATA_SECTION_NODE = 4

/**
 * Runs of ASCII whitespace collapse to a single space: preservation is of the
 * *rendered* text, not the source file's indentation. Deliberately not `\s`,
 * which would also fold NBSP and friends — those are the reduced cleanup
 * profile's business, where they are normalized *and counted*.
 */
const ASCII_WHITESPACE_RUN = /[ \t\n\r\f\v]+/g

/** Contents that are not reading text at all. */
const SKIPPED_TAGS = new Set(['head', 'script', 'style'])

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

/**
 * Elements whose edges are paragraph boundaries — the ADR §4 list (`p`, `div`,
 * `h1`–`h6`, `li`, `blockquote`, `tr`) plus the section-level containers a real
 * EPUB wraps them in. Over-listing is safe: a boundary between two boundaries
 * collapses, so an extra entry costs nothing while a missing one would run two
 * paragraphs together.
 */
const BLOCK_TAGS = new Set([
  'html',
  'body',
  'p',
  'div',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'blockquote',
  'tr',
  'section',
  'article',
  'aside',
  'nav',
  'header',
  'footer',
  'main',
  'hgroup',
  'figure',
  'figcaption',
  'ul',
  'ol',
  'dl',
  'dt',
  'dd',
  'table',
  'caption',
  'thead',
  'tbody',
  'tfoot',
  'pre',
  'hr',
  'address',
  'center',
  'form',
  'fieldset',
  'details',
  'summary'
])

/** Cells are space-joined inside their row's line (§4 table degradation). */
const TABLE_CELL_TAGS = new Set(['td', 'th'])

/** `img` is XHTML's; `image` is SVG's. Both are dropped and counted. */
const IMAGE_TAGS = new Set(['img', 'image'])

/**
 * xmldom reports undefined entities and stray markup through this handler.
 * Warnings and recoverable errors are swallowed — malformed XHTML that the
 * parser can still walk is extracted best-effort — while `fatalError` keeps
 * xmldom's own throwing default, so EP-2b can turn it into a `malformed`
 * verdict rather than importing half a chapter as if it were whole.
 */
const QUIET_ERROR_HANDLER = {
  warning: (): void => {},
  error: (): void => {}
}

/**
 * Accumulates text with markup structure expressed as *pending* separators.
 *
 * Separators are only materialized once more text actually follows, which is
 * what makes nested and adjacent block edges collapse instead of stacking blank
 * lines, and what keeps the result free of leading or trailing whitespace
 * without a trim that could touch the publisher's own characters.
 */
class TextBuilder {
  private readonly parts: string[] = []
  private started = false
  private pendingNewlines = 0
  private pendingSpace = false

  /** A text node, with its internal whitespace runs collapsed. */
  text(raw: string): void {
    const collapsed = raw.replace(ASCII_WHITESPACE_RUN, ' ')
    if (collapsed === '') return
    if (collapsed === ' ') {
      // Whitespace-only node: the separator between two inline neighbours.
      this.space()
      return
    }

    const lead = collapsed.startsWith(' ')
    const trail = collapsed.endsWith(' ')
    const core = collapsed.slice(lead ? 1 : 0, trail ? collapsed.length - 1 : collapsed.length)
    if (core === '') return

    if (lead) this.space()
    this.flush()
    this.parts.push(core)
    this.started = true
    this.pendingNewlines = 0
    this.pendingSpace = trail
  }

  /** A word separator; loses to any pending line or paragraph break. */
  space(): void {
    if (this.started) this.pendingSpace = true
  }

  /** `<br>` — a single `\n`; consecutive breaks stack to a paragraph, never past it. */
  lineBreak(): void {
    if (this.started) this.pendingNewlines = Math.min(this.pendingNewlines + 1, 2)
  }

  /** A block element's edge — a `\n\n` paragraph boundary. */
  blockBreak(): void {
    if (this.started) this.pendingNewlines = Math.max(this.pendingNewlines, 2)
  }

  value(): string {
    return this.parts.join('')
  }

  private flush(): void {
    if (this.pendingNewlines > 0) this.parts.push('\n'.repeat(this.pendingNewlines))
    else if (this.pendingSpace) this.parts.push(' ')
    this.pendingNewlines = 0
    this.pendingSpace = false
  }
}

/** What the walk collects alongside the text itself. */
interface WalkState {
  imageCount: number
  firstHeading: string | null
}

/** Lower-cased local name, prefix dropped — `svg:image` and `image` are one tag. */
function tagNameOf(element: Element): string {
  const raw = element.localName || element.nodeName || ''
  const colon = raw.lastIndexOf(':')
  return (colon >= 0 ? raw.slice(colon + 1) : raw).toLowerCase()
}

function walkChildren(node: Node, out: TextBuilder, state: WalkState): void {
  const children = node.childNodes
  for (let i = 0; i < children.length; i++) {
    const child = children.item(i)
    if (!child) continue
    if (child.nodeType === TEXT_NODE || child.nodeType === CDATA_SECTION_NODE) {
      out.text((child as Text).data ?? '')
    } else if (child.nodeType === ELEMENT_NODE) {
      visitElement(child as Element, out, state)
    }
    // Comments, processing instructions, and the doctype carry no reading text.
  }
}

function visitElement(element: Element, out: TextBuilder, state: WalkState): void {
  const tag = tagNameOf(element)
  if (SKIPPED_TAGS.has(tag)) return

  if (IMAGE_TAGS.has(tag)) {
    // Dropped, never placeheld — but counted, so the confirm card can say so.
    state.imageCount++
    return
  }

  if (tag === 'br') {
    out.lineBreak()
    return
  }

  // An unlisted tag (`em`, `strong`, `span`, `a`, …) is simply unwrapped: no
  // separator of its own, its characters kept exactly as the publisher set them.
  const isBlock = BLOCK_TAGS.has(tag)
  if (isBlock) out.blockBreak()
  else if (TABLE_CELL_TAGS.has(tag)) out.space()

  if (state.firstHeading === null && HEADING_TAGS.has(tag)) {
    state.firstHeading = headingTextOf(element)
  }

  walkChildren(element, out, state)

  if (isBlock) out.blockBreak()
}

/**
 * A heading's own text, read on its own so the title is available before the
 * heading is walked into the flow. Runs against a throwaway state, so images
 * inside a heading are counted once — by the real walk, not twice.
 */
function headingTextOf(heading: Element): string | null {
  const out = new TextBuilder()
  walkChildren(heading, out, { imageCount: 0, firstHeading: null })
  const text = out.value().replace(/\s+/gu, ' ').trim()
  return text === '' ? null : text
}

/**
 * Projects one XHTML content document to plain text.
 *
 * Block elements become `\n\n` boundaries and `<br>` a single `\n`; headings
 * become ordinary paragraph text (the stack builder does its own headline
 * detection); inline formatting is unwrapped; `head`/`script`/`style` contents
 * are skipped; images are dropped and counted; table rows become lines with
 * their cells space-joined. In-flow footnote text stays exactly where the
 * publisher put it — there is no inlining machinery here by design.
 *
 * @throws whatever xmldom raises for XHTML too broken to walk at all; EP-2b
 * turns that into a `malformed` verdict.
 */
export function extractXhtmlText(xhtml: string): ExtractedXhtml {
  const parser = new DOMParser({ errorHandler: QUIET_ERROR_HANDLER })
  // `text/html` is what puts xmldom in HTML-entity mode, so a publisher's
  // `&nbsp;`/`&mdash;` resolves to the character rather than surviving as literal
  // source text. XHTML's own entities are a subset, so nothing is lost.
  const document = parser.parseFromString(xhtml ?? '', 'text/html')

  const out = new TextBuilder()
  const state: WalkState = { imageCount: 0, firstHeading: null }
  if (document) walkChildren(document, out, state)

  return { text: out.value(), imageCount: state.imageCount, firstHeading: state.firstHeading }
}
