/**
 * Corner controls — HomeControl (dove TL) and GearControl (gear TR).
 *
 * Covers the persistent Home dove and Settings gear: click handlers, mark
 * rendering, and accessible names.
 */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HomeControl from '../components/shell/HomeControl'
import UpLevelControl from '../components/shell/UpLevelControl'
import GearControl from '../components/shell/GearControl'

describe('HomeControl', () => {
  afterEach(cleanup)

  it('renders a Go to home button with the dove mark', () => {
    render(<HomeControl onNavigateHome={vi.fn()} />)
    const btn = screen.getByRole('button', { name: 'Go to home' })
    expect(btn).toBeTruthy()
    expect(btn.querySelector('.home-control-dove')).toBeTruthy()
  })

  it('calls onNavigateHome when clicked', async () => {
    const user = userEvent.setup()
    const onNavigateHome = vi.fn()
    render(<HomeControl onNavigateHome={onNavigateHome} />)
    await user.click(screen.getByRole('button', { name: 'Go to home' }))
    expect(onNavigateHome).toHaveBeenCalledOnce()
  })
})

describe('UpLevelControl', () => {
  afterEach(cleanup)

  it('renders a configured button with the distinct up-level sprite', () => {
    render(<UpLevelControl onNavigateUp={vi.fn()} label="Back to Settings" />)
    const btn = screen.getByRole('button', { name: 'Back to Settings' })
    expect(btn).toBeTruthy()
    expect(btn.getAttribute('title')).toBe('Back to Settings')
    expect(btn.querySelector('.up-level-control-sprite')).toBeTruthy()
    expect(btn.querySelector('.home-control-dove')).toBeNull()
  })

  it('uses a custom title when provided', () => {
    render(
      <UpLevelControl
        onNavigateUp={vi.fn()}
        label="Back to library"
        title="Back to library"
      />
    )
    expect(screen.getByRole('button', { name: 'Back to library' }).getAttribute('title'))
      .toBe('Back to library')
  })

  it('calls onNavigateUp when clicked', async () => {
    const user = userEvent.setup()
    const onNavigateUp = vi.fn()
    render(<UpLevelControl onNavigateUp={onNavigateUp} label="Back to Settings" />)
    await user.click(screen.getByRole('button', { name: 'Back to Settings' }))
    expect(onNavigateUp).toHaveBeenCalledOnce()
  })
})

describe('GearControl', () => {
  afterEach(cleanup)

  it('renders an Open Settings button with the gear-control class', () => {
    render(<GearControl onOpenSettings={vi.fn()} />)
    const btn = screen.getByRole('button', { name: 'Open Settings' })
    expect(btn).toBeTruthy()
    expect(btn.className).toContain('gear-control')
  })

  it('calls onOpenSettings when clicked', async () => {
    const user = userEvent.setup()
    const onOpenSettings = vi.fn()
    render(<GearControl onOpenSettings={onOpenSettings} />)
    await user.click(screen.getByRole('button', { name: 'Open Settings' }))
    expect(onOpenSettings).toHaveBeenCalledOnce()
  })
})
