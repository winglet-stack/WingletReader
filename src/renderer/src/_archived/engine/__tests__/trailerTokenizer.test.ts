import { describe, it, expect } from 'vitest'
import { buildTrailerStacks, trailerPauseMs } from '../trailerTokenizer'
import type { TextPrimer, PrimerSection, PrimerSectionId } from '../textPrimer'
import type { Settings, TrailerStack } from '../../../types'

// ── Helpers ────────────────────────────────────────────────────────────────

const BASE_SETTINGS: Settings = {
  words_per_stack: 3,
  stacks_visible: 1,
  stack_gap: 32,
  bpm: 60,
  metronome_enabled: false,
  pause_at_sentences: true,
  pause_at_headlines: true,
  font_size: 36,
  stack_vertical_offset: 0,
  theme: 'dark',
  highlight_active: true,
  lines_enabled: false,
  lines_count: 3,
  lines_row_gap: 8,
  segmentation_enabled: true,
  segmentation_threshold: 5000,
  segmentation_chunk_size: 1500,
  auto_chapter_detection: true,
  summaries_initialized: false,
  chunk_rule_long_word: false,
  chunk_rule_enumerations: false,
  chunk_rule_bullets: false,
  chunk_rule_commas: false,
  chunk_rule_names: false,
  chunk_rule_headlines: true,
  stack_horizontal_offset: 0,
  view_style: 'default',
  show_chunk_dividers: true,
  highlight_color: '',
  viewport_bg_color: '',
  text_color: '',
  font_family: '',
  highlight_text_color: '',
  highlight_mode: 'default',
  highlight_panning_chunk_size: 0,
  highlighting_mode: 'default',
  tap_to_read: false,
  tap_to_read_key: 'Space',
  lock_at_wpm: false,
  target_wpm: 200,
  custom_palettes: [],
  custom_text_presets: [],
  custom_font_presets: [],
  custom_playback_presets: [],
  custom_reader_configs: [],
}

function emptySection(id: PrimerSectionId): PrimerSection {
  const displayAs = id === 'boldedTerms' ? 'chips' : id === 'introduction' || id === 'summary' ? 'prose' : 'list'
  return { id, label: id, displayAs, items: [], generated: false, fallback: '' }
}

function makePrimer(overrides: Partial<Record<PrimerSectionId, Partial<PrimerSection>>>): TextPrimer {
  const ids: PrimerSectionId[] = ['headings', 'introduction', 'boldedTerms', 'visualAids', 'questions', 'summary']
  return {
    sections: ids.map((id) => {
      const base = emptySection(id)
      return overrides[id] ? { ...base, ...overrides[id] } : base
    })
  }
}

// ── buildTrailerStacks ─────────────────────────────────────────────────────

describe('buildTrailerStacks — headings', () => {
  it('produces headline-type stacks for each heading item', () => {
    const primer = makePrimer({
      headings: { items: [{ text: 'Chapter One' }, { text: 'Chapter Two' }] }
    })
    const stacks = buildTrailerStacks(primer, BASE_SETTINGS)
    expect(stacks.length).toBe(2)
    stacks.forEach((s) => {
      expect(s.type).toBe('headline')
      expect(s.section).toBe('heading')
      expect(s.bold).toBe(false)
      expect(s.pauseForUser).toBe(false)
    })
  })

  it('preserves all words of a heading without splitting (within MAX_WORDS_PER_STACK)', () => {
    const primer = makePrimer({
      headings: { items: [{ text: 'Chapter One Introduction' }] }
    })
    const stacks = buildTrailerStacks(primer, BASE_SETTINGS)
    expect(stacks[0].words).toEqual(['Chapter', 'One', 'Introduction'])
  })

  it('chunks headings longer than MAX_WORDS_PER_STACK (7) into multiple stacks', () => {
    const longHeading = 'A B C D E F G H I' // 9 words
    const primer = makePrimer({ headings: { items: [{ text: longHeading }] } })
    const stacks = buildTrailerStacks(primer, BASE_SETTINGS)
    expect(stacks.length).toBe(2)
    expect(stacks[0].words.length).toBe(7)
    expect(stacks[1].words.length).toBe(2)
    stacks.forEach((s) => expect(s.type).toBe('headline'))
  })

  it('skips empty sections', () => {
    const primer = makePrimer({}) // all sections empty
    expect(buildTrailerStacks(primer, BASE_SETTINGS)).toHaveLength(0)
  })
})

describe('buildTrailerStacks — introduction', () => {
  it('tags stacks as intro section', () => {
    const primer = makePrimer({
      introduction: { items: [{ text: 'The quick brown fox.' }] }
    })
    const stacks = buildTrailerStacks(primer, BASE_SETTINGS)
    stacks.forEach((s) => expect(s.section).toBe('intro'))
  })

  it('applies normal word-stack rules (respects words_per_stack)', () => {
    // 9 words → at least 3 stacks with words_per_stack=3
    const primer = makePrimer({
      introduction: { items: [{ text: 'One two three four five six seven eight nine.' }] }
    })
    const stacks = buildTrailerStacks(primer, { ...BASE_SETTINGS, words_per_stack: 3 })
    const introStacks = stacks.filter((s) => s.section === 'intro')
    expect(introStacks.length).toBeGreaterThanOrEqual(3)
    introStacks.forEach((s) => {
      expect(s.bold).toBe(false)
      expect(s.pauseForUser).toBe(false)
    })
  })

  it('each intro stack word count does not exceed words_per_stack', () => {
    const primer = makePrimer({
      introduction: { items: [{ text: 'Alpha beta gamma delta epsilon zeta eta theta.' }] }
    })
    const stacks = buildTrailerStacks(primer, { ...BASE_SETTINGS, words_per_stack: 2 })
    stacks.filter((s) => s.section === 'intro').forEach((s) => {
      expect(s.words.length).toBeLessThanOrEqual(2)
    })
  })
})

describe('buildTrailerStacks — bold terms', () => {
  it('creates one stack per bold term with bold=true', () => {
    const primer = makePrimer({
      boldedTerms: { items: [{ text: 'Neural Networks' }, { text: 'Deep Learning' }] }
    })
    const stacks = buildTrailerStacks(primer, BASE_SETTINGS)
    expect(stacks).toHaveLength(2)
    stacks.forEach((s) => {
      expect(s.section).toBe('bold')
      expect(s.bold).toBe(true)
      expect(s.type).toBe('normal')
      expect(s.pauseForUser).toBe(false)
    })
  })

  it('preserves multi-word bold terms as a single stack', () => {
    const primer = makePrimer({
      boldedTerms: { items: [{ text: 'Gradient Descent' }] }
    })
    const stacks = buildTrailerStacks(primer, BASE_SETTINGS)
    expect(stacks[0].words).toEqual(['Gradient', 'Descent'])
  })

  it('bold=true is independent of words_per_stack; each item is one stack', () => {
    const primer = makePrimer({
      boldedTerms: { items: [{ text: 'A' }, { text: 'B' }, { text: 'C' }] }
    })
    const stacks = buildTrailerStacks(primer, { ...BASE_SETTINGS, words_per_stack: 1 })
    expect(stacks).toHaveLength(3)
    stacks.forEach((s) => expect(s.bold).toBe(true))
  })
})

describe('buildTrailerStacks — visual aids', () => {
  it('tags stacks as visualAid section', () => {
    const primer = makePrimer({
      visualAids: { items: [{ text: 'Figure 1: Brain architecture' }] }
    })
    const stacks = buildTrailerStacks(primer, BASE_SETTINGS)
    stacks.forEach((s) => expect(s.section).toBe('visualAid'))
  })

  it('bold is false for visual aid stacks', () => {
    const primer = makePrimer({
      visualAids: { items: [{ text: 'Table 2: Results' }] }
    })
    const stacks = buildTrailerStacks(primer, BASE_SETTINGS)
    stacks.forEach((s) => expect(s.bold).toBe(false))
  })
})

describe('buildTrailerStacks — questions', () => {
  it('marks only the last stack of each question with pauseForUser=true', () => {
    const primer = makePrimer({
      questions: {
        items: [
          { text: 'What is the main idea?' },
          { text: 'How does it work?' }
        ]
      }
    })
    const stacks = buildTrailerStacks(primer, { ...BASE_SETTINGS, words_per_stack: 3 })
    const questionStacks = stacks.filter((s) => s.section === 'question')

    // Exactly two stacks should have pauseForUser (one per question)
    const pauseStacks = questionStacks.filter((s) => s.pauseForUser)
    expect(pauseStacks.length).toBe(2)
  })

  it('non-last stacks of a multi-stack question have pauseForUser=false', () => {
    // Long question that will tokenize into multiple stacks with words_per_stack=2
    const primer = makePrimer({
      questions: { items: [{ text: 'What are the primary causes of climate change in the modern era?' }] }
    })
    const stacks = buildTrailerStacks(primer, { ...BASE_SETTINGS, words_per_stack: 2 })
    const questionStacks = stacks.filter((s) => s.section === 'question')

    expect(questionStacks.length).toBeGreaterThan(1)

    // All except the last should have pauseForUser=false
    questionStacks.slice(0, -1).forEach((s) => expect(s.pauseForUser).toBe(false))
    // The last one should have pauseForUser=true
    expect(questionStacks[questionStacks.length - 1].pauseForUser).toBe(true)
  })

  it('tags all question stacks as question section', () => {
    const primer = makePrimer({
      questions: { items: [{ text: 'Why does this matter?' }] }
    })
    const stacks = buildTrailerStacks(primer, BASE_SETTINGS)
    stacks.forEach((s) => expect(s.section).toBe('question'))
  })
})

describe('buildTrailerStacks — summary', () => {
  it('tags stacks as summary section', () => {
    const primer = makePrimer({
      summary: { items: [{ text: 'In conclusion, the theory holds.' }] }
    })
    const stacks = buildTrailerStacks(primer, BASE_SETTINGS)
    stacks.forEach((s) => expect(s.section).toBe('summary'))
  })

  it('applies normal word-stack rules for summary', () => {
    const primer = makePrimer({
      summary: { items: [{ text: 'One two three four five six.' }] }
    })
    const stacks = buildTrailerStacks(primer, { ...BASE_SETTINGS, words_per_stack: 3 })
    const summaryStacks = stacks.filter((s) => s.section === 'summary')
    expect(summaryStacks.length).toBeGreaterThan(0)
    summaryStacks.forEach((s) => {
      expect(s.bold).toBe(false)
      expect(s.pauseForUser).toBe(false)
      expect(s.words.length).toBeLessThanOrEqual(3)
    })
  })
})

describe('buildTrailerStacks — section ordering', () => {
  it('emits sections in primer order: headings → intro → bold → visualAid → question → summary', () => {
    const primer = makePrimer({
      headings: { items: [{ text: 'Title' }] },
      introduction: { items: [{ text: 'Intro text here.' }] },
      boldedTerms: { items: [{ text: 'Term' }] },
      visualAids: { items: [{ text: 'Figure 1' }] },
      questions: { items: [{ text: 'Question?' }] },
      summary: { items: [{ text: 'Summary text here.' }] }
    })
    const stacks = buildTrailerStacks(primer, BASE_SETTINGS)
    const sections = stacks.map((s) => s.section)

    const firstHeading = sections.indexOf('heading')
    const firstIntro = sections.indexOf('intro')
    const firstBold = sections.indexOf('bold')
    const firstVisual = sections.indexOf('visualAid')
    const firstQuestion = sections.indexOf('question')
    const firstSummary = sections.indexOf('summary')

    expect(firstHeading).toBeLessThan(firstIntro)
    expect(firstIntro).toBeLessThan(firstBold)
    expect(firstBold).toBeLessThan(firstVisual)
    expect(firstVisual).toBeLessThan(firstQuestion)
    expect(firstQuestion).toBeLessThan(firstSummary)
  })
})

// ── trailerPauseMs ─────────────────────────────────────────────────────────

describe('trailerPauseMs — heading', () => {
  const beatMs = 1000

  it('heading stacks always pause for 4× beatMs', () => {
    const s: TrailerStack = { words: ['Title'], type: 'headline', section: 'heading', bold: false, pauseForUser: false }
    expect(trailerPauseMs(s, beatMs, { pauseAtSentences: true })).toBe(4000)
    expect(trailerPauseMs(s, beatMs, { pauseAtSentences: false })).toBe(4000)
  })
})

describe('trailerPauseMs — bold', () => {
  const beatMs = 1000

  it('bold stacks always use exactly 1× beatMs regardless of pauseAtSentences', () => {
    const s: TrailerStack = { words: ['Neural', 'Networks'], type: 'normal', section: 'bold', bold: true, pauseForUser: false }
    expect(trailerPauseMs(s, beatMs, { pauseAtSentences: true })).toBe(1000)
    expect(trailerPauseMs(s, beatMs, { pauseAtSentences: false })).toBe(1000)
  })
})

describe('trailerPauseMs — visual aid slowdown', () => {
  const beatMs = 1000

  it('visual aid stacks run at 1.25× beatMs (20% slower pace)', () => {
    const base: TrailerStack = { words: ['Figure'], type: 'normal', section: 'intro', bold: false, pauseForUser: false }
    const visual: TrailerStack = { ...base, section: 'visualAid' }

    const normalPause = trailerPauseMs(base, beatMs, { pauseAtSentences: false })
    const visualPause = trailerPauseMs(visual, beatMs, { pauseAtSentences: false })

    expect(visualPause).toBe(normalPause * 1.25)
  })

  it('visual aid sentence-end stacks also apply the 1.25× factor', () => {
    const s: TrailerStack = { words: ['Done.'], type: 'sentence-end', section: 'visualAid', bold: false, pauseForUser: false }
    const introEquiv: TrailerStack = { ...s, section: 'intro' }

    const introPause = trailerPauseMs(introEquiv, beatMs, { pauseAtSentences: true })
    const visualPause = trailerPauseMs(s, beatMs, { pauseAtSentences: true })

    expect(visualPause).toBeCloseTo(introPause * 1.25)
  })
})

describe('trailerPauseMs — intro / summary follow normal pause rules', () => {
  const beatMs = 1000

  it('normal stack = 1× beatMs', () => {
    const s: TrailerStack = { words: ['word'], type: 'normal', section: 'intro', bold: false, pauseForUser: false }
    expect(trailerPauseMs(s, beatMs, { pauseAtSentences: true })).toBe(1000)
  })

  it('sentence-end stack = 2× beatMs when pauseAtSentences is true', () => {
    const s: TrailerStack = { words: ['end.'], type: 'sentence-end', section: 'summary', bold: false, pauseForUser: false }
    expect(trailerPauseMs(s, beatMs, { pauseAtSentences: true })).toBe(2000)
    expect(trailerPauseMs(s, beatMs, { pauseAtSentences: false })).toBe(1000)
  })

  it('paragraph-end stack = 3× beatMs when pauseAtSentences is true', () => {
    const s: TrailerStack = { words: ['last'], type: 'paragraph-end', section: 'intro', bold: false, pauseForUser: false }
    expect(trailerPauseMs(s, beatMs, { pauseAtSentences: true })).toBe(3000)
    expect(trailerPauseMs(s, beatMs, { pauseAtSentences: false })).toBe(1000)
  })
})
