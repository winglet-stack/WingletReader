import { autoUpdater } from 'electron-updater'
import log from 'electron-log'
import { runStartupUpdateCheck, type UpdaterLogger } from './updaterCore'

export function startPackagedAutoUpdater(
  isPackaged: boolean,
  portable: boolean,
  logger: UpdaterLogger = log
): void {
  // Defer every `autoUpdater` access behind the packaged gate. electron-updater
  // exports `autoUpdater` as a lazy getter that instantiates the platform updater
  // on first read; dereferencing it in an unpackaged (dev) run crashes startup,
  // so dev must never touch it. runStartupUpdateCheck also short-circuits on
  // !isPackaged, but the getter would already have fired by the time it's passed
  // in — hence the early return here.
  if (!isPackaged) {
    logger.info('Skipping auto-update check outside packaged builds.')
    return
  }

  // Portable copies (ADR-0016) cannot patch an installed NSIS app and would only
  // error on a locked-down host, so skip before the lazy autoUpdater getter is
  // ever dereferenced — same ordering rationale as the !isPackaged guard above.
  if (portable) {
    logger.info('Skipping auto-update check in portable mode.')
    return
  }

  // Route electron-updater's own diagnostics to a file so packaged builds — where
  // stdout is invisible — leave a readable trail at
  // %APPDATA%/WingletReader/logs/main.log (the maintainer dry-run reads this).
  log.transports.file.level = 'info'
  autoUpdater.logger = log

  void runStartupUpdateCheck({
    isPackaged,
    portable,
    updater: autoUpdater,
    logger
  })
}
