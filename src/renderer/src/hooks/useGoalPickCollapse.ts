import type React from 'react'
import { useLayoutEffect, useRef, useState } from 'react'
import { shouldCollapseGoalPickPopover } from '../engine/bookmarkPopoverModel'

const FULL_POPOVER_WIDTH_FALLBACK = 300

export interface GoalPickCollapseOptions {
  open: boolean
  goalAwaitingPick: boolean
  /** The plain-text view's glyph box, when the Text view is mounted. */
  plainTextContentRef?: React.MutableRefObject<HTMLPreElement | null>
  wrapRef: React.RefObject<HTMLDivElement>
  popoverRef: React.RefObject<HTMLDivElement>
}

function measuredWidth(element: Element | null): number {
  return element?.getBoundingClientRect().width ?? 0
}

function paddingRightOf(element: Element): number {
  return Number.parseFloat(window.getComputedStyle(element).paddingRight) || 0
}

/** Re-measures on element resize and window resize; returns the teardown. */
function observeResize(
  elements: Array<Element | null | undefined>,
  onResize: () => void
): () => void {
  const targets = elements.filter((element): element is Element => Boolean(element))
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(onResize) : null
  targets.forEach((element) => observer?.observe(element))
  window.addEventListener('resize', onResize)

  return () => {
    observer?.disconnect()
    window.removeEventListener('resize', onResize)
  }
}

/**
 * While a Target pick is armed, the popover must not cover the words the user is
 * being asked to click. When the full popover would overlap the glyph box it
 * collapses to its Cancel strip; the last full width is remembered so the
 * measurement stays stable once collapsed.
 */
export function useGoalPickCollapse({
  open,
  goalAwaitingPick,
  plainTextContentRef,
  wrapRef,
  popoverRef,
}: GoalPickCollapseOptions): boolean {
  const [collapsed, setCollapsed] = useState(false)
  const fullPopoverWidthRef = useRef(FULL_POPOVER_WIDTH_FALLBACK)

  useLayoutEffect(() => {
    const measure = () => {
      const textContentEl = plainTextContentRef?.current
      const wrapEl = wrapRef.current
      if (!open || !goalAwaitingPick || !textContentEl || !wrapEl) {
        setCollapsed(false)
        return
      }

      const livePopoverWidth = measuredWidth(popoverRef.current)
      if (!collapsed && livePopoverWidth > 0) {
        fullPopoverWidthRef.current = livePopoverWidth
      }

      setCollapsed(
        shouldCollapseGoalPickPopover({
          textRight: textContentEl.getBoundingClientRect().right,
          textPaddingRight: paddingRightOf(textContentEl),
          wrapRight: wrapEl.getBoundingClientRect().right,
          popoverWidth: fullPopoverWidthRef.current,
        })
      )
    }

    measure()

    if (!open || !goalAwaitingPick) return

    return observeResize([plainTextContentRef?.current, wrapRef.current, popoverRef.current], measure)
  }, [collapsed, goalAwaitingPick, open, plainTextContentRef, popoverRef, wrapRef])

  return collapsed
}
