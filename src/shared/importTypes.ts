export type ImportSourceType = 'text' | 'txt' | 'docx' | 'pdf' | 'json'

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

