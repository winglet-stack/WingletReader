import { describe, expect, it } from 'vitest'
import type { WordStack } from '../../types'
import {
  TRANSMUTE_WIZARD_STEPS,
  chunkRulesLabel,
  contentLimitLabel,
  effectiveBgColor,
  enabledChunkRules,
  findSelectedSegment,
  fontLabel,
  highlightLabel,
  initialTransmuteState,
  isOverMaxDuration,
  layoutLabel,
  maxDurationLabel,
  nextWizardStep,
  onOffLabel,
  parseStoredTransmuteProcess,
  pausesLabel,
  positionLabel,
  presetSaveError,
  previousWizardStep,
  readerColorsLabel,
  resolutionLabel,
  scopeStepError,
  spacingLabel,
  speedLabel,
  stackCountLabel,
  type StoredTransmuteProcess
} from '../transmuteWizard'

const stack = (words: string[]): WordStack => ({ words, type: 'normal' })

describe('wizard step ordering', () => {
  it('declares the four steps in order with their labels', () => {
    expect(TRANSMUTE_WIZARD_STEPS).toEqual([
      { key: 'scope', label: 'Scope and Content' },
      { key: 'video', label: 'Video Output' },
      { key: 'reader', label: 'Reader Settings' },
      { key: 'overview', label: 'Overview' }
    ])
  })

  it('advances through scope → video → reader → overview and clamps at the end', () => {
    expect(nextWizardStep('scope')).toBe('video')
    expect(nextWizardStep('video')).toBe('reader')
    expect(nextWizardStep('reader')).toBe('overview')
    expect(nextWizardStep('overview')).toBe('overview')
  })

  it('goes back through overview → reader → video → scope and clamps at the start', () => {
    expect(previousWizardStep('overview')).toBe('reader')
    expect(previousWizardStep('reader')).toBe('video')
    expect(previousWizardStep('video')).toBe('scope')
    expect(previousWizardStep('scope')).toBe('scope')
  })
})

describe('scopeStepError', () => {
  it('rejects an empty selection with the exact gate message', () => {
    expect(scopeStepError([], false)).toBe('No content found in selection.')
  })

  it('reports empty content before the duration limit', () => {
    expect(scopeStepError([], true)).toBe('No content found in selection.')
  })

  it('rejects when the estimate exceeds the max duration', () => {
    expect(scopeStepError([stack(['a'])], true)).toBe(
      'Estimated duration exceeds the configured max duration.'
    )
  })

  it('passes a valid scope', () => {
    expect(scopeStepError([stack(['a'])], false)).toBeNull()
  })
})

describe('isOverMaxDuration', () => {
  it('is false with no limit configured', () => {
    expect(isOverMaxDuration(null, 10_000_000)).toBe(false)
    expect(isOverMaxDuration(0, 10_000_000)).toBe(false)
  })

  it('compares the estimate against the limit in minutes', () => {
    expect(isOverMaxDuration(2, 121_000)).toBe(true)
    expect(isOverMaxDuration(2, 120_000)).toBe(false)
  })
})

describe('overview labels', () => {
  it('describes the content limit', () => {
    expect(contentLimitLabel({ contentLimitType: 'none', contentLimitWords: 1000, contentLimitPercentage: 100 })).toBe('All content')
    expect(contentLimitLabel({ contentLimitType: 'words', contentLimitWords: 2500, contentLimitPercentage: 100 })).toBe(`${(2500).toLocaleString()} words`)
    expect(contentLimitLabel({ contentLimitType: 'percentage', contentLimitWords: 1000, contentLimitPercentage: 40 })).toBe('40% of source')
  })

  it('describes the max duration', () => {
    expect(maxDurationLabel(null)).toBe('No limit')
    expect(maxDurationLabel(0)).toBe('No limit')
    expect(maxDurationLabel(5)).toBe('5 min')
  })

  it('describes every resolution', () => {
    expect(resolutionLabel('1280x720')).toBe('16:9 Landscape')
    expect(resolutionLabel('1080x1920')).toBe('9:16 Portrait')
    expect(resolutionLabel('720x720')).toBe('1:1 Square')
    expect(resolutionLabel('1920x1080')).toBe('16:9 Full HD')
  })

  it('lists only the enabled chunk rules in display order', () => {
    const none = {
      chunkRuleLongWord: false,
      chunkRuleEnumerations: false,
      chunkRuleBullets: false,
      chunkRuleCommas: false,
      chunkRuleNames: false
    }
    expect(enabledChunkRules(none)).toEqual([])
    expect(enabledChunkRules({ ...none, chunkRuleLongWord: true, chunkRuleCommas: true })).toEqual([
      'Long words',
      'Commas'
    ])
    expect(
      enabledChunkRules({
        chunkRuleLongWord: true,
        chunkRuleEnumerations: true,
        chunkRuleBullets: true,
        chunkRuleCommas: true,
        chunkRuleNames: true
      })
    ).toEqual(['Long words', 'Enumerations', 'Bullets', 'Commas', 'Names'])
  })
})

describe('reader/video summary labels', () => {
  it('formats on/off toggles', () => {
    expect(onOffLabel(true)).toBe('On')
    expect(onOffLabel(false)).toBe('Off')
  })

  it('formats speed as BPM and derived WPM', () => {
    expect(speedLabel({ bpm: 60, wordsPerStack: 3 })).toBe('60 BPM / 180 WPM')
  })

  it('formats the pause configuration', () => {
    expect(pausesLabel({ pauseAtSentences: true, pauseAtHeadlines: false })).toBe('Sentences on, headlines off')
    expect(pausesLabel({ pauseAtSentences: false, pauseAtHeadlines: true })).toBe('Sentences off, headlines on')
  })

  it('formats the font with a default fallback', () => {
    expect(fontLabel({ fontFamily: 'Georgia', fontSize: 36 })).toBe('Georgia / 36px')
    expect(fontLabel({ fontFamily: '', fontSize: 24 })).toBe('Default / 24px')
  })

  it('formats reader colours with default fallbacks', () => {
    expect(readerColorsLabel({ textColor: '#fff', bgColor: '#000' })).toBe('#fff text / #000 background')
    expect(readerColorsLabel({ textColor: '', bgColor: '' })).toBe('Default text / Default background')
  })

  it('formats the highlight mode and colour', () => {
    expect(highlightLabel({ highlightActive: false, highlightMode: 'default', highlightColor: '#f00' })).toBe('Off')
    expect(highlightLabel({ highlightActive: true, highlightMode: 'default', highlightColor: '' })).toBe('Default (theme default)')
    expect(highlightLabel({ highlightActive: true, highlightMode: 'progressive-bar', highlightColor: '#f00' })).toBe('Progressive (#f00)')
    expect(highlightLabel({ highlightActive: true, highlightMode: 'panning-bar', highlightColor: '#f00' })).toBe('Panning (#f00)')
  })

  it('formats the stack layout', () => {
    expect(layoutLabel({ linesEnabled: true, linesCount: 3, stacksVisible: 2 })).toBe('3 rows x 2 columns')
    expect(layoutLabel({ linesEnabled: false, linesCount: 3, stacksVisible: 1 })).toBe('1 stack')
    expect(layoutLabel({ linesEnabled: true, linesCount: 1, stacksVisible: 2 })).toBe('2 stacks')
  })

  it('formats spacing and position offsets', () => {
    expect(spacingLabel({ stackGap: 32, linesRowGap: 8 })).toBe('Stack gap 32px / row gap 8px')
    expect(positionLabel({ stackHorizontalOffset: -4, stackVerticalOffset: 10 })).toBe('X -4px / Y 10px')
  })

  it('joins enabled chunk rules or falls back to Default', () => {
    const none = {
      chunkRuleLongWord: false,
      chunkRuleEnumerations: false,
      chunkRuleBullets: false,
      chunkRuleCommas: false,
      chunkRuleNames: false
    }
    expect(chunkRulesLabel(none)).toBe('Default')
    expect(chunkRulesLabel({ ...none, chunkRuleBullets: true, chunkRuleNames: true })).toBe('Bullets, Names')
  })

  it('formats the generated stack count', () => {
    expect(stackCountLabel(0)).toBe('None')
    expect(stackCountLabel(1234)).toBe((1234).toLocaleString())
  })

  it('prefers the background colour override', () => {
    expect(effectiveBgColor({ bgColorOverride: '#abc', bgColor: '#000' })).toBe('#abc')
    expect(effectiveBgColor({ bgColorOverride: '', bgColor: '#000' })).toBe('#000')
  })
})

describe('findSelectedSegment', () => {
  const segments = [
    { id: 1, textId: 9, title: 'One', content: '', order: 0, sourceType: 'detected_heading' as const, word_count: 0 },
    { id: 2, textId: 9, title: 'Two', content: '', order: 1, sourceType: 'detected_heading' as const, word_count: 0 }
  ]

  it('returns null for whole-book scope or unknown ids', () => {
    expect(findSelectedSegment(segments, null)).toBeNull()
    expect(findSelectedSegment(segments, 99)).toBeNull()
  })

  it('finds the segment by id', () => {
    expect(findSelectedSegment(segments, 2)?.title).toBe('Two')
  })
})

describe('presetSaveError', () => {
  it('requires a non-blank name', () => {
    expect(presetSaveError('', [])).toBe('Please enter a name.')
    expect(presetSaveError('   ', [])).toBe('Please enter a name.')
  })

  it('rejects duplicate names after trimming', () => {
    expect(presetSaveError(' Fast ', [{ name: 'Fast' }])).toBe('A preset with this name already exists.')
  })

  it('accepts a fresh name', () => {
    expect(presetSaveError('Fast Portrait', [{ name: 'Fast' }])).toBeNull()
  })
})

describe('parseStoredTransmuteProcess', () => {
  const validSnapshot: StoredTransmuteProcess = {
    phase: 'configure',
    wizardStep: 'reader',
    overviewOpen: { scope: true, video: false, reader: true },
    sourceKind: 'pasted',
    textId: null,
    segmentId: null,
    selectedTitle: 'Pasted Text',
    pastedTextInput: 'one two three',
    pasteMode: true,
    maxDurationInput: '2'
  }

  it('returns null for missing or invalid JSON', () => {
    expect(parseStoredTransmuteProcess(null)).toBeNull()
    expect(parseStoredTransmuteProcess('')).toBeNull()
    expect(parseStoredTransmuteProcess('{not json')).toBeNull()
  })

  it('round-trips a valid snapshot', () => {
    expect(parseStoredTransmuteProcess(JSON.stringify(validSnapshot))).toEqual(validSnapshot)
  })

  it('falls back field by field on malformed values', () => {
    const parsed = parseStoredTransmuteProcess(
      JSON.stringify({
        phase: 'rendering',
        wizardStep: 'bogus',
        sourceKind: 'weird',
        textId: 'nope',
        segmentId: undefined,
        selectedTitle: 7,
        pastedTextInput: 12,
        pasteMode: 1,
        maxDurationInput: null
      })
    )
    expect(parsed).toEqual({
      phase: 'configure',
      wizardStep: 'scope',
      overviewOpen: { scope: true, video: true, reader: true },
      sourceKind: null,
      textId: null,
      segmentId: null,
      selectedTitle: '',
      pastedTextInput: '',
      pasteMode: true,
      maxDurationInput: ''
    })
  })

  it('keeps the select phase but normalizes unknown phases to configure', () => {
    expect(parseStoredTransmuteProcess(JSON.stringify({ ...validSnapshot, phase: 'select' }))?.phase).toBe('select')
    expect(parseStoredTransmuteProcess(JSON.stringify({ ...validSnapshot, phase: 'done' }))?.phase).toBe('configure')
  })
})

describe('initialTransmuteState', () => {
  const base: StoredTransmuteProcess = {
    phase: 'configure',
    wizardStep: 'reader',
    overviewOpen: { scope: false, video: true, reader: true },
    sourceKind: 'pasted',
    textId: null,
    segmentId: null,
    selectedTitle: 'Pasted Text',
    pastedTextInput: 'alpha beta',
    pasteMode: true,
    maxDurationInput: '3'
  }

  it('starts fresh on the select phase without a stored source', () => {
    const state = initialTransmuteState(null)
    expect(state.phase).toBe('select')
    expect(state.wizardStep).toBe('scope')
    expect(state.overviewOpen).toEqual({ scope: true, video: true, reader: true })
    expect(state.selectedText).toBeNull()
    expect(state.configTextId).toBeNull()
    expect(state.configSegmentId).toBeNull()
    expect(state.pasteMode).toBe(false)
  })

  it('ignores snapshot phase/step when there is no stored source', () => {
    const state = initialTransmuteState({ ...base, sourceKind: null })
    expect(state.phase).toBe('select')
    expect(state.wizardStep).toBe('scope')
    expect(state.selectedText).toBeNull()
    // raw input fields survive so the user can resume typing
    expect(state.pastedTextInput).toBe('alpha beta')
    expect(state.maxDurationInput).toBe('3')
  })

  it('restores a pasted source with its content', () => {
    const state = initialTransmuteState(base)
    expect(state.phase).toBe('configure')
    expect(state.wizardStep).toBe('reader')
    expect(state.overviewOpen).toEqual({ scope: false, video: true, reader: true })
    expect(state.selectedText).toEqual({ title: 'Pasted Text', content: 'alpha beta' })
    expect(state.configTextId).toBeNull()
  })

  it('restores a library source as a placeholder record pending content load', () => {
    const state = initialTransmuteState({
      ...base,
      sourceKind: 'library',
      textId: 7,
      segmentId: 3,
      selectedTitle: 'My Book'
    })
    expect(state.selectedText).toEqual({ id: 7, title: 'My Book', content: '' })
    expect(state.configTextId).toBe(7)
    expect(state.configSegmentId).toBe(3)
  })

  it('labels a library source without a stored title', () => {
    const state = initialTransmuteState({ ...base, sourceKind: 'library', textId: 7, selectedTitle: '' })
    expect(state.selectedText?.title).toBe('Selected text')
  })
})
