export type ImportSourceType = 'text' | 'txt' | 'docx' | 'pdf' | 'json' | 'epub'

export interface ImportCleanupAction {
  type:
    | 'lineEndings'
    | 'bom'
    | 'unicodeSpaces'
    | 'tabs'
    | 'softHyphen'
    | 'blankLines'
    | 'pageMarkers'
    | 'dehyphenation'
    | 'splitWordLineBreaks'
    | 'softLineWraps'
    | 'bulletLines'
    | 'dashNormalize'
  count: number
}

export interface ImportSuspiciousSignal {
  type:
    | 'lowWordDensity'
    | 'longNoSpaceRun'
    | 'highSingleCharacterTokenRatio'
    | 'repeatedHeaderFooter'
    | 'ocrLikely'
  message: string
  severity: 'info' | 'warning' | 'error'
  page?: number
}

export interface ImportDiagnostics {
  parser: string
  sourceExtension: ImportSourceType
  fileSizeBytes?: number
  charCount: number
  wordCount: number
  paragraphCount: number
  pageCount?: number
  cleanupActions: ImportCleanupAction[]
  suspiciousSignals: ImportSuspiciousSignal[]
  /** EPUB only (ADR-0034 §7): the publication's first `dc:identifier`.
   *  Recorded as evidence — deliberately **not** a dedupe key; wild identifiers
   *  are unreliable and identity policy belongs to the library-API design. */
  epubIdentifier?: string
  /** EPUB only (ADR-0034 §4): images dropped by extraction. Counted and
   *  disclosed on the confirm card rather than replaced by placeholders. */
  imagesOmitted?: number
}

export type ImportedBlockType = 'heading' | 'paragraph' | 'list' | 'tableText'

export interface ImportedBlock {
  type: ImportedBlockType
  text: string
  level?: number
  order: number
}

export interface ImportedPage {
  pageNumber: number
  text: string
  wordCount: number
  charCount: number
}

