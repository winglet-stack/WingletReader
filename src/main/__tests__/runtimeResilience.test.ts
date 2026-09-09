import { describe, expect, it, vi } from 'vitest'
import {
  registerMainProcessCrashLogging,
  type ProcessCrashEventTarget
} from '../runtimeResilience'

describe('registerMainProcessCrashLogging', () => {
  it('registers uncaught exception and rejection loggers with stack details', () => {
    const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
    const target: ProcessCrashEventTarget = {
      on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
        listeners.set(event, [...(listeners.get(event) ?? []), listener])
      }) as ProcessCrashEventTarget['on']
    }
    const logger = { error: vi.fn() }
    const terminate = vi.fn()
    const previousExitCode = process.exitCode
    process.exitCode = undefined

    try {
      registerMainProcessCrashLogging(target, logger, terminate)

      expect(target.on).toHaveBeenCalledWith('uncaughtException', expect.any(Function))
      expect(target.on).toHaveBeenCalledWith('unhandledRejection', expect.any(Function))

      const exception = new Error('main boom')
      listeners.get('uncaughtException')![0](exception, 'uncaughtException')
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('main boom'))
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error: main boom'))
      expect(process.exitCode).toBe(1)
      expect(terminate).toHaveBeenCalledWith(1)

      const rejection = new Error('async boom')
      listeners.get('unhandledRejection')![0](rejection, Promise.resolve())
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('async boom'))
      // unhandledRejection logs but is non-fatal: terminate was only called once
      // (by the uncaughtException handler above), not again here.
      expect(terminate).toHaveBeenCalledTimes(1)
    } finally {
      process.exitCode = previousExitCode
    }
  })
})
