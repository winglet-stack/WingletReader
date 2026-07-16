import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import NumericInput from '../components/NumericInput'

afterEach(cleanup)

describe('NumericInput', () => {
  it('keeps an editable draft while replacing the leading digit', () => {
    const onCommit = vi.fn()
    render(
      <NumericInput
        value={60}
        min={10}
        max={1200}
        onCommit={onCommit}
        ariaLabel="BPM value"
      />
    )

    const input = screen.getByRole('spinbutton', { name: 'BPM value' }) as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '0' } })

    expect(input.value).toBe('0')
    expect(onCommit).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: '120' } })
    expect(onCommit).toHaveBeenLastCalledWith(120)
  })

  it('commits the current draft on blur', () => {
    const onCommit = vi.fn()
    render(
      <NumericInput
        value={60}
        min={10}
        max={1200}
        onCommit={onCommit}
        ariaLabel="BPM value"
      />
    )

    const input = screen.getByRole('spinbutton', { name: 'BPM value' }) as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '5' } })
    fireEvent.blur(input)

    expect(onCommit).toHaveBeenLastCalledWith(10)
    expect(input.value).toBe('10')
  })
})
