import { describe, expect, it } from 'vitest'
import { planImportMeta, type ImportPlanInput } from '../importPlan'
import type { ImportDiagnostics } from '../../../../shared/importTypes'

const fileDiagnostics: ImportDiagnostics = {
  parser: 'pdf-parse/layout',
  sourceExtension: 'pdf',
  fileSizeBytes: 123,
  charCount: 41,
  wordCount: 6,
  paragraphCount: 1,
  pageCount: 2,
  cleanupActions: [{ type: 'lineEndings', count: 1 }],
  suspiciousSignals: [],
}

function baseInput(overrides: Partial<ImportPlanInput> = {}): ImportPlanInput {
  return {
    tab: 'paste',
    fileExt: null,
    contentToSave: 'Alpha beta gamma delta',
    contentDisplay: 'Alpha beta gamma delta',
    cleanupActions: [],
    fileDiagnostics: null,
    filePageCount: undefined,
    fileBlocks: undefined,
    fileHtml: null,
    ...overrides,
  }
}

describe('planImportMeta', () => {
  it('paste branch: flat text source with manual:paste parser, no displayContent when identical', () => {
    const meta = planImportMeta(baseInput())
    expect(meta.sourceType).toBe('text')
    expect(meta.diagnostics?.parser).toBe('manual:paste')
    expect(meta.diagnostics?.sourceExtension).toBe('text')
    expect(meta.pageCount).toBeUndefined()
    expect(meta).not.toHaveProperty('displayContent')
  })

  it('paste branch: stores displayContent when the display variant differs', () => {
    const meta = planImportMeta(
      baseInput({
        contentToSave: 'Roses are red, Violets are blue,\n\nSugar is sweet.',
        contentDisplay: 'Roses are red,\nViolets are blue,\n\nSugar is sweet.',
      })
    )
    expect(meta.displayContent).toBe('Roses are red,\nViolets are blue,\n\nSugar is sweet.')
  })

  it('plain .txt file branch: txt source extension, falls back to file diagnostics parser', () => {
    const meta = planImportMeta(
      baseInput({
        tab: 'file',
        fileExt: 'txt',
        fileDiagnostics: { ...fileDiagnostics, parser: 'node:utf8', sourceExtension: 'txt' },
      })
    )
    expect(meta.sourceType).toBe('text')
    expect(meta.diagnostics?.parser).toBe('node:utf8')
    expect(meta.diagnostics?.sourceExtension).toBe('txt')
  })

  it('rich pdf file branch: carries pageCount, blocks, diagnostics parser and merged cleanup actions', () => {
    const meta = planImportMeta(
      baseInput({
        tab: 'file',
        fileExt: 'pdf',
        contentToSave: 'Original extracted text with enough words',
        contentDisplay: 'Original extracted text with enough words',
        cleanupActions: [{ type: 'softLineWraps', count: 2 }],
        fileDiagnostics,
        filePageCount: 2,
      })
    )
    expect(meta.sourceType).toBe('pdf')
    expect(meta.pageCount).toBe(2)
    expect(meta.diagnostics?.parser).toBe('pdf-parse/layout')
    expect(meta.diagnostics?.cleanupActions).toEqual([
      { type: 'lineEndings', count: 1 },
      { type: 'softLineWraps', count: 2 },
    ])
    expect(meta).not.toHaveProperty('html')
  })

  it('rich docx file branch: includes html when present and displayContent when differing', () => {
    const meta = planImportMeta(
      baseInput({
        tab: 'file',
        fileExt: 'docx',
        contentToSave: 'Body text reflowed into one paragraph here.',
        contentDisplay: 'Body text reflowed\ninto one paragraph here.',
        fileDiagnostics: { ...fileDiagnostics, parser: 'mammoth', sourceExtension: 'docx' },
        fileHtml: '<p>Body text</p>',
      })
    )
    expect(meta.sourceType).toBe('docx')
    expect(meta.html).toBe('<p>Body text</p>')
    expect(meta.displayContent).toBe('Body text reflowed\ninto one paragraph here.')
  })
})
