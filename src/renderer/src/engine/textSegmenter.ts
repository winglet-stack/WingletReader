import type { TextSegment, SegmentSourceType, Settings } from '../types'
import type { ImportedBlock } from '../../../shared/importTypes'

interface RawSegment {
  title: string
  lines: string[]
}

// Checks whether a trimmed line looks like a section heading
function isHeadingLine(line: string): boolean {
  if (!line || line.length > 120) return false

  // Markdown headings: # Title, ## Title, ### Title
  if (/^#{1,3}\s+\S/.test(line)) return true

  // "Chapter N" / "Chapter One" / "Chapter I" (roman numerals up to ~20)
  if (/^chapter\s+(\d+|[ivxlcdmIVXLCDM]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i.test(line)) return true

  // "Part N" / "Part One"
  if (/^part\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(line)) return true

  // Numbered section: "1. Introduction", "2.3 The Method" — requires text after number
  if (/^\d+(\.\d+)*\.?\s+\S/.test(line) && line.length < 80) return true

  // ALL CAPS line of reasonable length (e.g. "INTRODUCTION", "THE GREAT GATSBY")
  if (
    /^[A-Z][A-Z\s\d\-:,.']{3,}$/.test(line) &&
    line.length >= 4 &&
    line.length <= 80 &&
    // Must contain at least one actual letter sequence (not just dashes/numbers)
    /[A-Z]{2}/.test(line)
  ) return true

  return false
}

function cleanHeadingTitle(line: string): string {
  // Strip markdown # prefix
  return line.replace(/^#+\s+/, '').replace(/:$/, '').trim()
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function detectChapters(text: string): RawSegment[] | null {
  const lines = text.split('\n')
  const headingIndices: number[] = []

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (!trimmed) continue

    // Heading must be preceded by a blank line (or be at start of document)
    const prevTrimmed = i > 0 ? lines[i - 1].trim() : ''
    const atStart = i === 0
    const afterBlank = prevTrimmed === ''

    if ((atStart || afterBlank) && isHeadingLine(trimmed)) {
      headingIndices.push(i)
    }
  }

  // Need at least 2 headings to consider it structured
  if (headingIndices.length < 2) return null

  const segments: RawSegment[] = []

  // Pre-heading intro content
  if (headingIndices[0] > 0) {
    const introLines = lines.slice(0, headingIndices[0])
    const introWc = wordCount(introLines.join(' '))
    if (introWc >= 20) {
      segments.push({ title: 'Introduction', lines: introLines })
    }
  }

  for (let h = 0; h < headingIndices.length; h++) {
    const start = headingIndices[h]
    const end = h + 1 < headingIndices.length ? headingIndices[h + 1] : lines.length
    const title = cleanHeadingTitle(lines[start].trim())
    const contentLines = lines.slice(start + 1, end)
    segments.push({ title, lines: contentLines })
  }

  // Filter segments with too little content — ambiguous sub-headings
  const meaningful = segments.filter((s) => wordCount(s.lines.join(' ')) >= 20)

  // If more than half the segments are empty/tiny, the headings are likely just formatting
  if (meaningful.length < headingIndices.length / 2) return null

  // Sanity: too many headings (> 60) means they're inline styling, not chapters
  if (headingIndices.length > 60) return null

  if (meaningful.length < 2) return null

  return meaningful
}

function detectChaptersFromBlocks(blocks: ImportedBlock[] | undefined): RawSegment[] | null {
  if (!blocks || blocks.length === 0) return null

  const headingIndexes = blocks
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => block.type === 'heading' && block.text.trim().length > 0)
    .map(({ index }) => index)

  if (headingIndexes.length < 2) return null

  const segments: RawSegment[] = []

  if (headingIndexes[0] > 0) {
    const introLines = blocks
      .slice(0, headingIndexes[0])
      .map((block) => block.text.trim())
      .filter(Boolean)
    if (wordCount(introLines.join(' ')) >= 20) {
      segments.push({ title: 'Introduction', lines: introLines })
    }
  }

  for (let h = 0; h < headingIndexes.length; h++) {
    const start = headingIndexes[h]
    const end = h + 1 < headingIndexes.length ? headingIndexes[h + 1] : blocks.length
    const title = cleanHeadingTitle(blocks[start].text.trim())
    const lines = blocks
      .slice(start + 1, end)
      .map((block) => block.text.trim())
      .filter(Boolean)
    segments.push({ title, lines })
  }

  const meaningful = segments.filter((s) => wordCount(s.lines.join(' ')) >= 20)
  if (meaningful.length < 2) return null
  if (headingIndexes.length > 80) return null
  return meaningful
}

function chunkByWords(text: string, targetWords: number): RawSegment[] {
  const paragraphs = text.split(/\n{2,}/)
  const chunks: RawSegment[] = []
  let currentParas: string[] = []
  let currentWc = 0

  const flush = () => {
    if (currentParas.length > 0) {
      chunks.push({ title: '', lines: currentParas })
      currentParas = []
      currentWc = 0
    }
  }

  for (const para of paragraphs) {
    const trimmed = para.trim()
    if (!trimmed) continue

    const paraWc = wordCount(trimmed)

    // Oversized single paragraph — split at sentence boundaries
    if (paraWc > targetWords) {
      flush()
      const sentences = trimmed.split(/(?<=[.!?])\s+/)
      let sentBatch: string[] = []
      let sentWc = 0
      for (const sentence of sentences) {
        const sw = wordCount(sentence)
        if (sentWc + sw > targetWords && sentWc > 0) {
          chunks.push({ title: '', lines: sentBatch })
          sentBatch = []
          sentWc = 0
        }
        sentBatch.push(sentence)
        sentWc += sw
      }
      if (sentBatch.length > 0) {
        currentParas = sentBatch
        currentWc = sentWc
      }
      continue
    }

    if (currentWc + paraWc > targetWords && currentWc > 0) {
      flush()
    }

    currentParas.push(trimmed)
    currentWc += paraWc
  }

  flush()

  return chunks
}

export type SegmentDraft = Omit<TextSegment, 'id' | 'textId'>

export function segmentText(
  content: string,
  settings: Pick<
    Settings,
    'segmentation_threshold' | 'segmentation_chunk_size' | 'auto_chapter_detection'
  >,
  blocks?: ImportedBlock[]
): SegmentDraft[] | null {
  if (content.length < settings.segmentation_threshold) return null

  let rawSegments: RawSegment[] | null = null
  let sourceType: SegmentSourceType = 'generated_chunk'

  if (settings.auto_chapter_detection) {
    rawSegments = detectChaptersFromBlocks(blocks) ?? detectChapters(content)
    if (rawSegments) sourceType = 'detected_heading'
  }

  if (!rawSegments) {
    rawSegments = chunkByWords(content, settings.segmentation_chunk_size)
    sourceType = 'generated_chunk'
  }

  if (rawSegments.length <= 1) return null

  return rawSegments.map((seg, i) => {
    const body = seg.lines.join(sourceType === 'detected_heading' ? '\n' : '\n\n').trim()
    return {
      title: seg.title || `Part ${i + 1}`,
      content: body,
      order: i,
      sourceType,
      word_count: wordCount(body)
    }
  })
}
