import React, { useContext } from 'react'
import { cleanupImportedText } from '../../../shared/importTextCleanup'
import { LibraryContext } from '../contexts/LibraryContext'
import { NavigationContext } from '../contexts/NavigationContext'
import { SettingsContext } from '../contexts/SettingsContext'
import { alphaChrome } from '../alphaChrome'
import { planImportMeta, type ImportMeta, type ImportProcessingSettings } from '../engine/importPlan'
import { validateImportDraft } from '../engine/importDraft'
import type {
  PasteOrFileImport,
  PlainImportFormProps
} from '../components/import/PlainImportForm'
import { usePasteOrFileImportWithAutoTitle } from './usePasteOrFileImport'
import { useImportBookIntake, type ImportBookTakeover } from './useImportBookIntake'
import { useImportDraft, type ImportDraft } from './useImportDraft'

export interface ImportPanelProps {
  settings?: ImportProcessingSettings
  onSave?: (
    title: string,
    content: string,
    meta: ImportMeta | undefined,
    processingSettings: ImportProcessingSettings,
    categoryId?: number
  ) => void
  onCancel?: () => void
  /**
   * When provided, renders a secondary "Create Video Without Saving" action.
   * Called with cleaned plain text + Import title; no Library record is created.
   * (PRD section 5.3 / 5.8 - ADR-0009)
   */
  onCreateVideoWithoutSaving?: (title: string, content: string) => void
}

const DEFAULT_PROCESSING: ImportProcessingSettings = {
  segmentation_enabled: false,
  auto_chapter_detection: false,
  segmentation_threshold: 5000,
  segmentation_chunk_size: 1500
}

interface ImportDeps {
  settings: ImportProcessingSettings
  onSave: NonNullable<ImportPanelProps['onSave']>
  onCancel: NonNullable<ImportPanelProps['onCancel']>
  categories: NonNullable<React.ContextType<typeof LibraryContext>>['categories']
}

/** Props win, then the ambient contexts, then a standing default. */
function useImportDeps(props: ImportPanelProps): ImportDeps {
  const navCtx = useContext(NavigationContext)
  const libraryCtx = useContext(LibraryContext)
  const settingsCtx = useContext(SettingsContext)

  return {
    settings: props.settings ?? settingsCtx?.settings ?? DEFAULT_PROCESSING,
    onSave: props.onSave ?? libraryCtx?.handleImportSave ?? (() => {}),
    onCancel: props.onCancel ?? (() => navCtx?.setView('hub')),
    categories: libraryCtx ? libraryCtx.categories : []
  }
}

/** Text Processing is chrome-gated, so a hidden toggle can never save as `true`. */
function resolveProcessingSettings(
  draft: ImportDraft,
  settings: ImportProcessingSettings
): ImportProcessingSettings {
  return {
    segmentation_enabled: alphaChrome.importTextProcessingEnabled ? draft.segEnabled : false,
    auto_chapter_detection: alphaChrome.importTextProcessingEnabled ? draft.chapterDetect : false,
    segmentation_threshold: settings.segmentation_threshold,
    segmentation_chunk_size: settings.segmentation_chunk_size
  }
}

interface SubmitDeps {
  deps: ImportDeps
  draft: ImportDraft
  file: PasteOrFileImport
  onCreateVideoWithoutSaving?: ImportPanelProps['onCreateVideoWithoutSaving']
}

/**
 * The two ways a plain-text draft leaves the surface. Both run the same guards
 * first — the unsaved-video door is not a shortcut past them (ADR-0009) — and
 * both report a failure on the surface's one error line.
 *
 * A plain factory rather than a hook: these are event handlers over values this
 * render already has, and nothing about them survives between renders.
 */
function buildSubmitActions({
  deps,
  draft,
  file,
  onCreateVideoWithoutSaving
}: SubmitDeps): PlainImportFormProps['actions'] {
  const validate = () => {
    file.setError(null)
    const validated = validateImportDraft({
      tab: file.tab,
      title: draft.title,
      activeContent: file.tab === 'paste' ? file.pastedText : file.fileContent
    })
    if (!validated.ok) {
      file.setError(validated.error)
      return null
    }
    return validated
  }

  const onSubmit = () => {
    const validated = validate()
    if (!validated) return
    const { resolvedTitle, contentToSave, activeContent, cleaned } = validated

    // A second pass that keeps soft line wraps, for the plain text view.
    const cleanedDisplay = cleanupImportedText(activeContent, {
      preservePageMarkers: true,
      skipSoftLineWraps: true
    })

    const meta = planImportMeta({
      tab: file.tab,
      fileExt: file.fileExt,
      contentToSave,
      contentDisplay: cleanedDisplay.content.trim(),
      cleanupActions: cleaned.actions,
      fileDiagnostics: file.fileDiagnostics,
      filePageCount: file.filePageCount,
      fileBlocks: file.fileBlocks,
      fileHtml: file.fileHtml
    })
    deps.onSave(
      resolvedTitle,
      contentToSave,
      meta,
      resolveProcessingSettings(draft, deps.settings),
      draft.selectedCategoryId
    )
  }

  if (!onCreateVideoWithoutSaving) return { onSubmit }
  return {
    onSubmit,
    onCreateVideoWithoutSaving: () => {
      const validated = validate()
      if (!validated) return
      onCreateVideoWithoutSaving(validated.resolvedTitle, validated.contentToSave)
    }
  }
}

export interface ImportPanelSurface {
  onCancel: () => void
  /** The surface's one error line, shown by whichever branch is up. */
  error: string | null
  /** Non-null while a structured book holds the surface. */
  takeover: ImportBookTakeover | null
  form: Omit<PlainImportFormProps, 'error'>
}

/**
 * Everything the Import surface is, resolved once per render.
 *
 * Composition order is load-bearing: the draft owns the title the file pick
 * fills in, the intake owns the pick handlers the file hook routes to, and the
 * submit actions read both. What it deliberately does *not* do is decide
 * anything per format — a structured book resolves to a takeover through the
 * channel registry, so a new channel is a registration rather than a branch
 * here.
 */
export function useImportPanelController(props: ImportPanelProps): ImportPanelSurface {
  const deps = useImportDeps(props)
  const draft = useImportDraft(deps.categories, deps.settings)
  const intake = useImportBookIntake()
  const file = usePasteOrFileImportWithAutoTitle(draft.setTitle, {
    extendedFileFields: true,
    ...intake.pickOptions
  })
  const actions = buildSubmitActions({
    deps,
    draft,
    file,
    onCreateVideoWithoutSaving: props.onCreateVideoWithoutSaving
  })

  return {
    onCancel: deps.onCancel,
    error: file.error,
    takeover: intake.resolveTakeover(file.setError),
    form: { draft, file, actions }
  }
}
