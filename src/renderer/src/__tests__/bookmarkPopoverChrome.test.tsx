/**
 * Unit tests for the popover's chrome hooks (issue 05): `useGoalPickCollapse`,
 * which keeps an armed Target pick from covering the words being picked, and
 * `useOutsideDismiss`, the click-away close. Both were inline effects in
 * `BookmarkPopover`.
 *
 * Environment: happy-dom (vitest.config.ts environmentMatchGlobs).
 */

import React, { useRef } from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { useGoalPickCollapse } from '../hooks/useGoalPickCollapse'
import { useOutsideDismiss } from '../hooks/useOutsideDismiss'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function domRect(left: number, right: number): DOMRect {
  return {
    x: left,
    y: 0,
    left,
    right,
    top: 0,
    bottom: 100,
    width: right - left,
    height: 100,
    toJSON: () => ({}),
  } as DOMRect
}

/** Mirrors the live geometry: a text column, the popover wrap, and the popover. */
function installLayout({
  textRight,
  paddingRight,
  wrapRight = 808,
  fullPopoverWidth = 300,
  collapsedPopoverWidth = 112,
}: {
  textRight: number
  paddingRight: number
  wrapRight?: number
  fullPopoverWidth?: number
  collapsedPopoverWidth?: number
}) {
  const layout = { textRight, paddingRight, wrapRight, fullPopoverWidth, collapsedPopoverWidth }
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('plain-text-content')) return domRect(100, layout.textRight)
    if (this.classList.contains('bookmark-popover-wrap')) {
      return domRect(layout.wrapRight - 48, layout.wrapRight)
    }
    if (this.classList.contains('bookmark-popover')) {
      const width = this.classList.contains('bookmark-popover--collapsed')
        ? layout.collapsedPopoverWidth
        : layout.fullPopoverWidth
      return domRect(layout.wrapRight - width, layout.wrapRight)
    }
    return domRect(0, 0)
  })

  const realGetComputedStyle = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el, pseudoElt) => {
    const style = realGetComputedStyle(el, pseudoElt)
    if (!(el as Element).classList.contains('plain-text-content')) return style
    return new Proxy(style, {
      get(target, prop, receiver) {
        if (prop === 'paddingRight') return `${layout.paddingRight}px`
        return Reflect.get(target, prop, receiver)
      },
    })
  })

  return {
    setLayout(patch: Partial<typeof layout>) {
      Object.assign(layout, patch)
    },
  }
}

function CollapseHarness({
  open = true,
  goalAwaitingPick = true,
  withText = true,
}: {
  open?: boolean
  goalAwaitingPick?: boolean
  withText?: boolean
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLPreElement>(null)
  const collapsed = useGoalPickCollapse({
    open,
    goalAwaitingPick,
    plainTextContentRef: withText ? textRef : undefined,
    wrapRef,
    popoverRef,
  })

  return (
    <div>
      <pre className="plain-text-content" ref={textRef}>
        one two three
      </pre>
      <div className="bookmark-popover-wrap" ref={wrapRef}>
        {open && (
          <div
            className={`bookmark-popover${collapsed ? ' bookmark-popover--collapsed' : ''}`}
            ref={popoverRef}
          >
            popover
          </div>
        )}
      </div>
      <span data-testid="collapsed">{String(collapsed)}</span>
    </div>
  )
}

const collapsed = () => screen.getByTestId('collapsed').textContent

describe('useGoalPickCollapse', () => {
  it('collapses while armed when the full popover would cover words', () => {
    installLayout({ textRight: 620, paddingRight: 56 })
    render(<CollapseHarness />)

    expect(collapsed()).toBe('true')
  })

  it('stays expanded when only the text padding gutter overlaps', () => {
    installLayout({ textRight: 560, paddingRight: 80 })
    render(<CollapseHarness />)

    expect(collapsed()).toBe('false')
  })

  it('never collapses when no pick is armed', () => {
    installLayout({ textRight: 620, paddingRight: 56 })
    render(<CollapseHarness goalAwaitingPick={false} />)

    expect(collapsed()).toBe('false')
  })

  it('never collapses while the popover is closed', () => {
    installLayout({ textRight: 620, paddingRight: 56 })
    render(<CollapseHarness open={false} />)

    expect(collapsed()).toBe('false')
  })

  it('stays expanded without a mounted text view to cover', () => {
    installLayout({ textRight: 620, paddingRight: 56 })
    render(<CollapseHarness withText={false} />)

    expect(collapsed()).toBe('false')
  })

  it('re-measures on window resize, in both directions', () => {
    const layout = installLayout({ textRight: 620, paddingRight: 56 })
    render(<CollapseHarness />)
    expect(collapsed()).toBe('true')

    act(() => {
      layout.setLayout({ textRight: 500 })
      window.dispatchEvent(new Event('resize'))
    })
    expect(collapsed()).toBe('false')

    act(() => {
      layout.setLayout({ textRight: 620 })
      window.dispatchEvent(new Event('resize'))
    })
    expect(collapsed()).toBe('true')
  })

  it('expands again as soon as the pick is no longer awaited', () => {
    installLayout({ textRight: 620, paddingRight: 56 })
    const { rerender } = render(<CollapseHarness />)
    expect(collapsed()).toBe('true')

    act(() => { rerender(<CollapseHarness goalAwaitingPick={false} />) })
    expect(collapsed()).toBe('false')
  })
})

function DismissHarness({
  open = true,
  suppressed = false,
  onDismiss,
}: {
  open?: boolean
  suppressed?: boolean
  onDismiss: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  useOutsideDismiss({ open, containerRef, suppressed, onDismiss })

  return (
    <div>
      <div ref={containerRef}>
        <button>inside</button>
      </div>
      <button>outside</button>
    </div>
  )
}

describe('useOutsideDismiss', () => {
  it('dismisses on mousedown outside the container', () => {
    const onDismiss = vi.fn()
    render(<DismissHarness onDismiss={onDismiss} />)

    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('ignores mousedown inside the container', () => {
    const onDismiss = vi.fn()
    render(<DismissHarness onDismiss={onDismiss} />)

    fireEvent.mouseDown(screen.getByRole('button', { name: 'inside' }))
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('stays put while suppressed', () => {
    const onDismiss = vi.fn()
    render(<DismissHarness suppressed onDismiss={onDismiss} />)

    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }))
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('listens only while open', () => {
    const onDismiss = vi.fn()
    const { rerender } = render(<DismissHarness open={false} onDismiss={onDismiss} />)

    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }))
    expect(onDismiss).not.toHaveBeenCalled()

    rerender(<DismissHarness open onDismiss={onDismiss} />)
    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
