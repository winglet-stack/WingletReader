import type { BrowserWindow } from 'electron'
import { readWhileWorkingChannelContract } from '../shared/channelContract'

export function sendRendererEvent(
  win: BrowserWindow | null,
  channel: string,
  payload?: unknown
): void {
  if (!win || win.isDestroyed()) return
  const send = (): void => {
    if (!win.isDestroyed()) {
      if (payload === undefined) win.webContents.send(channel)
      else win.webContents.send(channel, payload)
    }
  }
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', send)
  } else {
    send()
  }
}

export function sendNavigateHome(mainWindow: BrowserWindow | null): void {
  sendRendererEvent(mainWindow, readWhileWorkingChannelContract.onExited.channel)
}

export function sendEnableFailed(mainWindow: BrowserWindow | null, error: string): void {
  sendRendererEvent(mainWindow, readWhileWorkingChannelContract.onEnableFailed.channel, { error })
}
