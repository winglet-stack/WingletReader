import React, { useState, useContext, useEffect } from 'react'
import { cleanupImportedText, countWords } from '../../../shared/importTextCleanup'
import { planImportMeta, type ImportMeta, type ImportProcessingSettings } from '../engine/importPlan'
import { LibraryContext } from '../contexts/LibraryContext'
import { NavigationContext } from '../contexts/NavigationContext'
import { SettingsContext } from '../contexts/SettingsContext'
import { usePasteOrFileImportWithAutoTitle } from '../hooks/usePasteOrFileImport'
import SettingToggleRow from './SettingToggleRow'
import SettingsLabel from './settings/SettingsLabel'
import { ImportDropZone, ImportWarnings, ImportDiagnosticsBox, ImportStats } from './ImportPanelParts'
import { alphaChrome } from '../alphaChrome'

export type { ImportMeta, ImportProcessingSettings }

interface Props {
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
  segmentation_chunk_size: 1500,
}

function resolveImportDeps(
  props: Props,
  libraryCtx: React.ContextType<typeof LibraryContext>,
  settingsCtx: React.ContextType<typeof SettingsContext>
): {
  settings: ImportProcessingSettings
  onSave: NonNullable<Props['onSave']>
} {
  const settings = props.settings ?? settingsCtx?.settings ?? DEFAULT_PROCESSING
  const onSave = props.onSave ?? libraryCtx?.handleImportSave ?? (() => {})
  return { settings, onSave }
}

export default function ImportPanel(props: Props) {
  const navCtx = useContext(NavigationContext)
  const libraryCtx = useContext(LibraryContext)
  const settingsCtx = useContext(SettingsContext)
  const { settings, onSave } = resolveImportDeps(props, libraryCtx, settingsCtx)
  const onCancel = props.onCancel ?? (() => navCtx?.setView('hub'))
  const { onCreateVideoWithoutSaving } = props
  const categories = libraryCtx?.categories ?? []
  const [title, setTitle] = useState('')
  const {
    tab,
    setTab,
    pastedText,
    setPastedText,
    fileName,
    fileContent,
    setFileContent,
    fileDiagnostics,
    warnings,
    error,
    setError,
    busy,
    dragging,
    setDragging,
    dropRef,
    openFile,
    handleDrop,
    wordCount: wc,
    paragraphCount,
    fileHtml,
    fileExt,
    filePageCount,
    fileBlocks,
  } = usePasteOrFileImportWithAutoTitle(setTitle, {
    extendedFileFields: true,
  })
  const uncategorizedCategory = categories.find((category) => category.is_locked) ?? categories[0]
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | undefined>(
    uncategorizedCategory?.id
  )

  const [segEnabled, setSegEnabled] = useState(settings.segmentation_enabled)
  const [chapterDetect, setChapterDetect] = useState(settings.auto_chapter_detection)

  useEffect(() => {
    if (categories.length === 0) return
    const hasSelected = selectedCategoryId !== undefined
      && categories.some((category) => category.id === selectedCategoryId)
    if (!hasSelected) {
      setSelectedCategoryId(uncategorizedCategory?.id ?? categories[0]?.id)
    }
  }, [categories, selectedCategoryId, uncategorizedCategory])

  const stopInputShortcutPropagation = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    e.stopPropagation()
  }

  /** Validate title + content + word count. Returns cleaned values or null (and sets error). */
  const validateAndClean = (): { resolvedTitle: string; contentToSave: string; activeContent: string; cleaned: ReturnType<typeof cleanupImportedText> } | null => {
    const activeContent = tab === 'paste' ? pastedText : fileContent
    const resolvedTitle = title.trim()
    const cleaned = cleanupImportedText(activeContent ?? '', { preservePageMarkers: true })
    const contentToSave = cleaned.content.trim()

    if (!resolvedTitle) {
      setError('Please enter a title.')
      return null
    }
    if (!contentToSave) {
      setError(tab === 'paste' ? 'Please paste some text.' : 'No file loaded.')
      return null
    }
    if (countWords(contentToSave) < 3) {
      setError('Text is too short (needs at least 3 words).')
      return null
    }
    return { resolvedTitle, contentToSave, activeContent: activeContent ?? '', cleaned }
  }

  const handleSubmit = () => {
    setError(null)
    const validated = validateAndClean()
    if (!validated) return
    const { resolvedTitle, contentToSave, activeContent, cleaned } = validated

    const cleanedDisplay = cleanupImportedText(activeContent, { preservePageMarkers: true, skipSoftLineWraps: true })
    const contentDisplay = cleanedDisplay.content.trim()

    const processingSettings: ImportProcessingSettings = {
      segmentation_enabled: alphaChrome.importTextProcessingEnabled ? segEnabled : false,
      auto_chapter_detection: alphaChrome.importTextProcessingEnabled ? chapterDetect : false,
      segmentation_threshold: settings.segmentation_threshold,
      segmentation_chunk_size: settings.segmentation_chunk_size,
    }

    const meta = planImportMeta({
      tab,
      fileExt,
      contentToSave,
      contentDisplay,
      cleanupActions: cleaned.actions,
      fileDiagnostics,
      filePageCount,
      fileBlocks,
      fileHtml,
    })
    onSave(resolvedTitle, contentToSave, meta, processingSettings, selectedCategoryId)
  }

  const handleCreateVideoWithoutSaving = () => {
    setError(null)
    const validated = validateAndClean()
    if (!validated) return
    onCreateVideoWithoutSaving?.(validated.resolvedTitle, validated.contentToSave)
  }

  const diagnostics = tab === 'file' ? fileDiagnostics : null

  return (
    <div className="view-container">
      <header className="view-header">
        <h1>Import Text</h1>
        <button className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </header>

      <div className="form-group">
        <label htmlFor="text-title" className="form-label">
          Title
        </label>
        <input
          id="text-title"
          type="text"
          className="form-input"
          placeholder="e.g. The Great Gatsby - Chapter 1"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={stopInputShortcutPropagation}
          maxLength={200}
        />
      </div>

      {categories.length > 0 && (
        <div className="form-group">
          <label htmlFor="import-category" className="form-label">
            Category
          </label>
          <select
            id="import-category"
            className="form-input"
            value={selectedCategoryId ?? ''}
            onChange={(e) => setSelectedCategoryId(Number(e.target.value))}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="tab-row" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'paste'}
          className={`tab-btn ${tab === 'paste' ? 'tab-active' : ''}`}
          onClick={() => setTab('paste')}
        >
          Paste Text
        </button>
        <button
          role="tab"
          aria-selected={tab === 'file'}
          className={`tab-btn ${tab === 'file' ? 'tab-active' : ''}`}
          onClick={() => setTab('file')}
        >
          Upload File
        </button>
      </div>

      {tab === 'paste' && (
        <div className="form-group">
          <label htmlFor="paste-area" className="form-label">
            Paste your text below
          </label>
          <textarea
            id="paste-area"
            className="form-textarea"
            placeholder="Paste or type text here..."
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            onKeyDown={stopInputShortcutPropagation}
            rows={16}
            spellCheck={false}
          />
        </div>
      )}

      {tab === 'file' && (
        <ImportDropZone
          fileName={fileName}
          fileContent={fileContent}
          wordCount={wc}
          busy={busy}
          dragging={dragging}
          dropRef={dropRef}
          onOpen={openFile}
          onDrop={handleDrop}
          setDragging={setDragging}
        />
      )}

      {tab === 'file' && fileContent !== null && (
        <div className="form-group">
          <label htmlFor="file-preview-area" className="form-label">
            Review extracted text
          </label>
          <textarea
            id="file-preview-area"
            className="form-textarea"
            value={fileContent}
            onChange={(e) => setFileContent(e.target.value)}
            onKeyDown={stopInputShortcutPropagation}
            rows={14}
            spellCheck={false}
          />
        </div>
      )}

      <ImportWarnings warnings={warnings} />

      <ImportDiagnosticsBox diagnostics={diagnostics} />

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <ImportStats wordCount={wc} paragraphCount={paragraphCount} pageCount={filePageCount} />

      {alphaChrome.importTextProcessingEnabled && (
        <section className="settings-section">
          <h2 className="settings-heading">Text Processing</h2>

          <SettingToggleRow
            label="Auto-segment long texts"
            hint="Split imported texts into chapters or parts when they exceed the threshold"
            checked={segEnabled}
            onChange={setSegEnabled}
          />

          <div className="settings-row">
            <SettingsLabel
              label="Auto chapter detection"
              hint="Detect headings and split at chapter/section boundaries before falling back to chunks"
            />
            <div className="settings-control">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={chapterDetect}
                  onChange={(e) => setChapterDetect(e.target.checked)}
                  disabled={!segEnabled}
                />
                <span className="toggle-track" />
              </label>
            </div>
          </div>
        </section>
      )}

      <div className="form-actions">
        <button className="btn-brand" onClick={handleSubmit} disabled={busy}>
          Save &amp; Open in Reader
        </button>
        {onCreateVideoWithoutSaving && (
          <button
            className="btn-ghost"
            onClick={handleCreateVideoWithoutSaving}
            disabled={busy}
          >
            Create Video Without Saving
          </button>
        )}
      </div>
    </div>
  )
}
