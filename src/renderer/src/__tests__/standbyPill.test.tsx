import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import StandbyPill from '../components/StandbyPill'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.documentElement.className = ''
  document.body.className = ''
})

function stubApi(theme: 'dark' | 'light' = 'dark') {
  const api = {
    db: {
      getSettings: vi.fn().mockResolvedValue({ theme })
    },
    readWhileWorking: {
      exit: vi.fn().mockResolvedValue({ ok: true })
    }
  }
  vi.stubGlobal('api', api)
  return api
}

describe('StandbyPill', () => {
  it('renders the standby label and exits Overlay Reader on click', async () => {
    const api = stubApi()

    render(<StandbyPill />)

    expect(screen.getByLabelText('Overlay Reader standby control')).toBeTruthy()
    expect(screen.getByText('Overlay Reader')).toBeTruthy()
    expect(screen.getByText('On standby')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Exit Overlay Reader' }))

    expect(api.readWhileWorking.exit).toHaveBeenCalledOnce()
  })

  it('uses the light identity asset when settings are light themed', async () => {
    stubApi('light')

    render(<StandbyPill />)

    await waitFor(() => {
      expect(document.querySelector('.standby-pill')?.getAttribute('data-theme')).toBe('light')
    })
    expect(document.querySelector('.standby-pill__mark')?.getAttribute('src')).toBe('/logo-on-light.png')
  })
})
