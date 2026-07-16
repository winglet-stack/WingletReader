import { ipcRenderer } from 'electron'

export const readWhileWorkingApi = {
  getStatus: () => ipcRenderer.invoke('rww:getStatus'),
  hideToTray: () => ipcRenderer.invoke('rww:hideToTray'),
  enableAndHideToTray: () => ipcRenderer.invoke('rww:enableAndHideToTray'),
  getTemporarySession: () => ipcRenderer.invoke('rww:getTemporarySession'),
  finishTemporarySession: (reason: string) =>
    ipcRenderer.invoke('rww:finishTemporarySession', reason),
  exit: () => ipcRenderer.invoke('rww:exit'),
  onExited: (callback: () => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('rww:exited', handler)
    return () => {
      ipcRenderer.removeListener('rww:exited', handler)
    }
  },
  onEnableFailed: (callback: (error: string) => void) => {
    const handler = (_event: unknown, payload: { error?: string }): void =>
      callback(payload?.error ?? 'Read while working could not be enabled.')
    ipcRenderer.on('rww:enableFailed', handler)
    return () => {
      ipcRenderer.removeListener('rww:enableFailed', handler)
    }
  }
}
