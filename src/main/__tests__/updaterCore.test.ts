import { describe, expect, it, vi } from 'vitest'
import {
  runStartupUpdateCheck,
  type AutoUpdaterLike,
  type UpdaterLogger
} from '../updaterCore'

function makeUpdater(): AutoUpdaterLike {
  return {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    allowPrerelease: false,
    checkForUpdates: vi.fn(() => Promise.resolve(null))
  }
}

function makeLogger(): UpdaterLogger {
  return {
    info: vi.fn(),
    warn: vi.fn()
  }
}

describe('runStartupUpdateCheck', () => {
  it('skips updater calls outside packaged builds', async () => {
    const updater = makeUpdater()
    const logger = makeLogger()

    const result = await runStartupUpdateCheck({ isPackaged: false, portable: false, updater, logger })

    expect(result).toEqual({ checked: false })
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
    expect(updater.autoDownload).toBe(false)
    expect(updater.autoInstallOnAppQuit).toBe(false)
    expect(updater.allowPrerelease).toBe(false)
  })

  it('skips updater calls in portable mode even when packaged', async () => {
    const updater = makeUpdater()
    const logger = makeLogger()

    const result = await runStartupUpdateCheck({ isPackaged: true, portable: true, updater, logger })

    expect(result).toEqual({ checked: false })
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
    expect(updater.autoDownload).toBe(false)
    expect(updater.autoInstallOnAppQuit).toBe(false)
    expect(updater.allowPrerelease).toBe(false)
    expect(logger.info).toHaveBeenCalledWith('Skipping auto-update check in portable mode.')
  })

  it('configures silent download and install-on-quit in packaged builds', async () => {
    const updater = makeUpdater()

    const result = await runStartupUpdateCheck({
      isPackaged: true,
      portable: false,
      updater,
      logger: makeLogger()
    })

    expect(result).toEqual({ checked: true })
    expect(updater.autoDownload).toBe(true)
    expect(updater.autoInstallOnAppQuit).toBe(true)
    expect(updater.allowPrerelease).toBe(true)
    expect(updater.checkForUpdates).toHaveBeenCalledOnce()
  })

  it('logs updater failures without throwing', async () => {
    const error = new Error('network unavailable')
    const updater = makeUpdater()
    const logger = makeLogger()
    vi.mocked(updater.checkForUpdates).mockRejectedValueOnce(error)

    const result = await runStartupUpdateCheck({ isPackaged: true, portable: false, updater, logger })

    expect(result).toEqual({ checked: false })
    expect(logger.warn).toHaveBeenCalledWith(
      'Auto-update check failed; continuing startup.',
      error
    )
  })
})
