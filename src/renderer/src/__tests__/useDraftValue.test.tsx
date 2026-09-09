/**
 * Unit tests for `useDraftValue` (issue 03) — the controlled numeric draft state
 * shared by the three numeric instruments (`NumericInput`, `SliderField`,
 * `Stepper`). The behaviours pinned here are the ones each instrument used to
 * own its own copy of: the focus guard, the external-value resync, blur-commit,
 * Enter-commit and Escape-revert.
 *
 * Environment: happy-dom (vitest.config.ts environmentMatchGlobs).
 */

import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { useDraftValue } from '../hooks/useDraftValue'

afterEach(cleanup)

function Harness({ value, commit }: { value: number; commit: (raw: string) => void }) {
  const { draft, setDraft, onFocus, onBlur, onKeyDown } = useDraftValue(value, commit)
  return (
    <input
      aria-label="Draft"
      value={draft}
      onFocus={onFocus}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    />
  )
}

const box = () => screen.getByRole('textbox', { name: 'Draft' }) as HTMLInputElement

describe('useDraftValue', () => {
  it('seeds the draft from the incoming value', () => {
    render(<Harness value={60} commit={vi.fn()} />)
    expect(box().value).toBe('60')
  })

  it('mirrors an external value change while the box is unfocused', () => {
    const { rerender } = render(<Harness value={60} commit={vi.fn()} />)
    rerender(<Harness value={90} commit={vi.fn()} />)
    expect(box().value).toBe('90')
  })

  it('does not clobber an in-flight edit while the box is focused', () => {
    const { rerender } = render(<Harness value={60} commit={vi.fn()} />)
    fireEvent.focus(box())
    fireEvent.change(box(), { target: { value: '7' } })

    rerender(<Harness value={90} commit={vi.fn()} />)
    expect(box().value).toBe('7')
  })

  it('commits the raw draft on blur', () => {
    const commit = vi.fn()
    render(<Harness value={60} commit={commit} />)
    fireEvent.focus(box())
    fireEvent.change(box(), { target: { value: '7' } })
    fireEvent.blur(box())

    expect(commit).toHaveBeenCalledWith('7')
  })

  it('releases the focus guard on blur so later value changes resync', () => {
    const { rerender } = render(<Harness value={60} commit={vi.fn()} />)
    fireEvent.focus(box())
    fireEvent.change(box(), { target: { value: '7' } })
    fireEvent.blur(box())

    rerender(<Harness value={90} commit={vi.fn()} />)
    expect(box().value).toBe('90')
  })

  it('commits on Enter by blurring the field', () => {
    render(<Harness value={60} commit={vi.fn()} />)
    const input = box()
    const blurSpy = vi.spyOn(input, 'blur')

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '7' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(blurSpy).toHaveBeenCalled()
  })

  it('reverts the draft to the current value on Escape, then blurs', () => {
    render(<Harness value={60} commit={vi.fn()} />)
    const input = box()
    const blurSpy = vi.spyOn(input, 'blur')

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '7' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(input.value).toBe('60')
    expect(blurSpy).toHaveBeenCalled()
  })

  it('ignores other keys', () => {
    render(<Harness value={60} commit={vi.fn()} />)
    const input = box()
    const blurSpy = vi.spyOn(input, 'blur')

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '7' } })
    fireEvent.keyDown(input, { key: 'a' })

    expect(input.value).toBe('7')
    expect(blurSpy).not.toHaveBeenCalled()
  })
})
