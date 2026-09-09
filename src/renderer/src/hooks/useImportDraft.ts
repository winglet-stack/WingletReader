import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import type { ImportProcessingSettings } from '../engine/importPlan'
import type { CategoryRecord } from '../types'

export interface ImportDraft {
  title: string
  setTitle: Dispatch<SetStateAction<string>>
  categories: CategoryRecord[]
  selectedCategoryId: number | undefined
  setSelectedCategoryId: (categoryId: number) => void
  segEnabled: boolean
  setSegEnabled: (enabled: boolean) => void
  chapterDetect: boolean
  setChapterDetect: (enabled: boolean) => void
}

/** The locked category is Uncategorized; the first one is the fallback. */
function defaultCategory(categories: CategoryRecord[]): CategoryRecord | undefined {
  return categories.find((category) => category.is_locked) ?? categories[0]
}

/**
 * Everything the user is editing on the plain-text import surface before they
 * submit: the title, where it lands, and the two text-processing toggles.
 *
 * Structured books never reach here — a `.wbook` or `.epub` carries its own
 * title and category, which is why the confirm card takes the whole surface.
 */
export function useImportDraft(
  categories: CategoryRecord[],
  settings: ImportProcessingSettings
): ImportDraft {
  const [title, setTitle] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | undefined>(
    defaultCategory(categories)?.id
  )
  const [segEnabled, setSegEnabled] = useState(settings.segmentation_enabled)
  const [chapterDetect, setChapterDetect] = useState(settings.auto_chapter_detection)

  // Categories arrive asynchronously and can be deleted underneath the picker;
  // either way the selection is repaired to Uncategorized rather than left
  // pointing at nothing.
  useEffect(() => {
    if (categories.length === 0) return
    const hasSelected =
      selectedCategoryId !== undefined &&
      categories.some((category) => category.id === selectedCategoryId)
    if (!hasSelected) {
      setSelectedCategoryId(defaultCategory(categories)?.id ?? categories[0]?.id)
    }
  }, [categories, selectedCategoryId])

  return {
    title,
    setTitle,
    categories,
    selectedCategoryId,
    setSelectedCategoryId,
    segEnabled,
    setSegEnabled,
    chapterDetect,
    setChapterDetect
  }
}
