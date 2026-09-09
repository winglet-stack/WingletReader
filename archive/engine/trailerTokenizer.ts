import { buildStacks, MAX_WORDS_PER_STACK } from '@renderer/engine/tokenizer'
import type { TextPrimer } from './textPrimer'
import type { TrailerStack, TrailerStackSection, Settings } from '@renderer/types'

function taggedStacks(
  rawStacks: ReturnType<typeof buildStacks>,
  section: TrailerStackSection,
  bold = false,
  markLastPauseForUser = false
): TrailerStack[] {
  return rawStacks.map((s, i) => ({
    ...s,
    section,
    bold,
    pauseForUser: markLastPauseForUser && i === rawStacks.length - 1
  }))
}

/**
 * Build the ordered sequence of TrailerStacks from a TextPrimer.
 *
 * Section rules:
 *  headings   → full headline stacks, no word-stacking
 *  intro      → normal Reader word-stack rules
 *  boldedTerms → one stack per term (bold=true)
 *  visualAids → normal word-stack rules (paced 20% slower in the hook)
 *  questions  → normal word-stack rules; last stack of each item carries pauseForUser=true
 *  summary    → normal Reader word-stack rules
 */
export function buildTrailerStacks(primer: TextPrimer, settings: Settings): TrailerStack[] {
  const result: TrailerStack[] = []

  for (const section of primer.sections) {
    if (section.items.length === 0) continue

    switch (section.id) {
      case 'headings': {
        for (const item of section.items) {
          const words = item.text.trim().split(/\s+/).filter(Boolean)
          // Mirror tokenizer.ts: split long headings into MAX_WORDS_PER_STACK chunks
          for (let j = 0; j < words.length; j += MAX_WORDS_PER_STACK) {
            result.push({
              words: words.slice(j, j + MAX_WORDS_PER_STACK),
              type: 'headline',
              section: 'heading',
              bold: false,
              pauseForUser: false
            })
          }
        }
        break
      }

      case 'introduction': {
        const joined = section.items.map((i) => i.text).join('\n\n')
        const stacks = buildStacks(joined, settings.words_per_stack)
        result.push(...taggedStacks(stacks, 'intro'))
        break
      }

      case 'boldedTerms': {
        for (const item of section.items) {
          const words = item.text.trim().split(/\s+/).filter(Boolean)
          // Each bold term/phrase is one stack per BPM beat; chunk if too long
          for (let j = 0; j < words.length; j += MAX_WORDS_PER_STACK) {
            result.push({
              words: words.slice(j, j + MAX_WORDS_PER_STACK),
              type: 'normal',
              section: 'bold',
              bold: true,
              pauseForUser: false
            })
          }
        }
        break
      }

      case 'visualAids': {
        for (const item of section.items) {
          const stacks = buildStacks(item.text, settings.words_per_stack)
          if (stacks.length === 0) continue
          result.push(...taggedStacks(stacks, 'visualAid'))
        }
        break
      }

      case 'questions': {
        for (const item of section.items) {
          const stacks = buildStacks(item.text, settings.words_per_stack)
          if (stacks.length === 0) continue
          // Last stack of each question triggers a user pause for reflection
          result.push(...taggedStacks(stacks, 'question', false, true))
        }
        break
      }

      case 'summary': {
        const joined = section.items.map((i) => i.text).join('\n\n')
        const stacks = buildStacks(joined, settings.words_per_stack)
        result.push(...taggedStacks(stacks, 'summary'))
        break
      }
    }
  }

  return result
}

/**
 * Milliseconds to display a trailer stack before advancing.
 *
 * Rules:
 *  - heading:   4× beatMs (always, regardless of stack type)
 *  - bold:      1× beatMs (always — one beat per term)
 *  - visualAid: normal pause logic but at 80% speed (beatMs × 1.25)
 *  - intro / question / summary: normal pause logic
 */
export function trailerPauseMs(
  stack: TrailerStack,
  beatMs: number,
  opts: { pauseAtSentences: boolean }
): number {
  const effectiveBeat = stack.section === 'visualAid' ? beatMs * 1.25 : beatMs

  if (stack.section === 'heading') return effectiveBeat * 4
  if (stack.section === 'bold') return effectiveBeat

  switch (stack.type) {
    case 'headline':
      return effectiveBeat * 4
    case 'paragraph-end':
      return opts.pauseAtSentences ? effectiveBeat * 3 : effectiveBeat
    case 'sentence-end':
      return opts.pauseAtSentences ? effectiveBeat * 2 : effectiveBeat
    default:
      return effectiveBeat
  }
}
