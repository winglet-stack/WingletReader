import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ErrorBoundary, { MAIN_PROCESS_LOG_PATH } from '../ErrorBoundary'

function BrokenRender(): JSX.Element {
  throw new Error('render failed')
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
  it('renders the recovery screen when a child render throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ErrorBoundary>
        <BrokenRender />
      </ErrorBoundary>
    )

    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy()
    expect(screen.getByText(MAIN_PROCESS_LOG_PATH)).toBeTruthy()
  })

  it('reloads when the recovery button is clicked', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const reload = vi.fn()

    render(
      <ErrorBoundary reload={reload}>
        <BrokenRender />
      </ErrorBoundary>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))

    expect(reload).toHaveBeenCalledOnce()
  })
})
