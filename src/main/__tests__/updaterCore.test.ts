import { describe, expect, it, vi } from 'vitest'
import {
  runStartupUpdateCheck,
  type AutoUpdaterLike,
  type UpdateCheckResultLike,
  type UpdaterLogger
} from '../updaterCore'

function makeUpdater(checkResult: UpdateCheckResultLike | null = null): AutoUpdaterLike {
  return {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    allowPrerelease: false,
    checkForUpdates: vi.fn(() => Promise.resolve(checkResult))
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

    const result = await runStartupUpdateCheck({
      isPackaged: false,
      portable: false,
      resolveUpdater: () => updater,
      logger
    })

    expect(result).toEqual({ checked: false })
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
    expect(updater.autoDownload).toBe(false)
    expect(updater.autoInstallOnAppQuit).toBe(false)
    expect(updater.allowPrerelease).toBe(false)
    expect(logger.info).toHaveBeenCalledWith(
      'Skipping auto-update check outside packaged builds.'
    )
  })

  it('skips updater calls in portable mode even when packaged', async () => {
    const updater = makeUpdater()
    const logger = makeLogger()

    const result = await runStartupUpdateCheck({
      isPackaged: true,
      portable: true,
      resolveUpdater: () => updater,
      logger
    })

    expect(result).toEqual({ checked: false })
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
    expect(updater.autoDownload).toBe(false)
    expect(updater.autoInstallOnAppQuit).toBe(false)
    expect(updater.allowPrerelease).toBe(false)
    expect(logger.info).toHaveBeenCalledWith('Skipping auto-update check in portable mode.')
  })

  // The whole reason `updater.ts` used to restate both guards: electron-updater's
  // `autoUpdater` is a lazy getter that crashes an unpackaged run when read. The
  // guards now live here only, so these two cases are what preserves that
  // constraint — the thunk must not be called before both have passed.
  it('never resolves the updater when a guard rejects the run', async () => {
    const resolveUpdater = vi.fn(() => makeUpdater())

    await runStartupUpdateCheck({
      isPackaged: false,
      portable: false,
      resolveUpdater,
      logger: makeLogger()
    })
    await runStartupUpdateCheck({
      isPackaged: true,
      portable: true,
      resolveUpdater,
      logger: makeLogger()
    })

    expect(resolveUpdater).not.toHaveBeenCalled()
  })

  it('runs both guards synchronously, before the first await', () => {
    const resolveUpdater = vi.fn(() => makeUpdater())

    // No `await`: if a guard ran after a microtask boundary, the getter would
    // already have been dereferenced by the time the caller could react.
    void runStartupUpdateCheck({
      isPackaged: true,
      portable: false,
      resolveUpdater,
      logger: makeLogger()
    })

    expect(resolveUpdater).toHaveBeenCalledOnce()
  })

  it('configures silent download and install-on-quit in packaged builds', async () => {
    const updater = makeUpdater()

    const result = await runStartupUpdateCheck({
      isPackaged: true,
      portable: false,
      resolveUpdater: () => updater,
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

    const result = await runStartupUpdateCheck({
      isPackaged: true,
      portable: false,
      resolveUpdater: () => updater,
      logger
    })

    expect(result).toEqual({ checked: false })
    expect(logger.warn).toHaveBeenCalledWith(
      'Auto-update check failed; continuing startup.',
      error
    )
  })

  it('owns a rejecting background download promise without an unhandled rejection', async () => {
    const error = new Error('download failed')
    const unhandledRejection = vi.fn()
    const updater = makeUpdater({ downloadPromise: Promise.reject(error) })
    const logger = makeLogger()

    process.on('unhandledRejection', unhandledRejection)

    try {
      const result = await runStartupUpdateCheck({
        isPackaged: true,
        portable: false,
        resolveUpdater: () => updater,
        logger
      })
      await new Promise((resolve) => {
        setTimeout(resolve, 0)
      })

      expect(result).toEqual({ checked: true })
      expect(unhandledRejection).not.toHaveBeenCalled()
      expect(logger.warn).toHaveBeenCalledWith(
        'Background update download failed; continuing.',
        error
      )
    } finally {
      process.off('unhandledRejection', unhandledRejection)
    }
  })

  it('does not wait for the background download promise to settle', async () => {
    const updater = makeUpdater({ downloadPromise: new Promise(() => undefined) })

    const result = await Promise.race([
      runStartupUpdateCheck({
        isPackaged: true,
        portable: false,
        resolveUpdater: () => updater,
        logger: makeLogger()
      }),
      new Promise((resolve) => {
        setTimeout(() => resolve({ checked: 'blocked' }), 25)
      })
    ])

    expect(result).toEqual({ checked: true })
  })
})
