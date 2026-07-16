import pdfParse from 'pdf-parse'
import type { ImportedPage, ImportSuspiciousSignal } from '../shared/importTypes'

interface PdfTextItem {
  str: string
  transform: number[]
  width?: number
  height?: number
}

interface PositionedItem {
  text: string
  x: number
  y: number
  width: number
  height: number
}

interface TextLine {
  text: string
  xMin: number
  xMax: number
  y: number
  height: number
}

export interface PdfExtractionResult {
  content: string
  pageCount: number
  pages: ImportedPage[]
  suspiciousSignals: ImportSuspiciousSignal[]
}

function normalizeLineText(text: string): string {
  return text.replace(/[^\S\n\f]+/g, ' ').trim()
}

function normalizeLayoutLineText(text: string): string {
  return text.replace(/[^\S\n\f]+$/g, '')
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

function noSpaceRunCount(text: string): number {
  return (text.match(/[^\s\f]{45,}/g) ?? []).length
}

function mergedAlphaRunCount(text: string): number {
  return (text.match(/\p{Ll}{8,}\p{Lu}|\p{Lu}\p{Ll}{4,}\p{Lu}\p{Ll}{4,}/gu) ?? []).length
}

function qualityScore(text: string): number {
  return wordCount(text) - noSpaceRunCount(text) * 8 - mergedAlphaRunCount(text) * 6
}

function isSingleWordChar(value: string): boolean {
  return /^[\p{L}\p{N}]$/u.test(value.trim())
}

function shouldInsertInferredSpace(args: {
  currentText: string
  nextText: string
  gap: number
  avgCharWidth: number
}): boolean {
  const { currentText, nextText, gap, avgCharWidth } = args
  if (!currentText || !nextText) return false
  if (/\s$/.test(currentText) || /^\s/.test(nextText)) return false
  if (/^[,.;:!?)}\]'"’”]/.test(nextText)) return false
  if (/[([{'"“‘]$/.test(currentText)) return false

  const prevTrimmed = currentText.trim()
  const nextTrimmed = nextText.trim()
  const prevWordEnd = /[\p{L}\p{N}][)"'’”]?$|[.,;:!?][)"'’”]?$/u.test(prevTrimmed)
  const nextWordStart = /^[("'“‘]?[\p{L}\p{N}]/u.test(nextTrimmed)
  if (!prevWordEnd || !nextWordStart) return false

  const clearWordGap = gap > avgCharWidth * 1.35
  if (/[.,;:!?)]["'’”]?$/.test(prevTrimmed)) return true
  if (isSingleWordChar(prevTrimmed) && isSingleWordChar(nextTrimmed)) return clearWordGap
  if (!isSingleWordChar(prevTrimmed) && isSingleWordChar(nextTrimmed)) return clearWordGap

  return true
}

function inferredGapSpaces(args: {
  currentText: string
  nextText: string
  gap: number
  avgCharWidth: number
}): string {
  const { currentText, nextText, gap, avgCharWidth } = args
  if (gap <= avgCharWidth * 2.5) return ' '

  const previousLooksLikeLeader = /\.{3,}\s*$/.test(currentText)
  const nextLooksLikePageNumber = /^(?:[ivxlcdm]+|\d+)\b/i.test(nextText.trim())
  const nextLooksLikeLeader = /^\.{3,}/.test(nextText.trim())
  if (!previousLooksLikeLeader && !nextLooksLikePageNumber && !nextLooksLikeLeader) return ' '

  const estimated = Math.round(gap / Math.max(avgCharWidth, 1))
  return ' '.repeat(Math.min(Math.max(estimated, 1), 24))
}

function buildLineText(items: PositionedItem[]): string {
  const sorted = [...items].sort((a, b) => a.x - b.x)
  let text = ''
  let prevEnd: number | undefined
  let avgCharWidth = 4

  for (const item of sorted) {
    const value = item.text ?? ''
    if (!value.trim()) continue

    if (prevEnd !== undefined) {
      const gap = item.x - prevEnd
      if (shouldInsertInferredSpace({
        currentText: text,
        nextText: value,
        gap,
        avgCharWidth
      })) {
        text += inferredGapSpaces({
          currentText: text,
          nextText: value,
          gap,
          avgCharWidth
        })
      }
    }

    text += value
    if (value.trim().length > 0 && item.width > 0) {
      avgCharWidth = Math.max(2, item.width / Math.max(value.length, 1))
    }
    prevEnd = item.x + Math.max(item.width, avgCharWidth * value.length)
  }

  return normalizeLayoutLineText(text)
}

function renderLegacyPageFromItems(items: PdfTextItem[]): string {
  let lastY: number | undefined
  let text = ''

  for (const item of items) {
    const y = item.transform?.[5]
    if (lastY !== undefined && y !== lastY) {
      text += '\n'
    }
    text += item.str ?? ''
    lastY = y
  }

  return text.trim()
}

function groupItemsIntoLines(items: PdfTextItem[]): TextLine[] {
  const positioned: PositionedItem[] = items
    .map((item) => ({
      text: item.str ?? '',
      x: item.transform?.[4] ?? 0,
      y: item.transform?.[5] ?? 0,
      width: item.width ?? Math.max((item.str ?? '').length * 4, 1),
      height: item.height ?? 1
    }))
    .filter((item) => item.text.trim().length > 0)
    .sort((a, b) => (Math.abs(b.y - a.y) > 2 ? b.y - a.y : a.x - b.x))

  const lines: PositionedItem[][] = []

  for (const item of positioned) {
    const line = lines.find((candidate) => {
      if (Math.abs(candidate[0].y - item.y) > 3) return false
      const currentMinX = Math.min(...candidate.map((entry) => entry.x))
      const currentMaxX = Math.max(...candidate.map((entry) => entry.x + entry.width))
      const gapToLine = item.x > currentMaxX
        ? item.x - currentMaxX
        : currentMinX - (item.x + item.width)
      return gapToLine <= 120
    })
    if (line) line.push(item)
    else lines.push([item])
  }

  return lines
    .map((lineItems) => {
      const text = buildLineText(lineItems)
      const xs = lineItems.map((item) => item.x)
      const xMaxes = lineItems.map((item) => item.x + item.width)
      const ys = lineItems.map((item) => item.y)
      const heights = lineItems.map((item) => item.height)
      return {
        text,
        xMin: Math.min(...xs),
        xMax: Math.max(...xMaxes),
        y: ys.reduce((sum, y) => sum + y, 0) / ys.length,
        height: Math.max(...heights, 1)
      }
    })
    .filter((line) => line.text.length > 0)
    .sort((a, b) => (Math.abs(b.y - a.y) > 2 ? b.y - a.y : a.xMin - b.xMin))
}

function splitLikelyColumns(lines: TextLine[]): TextLine[][] {
  if (lines.length < 8) return [lines]

  const minX = Math.min(...lines.map((line) => line.xMin))
  const maxX = Math.max(...lines.map((line) => line.xMax))
  const pageTextWidth = Math.max(1, maxX - minX)
  const sortedByX = [...lines].sort((a, b) => a.xMin - b.xMin)
  let largestGap = 0
  let splitAt = -1

  for (let i = 1; i < sortedByX.length; i++) {
    const gap = sortedByX[i].xMin - sortedByX[i - 1].xMin
    if (gap > largestGap) {
      largestGap = gap
      splitAt = i
    }
  }

  const minGap = Math.max(120, pageTextWidth * 0.25)
  if (splitAt <= 0 || largestGap < minGap) return [lines]

  const left = sortedByX.slice(0, splitAt)
  const right = sortedByX.slice(splitAt)
  const minClusterSize = Math.max(3, Math.floor(lines.length * 0.2))
  if (left.length < minClusterSize || right.length < minClusterSize) return [lines]

  return [left, right]
    .map((column) => column.sort((a, b) => (Math.abs(b.y - a.y) > 2 ? b.y - a.y : a.xMin - b.xMin)))
    .sort((a, b) => Math.min(...a.map((line) => line.xMin)) - Math.min(...b.map((line) => line.xMin)))
}

function renderPageFromItems(items: PdfTextItem[]): string {
  const lines = groupItemsIntoLines(items)
  const columns = splitLikelyColumns(lines)
  const pageMinX = lines.length > 0 ? Math.min(...lines.map((line) => line.xMin)) : 0
  return columns
    .map((column) => {
      const columnMinX = column.length > 0 ? Math.min(...column.map((line) => line.xMin)) : pageMinX
      const charWidth = Math.max(3, median(column.map((line) => Math.max(1, (line.xMax - line.xMin) / Math.max(line.text.trim().length, 1)))))
      const lineGap = median(
        column
          .slice(1)
          .map((line, index) => Math.abs(column[index].y - line.y))
          .filter((gap) => gap > 0)
      )

      return column.map((line, index) => {
        const indent = Math.min(24, Math.max(0, Math.round((line.xMin - columnMinX) / charWidth)))
        const previous = index > 0 ? column[index - 1] : undefined
        const verticalGap = previous ? Math.abs(previous.y - line.y) : 0
        const separator = previous && lineGap > 0 && verticalGap > lineGap * 1.15 ? '\n\n' : index > 0 ? '\n' : ''
        return `${separator}${' '.repeat(indent)}${line.text}`
      }).join('')
    })
    .join('\n\n')
    .trim()
}

function choosePageText(
  legacyText: string,
  layoutText: string,
  pageNumber: number
): { text: string; signal?: ImportSuspiciousSignal } {
  if (!layoutText.trim()) return { text: legacyText }
  if (!legacyText.trim()) return { text: layoutText }

  const legacyWords = wordCount(legacyText)
  const layoutWords = wordCount(layoutText)
  const layoutClearlyWorse =
    layoutWords + 3 < legacyWords ||
    noSpaceRunCount(layoutText) > noSpaceRunCount(legacyText) ||
    mergedAlphaRunCount(layoutText) > mergedAlphaRunCount(legacyText) ||
    qualityScore(layoutText) + 2 < qualityScore(legacyText)

  if (layoutClearlyWorse) {
    return {
      text: legacyText,
      signal: {
        type: 'longNoSpaceRun',
        severity: 'info',
        page: pageNumber,
        message: `Used legacy PDF text order on page ${pageNumber} because layout extraction appeared to merge words.`
      }
    }
  }

  return { text: layoutText }
}

function repeatedValues(values: string[], pageCount: number): Set<string> {
  const counts = new Map<string, number>()
  for (const value of values) {
    const normalized = normalizeLineText(value)
    if (normalized.length < 3) continue
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1)
  }
  const threshold = Math.max(2, Math.ceil(pageCount * 0.5))
  return new Set(
    [...counts.entries()]
      .filter(([, count]) => count >= threshold)
      .map(([value]) => value)
  )
}

function stripRepeatedHeadersAndFooters(pageTexts: string[]): {
  pages: string[]
  signals: ImportSuspiciousSignal[]
} {
  if (pageTexts.length < 2) return { pages: pageTexts, signals: [] }

  const firstLines = pageTexts.map((text) => text.split('\n').map(normalizeLineText).filter(Boolean)[0] ?? '')
  const lastLines = pageTexts.map((text) => {
    const lines = text.split('\n').map(normalizeLineText).filter(Boolean)
    return lines[lines.length - 1] ?? ''
  })
  const repeated = new Set([...repeatedValues(firstLines, pageTexts.length), ...repeatedValues(lastLines, pageTexts.length)])
  if (repeated.size === 0) return { pages: pageTexts, signals: [] }

  const pages = pageTexts.map((text) => {
    const lines = text.split('\n')
    while (lines.length > 0 && repeated.has(normalizeLineText(lines[0]))) lines.shift()
    while (lines.length > 0 && repeated.has(normalizeLineText(lines[lines.length - 1]))) lines.pop()
    return lines.join('\n').trim()
  })

  return {
    pages,
    signals: [{
      type: 'repeatedHeaderFooter',
      severity: 'info',
      message: `Removed ${repeated.size} repeated header/footer line(s) from PDF extraction.`
    }]
  }
}

function toImportedPages(pageTexts: string[]): ImportedPage[] {
  return pageTexts.map((text, index) => ({
    pageNumber: index + 1,
    text,
    charCount: text.length,
    wordCount: text.trim().split(/\s+/).filter(Boolean).length
  }))
}

export async function extractPdfText(buffer: Buffer): Promise<PdfExtractionResult> {
  const renderedPages: string[] = []
  const extractionSignals: ImportSuspiciousSignal[] = []
  let pageNumber = 0

  const renderPage = async (pageData: {
    getTextContent: (options?: {
      normalizeWhitespace?: boolean
      disableCombineTextItems?: boolean
    }) => Promise<{ items: PdfTextItem[] }>
  }): Promise<string> => {
    pageNumber += 1
    const textContent = await pageData.getTextContent({
      normalizeWhitespace: false,
      disableCombineTextItems: false
    })
    const legacyText = renderLegacyPageFromItems(textContent.items)
    const layoutText = renderPageFromItems(textContent.items)
    const selected = choosePageText(legacyText, layoutText, pageNumber)
    if (selected.signal) extractionSignals.push(selected.signal)
    renderedPages.push(selected.text)
    return `${selected.text}\f`
  }

  const data = await pdfParse(buffer, { pagerender: renderPage })
  const pageTexts = renderedPages.length > 0
    ? renderedPages
    : String(data.text ?? '').split(/\f|\n{3,}/)

  const stripped = stripRepeatedHeadersAndFooters(pageTexts)
  const pages = toImportedPages(stripped.pages)
  const content = stripped.pages.join('\f\n\n').trim()

  return {
    content,
    pageCount: data.numpages,
    pages,
    suspiciousSignals: [...extractionSignals, ...stripped.signals]
  }
}

export const pdfExtractionInternals = {
  groupItemsIntoLines,
  renderLegacyPageFromItems,
  renderPageFromItems,
  choosePageText,
  splitLikelyColumns,
  stripRepeatedHeadersAndFooters
}
