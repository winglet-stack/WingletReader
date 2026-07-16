import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { CategoryRecord, TextRecord, TextSegment } from '../types'
import type { ImportMeta, ImportProcessingSettings } from '../components/ImportPanel'
import { segmentText } from '../engine/textSegmenter'
import { useNavigation } from './NavigationContext'

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

const DEFAULT_CATEGORIES: CategoryRecord[] = [
  { id: 1, name: 'Uncategorized', is_system: true, is_locked: true },
  { id: 2, name: 'Reading', is_system: true },
  { id: 3, name: 'Archive', is_system: true },
]

export function LibraryProvider({
  children,
  initialActiveText,
}: {
  children: React.ReactNode
  initialActiveText?: TextRecord | null
}) {
  const { setView } = useNavigation()
  const dbApi = (window as unknown as { api: { db: any } }).api.db

  const [texts, setTexts] = useState<TextRecord[]>([])
  const [categories, setCategories] = useState<CategoryRecord[]>([])
  const [activeText, setActiveText] = useState<TextRecord | null>(initialActiveText ?? null)
  const [segments, setSegments] = useState<TextSegment[]>([])
  const [parentText, setParentText] = useState<TextRecord | null>(null)
  const [libraryTab, setLibraryTab] = useState<LibraryTab>('list')
  const [addChapterTarget, setAddChapterTarget] = useState<TextRecord | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const pendingDeleteTimerRef = useRef<number | null>(null)

  const clearError = useCallback(() => setError(null), [])

  const clearPendingDeleteTimer = useCallback(() => {
    if (pendingDeleteTimerRef.current !== null) {
      window.clearTimeout(pendingDeleteTimerRef.current)
      pendingDeleteTimerRef.current = null
    }
  }, [])

  const readCategories = useCallback(async (): Promise<CategoryRecord[]> => {
    const categoryApi = dbApi as { getCategories?: () => Promise<CategoryRecord[]> }
    if (typeof categoryApi.getCategories === 'function') {
      return categoryApi.getCategories()
    }
    return DEFAULT_CATEGORIES
  }, [dbApi])

  useEffect(() => {
    Promise.all([dbApi.getTexts(), readCategories()])
      .then(([loadedTexts, loadedCategories]) => {
        setTexts(loadedTexts)
        setCategories(loadedCategories)
      })
      .catch((err: Error) => setError(`Failed to load data: ${err.message}`))
      .finally(() => setLoading(false))
  }, [dbApi, readCategories])

  const refreshTexts = useCallback(async () => {
    const refreshed = await dbApi.getTexts()
    setTexts(refreshed)
  }, [dbApi])

  const refreshCategories = useCallback(async () => {
    const refreshed = await readCategories()
    setCategories(refreshed)
  }, [readCategories])

  const openSegments = useCallback(async (record: TextRecord) => {
    try {
      const segs = await dbApi.getSegments(record.id!)
      setParentText(record)
      setSegments(segs)
      setLibraryTab('chapters')
      setView('library')
    } catch (err) {
      setError(`Failed to load chapters: ${(err as Error).message}`)
    }
  }, [dbApi, setView])

  const commitPendingDelete = useCallback(async (entry: PendingDelete) => {
    const id = entry.text.id
    if (typeof id !== 'number') return

    setPendingDelete((current) => (current?.text.id === id ? null : current))

    try {
      await dbApi.deleteText(id)
    } catch (err) {
      setError(`Failed to delete: ${(err as Error).message}`)
      await refreshTexts()
    }
  }, [dbApi, refreshTexts])

  useEffect(() => clearPendingDeleteTimer, [clearPendingDeleteTimer])

  const handleDelete = useCallback(async (id: number) => {
    if (pendingDelete) {
      clearPendingDeleteTimer()
      await commitPendingDelete(pendingDelete)
    }

    const textIndex = texts.findIndex((t) => t.id === id)
    if (textIndex === -1) return

    const text = texts[textIndex]
    const nextPendingDelete = { text, index: textIndex }

    setTexts((prev) => prev.filter((t) => t.id !== id))
    if (activeText?.id === id) { setActiveText(null); setView('library') }
    if (parentText?.id === id) { setParentText(null); setSegments([]); setLibraryTab('list'); setView('library') }
    if (addChapterTarget?.id === id) { setAddChapterTarget(null); setView('library') }

    setPendingDelete(nextPendingDelete)
    pendingDeleteTimerRef.current = window.setTimeout(() => {
      pendingDeleteTimerRef.current = null
      void commitPendingDelete(nextPendingDelete)
    }, 6000)
  }, [
    activeText,
    addChapterTarget,
    clearPendingDeleteTimer,
    commitPendingDelete,
    parentText,
    pendingDelete,
    setView,
    texts,
  ])

  const undoDelete = useCallback(() => {
    if (!pendingDelete) return

    clearPendingDeleteTimer()
    const { text, index } = pendingDelete
    setTexts((prev) => {
      if (typeof text.id === 'number' && prev.some((entry) => entry.id === text.id)) return prev

      const next = [...prev]
      const restoredIndex = Math.max(0, Math.min(index, next.length))
      next.splice(restoredIndex, 0, text)
      return next
    })
    setPendingDelete(null)
  }, [clearPendingDeleteTimer, pendingDelete])

  const handleImportSave = useCallback(
    async (
      title: string,
      content: string,
      meta: ImportMeta | undefined,
      processingSettings: ImportProcessingSettings,
      categoryId?: number
    ) => {
      try {
        const textPayload: Partial<TextRecord> = { title, content }
        if (typeof categoryId === 'number') textPayload.category_id = categoryId
        if (meta) {
          textPayload.source_type = meta.sourceType
          if (meta.pageCount !== undefined) textPayload.page_count = meta.pageCount
          if (meta.html) textPayload.content_html = meta.html
          if (meta.diagnostics) textPayload.import_diagnostics = meta.diagnostics
          if (meta.blocks) textPayload.import_blocks = meta.blocks
          if (meta.displayContent) textPayload.content_display = meta.displayContent
        }
        const saved = await dbApi.saveText(textPayload)

        if (
          processingSettings.segmentation_enabled &&
          content.length >= processingSettings.segmentation_threshold
        ) {
          const drafts = segmentText(content, processingSettings, meta?.blocks)
          if (drafts && drafts.length >= 2) {
            const savedSegs = await dbApi.saveSegments(saved.id!, drafts)
            const refreshed = await dbApi.getTexts()
            setTexts(refreshed)
            setParentText({ ...saved, segment_count: savedSegs.length })
            setSegments(savedSegs)
            setLibraryTab('chapters')
            setView('library')
            return
          }
        }

        setTexts((prev) => [saved, ...prev.filter((t) => t.id !== saved.id)])
        setActiveText({ ...saved, content })
        setView('reader')
      } catch (err) {
        setError(`Failed to save text: ${(err as Error).message}`)
      }
    },
    [setView]
  )

  const handleDeleteSegment = useCallback(async (segmentId: number) => {
    try {
      await dbApi.deleteSegment(segmentId)
      setSegments((prev) => prev.filter((s) => s.id !== segmentId))
      dbApi.getTexts().then(setTexts).catch(() => {})
    } catch (err) {
      setError(`Failed to delete chapter: ${(err as Error).message}`)
    }
  }, [])

  const handleSegmentTitleChange = useCallback(async (segmentId: number, newTitle: string) => {
    try {
      await dbApi.updateSegmentTitle(segmentId, newTitle)
      setSegments((prev) =>
        prev.map((s) => (s.id === segmentId ? { ...s, title: newTitle } : s))
      )
    } catch (err) {
      setError(`Failed to update title: ${(err as Error).message}`)
    }
  }, [])

  const handleOpenAddChapter = useCallback(async (book: TextRecord) => {
    setAddChapterTarget(book)
    try {
      const segs = await dbApi.getSegments(book.id!)
      setAddChapterTarget({ ...book, segment_count: segs.length })
    } catch {
      // Use whatever segment count we already have
    }
    setView('add-chapter')
  }, [setView])

  const handleAddChapterSaved = useCallback(async () => {
    if (!addChapterTarget) return
    try {
      const segs = await dbApi.getSegments(addChapterTarget.id!)
      const refreshed = await dbApi.getTexts()
      const updatedBook =
        refreshed.find((t: TextRecord) => t.id === addChapterTarget.id) ?? addChapterTarget
      setTexts(refreshed)
      setParentText(updatedBook)
      setSegments(segs)
      setAddChapterTarget(null)
      setLibraryTab('chapters')
      setView('library')
    } catch (err) {
      setError(`Failed to refresh: ${(err as Error).message}`)
    }
  }, [addChapterTarget, setView])

  const createCategory = useCallback(async (name: string) => {
    const created = await dbApi.saveCategory({ name })
    await refreshCategories()
    return created
  }, [refreshCategories])

  const renameCategory = useCallback(async (id: number, name: string) => {
    const updated = await dbApi.saveCategory({ id, name })
    await refreshCategories()
    return updated
  }, [refreshCategories])

  const deleteCategory = useCallback(async (id: number) => {
    await dbApi.deleteCategory(id)
    await Promise.all([refreshTexts(), refreshCategories()])
  }, [refreshCategories, refreshTexts])

  const assignTextCategory = useCallback(async (textId: number, categoryId: number) => {
    await dbApi.assignTextCategory(textId, categoryId)
    await refreshTexts()
  }, [refreshTexts])

  const value = useMemo<LibraryContextValue>(
    () => ({
      texts,
      categories,
      activeText,
      segments,
      parentText,
      libraryTab,
      addChapterTarget,
      pendingDelete,
      loading,
      error,
      clearError,
      openSegments,
      handleDelete,
      undoDelete,
      handleImportSave,
      createCategory,
      renameCategory,
      deleteCategory,
      assignTextCategory,
      handleDeleteSegment,
      handleSegmentTitleChange,
      handleOpenAddChapter,
      handleAddChapterSaved,
      setLibraryTab,
      setActiveText,
      setAddChapterTarget,
      refreshTexts,
      refreshCategories,
    }),
    [
      texts, categories, activeText, segments, parentText, libraryTab, addChapterTarget,
      pendingDelete,
      loading, error, clearError,
      openSegments, handleDelete, undoDelete, handleImportSave,
      createCategory, renameCategory, deleteCategory, assignTextCategory,
      handleDeleteSegment, handleSegmentTitleChange, handleOpenAddChapter, handleAddChapterSaved,
      refreshTexts, refreshCategories,
    ]
  )

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
}

export function useLibrary(): LibraryContextValue {
  const ctx = useContext(LibraryContext)
  if (ctx === null) {
    throw new Error('useLibrary must be used within a LibraryProvider')
  }
  return ctx
}
