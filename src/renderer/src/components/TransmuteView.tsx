import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { TextRecord, TextSegment, Settings, TransmuteConfig, WordStack } from '../types'
import type { UnsavedTransmuteSource } from '../contexts/NavigationContext'
import {
  applyContentLimit,
  buildStacksForTransmute,
  estimateDuration,
  estimateFileSize,
  formatDuration,
  formatFileSize,
  renderVideo
} from '../engine/videoRenderer'
import {
  loadStoredTransmuteConfig,
  makeDefaultTransmuteConfig,
  persistTransmuteConfig,
  applyReaderConfigToTransmuteConfig,
  applyTransmutePreset,
  readerFieldsFromSettings,
  transmutePresetFromConfig,
  validateTransmutePresets
} from '../engine/transmuteConfig'
import { validateReaderConfigs } from '../engine/reader-configs'
import {
  findSelectedSegment,
  initialTransmuteState,
  isOverMaxDuration,
  nextWizardStep,
  parseStoredTransmuteProcess,
  previousWizardStep,
  scopeStepError,
  type OverviewSectionKey,
  type StoredTransmuteProcess,
  type TransmutePhase,
  type TransmuteWizardStep
} from '../engine/transmuteWizard'
import TransmuteStepper from './transmute/TransmuteStepper'
import TransmuteEstimate from './transmute/TransmuteEstimate'
import TransmuteScopeStep from './transmute/TransmuteScopeStep'
import TransmuteVideoStep from './transmute/TransmuteVideoStep'
import TransmuteReaderStep from './transmute/TransmuteReaderStep'
import TransmuteOverviewStep from './transmute/TransmuteOverviewStep'
import TransmutePreviewPanel from './transmute/TransmutePreviewPanel'
import TransmuteSourceSelect from './transmute/TransmuteSourceSelect'
import AlphaNotice from './AlphaNotice'
import { alphaChrome } from '../alphaChrome'

interface Props {
  texts: TextRecord[]
  settings: Settings
  onSaveSettings: (updated: Partial<Settings>) => void
  onOpenReaderSettings: () => void
  /**
   * One-shot launch text id: when set, TransmuteView selects this saved text
   * immediately and skips the generic source picker. Beats any persisted process.
   * (PRD section 5.8 - ADR-0009)
   */
  launchTextId?: number | null
  /** Called once after the launchTextId intent has been consumed (clears the one-shot). */
  onLaunchConsumed?: () => void
  /**
   * One-shot unsaved source: when set, TransmuteView uses this content directly
   * without creating a Library record. Beats any persisted process.
   * (PRD section 5.3 / 5.8 - ADR-0009)
   */
  launchSource?: UnsavedTransmuteSource | null
  /** Called once after the launchSource intent has been consumed (clears the one-shot). */
  onLaunchSourceConsumed?: () => void
}

const TRANSMUTE_PROCESS_STORAGE_KEY = 'fasttrack.transmute.process.v1'

function readStoredTransmuteProcess(): StoredTransmuteProcess | null {
  try {
    return parseStoredTransmuteProcess(window.localStorage.getItem(TRANSMUTE_PROCESS_STORAGE_KEY))
  } catch {
    return null
  }
}

export default function TransmuteView({ texts, settings, onSaveSettings, onOpenReaderSettings, launchTextId = null, onLaunchConsumed, launchSource = null, onLaunchSourceConsumed }: Props) {
  const storedProcess = useMemo(() => readStoredTransmuteProcess(), [])
  const initial = useMemo(() => initialTransmuteState(storedProcess), [storedProcess])
  const [phase, setPhase] = useState<TransmutePhase>(initial.phase)
  const [wizardStep, setWizardStep] = useState<TransmuteWizardStep>(initial.wizardStep)
  const [overviewOpen, setOverviewOpen] = useState<Record<OverviewSectionKey, boolean>>(initial.overviewOpen)
  const [selectedText, setSelectedText] = useState<TextRecord | null>(initial.selectedText)
  const [segments, setSegments] = useState<TextSegment[]>([])
  const [loadingContent, setLoadingContent] = useState(false)
  const [config, setConfig] = useState<TransmuteConfig>({
    textId: initial.configTextId,
    segmentId: initial.configSegmentId,
    ...loadStoredTransmuteConfig(settings)
  })
  const [stacks, setStacks] = useState<WordStack[]>([])
  const [renderProgress, setRenderProgress] = useState(0)
  const [renderError, setRenderError] = useState<string | null>(null)
  const [resultBuffer, setResultBuffer] = useState<ArrayBuffer | null>(null)
  const [actualDurationMs, setActualDurationMs] = useState(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const restoreAttemptedRef = useRef(false)

  // Pasted-text source state
  const [pasteMode, setPasteMode] = useState(initial.pasteMode)
  const [pastedTextInput, setPastedTextInput] = useState(initial.pastedTextInput)

  // Max-duration input raw string (allows in-progress editing)
  const [maxDurationInput, setMaxDurationInput] = useState(initial.maxDurationInput)

  const rebuildStacks = useCallback((rawContent: string, cfg: TransmuteConfig) => {
    const content = applyContentLimit(rawContent, cfg)
    const s = buildStacksForTransmute(content, cfg)
    setStacks(s)
    return s
  }, [])

  // ── One-shot launch intent: saved text (PRD section 5.8) ───────────────────
  // IMPORTANT: this effect must be defined BEFORE the restore effect below so
  // that React runs it first on the initial render. Setting restoreAttemptedRef
  // here prevents the restore effect from clobbering the launched text.
  useEffect(() => {
    if (launchTextId === null) return
    // Block the restore effect.
    restoreAttemptedRef.current = true
    const text = texts.find((t) => t.id === launchTextId) ?? null
    if (!text) {
      // Text not found in the prop list; clear the intent and show select phase.
      onLaunchConsumed?.()
      return
    }
    void handleSelectText(text)
    onLaunchConsumed?.()
    // Intentionally only re-runs when launchTextId changes (one-shot pattern).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launchTextId])

  // ── One-shot launch intent: unsaved source (PRD section 5.3 / 5.8) ─────────
  // Same ordering rule as launchTextId above: defined before the restore effect.
  // No Library record is created; content goes directly into the configure phase.
  useEffect(() => {
    if (!launchSource) return
    // Block the restore effect.
    restoreAttemptedRef.current = true
    setRenderError(null)
    applyUnsavedSource(launchSource.title, launchSource.content)
    onLaunchSourceConsumed?.()
    // Intentionally only re-runs when launchSource changes (one-shot pattern).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launchSource])

  // ── Persisted-process restore ───────────────────────────────────────────────
  useEffect(() => {
    if (restoreAttemptedRef.current) return
    restoreAttemptedRef.current = true
    if (!storedProcess) return

    if (storedProcess.sourceKind === 'library' && storedProcess.textId !== null) {
      setLoadingContent(true)
      Promise.all([
        window.api.db.getText(storedProcess.textId),
        window.api.db.getSegments(storedProcess.textId)
      ])
        .then(([full, segs]) => {
          if (!full?.content) {
            setSelectedText(null)
            setSegments([])
            setStacks([])
            setPhase('select')
            return
          }
          const restoredConfig = {
            ...config,
            textId: storedProcess.textId,
            segmentId: storedProcess.segmentId
          }
          const scopedContent =
            restoredConfig.segmentId !== null
              ? (segs.find((s) => s.id === restoredConfig.segmentId)?.content ?? full.content)
              : full.content
          setSelectedText(full)
          setSegments(segs)
          setConfig(restoredConfig)
          rebuildStacks(scopedContent, restoredConfig)
        })
        .catch((err) => {
          setRenderError(`Failed to restore Transmute state: ${String(err)}`)
          setSelectedText(null)
          setSegments([])
          setStacks([])
          setPhase('select')
        })
        .finally(() => setLoadingContent(false))
      return
    }

    if (storedProcess.sourceKind === 'pasted' && storedProcess.pastedTextInput.trim()) {
      rebuildStacks(storedProcess.pastedTextInput.trim(), config)
    }
  }, [config, rebuildStacks, storedProcess])

  useEffect(() => {
    const sourceKind =
      selectedText && config.textId !== null
        ? 'library'
        : selectedText
          ? 'pasted'
          : null
    const snapshot: StoredTransmuteProcess = {
      phase,
      wizardStep,
      overviewOpen,
      sourceKind,
      textId: sourceKind === 'library' ? config.textId : null,
      segmentId: sourceKind ? config.segmentId : null,
      selectedTitle: selectedText?.title ?? '',
      pastedTextInput,
      pasteMode,
      maxDurationInput
    }
    try {
      window.localStorage.setItem(TRANSMUTE_PROCESS_STORAGE_KEY, JSON.stringify(snapshot))
    } catch {
      // Process persistence is best-effort; the video flow still works without storage.
    }
  }, [
    config.segmentId,
    config.textId,
    maxDurationInput,
    overviewOpen,
    pasteMode,
    pastedTextInput,
    phase,
    selectedText,
    wizardStep
  ])

  async function handleSelectText(text: TextRecord) {
    setLoadingContent(true)
    setRenderError(null)
    try {
      const [full, segs] = await Promise.all([
        window.api.db.getText(text.id!),
        window.api.db.getSegments(text.id!)
      ])
      if (!full?.content) {
        setRenderError('This text has no readable content.')
        setLoadingContent(false)
        return
      }
      const newConfig: TransmuteConfig = {
        ...config,
        textId: text.id!,
        segmentId: null
      }
      setSelectedText({ ...text, content: full.content })
      setSegments(segs)
      setConfig(newConfig)
      rebuildStacks(full.content, newConfig)
      setWizardStep('scope')
      setPhase('configure')
    } catch (err) {
      setRenderError(`Failed to load text: ${String(err)}`)
    } finally {
      setLoadingContent(false)
    }
  }

  function applyUnsavedSource(title: string, content: string) {
    const newConfig: TransmuteConfig = {
      ...config,
      textId: null,
      segmentId: null,
    }
    setSelectedText({ title, content })
    setSegments([])
    setConfig(newConfig)
    rebuildStacks(content, newConfig)
    setWizardStep('scope')
    setPhase('configure')
  }

  function handleUsePastedText() {
    const trimmed = pastedTextInput.trim()
    if (!trimmed) {
      setRenderError('Please paste some text before continuing.')
      return
    }
    setRenderError(null)
    applyUnsavedSource('Pasted Text', trimmed)
  }

  // Rebuild stacks when any tokenization-relevant config field or content scope changes
  useEffect(() => {
    if (!selectedText?.content) return
    const baseContent =
      config.segmentId !== null
        ? (segments.find((s) => s.id === config.segmentId)?.content ?? selectedText.content)
        : selectedText.content
    rebuildStacks(baseContent, config)
  }, [
    config.segmentId,
    config.wordsPerStack,
    config.contentLimitType,
    config.contentLimitWords,
    config.contentLimitPercentage,
    config.chunkRuleLongWord,
    config.chunkRuleEnumerations,
    config.chunkRuleBullets,
    config.chunkRuleCommas,
    config.chunkRuleNames,
    selectedText,
    segments,
    rebuildStacks
  ])

  const estimatedDurationMs = useMemo(() => estimateDuration(stacks, config), [stacks, config])
  const estimatedBytes = useMemo(() => estimateFileSize(estimatedDurationMs), [estimatedDurationMs])

  const overMaxDuration = isOverMaxDuration(config.maxDurationMinutes, estimatedDurationMs)

  const transmutePresets = useMemo(
    () => validateTransmutePresets(settings.custom_transmute_presets ?? [], makeDefaultTransmuteConfig(settings)),
    [settings]
  )

  const readerConfigs = useMemo(
    () => validateReaderConfigs(settings.custom_reader_configs),
    [settings.custom_reader_configs]
  )

  function updateConfig(patch: Partial<TransmuteConfig>) {
    setConfig((prev) => {
      const next = { ...prev, ...patch }
      persistTransmuteConfig(next)
      return next
    })
  }

  function replaceConfig(next: TransmuteConfig) {
    setConfig(next)
    persistTransmuteConfig(next)
  }

  function handleSelectTransmutePreset(presetId: string) {
    const preset = transmutePresets.find((p) => p.id === presetId)
    if (!preset) return
    replaceConfig(applyTransmutePreset(config, preset))
  }

  function handleSaveTransmutePreset(name: string) {
    onSaveSettings({
      custom_transmute_presets: [...transmutePresets, transmutePresetFromConfig(name, config)]
    })
  }

  function handleDeleteTransmutePreset(id: string) {
    onSaveSettings({
      custom_transmute_presets: transmutePresets.filter((p) => p.id !== id)
    })
  }

  function handleSelectReaderConfig(configId: string) {
    const readerConfig = readerConfigs.find((c) => c.id === configId)
    if (!readerConfig) return
    replaceConfig(applyReaderConfigToTransmuteConfig(config, readerConfig))
  }

  function handleCopyReaderSettings() {
    replaceConfig({
      ...config,
      ...readerFieldsFromSettings(settings)
    })
  }

  async function handleRender() {
    if (stacks.length === 0) return
    setRenderError(null)
    setRenderProgress(0)
    setResultBuffer(null)
    setPhase('rendering')

    const ac = new AbortController()
    abortControllerRef.current = ac

    try {
      const buffer = await renderVideo([{ stacks, config }], setRenderProgress, ac.signal)
      setResultBuffer(buffer)
      setActualDurationMs(estimatedDurationMs)
      setPhase('done')
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setPhase('configure')
      } else {
        setRenderError(`Video encoding failed: ${String(err)}`)
        setPhase('configure')
      }
    } finally {
      abortControllerRef.current = null
    }
  }

  function handleCancel() {
    abortControllerRef.current?.abort()
  }

  async function handleDownload() {
    if (!resultBuffer) return
    const title = selectedText?.title ?? 'video'
    const titleSlug = title
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 60)
    const suggested = `${titleSlug || 'video'}.mp4`
    const result = await window.api.video.save(resultBuffer, suggested)
    if (result && !result.ok && result.error && result.error !== 'Cancelled') {
      setRenderError(`Save failed: ${result.error}`)
    }
  }

  function handleRenderAgain() {
    setResultBuffer(null)
    setRenderProgress(0)
    setRenderError(null)
    setWizardStep('overview')
    setPhase('configure')
  }

  function handleBackToSelect() {
    abortControllerRef.current?.abort()
    setSelectedText(null)
    setSegments([])
    setStacks([])
    setResultBuffer(null)
    setRenderError(null)
    setRenderProgress(0)
    setPasteMode(false)
    setWizardStep('scope')
    setPhase('select')
  }

  function validateScopeStep() {
    const error = scopeStepError(stacks, overMaxDuration)
    setRenderError(error)
    return error === null
  }

  function continueFromScope() {
    if (validateScopeStep()) setWizardStep(nextWizardStep('scope'))
  }

  function handleRenderFromOverview() {
    if (!validateScopeStep()) {
      setWizardStep('scope')
      return
    }
    void handleRender()
  }

  function toggleOverviewSection(key: OverviewSectionKey) {
    setOverviewOpen((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const selectedSegment = findSelectedSegment(segments, config.segmentId)

  const estimate = (
    <TransmuteEstimate
      stackCount={stacks.length}
      estimatedDurationMs={estimatedDurationMs}
      estimatedBytes={estimatedBytes}
      overMaxDuration={overMaxDuration}
      maxDurationMinutes={config.maxDurationMinutes}
    />
  )

  function renderCurrentStep() {
    switch (wizardStep) {
      case 'scope':
        return (
          <TransmuteScopeStep
            segments={segments}
            config={config}
            stackCount={stacks.length}
            overMaxDuration={overMaxDuration}
            maxDurationInput={maxDurationInput}
            onMaxDurationInputChange={setMaxDurationInput}
            onUpdateConfig={updateConfig}
            onContinue={continueFromScope}
          />
        )
      case 'video':
        return (
          <TransmuteVideoStep
            config={config}
            onUpdateConfig={updateConfig}
            onBack={() => setWizardStep(previousWizardStep('video'))}
            onContinue={() => setWizardStep(nextWizardStep('video'))}
          />
        )
      case 'reader':
        return (
          <TransmuteReaderStep
            config={config}
            transmutePresets={transmutePresets}
            readerConfigs={readerConfigs}
            onUpdateConfig={updateConfig}
            onSelectPreset={handleSelectTransmutePreset}
            onSavePreset={handleSaveTransmutePreset}
            onDeletePreset={handleDeleteTransmutePreset}
            onSelectReaderConfig={handleSelectReaderConfig}
            onCopyReaderSettings={handleCopyReaderSettings}
            onOpenReaderSettings={onOpenReaderSettings}
            onBack={() => setWizardStep(previousWizardStep('reader'))}
            onContinue={() => setWizardStep(nextWizardStep('reader'))}
          />
        )
      case 'overview':
        return (
          <TransmuteOverviewStep
            config={config}
            selectedTitle={selectedText?.title}
            selectedSegmentTitle={selectedSegment?.title ?? null}
            stackCount={stacks.length}
            overviewOpen={overviewOpen}
            onToggleSection={toggleOverviewSection}
            onEditStep={setWizardStep}
            onBack={() => setWizardStep(previousWizardStep('overview'))}
            onRender={handleRenderFromOverview}
            renderDisabled={stacks.length === 0 || overMaxDuration}
          />
        )
    }
  }

  return (
    <div className="view-container transmute-view">
      <header className="view-header">
        <div className="transmute-header-row">
          <h1>Transmute Book to Video</h1>
          {phase !== 'select' && (
            <button className="btn-ghost btn-small" onClick={handleBackToSelect}>
              Back
            </button>
          )}
        </div>
        {phase !== 'select' && selectedText && (
          <p className="transmute-selected-book">
            <span className="transmute-book-chip">{selectedText.title}</span>
            {selectedSegment && (
              <span className="transmute-book-chip transmute-book-chip--chapter">
                {selectedSegment.title}
              </span>
            )}
          </p>
        )}
      </header>

      <AlphaNotice
        enabled={alphaChrome.transmuteExperimentalBannerEnabled}
        label="Transmute experimental warning"
        style={{ marginBottom: '12px' }}
      >
        {alphaChrome.transmuteExperimentalBannerCopy}
      </AlphaNotice>

      {renderError && (
        <div className="toast toast-error" role="alert" style={{ marginBottom: '12px' }}>
          <span>{renderError}</span>
          <button className="toast-close" onClick={() => setRenderError(null)}>x</button>
        </div>
      )}

      {phase === 'select' && (
        <TransmuteSourceSelect
          texts={texts}
          loadingContent={loadingContent}
          pasteMode={pasteMode}
          pastedTextInput={pastedTextInput}
          onTogglePasteMode={() => setPasteMode((v) => !v)}
          onChangePastedText={setPastedTextInput}
          onSelectText={handleSelectText}
          onUsePastedText={handleUsePastedText}
        />
      )}

      {phase === 'configure' && selectedText && (
        <div className="transmute-configure-layout">
          <div className="transmute-configure-controls">
            <TransmuteStepper activeStep={wizardStep} onSelectStep={setWizardStep} />
            {renderCurrentStep()}
          </div>
          {wizardStep === 'scope' ? (
            <div className="transmute-preview-panel transmute-estimate-panel">
              {estimate}
            </div>
          ) : (
            <TransmutePreviewPanel config={config} estimate={estimate} />
          )}
        </div>
      )}

      {phase === 'rendering' && (
        <div className="transmute-rendering">
          <p className="transmute-rendering-label">Rendering...</p>
          <div className="transmute-progress-bar-wrap">
            <div
              className="transmute-progress-bar-fill"
              style={{ width: `${Math.round(renderProgress * 100)}%` }}
            />
          </div>
          <p className="transmute-progress-pct">{Math.round(renderProgress * 100)}%</p>
          <button className="btn-ghost" onClick={handleCancel}>
            Cancel
          </button>
        </div>
      )}

      {phase === 'done' && resultBuffer && (
        <div className="transmute-done">
          <div className="transmute-done-icon">&#10003;</div>
          <p className="transmute-done-title">Ready to download</p>
          <p className="transmute-done-meta">
            {formatDuration(actualDurationMs)} &middot; {formatFileSize(resultBuffer.byteLength)}
          </p>
          <div className="transmute-actions transmute-done-actions">
            <button className="btn-primary transmute-render-btn" onClick={handleDownload}>
              Download Video
            </button>
            <button className="btn-ghost" onClick={handleRenderAgain}>
              Render Again
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
