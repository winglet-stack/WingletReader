import fs from 'fs'
import path from 'path'
import mammoth from 'mammoth'
import type { ImportedBlock, ImportedPage, ImportDiagnostics } from '../shared/importTypes'
import { buildImportDiagnostics, cleanupImportedText } from './importTextCleanup'
import { extractPdfText } from './pdfExtraction'

export interface ParseResult {
  content: string
  warnings: string[]
  diagnostics: ImportDiagnostics
  blocks?: ImportedBlock[]
  pages?: ImportedPage[]
  /** Total page count - set for PDF and for Word docs with explicit page breaks. */
  pageCount?: number
  /** HTML rendition of the source document - set for .docx files only. */
  html?: string
}

export class FileParser {
  static async parse(filePath: string, ext: string): Promise<ParseResult> {
    if (!fs.existsSync(filePath)) {
      throw new Error('File not found')
    }

    const stat = fs.statSync(filePath)
    if (stat.size === 0) {
      throw new Error('File is empty')
    }

    const MAX_SIZE = 50 * 1024 * 1024 // 50 MB
    if (stat.size > MAX_SIZE) {
      throw new Error('File exceeds maximum size of 50 MB')
    }

    switch (ext.toLowerCase()) {
      case 'txt':
        return FileParser.parseTxt(filePath)
      case 'docx':
        return FileParser.parseDocx(filePath)
      case 'pdf':
        return FileParser.parsePdf(filePath)
      default:
        throw new Error(
          `Unsupported file type ".${ext}". Supported types: .txt, .docx, .pdf`
        )
    }
  }

  private static parseTxt(filePath: string): ParseResult {
    const buffer = fs.readFileSync(filePath)
    const { content: decoded, parser } = FileParser.decodeTextBuffer(buffer)
    const cleaned = cleanupImportedText(decoded, { preservePageMarkers: true, preserveLayout: true })
    const content = cleaned.content

    if (!content.trim()) {
      throw new Error('Text file is empty or contains only whitespace')
    }

    const diagnostics = buildImportDiagnostics({
      parser,
      sourceExtension: 'txt',
      content,
      fileSizeBytes: buffer.length,
      cleanupActions: cleaned.actions
    })

    return { content, warnings: FileParser.diagnosticWarnings(diagnostics), diagnostics }
  }

  private static async parseDocx(filePath: string): Promise<ParseResult> {
    const buffer = fs.readFileSync(filePath)
    let textResult: { value: string; messages: Array<{ message: string }> }
    let htmlResult: { value: string; messages: Array<{ message: string }> }

    try {
      ;[textResult, htmlResult] = await Promise.all([
        mammoth.extractRawText({ buffer }),
        mammoth.convertToHtml({
          buffer,
          styleMap: [
            "p[style-name='Title'] => h1:fresh",
            "p[style-name='Subtitle'] => h2:fresh",
            "p[style-name='Heading 1'] => h1:fresh",
            "p[style-name='Heading 2'] => h2:fresh",
            "p[style-name='Heading 3'] => h3:fresh",
          ],
        }),
      ])
    } catch (err) {
      throw new Error(`Failed to read .docx file: ${(err as Error).message}`)
    }

    const cleaned = cleanupImportedText(textResult.value, {
      preservePageMarkers: true,
      preserveLayout: true
    })
    const content = cleaned.content.trim()

    if (!content) {
      throw new Error('No extractable text found in this .docx file')
    }

    const mammothWarnings = textResult.messages
      .filter((m) => m.message)
      .map((m) => m.message)
      .slice(0, 5)

    const formFeedCount = (content.match(/\f/g) ?? []).length
    const pageCount = formFeedCount > 0 ? formFeedCount + 1 : undefined
    const html = htmlResult.value || undefined
    const blocks = html ? FileParser.extractDocxBlocksFromHtml(html) : undefined
    const diagnostics = buildImportDiagnostics({
      parser: 'mammoth',
      sourceExtension: 'docx',
      content,
      fileSizeBytes: buffer.length,
      pageCount,
      cleanupActions: cleaned.actions
    })

    return {
      content,
      warnings: [...mammothWarnings, ...FileParser.diagnosticWarnings(diagnostics)],
      diagnostics,
      blocks,
      pageCount,
      html
    }
  }

  private static async parsePdf(filePath: string): Promise<ParseResult> {
    const buffer = fs.readFileSync(filePath)
    let extracted: Awaited<ReturnType<typeof extractPdfText>>

    try {
      extracted = await extractPdfText(buffer)
    } catch (err) {
      throw new Error(`Failed to read .pdf file: ${(err as Error).message}`)
    }

    const cleaned = cleanupImportedText(extracted.content, {
      preservePageMarkers: true,
      preserveLayout: true
    })
    const content = cleaned.content.trim()
    const diagnostics = buildImportDiagnostics({
      parser: 'pdf-parse/layout',
      sourceExtension: 'pdf',
      content,
      fileSizeBytes: buffer.length,
      pageCount: extracted.pageCount,
      cleanupActions: cleaned.actions,
      suspiciousSignals: extracted.suspiciousSignals
    })
    const warnings = FileParser.diagnosticWarnings(diagnostics)

    if (!content || content.replace(/\f/g, '').length < 30) {
      throw new Error(
        `This PDF contains little or no extractable text (${extracted.pageCount} page(s) found). ` +
          'It may be a scanned document or image-based PDF. ' +
          'Try copying the text manually and pasting it into the app.'
      )
    }

    return {
      content,
      warnings,
      diagnostics,
      pages: extracted.pages,
      pageCount: extracted.pageCount
    }
  }

  static inferTitle(filePath: string): string {
    const base = path.basename(filePath, path.extname(filePath))
    return base.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  }

  private static decodeTextBuffer(buffer: Buffer): { content: string; parser: string } {
    if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
      return { content: buffer.subarray(2).toString('utf16le'), parser: 'node:utf16le' }
    }

    if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
      const payload = buffer.subarray(2)
      // Odd-length payload means the file is truncated or malformed; the last
      // byte has no pair and is silently dropped by the swap loop below.
      const truncated = payload.length % 2 !== 0
      const swapped = Buffer.alloc(truncated ? payload.length - 1 : payload.length)
      for (let i = 0; i + 1 < payload.length; i += 2) {
        swapped[i] = payload[i + 1]
        swapped[i + 1] = payload[i]
      }
      return {
        content: swapped.toString('utf16le'),
        parser: truncated ? 'node:utf16be(truncated)' : 'node:utf16be'
      }
    }

    const utf8 = buffer.toString('utf8')
    const replacementCount = (utf8.match(/\uFFFD/g) ?? []).length
    if (replacementCount > 0) {
      return { content: buffer.toString('latin1'), parser: 'node:latin1' }
    }
    return { content: utf8, parser: 'node:utf8' }
  }

  private static diagnosticWarnings(diagnostics: ImportDiagnostics): string[] {
    return diagnostics.suspiciousSignals
      .filter((signal) => signal.severity !== 'info')
      .map((signal) => signal.message)
  }

  private static extractDocxBlocksFromHtml(html: string): ImportedBlock[] {
    const blocks: ImportedBlock[] = []
    const blockRegex = /<(h[1-6]|p|li|td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi
    let match: RegExpExecArray | null

    while ((match = blockRegex.exec(html)) !== null) {
      const tag = match[1].toLowerCase()
      const text = FileParser.htmlToText(match[2])
      if (!text) continue

      if (/^h[1-6]$/.test(tag)) {
        blocks.push({
          type: 'heading',
          text,
          level: Number(tag.slice(1)),
          order: blocks.length
        })
      } else if (tag === 'li') {
        blocks.push({ type: 'list', text, order: blocks.length })
      } else if (tag === 'td' || tag === 'th') {
        blocks.push({ type: 'tableText', text, order: blocks.length })
      } else {
        blocks.push({ type: 'paragraph', text, order: blocks.length })
      }
    }

    return blocks
  }

  private static htmlToText(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
  }
}
