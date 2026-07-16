import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react'
import SettingToggleRow from '../components/SettingToggleRow'

afterEach(() => {
  cleanup()
})

describe('SettingToggleRow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the label and a help trigger for the hint', () => {
    render(
      <SettingToggleRow
        label="Auto-segment long texts"
        hint="Split imported texts into chapters"
        checked={false}
        onChange={() => {}}
      />
    )
    expect(screen.getByText('Auto-segment long texts')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Help: Auto-segment long texts' })).toBeTruthy()
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('reveals the hint in a tooltip after hover delay', () => {
    render(
      <SettingToggleRow
        label="Auto-segment long texts"
        hint="Split imported texts into chapters"
        checked={false}
        onChange={() => {}}
      />
    )
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Help: Auto-segment long texts' }))
    act(() => {
      vi.advanceTimersByTime(150)
    })
    expect(screen.getByRole('tooltip').textContent).toBe('Split imported texts into chapters')
  })

  it('renders inline feedback when provided', () => {
    render(
      <SettingToggleRow
        label="Speed"
        feedback="300 wpm at current stack size"
        checked={false}
        onChange={() => {}}
      />
    )
    expect(screen.getByText('300 wpm at current stack size')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Help:/ })).toBeNull()
  })

  it('omits the help trigger when no hint is given', () => {
    const { container } = render(
      <SettingToggleRow label="Enable" checked={false} onChange={() => {}} />
    )
    expect(container.querySelector('.settings-help-trigger')).toBeNull()
    expect(container.querySelector('.settings-hint--feedback')).toBeNull()
  })

  it('reflects the checked prop', () => {
    render(<SettingToggleRow label="On" checked={true} onChange={() => {}} />)
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true)
  })

  it('fires onChange with the new checked value', () => {
    const onChange = vi.fn()
    render(<SettingToggleRow label="Toggle" checked={false} onChange={onChange} />)
    fireEvent.click(screen.getByRole('checkbox'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('honours the disabled prop', () => {
    const onChange = vi.fn()
    render(
      <SettingToggleRow label="Off" checked={false} onChange={onChange} disabled />
    )
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement
    expect(checkbox.disabled).toBe(true)
    fireEvent.click(checkbox)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('applies an aria-label when provided', () => {
    render(
      <SettingToggleRow
        label="X"
        checked={false}
        onChange={() => {}}
        ariaLabel="enable feature"
      />
    )
    expect(screen.getByLabelText('enable feature')).toBeTruthy()
  })

  it('renders the expected DOM structure', () => {
    const { container } = render(
      <SettingToggleRow label="X" hint="h" checked={false} onChange={() => {}} />
    )
    expect(container.querySelector('.settings-row .settings-label .settings-help-trigger')).toBeTruthy()
    expect(
      container.querySelector('.settings-control .toggle input[type="checkbox"]')
    ).toBeTruthy()
    expect(container.querySelector('.toggle .toggle-track')).toBeTruthy()
  })
})
