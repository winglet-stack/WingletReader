import React, { createContext, useContext } from 'react'
import type { CategoryRecord, TextRecord, TextSegment } from '../types'
import type { ImportMeta, ImportProcessingSettings } from '../components/ImportPanel'
import { useLibraryController } from './library/useLibraryController'

export type LibraryTab = 'list' | 'chapters'

type PendingDelete = { text: TextRecord; index: number }

export interface LibraryContextValue {
  texts: TextRecord[]
  categories: CategoryRecord[]
  activeText: TextRecord | null
  segments: TextSegment[]
  parentText: TextRecord | null
  libraryTab: LibraryTab
  addChapterTarget: TextRecord | null
  pendingDelete: PendingDelete | null
  loading: boolean
  error: string | null
  clearError: () => void
  openSegments: (record: TextRecord) => Promise<void>
  handleDelete: (id: number) => Promise<void>
  undoDelete: () => void
  handleImportSave: (
    title: string,
    content: string,
    meta: ImportMeta | undefined,
    processingSettings: ImportProcessingSettings,
    categoryId?: number
  ) => Promise<void>
  createCategory: (name: string) => Promise<CategoryRecord>
  renameCategory: (id: number, name: string) => Promise<CategoryRecord>
  deleteCategory: (id: number) => Promise<void>
  assignTextCategory: (textId: number, categoryId: number) => Promise<void>
  handleDeleteSegment: (segmentId: number) => Promise<void>
  handleSegmentTitleChange: (segmentId: number, newTitle: string) => Promise<void>
  handleOpenAddChapter: (book: TextRecord) => Promise<void>
  handleAddChapterSaved: () => Promise<void>
  setLibraryTab: (tab: LibraryTab) => void
  setActiveText: (text: TextRecord | null) => void
  setAddChapterTarget: (book: TextRecord | null) => void
  refreshTexts: () => Promise<void>
  refreshCategories: () => Promise<void>
}

export const LibraryContext = createContext<LibraryContextValue | null>(null)

export function LibraryProvider({
  children,
  initialActiveText,
}: {
  children: React.ReactNode
  initialActiveText?: TextRecord | null
}) {
  const value: LibraryContextValue = useLibraryController(initialActiveText)

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
}

export function useLibrary(): LibraryContextValue {
  const ctx = useContext(LibraryContext)
  if (ctx === null) {
    throw new Error('useLibrary must be used within a LibraryProvider')
  }
  return ctx
}
