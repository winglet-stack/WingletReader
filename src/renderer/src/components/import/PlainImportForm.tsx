import React from 'react'
import type { usePasteOrFileImportWithAutoTitle } from '../../hooks/usePasteOrFileImport'
import type { ImportDraft } from '../../hooks/useImportDraft'
import {
  ImportDropZone,
  ImportWarnings,
  ImportDiagnosticsBox,
  ImportStats,
  ImportError
} from '../ImportPanelParts'
import {
  ImportTitleField,
  ImportCategoryField,
  ImportTabRow,
  ImportPasteArea,
  ImportFilePreview,
  ImportFormActions
} from './ImportFormFields'
import ImportTextProcessingSection from './ImportTextProcessingSection'

/** The paste/file state the form renders, read off the hook that owns it. */
export type PasteOrFileImport = ReturnType<typeof usePasteOrFileImportWithAutoTitle>

export interface PlainImportFormProps {
  draft: ImportDraft
  file: PasteOrFileImport
  actions: {
    onSubmit: () => void
    onCreateVideoWithoutSaving?: () => void
  }
  error: string | null
}

/**
 * The ordinary import surface: a title, where it lands, and one of the two ways
 * text arrives. Composition only — the parts hold the markup and the hooks hold
 * the state, so the order of the rows is the whole of what this file decides.
 *
 * Grouped props on purpose: the form passes each part just the value and setter
 * it needs, rather than restating twenty of them at this level.
 */
export default function PlainImportForm({ draft, file, actions, error }: PlainImportFormProps) {
  // Diagnostics belong to a loaded file; the paste tab has nothing to report.
  const diagnostics = file.tab === 'file' ? file.fileDiagnostics : null

  return (
    <>
      <ImportTitleField title={draft.title} onChange={draft.setTitle} />

      <ImportCategoryField
        categories={draft.categories}
        selectedCategoryId={draft.selectedCategoryId}
        onChange={draft.setSelectedCategoryId}
      />

      <ImportTabRow tab={file.tab} onSelect={file.setTab} />

      {file.tab === 'paste' && (
        <ImportPasteArea pastedText={file.pastedText} onChange={file.setPastedText} />
      )}

      {file.tab === 'file' && (
        <ImportDropZone
          fileName={file.fileName}
          fileContent={file.fileContent}
          wordCount={file.wordCount}
          busy={file.busy}
          dragging={file.dragging}
          dropRef={file.dropRef}
          onOpen={file.openFile}
          onDrop={file.handleDrop}
          setDragging={file.setDragging}
        />
      )}

      {file.tab === 'file' && (
        <ImportFilePreview fileContent={file.fileContent} onChange={file.setFileContent} />
      )}

      <ImportWarnings warnings={file.warnings} />

      <ImportDiagnosticsBox diagnostics={diagnostics} />

      <ImportError error={error} />

      <ImportStats
        wordCount={file.wordCount}
        paragraphCount={file.paragraphCount}
        pageCount={file.filePageCount}
      />

      <ImportTextProcessingSection
        segEnabled={draft.segEnabled}
        onSegEnabledChange={draft.setSegEnabled}
        chapterDetect={draft.chapterDetect}
        onChapterDetectChange={draft.setChapterDetect}
      />

      <ImportFormActions
        busy={file.busy}
        onSubmit={actions.onSubmit}
        onCreateVideoWithoutSaving={actions.onCreateVideoWithoutSaving}
      />
    </>
  )
}
