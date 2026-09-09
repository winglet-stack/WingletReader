import type { TextRecord, TextSegment, TransmuteConfig, WordStack } from '../types'

export type TransmutePhase = 'select' | 'configure' | 'rendering' | 'done'
export type TransmuteWizardStep = 'scope' | 'video' | 'reader' | 'overview'
export type OverviewSectionKey = 'scope' | 'video' | 'reader'

export const TRANSMUTE_WIZARD_STEPS: { key: TransmuteWizardStep; label: string }[] = [
  { key: 'scope', label: 'Scope and Content' },
  { key: 'video', label: 'Video Output' },
  { key: 'reader', label: 'Reader Settings' },
  { key: 'overview', label: 'Overview' }
]

const STEP_ORDER: TransmuteWizardStep[] = TRANSMUTE_WIZARD_STEPS.map((s) => s.key)

/** The step after `step` in wizard order; the last step has no successor. */
export function nextWizardStep(step: TransmuteWizardStep): TransmuteWizardStep {
  const index = STEP_ORDER.indexOf(step)
  return STEP_ORDER[Math.min(index + 1, STEP_ORDER.length - 1)]
}

/** The step before `step` in wizard order; the first step has no predecessor. */
export function previousWizardStep(step: TransmuteWizardStep): TransmuteWizardStep {
  const index = STEP_ORDER.indexOf(step)
  return STEP_ORDER[Math.max(index - 1, 0)]
}

/**
 * The scope-step gate. Returns the user-facing error blocking the wizard
 * from advancing past the scope step, or null when the scope is valid.
 */
export function scopeStepError(stacks: WordStack[], overMaxDuration: boolean): string | null {
  if (stacks.length === 0) return 'No content found in selection.'
  if (overMaxDuration) return 'Estimated duration exceeds the configured max duration.'
  return null
}

/** Whether the estimated render duration exceeds the configured max duration. */
export function isOverMaxDuration(
  maxDurationMinutes: number | null,
  estimatedDurationMs: number
): boolean {
  return (
    maxDurationMinutes !== null &&
    maxDurationMinutes > 0 &&
    estimatedDurationMs > maxDurationMinutes * 60_000
  )
}

export function findSelectedSegment(
  segments: TextSegment[],
  segmentId: number | null
): TextSegment | null {
  if (segmentId === null) return null
  return segments.find((s) => s.id === segmentId) ?? null
}

export function contentLimitLabel(
  config: Pick<TransmuteConfig, 'contentLimitType' | 'contentLimitWords' | 'contentLimitPercentage'>
): string {
  if (config.contentLimitType === 'none') return 'All content'
  if (config.contentLimitType === 'words') return `${config.contentLimitWords.toLocaleString()} words`
  return `${config.contentLimitPercentage}% of source`
}

export function maxDurationLabel(maxDurationMinutes: number | null): string {
  return maxDurationMinutes !== null && maxDurationMinutes > 0
    ? `${maxDurationMinutes} min`
    : 'No limit'
}

export function resolutionLabel(resolution: TransmuteConfig['resolution']): string {
  switch (resolution) {
    case '1280x720':
      return '16:9 Landscape'
    case '1080x1920':
      return '9:16 Portrait'
    case '720x720':
      return '1:1 Square'
    default:
      return '16:9 Full HD'
  }
}

export function enabledChunkRules(
  config: Pick<
    TransmuteConfig,
    'chunkRuleLongWord' | 'chunkRuleEnumerations' | 'chunkRuleBullets' | 'chunkRuleCommas' | 'chunkRuleNames'
  >
): string[] {
  return [
    config.chunkRuleLongWord ? 'Long words' : null,
    config.chunkRuleEnumerations ? 'Enumerations' : null,
    config.chunkRuleBullets ? 'Bullets' : null,
    config.chunkRuleCommas ? 'Commas' : null,
    config.chunkRuleNames ? 'Names' : null
  ].filter((rule): rule is string => rule !== null)
}

export function onOffLabel(value: boolean): string {
  return value ? 'On' : 'Off'
}

export function speedLabel(config: Pick<TransmuteConfig, 'bpm' | 'wordsPerStack'>): string {
  return `${config.bpm} BPM / ${config.bpm * config.wordsPerStack} WPM`
}

export function pausesLabel(
  config: Pick<TransmuteConfig, 'pauseAtSentences' | 'pauseAtHeadlines'>
): string {
  return `${config.pauseAtSentences ? 'Sentences on' : 'Sentences off'}, ${config.pauseAtHeadlines ? 'headlines on' : 'headlines off'}`
}

export function fontLabel(config: Pick<TransmuteConfig, 'fontFamily' | 'fontSize'>): string {
  return `${config.fontFamily || 'Default'} / ${config.fontSize}px`
}

export function readerColorsLabel(config: Pick<TransmuteConfig, 'textColor' | 'bgColor'>): string {
  return `${config.textColor || 'Default'} text / ${config.bgColor || 'Default'} background`
}

export function highlightLabel(
  config: Pick<TransmuteConfig, 'highlightActive' | 'highlightMode' | 'highlightColor'>
): string {
  if (!config.highlightActive) return 'Off'
  const mode =
    config.highlightMode === 'default'
      ? 'Default'
      : config.highlightMode === 'progressive-bar'
        ? 'Progressive'
        : 'Panning'
  return `${mode} (${config.highlightColor || 'theme default'})`
}

export function layoutLabel(
  config: Pick<TransmuteConfig, 'linesCount' | 'stacksVisible'>
): string {
  if (config.linesCount > 1) {
    return `${config.linesCount} rows x ${config.stacksVisible} columns`
  }
  return `${config.stacksVisible} stack${config.stacksVisible !== 1 ? 's' : ''}`
}

export function spacingLabel(config: Pick<TransmuteConfig, 'stackGap' | 'linesRowGap'>): string {
  return `Stack gap ${config.stackGap}px / row gap ${config.linesRowGap}px`
}

export function positionLabel(
  config: Pick<TransmuteConfig, 'stackHorizontalOffset' | 'stackVerticalOffset'>
): string {
  return `X ${config.stackHorizontalOffset}px / Y ${config.stackVerticalOffset}px`
}

export function chunkRulesLabel(config: Parameters<typeof enabledChunkRules>[0]): string {
  const rules = enabledChunkRules(config)
  return rules.length > 0 ? rules.join(', ') : 'Default'
}

export function stackCountLabel(stackCount: number): string {
  return stackCount > 0 ? stackCount.toLocaleString() : 'None'
}

/** The background colour actually used for the video frame (override wins). */
export function effectiveBgColor(config: Pick<TransmuteConfig, 'bgColorOverride' | 'bgColor'>): string {
  return config.bgColorOverride || config.bgColor
}

/** Validates a new transmute-preset name. Returns a user-facing error or null. */
export function presetSaveError(name: string, existing: { name: string }[]): string | null {
  const trimmed = name.trim()
  if (!trimmed) return 'Please enter a name.'
  if (existing.some((p) => p.name === trimmed)) return 'A preset with this name already exists.'
  return null
}

// ── Process snapshot (wizard UI state, NOT Transmute config) ──────────────────
// The snapshot is persisted by TransmuteView under
// 'fasttrack.transmute.process.v1' via a direct localStorage write; only the
// parsing of a raw snapshot lives here. Transmute *config* persistence goes
// exclusively through transmuteConfig.ts.

export interface StoredTransmuteProcess {
  phase: TransmutePhase
  wizardStep: TransmuteWizardStep
  overviewOpen: Record<OverviewSectionKey, boolean>
  sourceKind: 'library' | 'pasted' | null
  textId: number | null
  segmentId: number | null
  selectedTitle: string
  pastedTextInput: string
  pasteMode: boolean
  maxDurationInput: string
}

function normalizePhase(phase: TransmutePhase | undefined): TransmutePhase {
  return phase === 'configure' || phase === 'select' ? phase : 'configure'
}

function asWizardStep(raw: unknown): TransmuteWizardStep {
  return STEP_ORDER.includes(raw as TransmuteWizardStep) ? (raw as TransmuteWizardStep) : 'scope'
}

function asSourceKind(raw: unknown): 'library' | 'pasted' | null {
  return raw === 'library' || raw === 'pasted' ? raw : null
}

function asIdOrNull(raw: unknown): number | null {
  return typeof raw === 'number' ? raw : null
}

function asString(raw: unknown): string {
  return typeof raw === 'string' ? raw : ''
}

function openByDefault(raw: boolean | undefined): boolean {
  return raw ?? true
}

export function parseStoredTransmuteProcess(raw: string | null): StoredTransmuteProcess | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<StoredTransmuteProcess>
    const overviewOpen = parsed.overviewOpen ?? ({} as Partial<Record<OverviewSectionKey, boolean>>)
    return {
      phase: normalizePhase(parsed.phase),
      wizardStep: asWizardStep(parsed.wizardStep),
      overviewOpen: {
        scope: openByDefault(overviewOpen.scope),
        video: openByDefault(overviewOpen.video),
        reader: openByDefault(overviewOpen.reader)
      },
      sourceKind: asSourceKind(parsed.sourceKind),
      textId: asIdOrNull(parsed.textId),
      segmentId: asIdOrNull(parsed.segmentId),
      selectedTitle: asString(parsed.selectedTitle),
      pastedTextInput: asString(parsed.pastedTextInput),
      pasteMode: Boolean(parsed.pasteMode),
      maxDurationInput: asString(parsed.maxDurationInput)
    }
  } catch {
    return null
  }
}

export interface InitialTransmuteState {
  phase: TransmutePhase
  wizardStep: TransmuteWizardStep
  overviewOpen: Record<OverviewSectionKey, boolean>
  selectedText: TextRecord | null
  configTextId: number | null
  configSegmentId: number | null
  pasteMode: boolean
  pastedTextInput: string
  maxDurationInput: string
}

const FRESH_TRANSMUTE_STATE: InitialTransmuteState = {
  phase: 'select',
  wizardStep: 'scope',
  overviewOpen: { scope: true, video: true, reader: true },
  selectedText: null,
  configTextId: null,
  configSegmentId: null,
  pasteMode: false,
  pastedTextInput: '',
  maxDurationInput: ''
}

/** Derives TransmuteView's initial UI state from a restored process snapshot. */
export function initialTransmuteState(stored: StoredTransmuteProcess | null): InitialTransmuteState {
  if (!stored) return FRESH_TRANSMUTE_STATE
  const inputs = {
    pasteMode: stored.pasteMode,
    pastedTextInput: stored.pastedTextInput,
    maxDurationInput: stored.maxDurationInput
  }
  if (stored.sourceKind === null) return { ...FRESH_TRANSMUTE_STATE, ...inputs }
  const restored = {
    phase: stored.phase,
    wizardStep: stored.wizardStep,
    overviewOpen: stored.overviewOpen,
    configSegmentId: stored.segmentId,
    ...inputs
  }
  if (stored.sourceKind === 'pasted') {
    return {
      ...restored,
      selectedText: { title: 'Pasted Text', content: stored.pastedTextInput },
      configTextId: null
    }
  }
  const selectedText: TextRecord | null =
    stored.textId !== null
      ? { id: stored.textId, title: stored.selectedTitle || 'Selected text', content: '' }
      : null
  return { ...restored, selectedText, configTextId: stored.textId }
}
