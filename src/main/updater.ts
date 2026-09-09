import { autoUpdater } from 'electron-updater'
import log from 'electron-log'
import { runStartupUpdateCheck, type AutoUpdaterLike, type UpdaterLogger } from './updaterCore'

export function startPackagedAutoUpdater(
  isPackaged: boolean,
  portable: boolean,
  logger: UpdaterLogger = log
): void {
  // The packaged gate and the portable-mode gate (ADR-0016) are stated once, in
  // `runStartupUpdateCheck`. This file used to repeat both — with byte-identical
  // log strings — for one reason: electron-updater exports `autoUpdater` as a
  // lazy getter that instantiates the platform updater on first read, and
  // dereferencing it in an unpackaged (dev) run crashes startup, so the getter
  // could not be touched to build the options object. Handing the core a thunk
  // preserves that constraint exactly — the guards still run before anything
  // reads `autoUpdater`, and they run synchronously, before the first `await` —
  // without writing the policy twice.
  void runStartupUpdateCheck({
    isPackaged,
    portable,
    resolveUpdater: (): AutoUpdaterLike => {
      // Route electron-updater's own diagnostics to a file so packaged builds —
      // where stdout is invisible — leave a readable trail at
      // %APPDATA%/WingletReader/logs/main.log (the maintainer dry-run reads this).
      log.transports.file.level = 'info'
      autoUpdater.logger = log
      autoUpdater.on('error', (error) => {
        logger.warn('Auto-updater emitted an error; continuing startup.', error)
      })
      return autoUpdater
    },
    logger
  })
}
