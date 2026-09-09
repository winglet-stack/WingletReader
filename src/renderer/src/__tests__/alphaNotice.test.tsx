/**
 * `AlphaNotice` — the shared `.warnings-box` mechanism behind all four alpha
 * warning banners (PRD `release-0.2.1-alpha-1` D6). `TransmuteView`'s own
 * banner assertions live in `transmuteView.test.tsx` and stay unmodified;
 * this file covers the component in isolation.
 *
 * Environment: happy-dom (matched by vitest.config.ts environmentMatchGlobs).
 */
import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import AlphaNotice from '../components/AlphaNotice'

afterEach(cleanup)

describe('AlphaNotice', () => {
  it('renders nothing when disabled', () => {
    const { container } = render(
      <AlphaNotice enabled={false} label="Some experimental warning">
        Copy that should not appear.
      </AlphaNotice>
    )

    expect(container.firstChild).toBeNull()
    expect(screen.queryByText('Copy that should not appear.')).toBeNull()
  })

  it('renders the status region with the caller-supplied label and copy when enabled', () => {
    render(
      <AlphaNotice enabled label="Some experimental warning">
        Copy that should appear.
      </AlphaNotice>
    )

    const banner = screen.getByRole('status', { name: 'Some experimental warning' })
    expect(banner.textContent).toBe('Copy that should appear.')
    expect(banner.className).toBe('warnings-box')
  })

  it('has no dismiss affordance', () => {
    render(
      <AlphaNotice enabled label="Some experimental warning">
        Copy.
      </AlphaNotice>
    )

    expect(screen.getByRole('status').querySelector('button')).toBeNull()
  })

  it('applies caller-supplied style as a call-site spacing concern', () => {
    render(
      <AlphaNotice enabled label="Some experimental warning" style={{ marginBottom: '12px' }}>
        Copy.
      </AlphaNotice>
    )

    expect(screen.getByRole('status').style.marginBottom).toBe('12px')
  })
})
