/** @vitest-environment happy-dom */

import { renderHook, act, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTextPaging } from '../useTextPaging'
import { useTextWordIndex } from '../../hooks/useWordIndex'
import * as wordHighlight from '../wordHighlight'

const words = (count: number, prefix: string) =>
  Array.from({ length: count }, (_, i) => `${prefix}${i}`).join(' ')

const THREE_PAGE_TEXT = [
  words(300, 'a'),
  words(300, 'b'),
  words(300, 'c'),
].join('\n\n')

const SINGLE_PAGE_TEXT = 'alpha beta gamma'

/**
 * Paging over the word index, as the Reader composes them
 * (`architecture-depth/08`): `useTextWordIndex` owns the deferred whole-book
 * walk, `useTextPaging` owns the Page state on top of it. The two are rendered
 * together here so every case below — including the OL-1 deferral ones — reads
 * exactly as it did when one hook did both jobs.
 */
function renderPaging(displayContent = THREE_PAGE_TEXT, currentWordOffset = 0, active = true) {
  return renderHook(
    ({ content, offset, isActive }) => useTextPaging(useTextWordIndex(content, isActive), offset),
    { initialProps: { content: displayContent, offset: currentWordOffset, isActive: active } }
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('useTextPaging', () => {
  it('attaches to the playhead page', () => {
    const { result, rerender } = renderPaging(THREE_PAGE_TEXT, 0)

    expect(result.current.totalWords).toBe(900)
    expect(result.current.totalPages).toBe(3)
    expect(result.current.pageStarts).toEqual([0, 300, 600])
    expect(result.current.currentPage).toBe(0)
    expect(result.current.detached).toBe(false)
    expect(result.current.currentRange).toEqual({ startWord: 0, endWord: 300 })

    rerender({ content: THREE_PAGE_TEXT, offset: 305, isActive: true })

    expect(result.current.currentPage).toBe(1)
    expect(result.current.detached).toBe(false)
    expect(result.current.currentRange).toEqual({ startWord: 300, endWord: 600 })
  })

  it('goPrev and goNext detach and clamp at bounds', () => {
    const { result } = renderPaging(THREE_PAGE_TEXT, 0)

    act(() => result.current.goPrev())
    expect(result.current.currentPage).toBe(0)
    expect(result.current.detached).toBe(false)
    expect(result.current.canBack).toBe(false)

    act(() => result.current.goNext())
    expect(result.current.currentPage).toBe(1)
    expect(result.current.detached).toBe(true)
    expect(result.current.canBack).toBe(true)
    expect(result.current.canForward).toBe(true)

    act(() => result.current.goNext())
    expect(result.current.currentPage).toBe(2)
    expect(result.current.detached).toBe(true)
    expect(result.current.canForward).toBe(false)

    act(() => result.current.goNext())
    expect(result.current.currentPage).toBe(2)
    expect(result.current.detached).toBe(true)
  })

  it('re-attaches when the playhead advances into the viewed page', () => {
    const { result, rerender } = renderPaging(THREE_PAGE_TEXT, 0)

    act(() => result.current.goNext())
    expect(result.current.currentPage).toBe(1)
    expect(result.current.detached).toBe(true)

    rerender({ content: THREE_PAGE_TEXT, offset: 305, isActive: true })

    expect(result.current.currentPage).toBe(1)
    expect(result.current.detached).toBe(false)

    rerender({ content: THREE_PAGE_TEXT, offset: 610, isActive: true })
    expect(result.current.currentPage).toBe(2)
    expect(result.current.detached).toBe(false)
  })

  it('locate clears the detached override', () => {
    const { result } = renderPaging(THREE_PAGE_TEXT, 0)

    act(() => result.current.goNext())
    expect(result.current.currentPage).toBe(1)
    expect(result.current.detached).toBe(true)

    act(() => result.current.locate())
    expect(result.current.currentPage).toBe(0)
    expect(result.current.detached).toBe(false)
  })

  it('resets when displayContent changes', () => {
    const { result, rerender } = renderPaging(THREE_PAGE_TEXT, 0)

    act(() => result.current.goNext())
    expect(result.current.currentPage).toBe(1)
    expect(result.current.detached).toBe(true)

    rerender({ content: SINGLE_PAGE_TEXT, offset: 0, isActive: true })

    expect(result.current.totalWords).toBe(3)
    expect(result.current.totalPages).toBe(1)
    expect(result.current.currentPage).toBe(0)
    expect(result.current.detached).toBe(false)
    expect(result.current.currentRange).toEqual({ startWord: 0, endWord: 3 })
  })

  it('memoizes the scan on displayContent only, never on wordOffset', () => {
    // OL-1: one unified scan pass, keyed on displayContent + the compute latch —
    // never on the playhead offset (the ADR-0025 §1 anti-lag invariant).
    const scanSpy = vi.spyOn(wordHighlight, 'scanText')
    const { rerender } = renderPaging(THREE_PAGE_TEXT, 0)
    const scanCalls = scanSpy.mock.calls.length

    expect(scanCalls).toBeGreaterThan(0)

    rerender({ content: THREE_PAGE_TEXT, offset: 305, isActive: true })

    expect(scanSpy.mock.calls.length).toBe(scanCalls)
  })

  it('walks the book exactly once, however many lookups the page state makes', () => {
    // OL-1 unification, now enforced structurally: the only walk in the tree is
    // the index's, and paging asks it questions rather than re-scanning. The
    // one-shot helpers that used to walk independently no longer exist.
    const scanSpy = vi.spyOn(wordHighlight, 'scanText')

    const { result } = renderPaging(THREE_PAGE_TEXT, 0)
    act(() => result.current.goNext())
    act(() => result.current.locate())

    expect(scanSpy).toHaveBeenCalledTimes(1)
  })

  it('defers the scan off the engage frame until the view is active (OL-1)', () => {
    const scanSpy = vi.spyOn(wordHighlight, 'scanText')

    // Engaged into RSVP: the Text view is never opened, so nothing tokenizes.
    const { result, rerender } = renderPaging(THREE_PAGE_TEXT, 0, false)
    expect(scanSpy).not.toHaveBeenCalled()
    // A deferred text reports an empty single Page, never a stale/partial scan.
    expect(result.current.totalWords).toBe(0)
    expect(result.current.totalPages).toBe(1)
    expect(result.current.pageStarts).toEqual([0])

    // Playback advancing the offset while still in RSVP must not trigger a scan.
    rerender({ content: THREE_PAGE_TEXT, offset: 305, isActive: false })
    expect(scanSpy).not.toHaveBeenCalled()

    // Entering the plain Text view computes it once, on the spot.
    rerender({ content: THREE_PAGE_TEXT, offset: 305, isActive: true })
    expect(scanSpy).toHaveBeenCalledTimes(1)
    expect(result.current.totalWords).toBe(900)
    expect(result.current.totalPages).toBe(3)
    expect(result.current.pageStarts).toEqual([0, 300, 600])
  })

  it('stays computed when toggling back to RSVP, and rescans only on text change', () => {
    const scanSpy = vi.spyOn(wordHighlight, 'scanText')
    const { rerender } = renderPaging(THREE_PAGE_TEXT, 0, true)
    expect(scanSpy).toHaveBeenCalledTimes(1)

    // Toggle back to RSVP then into the view again: sticky latch, no re-scan.
    rerender({ content: THREE_PAGE_TEXT, offset: 0, isActive: false })
    rerender({ content: THREE_PAGE_TEXT, offset: 0, isActive: true })
    expect(scanSpy).toHaveBeenCalledTimes(1)

    // A new text engaged straight into RSVP resets the latch and does NOT scan.
    rerender({ content: SINGLE_PAGE_TEXT, offset: 0, isActive: false })
    expect(scanSpy).toHaveBeenCalledTimes(1)
  })
})
