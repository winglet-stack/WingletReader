import type { BrowserWindow, Event } from 'electron'

export function isLocalNavigationUrl(targetUrl: string, devRendererUrl?: string): boolean {
  let parsedTarget: URL
  try {
    parsedTarget = new URL(targetUrl)
  } catch {
    return false
  }

  if (parsedTarget.protocol === 'file:') return true

  if (devRendererUrl) {
    try {
      const parsedDevRenderer = new URL(devRendererUrl)
      return parsedTarget.origin === parsedDevRenderer.origin
    } catch {
      return false
    }
  }

  return false
}

export function attachLocalNavigationGuard(
  win: BrowserWindow,
  devRendererUrl?: string
): void {
  const denyNonLocalNavigation = (event: Event, targetUrl: string): void => {
    if (!isLocalNavigationUrl(targetUrl, devRendererUrl)) event.preventDefault()
  }

  win.webContents.on('will-navigate', denyNonLocalNavigation)
  win.webContents.on('will-redirect', denyNonLocalNavigation)
}
