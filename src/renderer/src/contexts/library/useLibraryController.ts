import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import type { ImportMeta, ImportProcessingSettings } from '../../components/ImportPanel'
import { segmentText } from '../../engine/textSegmenter'
import type { CategoryRecord, TextRecord, TextSegment } from '../../types'
import { useNavigation, type NavigationContextValue } from '../NavigationContext'

type LibraryDbApi = Window['api']['db']
type SetView = NavigationContextValue['setView']
type StateSetter<T> = Dispatch<SetStateAction<T>>
type SetError = StateSetter<string | null>
type LibraryTabState = 'list' | 'chapters'
type PendingDeleteEntry = { text: TextRecord; index: number }

const DEFAULT_CATEGORIES: CategoryRecord[] = [
  { id: 1, name: 'Uncategorized', is_system: true, is_locked: true },
  { id: 2, name: 'Reading', is_system: true },
  { id: 3, name: 'Archive', is_system: true },
]

export function useLibraryCatalog(dbApi: LibraryDbApi, setError: SetError) {
  const [texts, setTexts] = useState<TextRecord[]>([])
  const [categories, setCategories] = useState<CategoryRecord[]>([])
  const [loading, setLoading] = useState(true)

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
  }, [dbApi, readCategories, setError])

  const refreshTexts = useCallback(async () => {
    const refreshed = await dbApi.getTexts()
    setTexts(refreshed)
  }, [dbApi])

  const refreshCategories = useCallback(async () => {
    const refreshed = await readCategories()
    setCategories(refreshed)
  }, [readCategories])

  const createCategory = useCallback(async (name: string) => {
    const created = await dbApi.saveCategory({ name })
    await refreshCategories()
    return created
  }, [dbApi, refreshCategories])

  const renameCategory = useCallback(async (id: number, name: string) => {
    const updated = await dbApi.saveCategory({ id, name })
    await refreshCategories()
    return updated
  }, [dbApi, refreshCategories])

  const deleteCategory = useCallback(async (id: number) => {
    await dbApi.deleteCategory(id)
    await Promise.all([refreshTexts(), refreshCategories()])
  }, [dbApi, refreshCategories, refreshTexts])

  const assignTextCategory = useCallback(async (textId: number, categoryId: number) => {
    await dbApi.assignTextCategory(textId, categoryId)
    await refreshTexts()
  }, [dbApi, refreshTexts])

  return {
    texts,
    setTexts,
    categories,
    loading,
    refreshTexts,
    refreshCategories,
    createCategory,
    renameCategory,
    deleteCategory,
    assignTextCategory,
  }
}

export function useLibrarySelection(
  dbApi: LibraryDbApi,
  setView: SetView,
  setError: SetError,
  setTexts: StateSetter<TextRecord[]>,
  initialActiveText?: TextRecord | null
) {
  const [activeText, setActiveText] = useState<TextRecord | null>(initialActiveText ?? null)
  const [segments, setSegments] = useState<TextSegment[]>([])
  const [parentText, setParentText] = useState<TextRecord | null>(null)
  const [libraryTab, setLibraryTab] = useState<LibraryTabState>('list')
  const [addChapterTarget, setAddChapterTarget] = useState<TextRecord | null>(null)

  const openSegments = useCallback(async (record: TextRecord) => {
    try {
      const loadedSegments = await dbApi.getSegments(record.id!)
      setParentText(record)
      setSegments(loadedSegments)
      setLibraryTab('chapters')
      setView('library')
    } catch (err) {
      setError(`Failed to load chapters: ${(err as Error).message}`)
    }
  }, [dbApi, setError, setView])

  const handleDeleteSegment = useCallback(async (segmentId: number) => {
    try {
      await dbApi.deleteSegment(segmentId)
      setSegments((previous) => previous.filter((segment) => segment.id !== segmentId))
      dbApi.getTexts().then(setTexts).catch(() => {})
    } catch (err) {
      setError(`Failed to delete chapter: ${(err as Error).message}`)
    }
  }, [dbApi, setError, setTexts])

  const handleSegmentTitleChange = useCallback(async (segmentId: number, newTitle: string) => {
    try {
      await dbApi.updateSegmentTitle(segmentId, newTitle)
      setSegments((previous) =>
        previous.map((segment) =>
          segment.id === segmentId ? { ...segment, title: newTitle } : segment
        )
      )
    } catch (err) {
      setError(`Failed to update title: ${(err as Error).message}`)
    }
  }, [dbApi, setError])

  const handleOpenAddChapter = useCallback(async (book: TextRecord) => {
    setAddChapterTarget(book)
    try {
      const loadedSegments = await dbApi.getSegments(book.id!)
      setAddChapterTarget({ ...book, segment_count: loadedSegments.length })
    } catch {
      // Use whatever segment count we already have.
    }
    setView('add-chapter')
  }, [dbApi, setView])

  const handleAddChapterSaved = useCallback(async () => {
    if (!addChapterTarget) return
    try {
      const loadedSegments = await dbApi.getSegments(addChapterTarget.id!)
      const refreshedTexts = await dbApi.getTexts()
      const updatedBook =
        refreshedTexts.find((text) => text.id === addChapterTarget.id) ?? addChapterTarget
      setTexts(refreshedTexts)
      setParentText(updatedBook)
      setSegments(loadedSegments)
      setAddChapterTarget(null)
      setLibraryTab('chapters')
      setView('library')
    } catch (err) {
      setError(`Failed to refresh: ${(err as Error).message}`)
    }
  }, [addChapterTarget, dbApi, setError, setTexts, setView])

  const clearDeletedTextDestinations = useCallback((id: number) => {
    if (activeText?.id === id) {
      setActiveText(null)
      setView('library')
    }
    if (parentText?.id === id) {
      setParentText(null)
      setSegments([])
      setLibraryTab('list')
      setView('library')
    }
    if (addChapterTarget?.id === id) {
      setAddChapterTarget(null)
      setView('library')
    }
  }, [activeText, addChapterTarget, parentText, setView])

  return {
    activeText,
    setActiveText,
    segments,
    setSegments,
    parentText,
    setParentText,
    libraryTab,
    setLibraryTab,
    addChapterTarget,
    setAddChapterTarget,
    openSegments,
    handleDeleteSegment,
    handleSegmentTitleChange,
    handleOpenAddChapter,
    handleAddChapterSaved,
    clearDeletedTextDestinations,
  }
}

export function usePendingTextDelete(
  dbApi: LibraryDbApi,
  texts: TextRecord[],
  setTexts: StateSetter<TextRecord[]>,
  clearDeletedTextDestinations: (id: number) => void,
  refreshTexts: () => Promise<void>,
  setError: SetError
) {
  const [pendingDelete, setPendingDelete] = useState<PendingDeleteEntry | null>(null)
  const pendingDeleteTimerRef = useRef<number | null>(null)

  const clearPendingDeleteTimer = useCallback(() => {
    if (pendingDeleteTimerRef.current !== null) {
      window.clearTimeout(pendingDeleteTimerRef.current)
      pendingDeleteTimerRef.current = null
    }
  }, [])

  const commitPendingDelete = useCallback(async (entry: PendingDeleteEntry) => {
    const id = entry.text.id
    if (typeof id !== 'number') return

    setPendingDelete((current) => (current?.text.id === id ? null : current))
    try {
      await dbApi.deleteText(id)
    } catch (err) {
      setError(`Failed to delete: ${(err as Error).message}`)
      await refreshTexts()
    }
  }, [dbApi, refreshTexts, setError])

  useEffect(() => clearPendingDeleteTimer, [clearPendingDeleteTimer])

  const handleDelete = useCallback(async (id: number) => {
    if (pendingDelete) {
      clearPendingDeleteTimer()
      await commitPendingDelete(pendingDelete)
    }

    const textIndex = texts.findIndex((text) => text.id === id)
    if (textIndex === -1) return

    const nextPendingDelete = { text: texts[textIndex], index: textIndex }
    setTexts((previous) => previous.filter((text) => text.id !== id))
    clearDeletedTextDestinations(id)
    setPendingDelete(nextPendingDelete)
    pendingDeleteTimerRef.current = window.setTimeout(() => {
      pendingDeleteTimerRef.current = null
      void commitPendingDelete(nextPendingDelete)
    }, 6000)
  }, [
    clearDeletedTextDestinations,
    clearPendingDeleteTimer,
    commitPendingDelete,
    pendingDelete,
    setTexts,
    texts,
  ])

  const undoDelete = useCallback(() => {
    if (!pendingDelete) return

    clearPendingDeleteTimer()
    const { text, index } = pendingDelete
    setTexts((previous) => {
      if (typeof text.id === 'number' && previous.some((entry) => entry.id === text.id)) {
        return previous
      }

      const next = [...previous]
      const restoredIndex = Math.max(0, Math.min(index, next.length))
      next.splice(restoredIndex, 0, text)
      return next
    })
    setPendingDelete(null)
  }, [clearPendingDeleteTimer, pendingDelete, setTexts])

  return { pendingDelete, handleDelete, undoDelete }
}

function applyImportMeta(textPayload: Partial<TextRecord>, meta: ImportMeta) {
  textPayload.source_type = meta.sourceType
  if (meta.pageCount !== undefined) textPayload.page_count = meta.pageCount
  if (meta.html) textPayload.content_html = meta.html
  if (meta.diagnostics) textPayload.import_diagnostics = meta.diagnostics
  if (meta.blocks) textPayload.import_blocks = meta.blocks
  if (meta.displayContent) textPayload.content_display = meta.displayContent
}

function buildImportTextPayload(
  title: string,
  content: string,
  meta: ImportMeta | undefined,
  categoryId?: number
): Partial<TextRecord> {
  const textPayload: Partial<TextRecord> = { title, content }
  if (typeof categoryId === 'number') textPayload.category_id = categoryId
  if (meta) applyImportMeta(textPayload, meta)
  return textPayload
}

async function saveSegmentedImport(
  dbApi: LibraryDbApi,
  saved: TextRecord,
  content: string,
  meta: ImportMeta | undefined,
  processingSettings: ImportProcessingSettings
): Promise<TextSegment[] | null> {
  if (
    !processingSettings.segmentation_enabled ||
    content.length < processingSettings.segmentation_threshold
  ) {
    return null
  }

  const drafts = segmentText(content, processingSettings, meta?.blocks)
  if (!drafts || drafts.length < 2) return null
  return dbApi.saveSegments(saved.id!, drafts)
}

export function useLibraryImportActions(
  dbApi: LibraryDbApi,
  setView: SetView,
  setError: SetError,
  setTexts: StateSetter<TextRecord[]>,
  setActiveText: StateSetter<TextRecord | null>,
  setParentText: StateSetter<TextRecord | null>,
  setSegments: StateSetter<TextSegment[]>,
  setLibraryTab: StateSetter<LibraryTabState>
) {
  const handleImportSave = useCallback(async (
    title: string,
    content: string,
    meta: ImportMeta | undefined,
    processingSettings: ImportProcessingSettings,
    categoryId?: number
  ) => {
    try {
      const saved = await dbApi.saveText(buildImportTextPayload(title, content, meta, categoryId))
      const savedSegments = await saveSegmentedImport(
        dbApi,
        saved,
        content,
        meta,
        processingSettings
      )

      if (savedSegments) {
        const refreshedTexts = await dbApi.getTexts()
        setTexts(refreshedTexts)
        setParentText({ ...saved, segment_count: savedSegments.length })
        setSegments(savedSegments)
        setLibraryTab('chapters')
        setView('library')
        return
      }

      setTexts((previous) => [saved, ...previous.filter((text) => text.id !== saved.id)])
      setActiveText({ ...saved, content })
      setView('reader')
    } catch (err) {
      setError(`Failed to save text: ${(err as Error).message}`)
    }
  }, [
    dbApi,
    setActiveText,
    setError,
    setLibraryTab,
    setParentText,
    setSegments,
    setTexts,
    setView,
  ])

  return { handleImportSave }
}

export function useLibraryController(initialActiveText?: TextRecord | null) {
  const { setView } = useNavigation()
  const dbApi = window.api.db
  const [error, setError] = useState<string | null>(null)
  const clearError = useCallback(() => setError(null), [])
  const catalog = useLibraryCatalog(dbApi, setError)
  const selection = useLibrarySelection(
    dbApi,
    setView,
    setError,
    catalog.setTexts,
    initialActiveText
  )
  const deletion = usePendingTextDelete(
    dbApi,
    catalog.texts,
    catalog.setTexts,
    selection.clearDeletedTextDestinations,
    catalog.refreshTexts,
    setError
  )
  const importActions = useLibraryImportActions(
    dbApi,
    setView,
    setError,
    catalog.setTexts,
    selection.setActiveText,
    selection.setParentText,
    selection.setSegments,
    selection.setLibraryTab
  )

  return useMemo(() => ({
    texts: catalog.texts,
    categories: catalog.categories,
    activeText: selection.activeText,
    segments: selection.segments,
    parentText: selection.parentText,
    libraryTab: selection.libraryTab,
    addChapterTarget: selection.addChapterTarget,
    pendingDelete: deletion.pendingDelete,
    loading: catalog.loading,
    error,
    clearError,
    openSegments: selection.openSegments,
    handleDelete: deletion.handleDelete,
    undoDelete: deletion.undoDelete,
    handleImportSave: importActions.handleImportSave,
    createCategory: catalog.createCategory,
    renameCategory: catalog.renameCategory,
    deleteCategory: catalog.deleteCategory,
    assignTextCategory: catalog.assignTextCategory,
    handleDeleteSegment: selection.handleDeleteSegment,
    handleSegmentTitleChange: selection.handleSegmentTitleChange,
    handleOpenAddChapter: selection.handleOpenAddChapter,
    handleAddChapterSaved: selection.handleAddChapterSaved,
    setLibraryTab: selection.setLibraryTab,
    setActiveText: selection.setActiveText,
    setAddChapterTarget: selection.setAddChapterTarget,
    refreshTexts: catalog.refreshTexts,
    refreshCategories: catalog.refreshCategories,
  }), [catalog, clearError, deletion, error, importActions, selection])
}
