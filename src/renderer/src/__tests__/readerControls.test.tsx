import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ReaderControls from '../components/reader/ReaderControls'

afterEach(() => {
  cleanup()
})

const baseProps = {
  playState: 'idle' as const,
  currentIndex: 0,
  stacksLength: 10,
  hasSavedIndex: false,
  resumePct: null,
  countdownActive: false,
  onRestart: vi.fn(),
  onRewind: vi.fn(),
  onPause: vi.fn(),
  onResume: vi.fn(),
  onResumeSaved: vi.fn(),
  onPlay: vi.fn(),
  onSkipForward: vi.fn(),
  onStop: vi.fn(),
  utilities: <button type="button">Utilities</button>,
}

describe('ReaderControls', () => {
  it('renders the default playback transport and empty left spacer', () => {
    const { container } = render(<ReaderControls {...baseProps} />)

    expect(container.querySelector('.reader-controls-spacer')).not.toBeNull()
    expect(screen.getByRole('toolbar', { name: 'Playback controls' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Restart' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Rewind' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Skip forward' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy()
    expect(container.querySelector('.reader-controls-utilities')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Utilities' })).toBeTruthy()
  })

  it('replaces the left spacer and playback transport when slots are provided', () => {
    const { container } = render(
      <ReaderControls
        {...baseProps}
        leftSlot={<button type="button" className="reader-browse-btn" data-testid="reader-left-slot">Browse slot</button>}
        transport={<div data-testid="reader-transport-slot">Text transport</div>}
      />,
    )

    expect(container.querySelector('.reader-controls-spacer')).toBeNull()
    expect(screen.queryByRole('toolbar', { name: 'Playback controls' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Restart' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Rewind' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Skip forward' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull()
    expect(screen.getByTestId('reader-left-slot')).toBeTruthy()
    expect(screen.getByTestId('reader-left-slot').closest('.reader-controls')).toBeTruthy()
    expect(screen.getByTestId('reader-transport-slot')).toBeTruthy()
    expect(container.querySelector('.reader-controls-utilities')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Utilities' })).toBeTruthy()
  })
})
