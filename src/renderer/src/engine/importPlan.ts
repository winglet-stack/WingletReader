import type { ContentSourceType, Settings } from '../types'
import type {
  ImportCleanupAction,
  ImportDiagnostics,
  ImportedBlock,
  ImportSourceType
} from '../../../shared/importTypes'
import { buildImportDiagnostics } from '../../../shared/importTextCleanup'

export interface ImportMeta {
  sourceType: ContentSourceType
  pageCount?: number
  /** HTML rendition of the file — present for .docx imports only. */
  html?: string
  diagnostics?: ImportDiagnostics
  blocks?: ImportedBlock[]
  /** Pre-soft-wrap-converted content for the reader's plain text view.
   *  Only present when it differs from the RSVP content (i.e. soft wraps existed). */
  displayContent?: string
}

export type ImportProcessingSettings = Pick<
  Settings,
  'segmentation_enabled' | 'auto_chapter_detection' | 'segmentation_threshold' | 'segmentation_chunk_size'
>

/** Everything the submit decision needs after the guards have passed. The two
 *  cleanup passes have already run; `contentToSave` is the RSVP content and
 *  `contentDisplay` is the soft-wrap-preserving variant. */
export interface ImportPlanInput {
  tab: 'paste' | 'file'
  fileExt: string | null
  contentToSave: string
  contentDisplay: string
  /** `cleaned.actions` from the primary cleanup pass over the active content. */
  cleanupActions: ImportCleanupAction[]
  fileDiagnostics: ImportDiagnostics | null
  filePageCount?: number
  fileBlocks?: ImportedBlock[]
  fileHtml: string | null
}

/** displayContent is stored only when the display variant differs from the
 *  RSVP content — i.e. soft wraps were present. */
function displayContentPart(input: ImportPlanInput): { displayContent?: string } {
  return input.contentDisplay !== input.contentToSave
    ? { displayContent: input.contentDisplay }
    : {}
}

/** pdf/docx file imports: carry page count, blocks, optional html, and the
 *  file's own diagnostics merged with this pass's cleanup actions. */
function planRichFileMeta(input: ImportPlanInput): ImportMeta {
  const { fileExt, contentToSave, cleanupActions, fileDiagnostics, filePageCount, fileBlocks, fileHtml } = input
  const diagnostics = buildImportDiagnostics({
    parser: fileDiagnostics?.parser ?? `file:${fileExt}`,
    sourceExtension: fileExt as ImportSourceType,
    content: contentToSave,
    fileSizeBytes: fileDiagnostics?.fileSizeBytes,
    pageCount: filePageCount,
    cleanupActions: [...(fileDiagnostics?.cleanupActions ?? []), ...cleanupActions],
    suspiciousSignals: fileDiagnostics?.suspiciousSignals ?? []
  })
  return {
    sourceType: fileExt as ContentSourceType,
    pageCount: filePageCount,
    diagnostics,
    blocks: fileBlocks,
    ...(fileHtml ? { html: fileHtml } : {}),
    ...displayContentPart(input)
  }
}

/** Paste and plain .txt imports: a flat text source with diagnostics only. */
function planTextMeta(input: ImportPlanInput): ImportMeta {
  const { tab, contentToSave, cleanupActions, fileDiagnostics } = input
  const diagnostics = buildImportDiagnostics({
    parser: tab === 'paste' ? 'manual:paste' : fileDiagnostics?.parser ?? 'file:text',
    sourceExtension: tab === 'paste' ? 'text' : 'txt',
    content: contentToSave,
    fileSizeBytes: fileDiagnostics?.fileSizeBytes,
    cleanupActions: [...(fileDiagnostics?.cleanupActions ?? []), ...cleanupActions],
    suspiciousSignals: fileDiagnostics?.suspiciousSignals ?? []
  })
  return {
    sourceType: 'text',
    diagnostics,
    ...displayContentPart(input)
  }
}

/** Pure submit planner: decides the ImportMeta shape from the import source and
 *  file type. The component keeps the validation guards (they set error state);
 *  this carries the branch/meta decision so it can be unit-tested in isolation. */
export function planImportMeta(input: ImportPlanInput): ImportMeta {
  const isRichFileImport =
    input.tab === 'file' && (input.fileExt === 'pdf' || input.fileExt === 'docx')
  return isRichFileImport ? planRichFileMeta(input) : planTextMeta(input)
}
