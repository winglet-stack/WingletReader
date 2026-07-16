/// <reference types="vite/client" />

import type {
  TextRecord,
  TextSegment,
  Bookmark,
  Settings,
  Summary,
  SummaryQuestion,
  ReadingPosition,
  ResumeCandidate,
  BookResumeTarget,
  CategoryRecord,
  ReadWhileWorkingStatus,
  TemporaryReaderSession
} from './types'
import type { SettingsStore } from '../../shared/settings'
import type { ImportedBlock, ImportedPage, ImportDiagnostics } from '../../shared/importTypes'

type PortableProvisioningResult =
  | {
      ok: true
      targetPath: string
      launcherPath: string
      dataPath: string
    }
  | {
      ok: false
      error: {
        code:
          | 'invalid-target'
          | 'target-not-writable'
          | 'insufficient-space'
          | 'portable-exists'
          | 'target-has-conflicts'
          | 'source-missing'
          | 'copy-failed'
        message: string
        detail?: string
        requiredBytes?: number
        availableBytes?: number
      }
    }

// `declare global` is required for this `interface Window` augmentation to reach
// the real DOM `Window` type: env.d.ts is a module (it has top-level imports), so
// a bare `interface Window` would augment nothing and `window.api` would be
// untyped everywhere. The body keeps its original indentation to stay a minimal,
// reviewable diff.
declare global {
interface Window {
  api: {
    app: {
      getVersion(): Promise<string>
      splashReady(): void
    }
    db: {
      getTexts(): Promise<TextRecord[]>
      getText(id: number): Promise<TextRecord | null>
      saveText(text: Partial<TextRecord>): Promise<TextRecord>
      deleteText(id: number): Promise<void>
      getCategories(): Promise<CategoryRecord[]>
      saveCategory(category: Partial<CategoryRecord>): Promise<CategoryRecord>
      deleteCategory(id: number): Promise<void>
      assignTextCategory(textId: number, categoryId: number): Promise<TextRecord>
      getSettings(): Promise<Settings>
      saveSettings(settings: Partial<Settings>): Promise<Settings>
      getSettingsStore(): Promise<SettingsStore>
      saveSettingsStore(store: SettingsStore): Promise<SettingsStore>
      getSegments(textId: number): Promise<TextSegment[]>
      getSegment(id: number): Promise<TextSegment | null>
      saveSegments(
        textId: number,
        drafts: Array<Omit<TextSegment, 'id' | 'textId'>>
      ): Promise<TextSegment[]>
      updateSegmentTitle(id: number, title: string): Promise<void>
      deleteSegments(textId: number): Promise<void>
      deleteSegment(id: number): Promise<void>
      appendSegment(textId: number, draft: Omit<TextSegment, 'id' | 'textId'>): Promise<TextSegment>
      createChapterFromPassage(
        textId: number,
        startWordOffset: number,
        endWordOffset: number,
        title: string
      ): Promise<{ ok: true; segment: TextSegment } | { ok: false; error: string }>
      getBookmarks(textId: number): Promise<Bookmark[]>
      saveBookmark(
        textId: number,
        draft: Omit<Bookmark, 'id' | 'textId' | 'createdAt'>
      ): Promise<Bookmark>
      updateBookmarkLabel(id: number, label: string): Promise<void>
      deleteBookmark(id: number): Promise<void>
      getSummaries(textId: number): Promise<Summary[]>
      saveSummary(
        data: Omit<Summary, 'id' | 'created_at' | 'updated_at'> & { id?: number }
      ): Promise<Summary>
      deleteSummary(id: number): Promise<void>
      getSummaryQuestionsForText(textId: number): Promise<SummaryQuestion[]>
      saveSummaryQuestion(
        data: Omit<SummaryQuestion, 'id' | 'status' | 'created_at' | 'updated_at'> & { id?: number }
      ): Promise<SummaryQuestion>
      deleteSummaryQuestion(id: number): Promise<void>
      getReadingPosition(textId: number): Promise<ReadingPosition | null>
      getLatestResumeCandidate(): Promise<ResumeCandidate | null>
      getBookResumeTarget(bookTextId: number): Promise<BookResumeTarget | null>
      saveReadingPosition(
        textId: number,
        stackIndex: number,
        source?: ReadingPosition['source']
      ): Promise<ReadingPosition>
    }
    file: {
      open(): Promise<{
        fileName: string
        title: string
        content: string
        warnings: string[]
        ext: string
        pageCount?: number
        html?: string | null
        diagnostics?: ImportDiagnostics
        blocks?: ImportedBlock[]
        pages?: ImportedPage[]
      } | null>
    }
    data: {
      exportAll(): Promise<{ ok: boolean; error?: string }>
      importJson(): Promise<{ ok: boolean; imported?: number; error?: string }>
      selectPortableTarget(): Promise<{ canceled: boolean; targetPath?: string }>
      createPortableDrive(targetPath: string): Promise<PortableProvisioningResult>
    }
    video: {
      save(buffer: ArrayBuffer, suggestedName: string): Promise<{ ok: boolean; error?: string }>
    }
    readWhileWorking: {
      getStatus(): Promise<ReadWhileWorkingStatus>
      hideToTray(): Promise<ReadWhileWorkingStatus>
      enableAndHideToTray(): Promise<ReadWhileWorkingStatus>
      getTemporarySession(): Promise<{ session: TemporaryReaderSession | null; settings: Settings }>
      finishTemporarySession(reason: string): Promise<{ ok: boolean }>
      exit(): Promise<{ ok: boolean }>
      /** Subscribe to RWW-exit; returns an unsubscribe fn. Fires on the main window. */
      onExited(callback: () => void): () => void
      /** Subscribe to tray-initiated enable failures; returns an unsubscribe fn. Fires on the main window. */
      onEnableFailed(callback: (error: string) => void): () => void
    }
  }
}
}
