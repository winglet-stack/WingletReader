import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import SettingHintTrigger from '../components/settings/SettingHintTrigger'

afterEach(() => {
  cleanup()
})

describe('SettingHintTrigger', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the tooltip after the hover delay', () => {
    render(<SettingHintTrigger settingLabel="Speed" text="Adjust reading speed in BPM" />)
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Help: Speed' }))
    expect(screen.queryByRole('tooltip')).toBeNull()
    act(() => {
      vi.advanceTimersByTime(150)
    })
    expect(screen.getByRole('tooltip').textContent).toBe('Adjust reading speed in BPM')
  })

  it('hides the tooltip when the pointer leaves', () => {
    render(<SettingHintTrigger settingLabel="Speed" text="Adjust reading speed in BPM" />)
    const trigger = screen.getByRole('button', { name: 'Help: Speed' })
    fireEvent.mouseEnter(trigger)
    act(() => {
      vi.advanceTimersByTime(150)
    })
    fireEvent.mouseLeave(trigger.parentElement!)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})
