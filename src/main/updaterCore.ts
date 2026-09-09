export interface UpdateCheckResultLike {
  downloadPromise?: Promise<unknown> | null
}

export interface AutoUpdaterLike {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  allowPrerelease: boolean
  checkForUpdates(): Promise<UpdateCheckResultLike | null>
}

export interface UpdaterLogger {
  info(message: string): void
  warn(message: string, error?: unknown): void
}

export interface StartupUpdateCheckOptions {
  isPackaged: boolean
  /**
   * Portable copies (ADR-0016) run off a stick and cannot patch an installed
   * NSIS app, so the updater is skipped when this is true. The signal comes from
   * slice 01's `isPortable` helper — no detection is duplicated here.
   */
  portable: boolean
  /**
   * The updater, resolved **lazily**. electron-updater exports `autoUpdater` as
   * a getter that instantiates the platform updater on first read, and reading
   * it in an unpackaged (dev) run crashes startup — which is why the caller used
   * to repeat the packaged/portable guards before dereferencing it. Taking a
   * thunk instead lets those guards live here, once: nothing touches the getter
   * until both have passed, and both run synchronously before the first `await`.
   */
  resolveUpdater: () => AutoUpdaterLike
  logger?: UpdaterLogger
}

export interface StartupUpdateCheckResult {
  checked: boolean
}

export async function runStartupUpdateCheck({
  isPackaged,
  portable,
  resolveUpdater,
  logger = console
}: StartupUpdateCheckOptions): Promise<StartupUpdateCheckResult> {
  if (!isPackaged) {
    logger.info('Skipping auto-update check outside packaged builds.')
    return { checked: false }
  }

  if (portable) {
    logger.info('Skipping auto-update check in portable mode.')
    return { checked: false }
  }

  const updater = resolveUpdater()
  updater.autoDownload = true
  updater.autoInstallOnAppQuit = true
  // Alpha builds carry a semver prerelease tag (`0.1.0-alpha.N`). GitHub's
  // "latest release" endpoint excludes prereleases, so without this the updater
  // would never see alpha → alpha bumps.
  updater.allowPrerelease = true

  try {
    logger.info('Checking for updates against the packaged feed.')
    const result = await updater.checkForUpdates()
    // electron-updater starts the download detached when autoDownload is on and
    // hands the promise back for the caller to own. Do not await it: startup
    // must not block on the background download.
    result?.downloadPromise?.catch((error) => {
      logger.warn('Background update download failed; continuing.', error)
    })
    return { checked: true }
  } catch (error) {
    logger.warn('Auto-update check failed; continuing startup.', error)
    return { checked: false }
  }
}
