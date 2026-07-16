import { describe, expect, it } from 'vitest'
import { pdfExtractionInternals } from '../pdfExtraction'

const item = (str: string, x: number, y: number, width = str.length * 5) => ({
  str,
  transform: [1, 0, 0, 1, x, y],
  width
})

describe('pdfExtractionInternals', () => {
  it('preserves source item spacing in the legacy renderer', () => {
    const text = pdfExtractionInternals.renderLegacyPageFromItems([
      item('Every ', 40, 700),
      item('author, ', 70, 700),
      item('I ', 110, 700),
      item('suppose,', 120, 700),
    ])

    expect(text).toBe('Every author, I suppose,')
  })

  it('infers spaces from x gaps while preserving line order', () => {
    const text = pdfExtractionInternals.renderPageFromItems([
      item('World', 80, 700),
      item('Hello', 40, 700),
      item('Next', 40, 680),
      item('line', 80, 680),
    ])

    expect(text).toBe('Hello World\nNext line')
  })

  it('inserts conservative spaces between separate word items', () => {
    const text = pdfExtractionInternals.renderPageFromItems([
      item('Every', 40, 700, 24),
      item('author,', 64, 700, 34),
      item('I', 100, 700, 5),
      item('suppose,', 108, 700, 44),
    ])

    expect(text).toBe('Every author, I suppose,')
  })

  it('does not over-space adjacent single-character glyph runs', () => {
    const text = pdfExtractionInternals.renderPageFromItems([
      item('t', 40, 700, 5),
      item('r', 45, 700, 5),
      item('a', 50, 700, 5),
      item('c', 55, 700, 5),
      item('e', 60, 700, 5),
      item('word', 90, 700, 20),
    ])

    expect(text).toBe('trace word')
  })

  it('keeps normal paragraph extraction on readable lines', () => {
    const text = pdfExtractionInternals.renderPageFromItems([
      item('Amos told the class about an ongoing program', 40, 700, 220),
      item('of research at the University of Michigan.', 40, 682, 210),
    ])

    expect(text).toBe('Amos told the class about an ongoing program\nof research at the University of Michigan.')
  })

  it('preserves header and subheader separation from larger vertical gaps', () => {
    const text = pdfExtractionInternals.renderPageFromItems([
      item('CHAPTER ONE', 140, 720, 80),
      item('The Self-Image', 120, 700, 100),
      item('Your Key to Living Without Limits', 40, 660, 180),
    ])

    expect(text).toMatch(/CHAPTER ONE\n\s+The Self-Image\n\nYour Key to Living Without Limits/)
  })

  it('preserves table-of-contents leaders and page numbers on separate lines', () => {
    const text = pdfExtractionInternals.renderPageFromItems([
      item('Contents', 40, 740, 60),
      item('Introduction', 40, 710, 75),
      item('.....................', 180, 710, 100),
      item('xi', 310, 710, 10),
      item('CHAPTER ONE', 40, 690, 80),
      item('The Self-Image', 140, 690, 95),
      item('.....................', 250, 690, 100),
      item('1', 380, 690, 5),
    ])

    expect(text).toContain('Contents\n\nIntroduction')
    expect(text).toContain('.....................')
    expect(text).toContain('xi')
    expect(text).toContain('\nCHAPTER ONE')
    expect(text).toContain('1')
  })

  it('preserves form-feed page boundaries through layout cleanup', async () => {
    const { cleanupImportedText } = await import('../../shared/importTextCleanup')
    const result = cleanupImportedText('Page one line\f\n\nPage two line', {
      preservePageMarkers: true,
      preserveLayout: true
    })

    expect(result.content).toBe('Page one line\f\n\nPage two line')
  })

  it('falls back to legacy text when layout output merges words', () => {
    const selected = pdfExtractionInternals.choosePageText(
      'Every author, I suppose, has in mind a setting',
      'Everyauthor,Isuppose,hasinmindasetting',
      1
    )

    expect(selected.text).toBe('Every author, I suppose, has in mind a setting')
    expect(selected.signal?.type).toBe('longNoSpaceRun')
  })

  it('reads likely columns top-to-bottom within each column', () => {
    const text = pdfExtractionInternals.renderPageFromItems([
      item('L1', 40, 700),
      item('R1', 300, 700),
      item('L2', 40, 680),
      item('R2', 300, 680),
      item('L3', 40, 660),
      item('R3', 300, 660),
      item('L4', 40, 640),
      item('R4', 300, 640),
    ])

    expect(text).toBe('L1\nL2\nL3\nL4\n\nR1\nR2\nR3\nR4')
  })

  it('strips repeated headers and footers', () => {
    const result = pdfExtractionInternals.stripRepeatedHeadersAndFooters([
      'Report Title\nPage one body\nConfidential',
      'Report Title\nPage two body\nConfidential',
      'Report Title\nPage three body\nConfidential',
    ])

    expect(result.pages).toEqual(['Page one body', 'Page two body', 'Page three body'])
    expect(result.signals[0].type).toBe('repeatedHeaderFooter')
  })
})
