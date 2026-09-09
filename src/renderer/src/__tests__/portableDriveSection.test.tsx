/**
 * PortableDriveSection — Settings → Data "Create Portable Drive" action
 * (ADR-0016 §3, slice 07). Drives the slice-06 provisioning IPC: native folder
 * picker → assembly → inline progress/success/error. Success guidance must echo
 * the on-stick README (launch WingletReader.cmd, one-time SmartScreen, safe eject)
 * and the UI must never claim success on a failed provision.
 *
 * Environment: happy-dom (matched by vitest.config.ts environmentMatchGlobs).
 */
import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import PortableDriveSection from '../components/settings/PortableDriveSection'
import { alphaChrome } from '../alphaChrome'

afterEach(cleanup)

let selectPortableTarget: ReturnType<typeof vi.fn>
let createPortableDrive: ReturnType<typeof vi.fn>

beforeEach(() => {
  selectPortableTarget = vi.fn()
  createPortableDrive = vi.fn()
  vi.stubGlobal('api', {
    data: { selectPortableTarget, createPortableDrive }
  })
})

describe('PortableDriveSection', () => {
  it('shows the experimental warning above the create-drive action (PRD D6)', () => {
    render(<PortableDriveSection />)

    const banner = screen.getByRole('status', { name: 'Portable drive experimental warning' })
    expect(banner.textContent).toBe(alphaChrome.portableExperimentalBannerCopy)

    const createButton = screen.getByRole('button', { name: /create portable drive/i })
    expect(
      banner.compareDocumentPosition(createButton) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('picks a folder, provisions, and shows the launcher guidance with the target path', async () => {
    selectPortableTarget.mockResolvedValue({ canceled: false, targetPath: 'E:\\Stick' })
    createPortableDrive.mockResolvedValue({
      ok: true,
      targetPath: 'E:\\Stick',
      launcherPath: 'E:\\Stick\\WingletReader.cmd',
      dataPath: 'E:\\Stick\\app\\data\\fasttrack-data.json'
    })

    render(<PortableDriveSection />)
    fireEvent.click(screen.getByRole('button', { name: /create portable drive/i }))

    expect(await screen.findByText(/portable drive ready/i)).toBeTruthy()
    expect(createPortableDrive).toHaveBeenCalledWith('E:\\Stick')
    expect(screen.getByText('E:\\Stick')).toBeTruthy()
    // README-consistent guidance: launcher, one-time SmartScreen, safe eject.
    expect(screen.getByText(/WingletReader\.cmd/)).toBeTruthy()
    expect(screen.getByText(/SmartScreen/i)).toBeTruthy()
    expect(screen.getByText(/before ejecting/i)).toBeTruthy()
  })

  it('does not provision when the folder picker is cancelled', async () => {
    selectPortableTarget.mockResolvedValue({ canceled: true })

    render(<PortableDriveSection />)
    fireEvent.click(screen.getByRole('button', { name: /create portable drive/i }))

    await waitFor(() => expect(selectPortableTarget).toHaveBeenCalledTimes(1))
    expect(createPortableDrive).not.toHaveBeenCalled()
    expect(screen.queryByText(/portable drive ready/i)).toBeNull()
  })

  it('surfaces a typed provisioning error and never claims success', async () => {
    selectPortableTarget.mockResolvedValue({ canceled: false, targetPath: 'E:\\Stick' })
    createPortableDrive.mockResolvedValue({
      ok: false,
      error: {
        code: 'insufficient-space',
        message: 'There is not enough free space for a portable WingletReader copy.',
        detail: 'needs 500 MB'
      }
    })

    render(<PortableDriveSection />)
    fireEvent.click(screen.getByRole('button', { name: /create portable drive/i }))

    expect(await screen.findByText(/not enough free space/i)).toBeTruthy()
    expect(screen.getByText(/needs 500 MB/)).toBeTruthy()
    expect(screen.queryByText(/portable drive ready/i)).toBeNull()
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('treats a rejected provisioning promise as a failure, not success', async () => {
    selectPortableTarget.mockResolvedValue({ canceled: false, targetPath: 'E:\\Stick' })
    createPortableDrive.mockRejectedValue(new Error('IPC blew up'))

    render(<PortableDriveSection />)
    fireEvent.click(screen.getByRole('button', { name: /create portable drive/i }))

    expect(await screen.findByText(/could not be completed/i)).toBeTruthy()
    expect(screen.queryByText(/portable drive ready/i)).toBeNull()
  })
})
