import { describe, expect, it } from 'vitest'
import type { CategoryRecord } from '../../types'
import {
  orderCategoriesBySelection,
  resolveTextCategoryId,
  splitCategoryOptions,
} from '../libraryCategoryPicker'

const categories: CategoryRecord[] = [
  { id: 1, name: 'Uncategorized', is_system: true, is_locked: true },
  { id: 2, name: 'Reading', is_system: true },
  { id: 3, name: 'Archive', is_system: true },
  { id: 4, name: 'Research' },
  { id: 5, name: 'Reference' },
]

describe('libraryCategoryPicker', () => {
  it('resolves the text category with locked-category fallback', () => {
    expect(resolveTextCategoryId(3, categories)).toBe(3)
    expect(resolveTextCategoryId(undefined, categories)).toBe(1)
  })

  it('falls back to the first category when no locked category exists', () => {
    expect(resolveTextCategoryId(undefined, categories.slice(1))).toBe(2)
    expect(resolveTextCategoryId(undefined, [])).toBeUndefined()
  })

  it('orders the selected category first without losing the rest', () => {
    expect(orderCategoriesBySelection(categories, 3).map((category) => category.id)).toEqual([
      3, 1, 2, 4, 5,
    ])
  })

  it('keeps source order when the selected category is absent', () => {
    expect(orderCategoriesBySelection(categories, 99).map((category) => category.id)).toEqual([
      1, 2, 3, 4, 5,
    ])
  })

  it('splits selected-first categories into visible and overflow groups', () => {
    const result = splitCategoryOptions(categories, 4, 3)

    expect(result.visibleCategories.map((category) => category.id)).toEqual([4, 1, 2])
    expect(result.overflowCategories.map((category) => category.id)).toEqual([3, 5])
  })
})
