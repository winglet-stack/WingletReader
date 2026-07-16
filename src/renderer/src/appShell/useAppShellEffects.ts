import { useEffect, useState } from 'react'
import type { AppView } from '../types'
import { isAlphaDeadRoute, resolveAlphaView } from '../alphaChrome'

export function useAppShellDocumentEffects(
  view: AppView,
  setView: (view: AppView) => void,
  theme: string
) {
  const [fullscreenActive, setFullscreenActive] = useState(false)
  const [appVersion, setAppVersion] = useState<string | null>(null)

  useEffect(() => {
    document.body.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    if (isAlphaDeadRoute(view)) {
      setView(resolveAlphaView(view))
    }
  }, [view, setView])

  useEffect(() => {
    let cancelled = false
    window.api.app.getVersion()
      .then((version) => {
        if (!cancelled) setAppVersion(version)
      })
      .catch(() => {
        if (!cancelled) setAppVersion(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const faviconEl = document.querySelector("link[rel='icon']") as HTMLLinkElement | null
    if (faviconEl) faviconEl.href = '/logo.png'
  }, [])

  useEffect(() => {
    const handler = () => {
      setFullscreenActive(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  return { fullscreenActive, appVersion }
}

// Tray-initiated "Start Read While Working" can't return a status to the
// renderer, so the main process pushes failures via rww:enableFailed. Route them
// the same way the Library button does: surface the error and open Global
// Settings (where the RWW section lives).
export function useReadWhileWorkingEnableFailed(
  setShellError: (error: string | null) => void,
  openGlobalSettings: () => void
) {
  useEffect(() => {
    return window.api?.readWhileWorking?.onEnableFailed?.((error: string) => {
      setShellError(error)
      openGlobalSettings()
    })
  }, [setShellError, openGlobalSettings])
}

export function useAppShellErrors(
  shellError: string | null,
  setShellError: (error: string | null) => void,
  readerError: string | null,
  clearReaderError: () => void,
  libraryError: string | null,
  clearLibraryError: () => void
) {
  const error = shellError ?? readerError ?? libraryError
  const dismissError = () => {
    if (shellError) setShellError(null)
    else if (readerError) clearReaderError()
    else clearLibraryError()
  }
  return { error, dismissError }
}
