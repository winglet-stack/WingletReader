import { describe, it, expect } from 'vitest'
import { requestStacks } from '../stackBuilder'
import { buildStacks, type ChunkRules } from '../tokenizer'
import type { WordStack } from '../../types'

// Environment: node (default). No `Worker` global, so `requestStacks` takes the
// deterministic synchronous fallback — which is exactly the path the vitest suite
// relies on. These tests lock in the two contracts OL-3 must not break:
//   1. Delivered stacks are byte-identical to `buildStacks(...)`.
//   2. Delivery is synchronous in the fallback (before `requestStacks` returns).

const NO_RULES: ChunkRules = {
  longWord: false,
  enumerations: false,
  bullets: false,
  commas: false,
  names: false,
  headlines: false,
}

const ALL_RULES: ChunkRules = {
  longWord: true,
  enumerations: true,
  bullets: true,
  commas: true,
  names: true,
  headlines: true,
}

// A body of prose that exercises paragraphs, headlines, sentence/paragraph ends,
// two-part proper names, enumerations, bullets, commas, and an overlong word.
const SAMPLE = [
  '# The Meeting',
  '',
  'Alice Johnson walked into the room, quietly. Bob Smith followed her.',
  'They discussed the plan at length, then agreed on the next steps.',
  '',
  'Agenda:',
  '',
  '1. Review the budget for the coming quarter and adjust as needed.',
  '2. Assign owners.',
  '',
  '- First bullet point about something',
  '- Second bullet point',
  '',
  `A supercalifragilisticexpialidocious word ends the chunk early.`,
].join('\n')

function collectSync(text: string, wordsPerStack: number, rules: ChunkRules): WordStack[] {
  let delivered: WordStack[] | null = null
  requestStacks({ text, wordsPerStack, rules }, (stacks) => {
    delivered = stacks
  })
  if (delivered === null) throw new Error('fallback did not deliver synchronously')
  return delivered
}

describe('requestStacks — byte-identical to buildStacks', () => {
  const texts: Array<[string, string]> = [
    ['sample prose', SAMPLE],
    ['empty', ''],
    ['whitespace only', '   \n\n  \t '],
    ['single word', 'Hello'],
    ['no trailing structure', 'one two three four five six seven eight'],
  ]

  for (const [label, text] of texts) {
    for (const [rulesLabel, rules] of [
      ['default (headlines only)', undefined],
      ['no rules', NO_RULES],
      ['all rules', ALL_RULES],
    ] as Array<[string, ChunkRules | undefined]>) {
      for (const wps of [1, 3, 7]) {
        it(`matches for ${label} / ${rulesLabel} / wps=${wps}`, () => {
          const effectiveRules = rules ?? {
            // Mirror the engine default (headlines grouped) via rulesFromSettings-equivalent.
            longWord: false,
            enumerations: false,
            bullets: false,
            commas: false,
            names: false,
            headlines: true,
          }
          const expected = buildStacks(text, wps, effectiveRules)
          const actual = collectSync(text, wps, effectiveRules)
          expect(actual).toEqual(expected)
        })
      }
    }
  }
})

describe('requestStacks — deterministic synchronous fallback', () => {
  it('delivers before returning when no worker is available', () => {
    let deliveredDuringCall = false
    requestStacks({ text: SAMPLE, wordsPerStack: 3, rules: ALL_RULES }, () => {
      deliveredDuringCall = true
    })
    expect(deliveredDuringCall).toBe(true)
  })

  it('returns a no-op cancel handle in the fallback path', () => {
    const handle = requestStacks({ text: SAMPLE, wordsPerStack: 3, rules: NO_RULES }, () => {})
    expect(() => handle.cancel()).not.toThrow()
  })
})
