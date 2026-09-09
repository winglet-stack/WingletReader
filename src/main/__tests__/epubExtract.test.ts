/**
 * EP-2a — XHTML→text extraction (ADR-0034 §4).
 *
 * Zip-free by design: every case is a string literal, because what is under test
 * is the projection of markup to text, not the container. The through-line of
 * these assertions is the preservation invariant — structure turns into
 * whitespace, characters survive untouched, and the only thing removed (images)
 * comes back as a count.
 */
import { describe, expect, it } from 'vitest'
import { extractXhtmlText } from '../epubExtract'

/** Wraps a body fragment in the XHTML skeleton a real EPUB content file has. */
function doc(body: string, head = ''): string {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<!DOCTYPE html>',
    '<html xmlns="http://www.w3.org/1999/xhtml">',
    `<head><title>Ignored</title>${head}</head>`,
    `<body>${body}</body>`,
    '</html>'
  ].join('\n')
}

describe('extractXhtmlText — block boundaries', () => {
  it('separates paragraphs with a blank line', () => {
    const result = extractXhtmlText(doc('<p>First paragraph.</p><p>Second paragraph.</p>'))
    expect(result.text).toBe('First paragraph.\n\nSecond paragraph.')
  })

  it('treats div, list items, and blockquote as paragraph boundaries', () => {
    const result = extractXhtmlText(
      doc('<div>A division.</div><ul><li>One</li><li>Two</li></ul><blockquote>Quoted.</blockquote>')
    )
    expect(result.text).toBe('A division.\n\nOne\n\nTwo\n\nQuoted.')
  })

  it('renders a heading as plain paragraph text, with no marker of its own', () => {
    const result = extractXhtmlText(doc('<h1>Chapter One</h1><p>It began at dusk.</p>'))
    expect(result.text).toBe('Chapter One\n\nIt began at dusk.')
  })

  it('collapses nested block edges instead of stacking blank lines', () => {
    const result = extractXhtmlText(
      doc('<section><div><p>Only one boundary.</p></div><div><p>Follows here.</p></div></section>')
    )
    expect(result.text).toBe('Only one boundary.\n\nFollows here.')
  })

  it('leaves no leading or trailing whitespace around the document', () => {
    const result = extractXhtmlText(doc('\n  <p>Body text.</p>\n  '))
    expect(result.text).toBe('Body text.')
  })
})

describe('extractXhtmlText — line breaks', () => {
  it('turns a br into a single newline', () => {
    const result = extractXhtmlText(doc('<p>Line one<br />Line two</p>'))
    expect(result.text).toBe('Line one\nLine two')
  })

  it('keeps a br break distinct from a paragraph break', () => {
    const result = extractXhtmlText(doc('<p>One<br />Two</p><p>Three</p>'))
    expect(result.text).toBe('One\nTwo\n\nThree')
  })

  it('stacks consecutive br breaks into a paragraph break at most', () => {
    const result = extractXhtmlText(doc('<p>Stanza one<br /><br />Stanza two<br /><br /><br />End</p>'))
    expect(result.text).toBe('Stanza one\n\nStanza two\n\nEnd')
  })
})

describe('extractXhtmlText — whitespace', () => {
  it('collapses intra-paragraph whitespace runs to a single space', () => {
    const result = extractXhtmlText(doc('<p>Ragged   source\n\tindentation   here.</p>'))
    expect(result.text).toBe('Ragged source indentation here.')
  })

  it('does not invent a space where the source had none between inline tags', () => {
    const result = extractXhtmlText(doc('<p>un<em>break</em>able</p>'))
    expect(result.text).toBe('unbreakable')
  })

  it('keeps a single space where whitespace separated two inline elements', () => {
    const result = extractXhtmlText(doc('<p><em>one</em>\n   <em>two</em></p>'))
    expect(result.text).toBe('one two')
  })

  it('leaves non-ASCII spaces for the cleanup profile to normalize and count', () => {
    const result = extractXhtmlText(doc('<p>Mr.&#160;Wren and a soft&#173;hyphen.</p>'))
    expect(result.text).toBe('Mr.\u00A0Wren and a soft\u00ADhyphen.')
  })
})

describe('extractXhtmlText — inline formatting', () => {
  it('unwraps inline tags and keeps every character', () => {
    const result = extractXhtmlText(
      doc('<p>An <em>emphatic</em> <strong>claim</strong>&#8212;<a href="notes.xhtml">linked</a>.</p>')
    )
    expect(result.text).toBe('An emphatic claim—linked.')
  })

  it('resolves HTML named entities to their characters', () => {
    const result = extractXhtmlText(doc('<p>Salt &amp; pepper &mdash; nothing else.</p>'))
    expect(result.text).toBe('Salt & pepper — nothing else.')
  })

  it('preserves a publisher double hyphen verbatim', () => {
    const result = extractXhtmlText(doc('<p>He paused--then went on.</p>'))
    expect(result.text).toBe('He paused--then went on.')
  })

  it('keeps in-flow footnote text exactly where the publisher put it', () => {
    const result = extractXhtmlText(
      doc('<p>A claim<sup><a href="#fn1">1</a></sup> follows.</p><p class="fn">1. The note.</p>')
    )
    expect(result.text).toBe('A claim1 follows.\n\n1. The note.')
  })
})

describe('extractXhtmlText — images', () => {
  it('drops img elements without a placeholder and counts them', () => {
    const result = extractXhtmlText(
      doc('<p>Before.</p><p><img src="fig1.png" alt="Figure 1" /></p><p>After.</p>')
    )
    expect(result.text).toBe('Before.\n\nAfter.')
    expect(result.imageCount).toBe(1)
  })

  it('counts SVG image elements alongside img', () => {
    const result = extractXhtmlText(
      doc(
        '<p><img src="a.png" /></p>' +
          '<figure><svg viewBox="0 0 10 10"><image xlink:href="b.png" /></svg></figure>' +
          '<p>Caption follows.</p>'
      )
    )
    expect(result.imageCount).toBe(2)
    expect(result.text).toBe('Caption follows.')
  })

  it('reports zero images for a text-only document', () => {
    expect(extractXhtmlText(doc('<p>Nothing but words.</p>')).imageCount).toBe(0)
  })

  it('counts an image inside a heading exactly once', () => {
    const result = extractXhtmlText(doc('<h1><img src="drop-cap.png" />The Wreck</h1>'))
    expect(result.imageCount).toBe(1)
    expect(result.firstHeading).toBe('The Wreck')
  })
})

describe('extractXhtmlText — tables', () => {
  it('degrades rows to lines with cells space-joined', () => {
    const result = extractXhtmlText(
      doc(
        '<table><tr><th>Year</th><th>Event</th></tr>' +
          '<tr><td>1801</td><td>The lamp was lit.</td></tr></table>'
      )
    )
    expect(result.text).toBe('Year Event\n\n1801 The lamp was lit.')
  })

  it('keeps a table row separate from the prose around it', () => {
    const result = extractXhtmlText(
      doc('<p>Before the table.</p><table><tbody><tr><td>Cell</td></tr></tbody></table><p>After.</p>')
    )
    expect(result.text).toBe('Before the table.\n\nCell\n\nAfter.')
  })
})

describe('extractXhtmlText — firstHeading', () => {
  it('returns the text of the first heading in the document', () => {
    const result = extractXhtmlText(doc('<h2>Chapter One</h2><p>Prose.</p><h3>A Later Section</h3>'))
    expect(result.firstHeading).toBe('Chapter One')
  })

  it('reads the first heading at any level, including one nested in a section', () => {
    const result = extractXhtmlText(doc('<section><header><h6>A Small Title</h6></header></section>'))
    expect(result.firstHeading).toBe('A Small Title')
  })

  it('flattens inline markup and whitespace inside the heading', () => {
    const result = extractXhtmlText(doc('<h1>The <em>Long</em>\n   Road<br />Home</h1>'))
    expect(result.firstHeading).toBe('The Long Road Home')
  })

  it('is null when the document has no heading', () => {
    expect(extractXhtmlText(doc('<p>Just prose.</p>')).firstHeading).toBeNull()
  })

  it('skips an empty heading and takes the next one that has text', () => {
    const result = extractXhtmlText(doc('<h1>   </h1><h2>Real Title</h2>'))
    expect(result.firstHeading).toBe('Real Title')
  })
})

describe('extractXhtmlText — skipped content', () => {
  it('skips head, style, and script contents', () => {
    const result = extractXhtmlText(
      doc(
        '<p>Visible prose.</p><script>var hidden = 1;</script>',
        '<style>p { color: red; }</style>'
      )
    )
    expect(result.text).toBe('Visible prose.')
  })

  it('does not read a document title as a heading', () => {
    expect(extractXhtmlText(doc('<p>Prose.</p>')).firstHeading).toBeNull()
  })

  it('ignores comments and attribute values', () => {
    const result = extractXhtmlText(
      doc('<!-- a note to the typesetter --><p title="tooltip">Only this.</p>')
    )
    expect(result.text).toBe('Only this.')
  })
})

describe('extractXhtmlText — degenerate input', () => {
  it('returns an empty extraction for an empty string', () => {
    expect(extractXhtmlText('')).toEqual({ text: '', imageCount: 0, firstHeading: null })
  })

  it('extracts a bare fragment with no html or body wrapper', () => {
    const result = extractXhtmlText('<p>Loose paragraph.</p>')
    expect(result.text).toBe('Loose paragraph.')
  })

  it('extracts best-effort from an unclosed inline tag', () => {
    const result = extractXhtmlText(doc('<p>An <em>unclosed emphasis.</p>'))
    expect(result.text).toContain('An unclosed emphasis.')
  })
})
