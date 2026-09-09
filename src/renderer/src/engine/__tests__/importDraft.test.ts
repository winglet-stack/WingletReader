/**
 * The Import submit guards, as a pure decision (codebase-health 08).
 *
 * These are the three refusals the plain-text surface can produce before
 * anything is saved. The copy is product voice — asserted literally, not by
 * regex — and so is the *order*: the first failing guard is the one the user
 * reads.
 */
import { describe, expect, it } from 'vitest'
import { validateImportDraft } from '../importDraft'

describe('validateImportDraft', () => {
  it('accepts a titled draft with enough words', () => {
    const result = validateImportDraft({
      tab: 'paste',
      title: '  A Title  ',
      activeContent: 'Alpha beta gamma'
    })

    expect(result).toMatchObject({
      ok: true,
      resolvedTitle: 'A Title',
      contentToSave: 'Alpha beta gamma',
      activeContent: 'Alpha beta gamma'
    })
  })

  it('carries the cleanup actions the save path reports as diagnostics', () => {
    const result = validateImportDraft({
      tab: 'file',
      title: 'Poem',
      activeContent: 'Roses are red,\r\nViolets are blue.'
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.cleaned.actions.map((action) => action.type)).toContain('lineEndings')
    // The raw text is handed back untouched: the display pass re-cleans it with
    // different options, so it cannot be given the already-cleaned copy.
    expect(result.activeContent).toBe('Roses are red,\r\nViolets are blue.')
  })

  it('refuses an untitled draft', () => {
    expect(
      validateImportDraft({ tab: 'paste', title: '   ', activeContent: 'Alpha beta gamma' })
    ).toEqual({ ok: false, error: 'Please enter a title.' })
  })

  it('names the empty paste box', () => {
    expect(validateImportDraft({ tab: 'paste', title: 'A Title', activeContent: '   ' })).toEqual({
      ok: false,
      error: 'Please paste some text.'
    })
  })

  it('names the unloaded file instead, on the file tab', () => {
    expect(validateImportDraft({ tab: 'file', title: 'A Title', activeContent: null })).toEqual({
      ok: false,
      error: 'No file loaded.'
    })
  })

  it('refuses fewer than three words', () => {
    expect(
      validateImportDraft({ tab: 'paste', title: 'A Title', activeContent: 'Two words' })
    ).toEqual({ ok: false, error: 'Text is too short (needs at least 3 words).' })
  })

  it('accepts exactly three words', () => {
    expect(
      validateImportDraft({ tab: 'paste', title: 'A Title', activeContent: 'One two three' }).ok
    ).toBe(true)
  })

  it('reports the missing title first when everything is missing', () => {
    expect(validateImportDraft({ tab: 'paste', title: '', activeContent: '' })).toEqual({
      ok: false,
      error: 'Please enter a title.'
    })
  })
})
