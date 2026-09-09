export type PrimerSectionId =
  | 'headings'
  | 'introduction'
  | 'boldedTerms'
  | 'visualAids'
  | 'questions'
  | 'summary'

export type PrimerDisplayAs = 'list' | 'prose' | 'chips'

export interface PrimerItem {
  text: string
}

export interface PrimerSection {
  id: PrimerSectionId
  label: string
  displayAs: PrimerDisplayAs
  items: PrimerItem[]
  generated: boolean
  generatedNote?: string
  fallback: string
}

export interface TextPrimer {
  sections: PrimerSection[]
}

// ── Shared heading utilities (mirrors tokenizer.ts isHeadline) ─────────────

function isHeadlinePara(para: string): boolean {
  const line = para.split('\n')[0].trim()
  if (!line) return false
  if (/^#{1,6}\s/.test(line)) return true
  if (line === line.toUpperCase() && /[A-Z]{2,}/.test(line) && line.length >= 3) return true
  const isSingleLine =
    !para.includes('\n') || para.split('\n').filter((l) => l.trim()).length === 1
  if (isSingleLine && /:\s*$/.test(line) && line.split(/\s+/).length <= 8) return true
  return false
}

function getHeadingText(para: string): string {
  return para
    .split('\n')[0]
    .trim()
    .replace(/^#{1,6}\s+/, '')
    .replace(/:\s*$/, '')
    .trim()
}

// ── Section extractors ─────────────────────────────────────────────────────

function extractHeadings(paragraphs: string[]): PrimerSection {
  const items: PrimerItem[] = []
  const seen = new Set<string>()

  for (const para of paragraphs) {
    if (!isHeadlinePara(para)) continue
    const text = getHeadingText(para)
    if (!text || seen.has(text)) continue
    seen.add(text)
    items.push({ text })
  }

  return {
    id: 'headings',
    label: 'Titles & Headings',
    displayAs: 'list',
    items,
    generated: false,
    fallback: 'No headings found.'
  }
}

const INTRO_SECTION_RE =
  /^(introduction|overview|abstract|preface|foreword|prologue|preamble)\b/i

function extractIntroduction(paragraphs: string[]): PrimerSection {
  // Find an explicit introduction heading
  for (let i = 0; i < paragraphs.length; i++) {
    if (!isHeadlinePara(paragraphs[i])) continue
    if (!INTRO_SECTION_RE.test(getHeadingText(paragraphs[i]))) continue

    const content: PrimerItem[] = []
    for (let j = i + 1; j < paragraphs.length && content.length < 3; j++) {
      if (isHeadlinePara(paragraphs[j])) break
      content.push({ text: paragraphs[j] })
    }

    if (content.length > 0) {
      return {
        id: 'introduction',
        label: 'Introduction',
        displayAs: 'prose',
        items: content,
        generated: false,
        fallback: 'No introduction found.'
      }
    }
  }

  // Infer from first non-heading content paragraphs
  const firstParas: PrimerItem[] = []
  for (const para of paragraphs) {
    if (isHeadlinePara(para) || para.trim().length < 20) continue
    const text = para.length > 500 ? para.slice(0, 500) + '…' : para
    firstParas.push({ text })
    if (firstParas.length >= 2) break
  }

  return {
    id: 'introduction',
    label: 'Introduction',
    displayAs: 'prose',
    items: firstParas,
    generated: firstParas.length > 0,
    generatedNote:
      firstParas.length > 0
        ? 'Inferred from opening content — no explicit introduction was found.'
        : undefined,
    fallback: 'No introduction found.'
  }
}

function extractBoldedTerms(text: string): PrimerSection {
  const items: PrimerItem[] = []
  const seen = new Set<string>()

  // Match **term** and __term__
  const patterns = [/\*\*(.+?)\*\*/g, /__(.+?)__/g]
  for (const re of patterns) {
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const term = m[1].trim()
      if (term && !seen.has(term)) {
        seen.add(term)
        items.push({ text: term })
      }
    }
  }

  return {
    id: 'boldedTerms',
    label: 'Bolded Terms & Phrases',
    displayAs: 'chips',
    items,
    generated: false,
    fallback: 'No bolded terms found.'
  }
}

const VISUAL_PATTERNS: RegExp[] = [
  // Caption-style lines: "Figure 1:", "Table 2.", "FIG. 3 —"
  /^(figure|fig\.?|table|chart|diagram|graph|image|illustration|exhibit|plate)\s*[\d.]*\s*[:.—]/i,
  // Numbered reference anywhere in a short line: "Figure 1", "Table 2"
  /\b(figure|fig\.?|table|chart|diagram|graph|illustration)\s+\d+/i,
  // Bracketed references: "[Figure 1]", "[Table 2: title]"
  /\[(figure|fig\.?|table|chart|diagram)\s*[\d]*[^\]]*\]/i
]

function extractVisualAids(lines: string[]): PrimerSection {
  const items: PrimerItem[] = []
  const seen = new Set<string>()

  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.length > 200) continue

    for (const re of VISUAL_PATTERNS) {
      if (re.test(line)) {
        const key = line.toLowerCase().slice(0, 100)
        if (!seen.has(key)) {
          seen.add(key)
          items.push({ text: line })
        }
        break
      }
    }
  }

  return {
    id: 'visualAids',
    label: 'Visual Aids',
    displayAs: 'list',
    items,
    generated: false,
    fallback: 'No visual aids found.'
  }
}

// Matches section headings that mark a question/exercise block
const QUESTION_SECTION_RE =
  /^(review(\s+(questions?|exercises?|problems?|activities?))?|discussion(\s+(questions?|prompts?|topics?))?|practice(\s+(questions?|exercises?|problems?))?|comprehension\s+questions?|self.?assessment|check\s+your\s+(understanding|knowledge)|exercises?|problems?|critical\s+thinking|activities?|end.of.chapter|questions?)$/i

function isQuestionLine(line: string): boolean {
  const t = line.trim()
  if (t.length < 10) return false
  if (t.endsWith('?')) return true
  if (/^\d+[.)]\s+.+\?$/.test(t)) return true
  return false
}

function extractQuestions(paragraphs: string[]): PrimerSection {
  let inSection = false
  const sectionItems: PrimerItem[] = []

  for (const para of paragraphs) {
    if (isHeadlinePara(para)) {
      inSection = QUESTION_SECTION_RE.test(getHeadingText(para))
      continue
    }

    if (!inSection) continue

    const lines = para.split('\n').map((l) => l.trim()).filter(Boolean)
    for (const line of lines) {
      // Numbered item: "1. text" or "1) text"
      const numbered = line.match(/^(\d+[.)]\s+)(.+)$/)
      if (numbered) {
        sectionItems.push({ text: numbered[2] })
        continue
      }
      // Lettered item: "a) text"
      const lettered = line.match(/^([a-z][.)]\s+)(.+)$/i)
      if (lettered) {
        sectionItems.push({ text: lettered[2] })
        continue
      }
      // Bare question
      if (isQuestionLine(line)) {
        sectionItems.push({ text: line })
      }
    }
  }

  if (sectionItems.length > 0) {
    return {
      id: 'questions',
      label: 'End-of-Chapter Questions',
      displayAs: 'list',
      items: sectionItems.slice(0, 20),
      generated: false,
      fallback: 'No end-of-chapter questions found.'
    }
  }

  // Fallback: scan tail 20% of all lines for question-like content
  const allLines = paragraphs
    .flatMap((p) => p.split('\n').map((l) => l.trim()))
    .filter(Boolean)
  const startAt = Math.floor(allLines.length * 0.8)
  const tailItems: PrimerItem[] = []

  for (const line of allLines.slice(startAt)) {
    if (isQuestionLine(line)) {
      tailItems.push({ text: line })
    }
  }

  return {
    id: 'questions',
    label: 'End-of-Chapter Questions',
    displayAs: 'list',
    items: tailItems.slice(0, 20),
    generated: false,
    fallback: 'No end-of-chapter questions found.'
  }
}

const SUMMARY_SECTION_RE =
  /^(summary|conclusion|key\s+(points?|takeaways?|concepts?)|in\s+(brief|summary|conclusion)|wrap.?up|chapter\s+review|review)$/i

function extractSummary(paragraphs: string[]): PrimerSection {
  // Find an explicit summary heading
  for (let i = 0; i < paragraphs.length; i++) {
    if (!isHeadlinePara(paragraphs[i])) continue
    if (!SUMMARY_SECTION_RE.test(getHeadingText(paragraphs[i]))) continue

    const content: PrimerItem[] = []
    for (let j = i + 1; j < paragraphs.length; j++) {
      if (isHeadlinePara(paragraphs[j])) break
      content.push({ text: paragraphs[j] })
    }

    if (content.length > 0) {
      return {
        id: 'summary',
        label: 'Summary',
        displayAs: 'prose',
        items: content,
        generated: false,
        fallback: 'No summary found.'
      }
    }
  }

  // Generate from first sentences of the closing paragraphs
  const contentParas = paragraphs.filter((p) => !isHeadlinePara(p) && p.trim().length > 50)

  if (contentParas.length === 0) {
    return {
      id: 'summary',
      label: 'Summary',
      displayAs: 'prose',
      items: [],
      generated: true,
      fallback: 'No summary found.'
    }
  }

  const lastParas = contentParas.slice(-Math.min(5, contentParas.length))
  const sentences = lastParas.map((para) => {
    const m = para.match(/^.+?[.!?](?:\s|$)/)
    return { text: m ? m[0].trim() : para.slice(0, 300) }
  })

  return {
    id: 'summary',
    label: 'Summary',
    displayAs: 'prose',
    items: sentences,
    generated: true,
    generatedNote: 'Generated from closing content — no explicit summary was found.',
    fallback: 'No summary found.'
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

export function generatePrimer(text: string): TextPrimer {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  return {
    sections: [
      extractHeadings(paragraphs),
      extractIntroduction(paragraphs),
      extractBoldedTerms(text),
      extractVisualAids(lines),
      extractQuestions(paragraphs),
      extractSummary(paragraphs)
    ]
  }
}
