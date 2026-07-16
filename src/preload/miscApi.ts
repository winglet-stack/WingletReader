import { ipcRenderer } from 'electron'

export const appApi = {
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  splashReady: () => ipcRenderer.send('splash:renderer-ready')
}

export const fileApi = {
  open: () => ipcRenderer.invoke('file:open')
}

export const dataApi = {
  exportAll: () => ipcRenderer.invoke('export:all'),
  importJson: () => ipcRenderer.invoke('import:json'),
  selectPortableTarget: () => ipcRenderer.invoke('portable:selectTarget'),
  createPortableDrive: (targetPath: string) =>
    ipcRenderer.invoke('portable:createDrive', targetPath)
}

export const videoApi = {
  save: (buffer: ArrayBuffer, suggestedName: string) =>
    ipcRenderer.invoke('video:save', buffer, suggestedName)
}
