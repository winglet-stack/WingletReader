export interface AutoUpdaterLike {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  allowPrerelease: boolean
  checkForUpdates(): Promise<unknown>
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
  updater: AutoUpdaterLike
  logger?: UpdaterLogger
}

export interface StartupUpdateCheckResult {
  checked: boolean
}

export async function runStartupUpdateCheck({
  isPackaged,
  portable,
  updater,
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

  updater.autoDownload = true
  updater.autoInstallOnAppQuit = true
  // Alpha builds carry a semver prerelease tag (`0.1.0-alpha.N`). GitHub's
  // "latest release" endpoint excludes prereleases, so without this the updater
  // would never see alpha → alpha bumps.
  updater.allowPrerelease = true

  try {
    logger.info('Checking for updates against the packaged feed.')
    await updater.checkForUpdates()
    return { checked: true }
  } catch (error) {
    logger.warn('Auto-update check failed; continuing startup.', error)
    return { checked: false }
  }
}
