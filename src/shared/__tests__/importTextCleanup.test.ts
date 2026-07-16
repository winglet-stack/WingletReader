import { describe, expect, it } from 'vitest'
import { buildImportDiagnostics, cleanupImportedText } from '../importTextCleanup'

describe('cleanupImportedText', () => {
  it('normalizes line endings while preserving page markers', () => {
    const result = cleanupImportedText('\uFEFFOne\r\nTwo\r\fThree', { preservePageMarkers: true })
    expect(result.content).toBe('One Two\n\fThree')
    expect(result.actions.map((a) => a.type)).toContain('bom')
    expect(result.actions.map((a) => a.type)).toContain('lineEndings')
  })

  it('dehyphenates conservative word-newline-word breaks', () => {
    const result = cleanupImportedText('A hyphen-\nated word.\n- not a list item')
    expect(result.content).toContain('hyphenated')
    expect(result.content).toContain('- not a list item')
  })

  it('normalizes unicode spaces and soft hyphens without flattening paragraphs', () => {
    const result = cleanupImportedText('One\u00A0two\u00AD\n\nThree')
    expect(result.content).toBe('One two\n\nThree')
    expect(result.actions.map((a) => a.type)).toEqual(
      expect.arrayContaining(['unicodeSpaces', 'softHyphen'])
    )
  })

  it('joins conservative split-word line breaks', () => {
    const result = cleanupImportedText('seminar and ultimate\nly concluded')
    expect(result.content).toBe('seminar and ultimately concluded')
    expect(result.actions.map((a) => a.type)).toContain('splitWordLineBreaks')
  })

  it('does not merge a word with a following standalone single-letter token', () => {
    const result = cleanupImportedText('worlds\ny something', { skipSoftLineWraps: true })
    expect(result.content).toBe('worlds\ny something')
    expect(result.actions.map((a) => a.type)).not.toContain('splitWordLineBreaks')
  })

  it('still rejoins legitimate multi-character split-word continuations', () => {
    const result = cleanupImportedText('develop\nment advances', { skipSoftLineWraps: true })
    expect(result.content).toBe('development advances')
    expect(result.actions.map((a) => a.type)).toContain('splitWordLineBreaks')
  })

  it('normalizes normal soft line wraps inside a sentence', () => {
    const result = cleanupImportedText('people are good\nintuitive grammarians')
    expect(result.content).toBe('people are good intuitive grammarians')
    expect(result.actions.map((a) => a.type)).toContain('softLineWraps')
  })

  it('preserves paragraph breaks while normalizing wrapped paragraph lines', () => {
    const result = cleanupImportedText('First line\nwrap.\n\nSecond line\nwrap.')
    expect(result.content).toBe('First line wrap.\n\nSecond line wrap.')
  })

  it('leaves already-correct spacing unchanged', () => {
    const input = 'Every author, I suppose, has in mind a setting.'
    const result = cleanupImportedText(input)
    expect(result.content).toBe(input)
    expect(result.actions).toEqual([])
  })

  it('preserves single line breaks in layout-preserving mode', () => {
    const result = cleanupImportedText('Title\nSubtitle\n\nBody line', { preserveLayout: true })
    expect(result.content).toBe('Title\nSubtitle\n\nBody line')
    expect(result.actions.map((a) => a.type)).not.toContain('softLineWraps')
  })

  it('repairs split words while preserving layout line breaks', () => {
    const result = cleanupImportedText('A heading\nultimate\nly concluded', { preserveLayout: true })
    expect(result.content).toBe('A heading\nultimately concluded')
    expect(result.actions.map((a) => a.type)).toContain('splitWordLineBreaks')
  })

  it('expands tabs as indentation in layout-preserving mode', () => {
    const result = cleanupImportedText('Chapter\t1', { preserveLayout: true })
    expect(result.content).toBe('Chapter    1')
  })
})

describe('cleanupImportedText — skipSoftLineWraps option', () => {
  it('preserves single newlines when skipSoftLineWraps is true', () => {
    const input = 'Chapter 1\nTo Sleep\n\nChapter 2\nCaffeine'
    const result = cleanupImportedText(input, { skipSoftLineWraps: true })
    expect(result.content).toBe('Chapter 1\nTo Sleep\n\nChapter 2\nCaffeine')
    expect(result.actions.map((a) => a.type)).not.toContain('softLineWraps')
  })

  it('still converts soft line wraps to spaces without the flag (default behaviour unchanged)', () => {
    const result = cleanupImportedText('Chapter 1\nTo Sleep')
    expect(result.content).toBe('Chapter 1 To Sleep')
    expect(result.actions.map((a) => a.type)).toContain('softLineWraps')
  })

  it('still applies dehyphenation with skipSoftLineWraps: true', () => {
    const result = cleanupImportedText('anti-\nclockwise movement', { skipSoftLineWraps: true })
    expect(result.content).toBe('anticlockwise movement')
    expect(result.actions.map((a) => a.type)).toContain('dehyphenation')
  })

  it('still applies split-word line break repair with skipSoftLineWraps: true', () => {
    const result = cleanupImportedText('ultimate\nly concluded', { skipSoftLineWraps: true })
    expect(result.content).toBe('ultimately concluded')
    expect(result.actions.map((a) => a.type)).toContain('splitWordLineBreaks')
  })

  it('preserves paragraph double-newlines alongside structural single newlines', () => {
    const input = 'Title line\nSub-title\n\nParagraph one line\nwrap continues'
    const result = cleanupImportedText(input, { skipSoftLineWraps: true })
    expect(result.content).toBe('Title line\nSub-title\n\nParagraph one line\nwrap continues')
  })

  it('converts tabs to a single space (not 4 spaces) with skipSoftLineWraps: true', () => {
    const result = cleanupImportedText('Chapter\t1', { skipSoftLineWraps: true })
    expect(result.content).toBe('Chapter 1')
  })

  it('produces content with the same word count as the standard cleanup', () => {
    const input = 'Chapter 1\nTo Sleep . . .\n\nChapter 2\nCaffeine, Jet Lag'
    const standard = cleanupImportedText(input)
    const display = cleanupImportedText(input, { skipSoftLineWraps: true })
    // Word count must match so wordOffset from RSVP stacks indexes correctly into content_display
    const countWords = (s: string) => s.trim().split(/\s+/).filter(Boolean).length
    expect(countWords(display.content)).toBe(countWords(standard.content))
  })
})

describe('buildImportDiagnostics', () => {
  it('counts words, paragraphs, cleanup actions, and suspicious no-space runs', () => {
    const diagnostics = buildImportDiagnostics({
      parser: 'test',
      sourceExtension: 'txt',
      content: `Alpha beta\n\n${'x'.repeat(90)}`,
      cleanupActions: [{ type: 'tabs', count: 2 }]
    })

    expect(diagnostics.wordCount).toBe(3)
    expect(diagnostics.paragraphCount).toBe(2)
    expect(diagnostics.cleanupActions[0]).toEqual({ type: 'tabs', count: 2 })
    expect(diagnostics.suspiciousSignals.some((s) => s.type === 'longNoSpaceRun')).toBe(true)
  })
})
