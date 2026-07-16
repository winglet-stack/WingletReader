import { clipboard } from 'electron'
import { execFile } from 'child_process'
import { cleanupImportedText } from './importTextCleanup'
import {
  CAPTURE_CLEAR_SENTINEL,
  CAPTURE_POLL_INTERVAL_MS,
  CAPTURE_POLL_TIMEOUT_MS,
  interpretCapture,
  planClipboardRestore,
  type CaptureInterpretation
} from './readWhileWorkingCore'

type StoredSettings = {
  read_while_working_restore_clipboard?: boolean
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function sendWindowsCopyShortcut(): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-STA',
        '-Command',
        "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^c')"
      ],
      { windowsHide: true, timeout: 1200 },
      (error) => {
        if (error) reject(error)
        else resolve()
      }
    )
  })
}

export async function pollClipboardForCapture(): Promise<string> {
  const deadline = Date.now() + CAPTURE_POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    const current = clipboard.readText()
    if (current !== CAPTURE_CLEAR_SENTINEL) return current
    await delay(CAPTURE_POLL_INTERVAL_MS)
  }
  return clipboard.readText()
}

export async function captureSelectedText(settings: StoredSettings): Promise<CaptureInterpretation> {
  const previousClipboard = clipboard.readText()
  let capturedClipboard = CAPTURE_CLEAR_SENTINEL
  try {
    clipboard.writeText(CAPTURE_CLEAR_SENTINEL)
    await sendWindowsCopyShortcut()
    const rawClipboard = await pollClipboardForCapture()
    capturedClipboard = rawClipboard
    const capturedText = rawClipboard !== CAPTURE_CLEAR_SENTINEL
      ? cleanupImportedText(rawClipboard, { preservePageMarkers: true }).content.trim()
      : ''
    return interpretCapture(capturedText)
  } finally {
    const toRestore = planClipboardRestore(
      previousClipboard,
      clipboard.readText(),
      capturedClipboard,
      settings.read_while_working_restore_clipboard ?? true
    )
    if (toRestore !== null) clipboard.writeText(toRestore)
  }
}
