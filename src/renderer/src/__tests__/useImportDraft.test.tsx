/**
 * The plain-text import draft (codebase-health 08).
 *
 * Title, target category, and the two processing toggles — the state a
 * structured book never reaches, because a `.wbook` or `.epub` brings its own
 * title and lands in its own category.
 *
 * Environment: happy-dom (matched by vitest.config.ts environmentMatchGlobs).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useImportDraft } from '../hooks/useImportDraft'
import type { ImportProcessingSettings } from '../engine/importPlan'
import type { CategoryRecord } from '../types'

afterEach(cleanup)

const UNCATEGORIZED: CategoryRecord = {
  id: 1,
  name: 'Uncategorized',
  is_system: true,
  is_locked: true
}
const FICTION: CategoryRecord = { id: 2, name: 'Fiction' }

const PROCESSING: ImportProcessingSettings = {
  segmentation_enabled: true,
  auto_chapter_detection: true,
  segmentation_threshold: 5000,
  segmentation_chunk_size: 1500
}

describe('useImportDraft', () => {
  it('starts empty, on the locked category, seeded from the settings', () => {
    const { result } = renderHook(() => useImportDraft([FICTION, UNCATEGORIZED], PROCESSING))

    expect(result.current.title).toBe('')
    expect(result.current.selectedCategoryId).toBe(UNCATEGORIZED.id)
    expect(result.current.segEnabled).toBe(true)
    expect(result.current.chapterDetect).toBe(true)
  })

  it('falls back to the first category when none is locked', () => {
    const { result } = renderHook(() => useImportDraft([FICTION], PROCESSING))

    expect(result.current.selectedCategoryId).toBe(FICTION.id)
  })

  it('adopts the locked category once categories arrive', () => {
    const { result, rerender } = renderHook(
      ({ categories }) => useImportDraft(categories, PROCESSING),
      { initialProps: { categories: [] as CategoryRecord[] } }
    )

    expect(result.current.selectedCategoryId).toBeUndefined()
    rerender({ categories: [FICTION, UNCATEGORIZED] })

    expect(result.current.selectedCategoryId).toBe(UNCATEGORIZED.id)
  })

  it('repairs a selection whose category has gone away', () => {
    const { result, rerender } = renderHook(
      ({ categories }) => useImportDraft(categories, PROCESSING),
      { initialProps: { categories: [UNCATEGORIZED, FICTION] } }
    )

    act(() => result.current.setSelectedCategoryId(FICTION.id))
    expect(result.current.selectedCategoryId).toBe(FICTION.id)

    rerender({ categories: [UNCATEGORIZED] })

    expect(result.current.selectedCategoryId).toBe(UNCATEGORIZED.id)
  })

  it('leaves a still-valid selection alone', () => {
    const { result, rerender } = renderHook(
      ({ categories }) => useImportDraft(categories, PROCESSING),
      { initialProps: { categories: [UNCATEGORIZED, FICTION] } }
    )

    act(() => result.current.setSelectedCategoryId(FICTION.id))
    rerender({ categories: [UNCATEGORIZED, FICTION, { id: 3, name: 'Essays' }] })

    expect(result.current.selectedCategoryId).toBe(FICTION.id)
  })

  it('holds the title and both toggles', () => {
    const { result } = renderHook(() => useImportDraft([UNCATEGORIZED], PROCESSING))

    act(() => result.current.setTitle('A Title'))
    act(() => result.current.setSegEnabled(false))
    act(() => result.current.setChapterDetect(false))

    expect(result.current.title).toBe('A Title')
    expect(result.current.segEnabled).toBe(false)
    expect(result.current.chapterDetect).toBe(false)
  })
})
