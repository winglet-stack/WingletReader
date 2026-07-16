import type { CategoryRecord } from '../types'

export function resolveTextCategoryId(
  categoryId: number | undefined,
  categories: CategoryRecord[]
): number | undefined {
  return categoryId ?? categories.find((category) => category.is_locked)?.id ?? categories[0]?.id
}

export function orderCategoriesBySelection(
  categories: CategoryRecord[],
  selectedCategoryId: number | undefined
): CategoryRecord[] {
  if (categories.length === 0) return []
  if (selectedCategoryId === undefined) return categories
  const selected = categories.find((category) => category.id === selectedCategoryId)
  if (!selected) return categories
  return [selected, ...categories.filter((category) => category.id !== selectedCategoryId)]
}

export function splitCategoryOptions(
  categories: CategoryRecord[],
  selectedCategoryId: number | undefined,
  maxVisible: number
): { visibleCategories: CategoryRecord[]; overflowCategories: CategoryRecord[] } {
  const orderedCategories = orderCategoriesBySelection(categories, selectedCategoryId)
  return {
    visibleCategories: orderedCategories.slice(0, maxVisible),
    overflowCategories: orderedCategories.slice(maxVisible),
  }
}
