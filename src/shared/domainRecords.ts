import type { ImportedBlock, ImportDiagnostics } from './importTypes'

export type ContentSourceType = 'text' | 'pdf' | 'docx'

export interface CategoryRecord {
  id: number
  name: string
  is_system?: boolean
  is_locked?: boolean
}

export interface TextRecord {
  id?: number
  title: string
  /** Stable seed slug when this book was inserted by the Seed loader (ADR-0018).
   *  User-created and imported records simply lack it. */
  seed_id?: string
  content?: string
  /** HTML rendition of the document — populated for .docx imports only. */
  content_html?: string
  /** Pre-soft-wrap-converted content for display in the reader's plain text view.
   *  Single structural newlines are preserved here; the RSVP engine still uses content. */
  content_display?: string
  word_count?: number
  segment_count?: number
  is_manual_book?: boolean
  source_type?: ContentSourceType
  page_count?: number
  import_diagnostics?: ImportDiagnostics
  import_blocks?: ImportedBlock[]
  category_id?: number
  created_at?: string
  updated_at?: string
}

export type SegmentSourceType = 'detected_heading' | 'generated_chunk'

export interface TextSegment {
  id: number
  textId: number
  title: string
  content: string
  order: number
  sourceType: SegmentSourceType
  word_count: number
  /** Stable word index in the parent text where this chapter begins (set when created from a reading stop point). */
  startWordOffset?: number
  /** Stable word index in the parent text where this chapter ends (exclusive). */
  endWordOffset?: number
}

export type BookmarkKind = 'normal' | 'goal'

export interface Bookmark {
  id: number
  textId: number
  kind: BookmarkKind
  wordOffset: number
  label: string
  createdAt: string
}

export interface Summary {
  id: number
  textId: number
  segmentId?: number
  textTitle: string
  chapterTitle?: string
  content: string
  startWordOffset?: number
  endWordOffset?: number
  created_at: string
  updated_at: string
}

export interface SummaryQuestion {
  id: number
  summaryId: number
  textId: number
  text: string
  answer: string
  status: 'unanswered' | 'answered'
  created_at: string
  updated_at: string
}

export interface ReadingPosition {
  textId: number
  stackIndex: number
  updatedAt: string
  source?: 'text' | 'segment'
}

export interface ResumeCandidate {
  textId: number
  title: string
  stackIndex: number
  updatedAt: string
}

export interface BookResumeTarget {
  segmentId: number
  stackIndex: number
  resume: boolean
}

export interface ReadWhileWorkingStatus {
  enabled: boolean
  supported: boolean
  registered: boolean
  shortcut: string
  exitShortcut: string
  exitRegistered: boolean
  error: string | null
  exitError: string | null
}

export interface TemporaryReaderSession {
  id: string
  title: string
  content: string
  createdAt: string
}
