import log from 'electron-log'

export interface CrashLogger {
  error: (...args: unknown[]) => void
}

export interface ProcessCrashEventTarget {
  on(event: 'uncaughtException', listener: (error: Error, origin: string) => void): void
  on(event: 'unhandledRejection', listener: (reason: unknown, promise: Promise<unknown>) => void): void
}

export type CrashTerminator = (exitCode: number) => void

function formatCrashReason(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.stack ?? `${reason.name}: ${reason.message}`
  }
  if (typeof reason === 'string') return reason
  try {
    return JSON.stringify(reason)
  } catch {
    return String(reason)
  }
}

export function registerMainProcessCrashLogging(
  target: ProcessCrashEventTarget = process,
  logger: CrashLogger = log,
  terminate: CrashTerminator = (exitCode) => process.exit(exitCode)
): void {
  // Asymmetry is deliberate: after an uncaughtException main's state is unknown,
  // so exit. An unhandledRejection is logged but NOT fatal — the JSON store is
  // durable per-mutation (database.ts writes tmp-then-rename on every save), so
  // fail-fast protects nothing, while killing an alpha session costs the tester
  // feedback the alpha exists to collect.
  target.on('uncaughtException', (error, origin) => {
    logger.error(
      `[runtime] uncaughtException (${origin})\n${formatCrashReason(error)}`
    )
    process.exitCode = 1
    terminate(1)
  })

  target.on('unhandledRejection', (reason) => {
    logger.error(
      `[runtime] unhandledRejection\n${formatCrashReason(reason)}`
    )
  })
}
