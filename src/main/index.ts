import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  globalShortcut,
  Notification,
  screen
} from 'electron'
import { performance } from 'node:perf_hooks'
import { join, dirname } from 'path'
import { existsSync } from 'fs'
import { Database } from './database'
import {
  MAIN_WINDOW_FADE_INTERVAL_MS,
  MAIN_WINDOW_FADE_MS,
  TEMP_READER_WINDOW_LIMITS,
  clampTemporaryReaderSize,
  fadeOutOpacityAt,
  type TemporaryReaderSession
} from './readWhileWorkingCore'
import {
  createOverlayReader,
  type OverlayReaderPort,
  type OverlayReaderRect,
  type OverlayReaderSettings,
  type StandbyPillHandlers
} from './overlayReader'
import { registerHandlers, type WindowRefs } from './ipcHandlers'
import { appChannelContract } from '../shared/channelContract'
import { startPackagedAutoUpdater } from './updater'
import log from 'electron-log'
import { attachTray, createTrayMenu } from './trayMenu'
import { sendEnableFailed, sendNavigateHome } from './rwwNavigation'
import { captureSelectedText } from './rwwCapture'
import { resolveStartupSplashOptions } from './splashOptions'
import { resolveUserDataRedirect } from './portableMode'
import { resolveZoomKeyAction } from './zoomGuard'
import { registerMainProcessCrashLogging } from './runtimeResilience'
import { attachLocalNavigationGuard } from './navigationPolicy'

let mainWindow: BrowserWindow | null = null
let db: Database
let tray: ReturnType<typeof attachTray> | null = null
let allowQuit = false
let temporaryReaderWindow: BrowserWindow | null = null
let temporaryReaderSession: TemporaryReaderSession | null = null
let standbyPillWindow: BrowserWindow | null = null
let mainWindowFadeTimer: ReturnType<typeof setInterval> | null = null
let mainWindowFadeWindow: BrowserWindow | null = null

registerMainProcessCrashLogging()

function isDev(): boolean {
  return !app.isPackaged
}

// Clamp the window's Chromium zoom (Ctrl+'-' / Ctrl+'+' / Ctrl+'0') to a
// legible range. Without this, Ctrl+'-' can shrink the chrome until it is
// unreadable with no obvious way back; resolveZoomKeyAction enforces the
// floor/ceiling and keeps Ctrl+'+' / Ctrl+'0' working as the way back up.
function attachZoomGuard(win: BrowserWindow): void {
  const wc = win.webContents
  wc.on('before-input-event', (event, input) => {
    const nextLevel = resolveZoomKeyAction(
      { type: input.type, key: input.key, control: input.control, meta: input.meta },
      wc.getZoomLevel()
    )
    if (nextLevel === null) return
    event.preventDefault()
    wc.setZoomLevel(nextLevel)
  })
}

function createWindow(showOnReady = true): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'WingletReader Alpha',
    backgroundColor: '#111111',
    icon: join(app.getAppPath(), 'resources/logo.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true
    }
  })

  attachZoomGuard(mainWindow)
  attachLocalNavigationGuard(mainWindow, process.env['ELECTRON_RENDERER_URL'])

  mainWindow.on('ready-to-show', () => {
    if (showOnReady) mainWindow!.show()
  })

  mainWindow.on('close', (event) => {
    if (!allowQuit && db?.getSettings().read_while_working_enabled) {
      event.preventDefault()
      mainWindow?.hide()
      overlayReader.ensureTray()
    }
  })

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  if (isDev() && process.env['ELECTRON_RENDERER_URL']) {
    loadRendererForWindow(mainWindow)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    loadRendererForWindow(mainWindow)
  }
}

// Single-instance lock: Read While Working hides the app to the tray, so a user
// who thinks it's closed may relaunch it. Without this guard a second process
// spawns, fights over the userData/GPU cache (the "Unable to move the cache:
// Access is denied" errors), and shows a fresh window stuck on mode-choice while
// the real, in-tray window is the one that actually owns Read While Working.
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // A relaunch attempt: surface the one real window on the Library rather than
    // letting a duplicate spawn. Mirrors the RWW exit routing (sendNavigateHome).
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow(true)
    } else {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
    sendNavigateHome(mainWindow)
  })
}

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) return
  if (process.platform === 'win32') {
    app.setAppUserModelId(isDev() ? process.execPath : 'com.fasttrack.reader')
  }

  // Portable USB mode (ADR-0016): when a marker file sits beside the real
  // executable, redirect the *entire* userData directory onto the stick BEFORE
  // the JSON store is constructed, so the library, settings, segments, the
  // fasttrack.transmute.* localStorage, logs, and Electron caches all follow the
  // user. The target is recomputed from process.execPath every launch, so a
  // changing drive letter is irrelevant. No marker → installed behaviour is
  // untouched (app.setPath is never invoked, userData stays where it was).
  const portable = resolveUserDataRedirect(dirname(process.execPath), existsSync)
  if (portable.portable && portable.userDataPath) {
    app.setPath('userData', portable.userDataPath)
    log.info(`Portable mode: userData redirected to ${portable.userDataPath}`)
  }

  const userDataPath = app.getPath('userData')
  try {
    db = new Database(join(userDataPath, 'fasttrack-data.json'))
  } catch (err) {
    dialog.showErrorBox(
      'Storage Error',
      `Failed to initialize storage: ${(err as Error).message}`
    )
    app.quit()
    return
  }

  const windowRefs: WindowRefs = {
    get mainWindow() { return mainWindow },
    get temporaryReaderWindow() { return temporaryReaderWindow },
    get temporaryReaderSession() { return temporaryReaderSession },
    updateReadWhileWorkingRegistration: (s) => overlayReader.syncRegistration(s),
    ensureTray: () => overlayReader.ensureTray(),
    enableReadWhileWorkingAndHide: () => overlayReader.arm(),
    finishTemporaryReaderSession: () => overlayReader.finishTemporarySession(),
    exitReadWhileWorkingMode: (notification) => overlayReader.exit(notification)
  }
  registerHandlers(ipcMain, db, windowRefs)
  const startupSettings = overlayReader.clearArmedFlag()

  // Cold-start splash coordinator. Packaged builds show the normal brand-floor
  // splash. Dev/tuning boots opt in with SPLASH=1, SPLASH=full, --splash, or
  // --splash=full; the full mode waits for the whole intro sheet without
  // changing the packaged default or build config.
  const splashOptions = resolveStartupSplashOptions({
    isPackaged: app.isPackaged,
    envSplash: process.env['SPLASH'],
    argv: process.argv
  })
  const showSplash = splashOptions.enabled

  if (!showSplash) {
    createWindow(false)
    let shown = false
    const showMain = () => {
      if (shown) return
      shown = true
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show()
    }
    ipcMain.once(appChannelContract.splashReady.channel, showMain)
    setTimeout(() => {
      log.warn('[startup] renderer-ready timeout — forcing show')
      showMain()
    }, 5_000)
  } else {
    let splashWindow: BrowserWindow | null = null
    let mainReady = false
    let splashRevealDelayReached = false
    let revealed = false
    let maxTimeoutId: ReturnType<typeof setTimeout> | null = null

    const doReveal = () => {
      if (revealed) return
      revealed = true
      if (maxTimeoutId !== null) clearTimeout(maxTimeoutId)
      try { if (splashWindow && !splashWindow.isDestroyed()) splashWindow.destroy() } catch { /* ignore */ }
      splashWindow = null
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show()
    }

    const checkReveal = () => {
      if (mainReady && splashRevealDelayReached) doReveal()
    }

    let splashOk = false
    try {
      splashWindow = new BrowserWindow({
        width: 216,
        height: 216,
        center: true,
        transparent: true,
        skipTaskbar: true,
        alwaysOnTop: true,
        resizable: false,
        frame: false,
        show: false,
        webPreferences: { contextIsolation: true }
      })

      splashWindow.once('ready-to-show', () => {
        if (!splashWindow || splashWindow.isDestroyed()) return
        splashWindow.show()
      })

      splashWindow.webContents.once('did-finish-load', () => {
        // Normal: brand floor = frame 8 at 15 fps. Forced-full tuning:
        // intro = 22 frames. Both stay main-owned with no splash IPC.
        // Loop/inspect mode: no auto-reveal — press any key to dismiss.
        if (splashOptions.revealMode !== 'loop') {
          setTimeout(() => {
            splashRevealDelayReached = true
            checkReveal()
          }, splashOptions.revealDelayMs)
        }
      })

      // Keyboard skip — honored only after mainReady so the user can't jump
      // from one loading screen directly into an unpainted main window.
      // In forced-full tuning mode, skip waits until the intro has completed.
      splashWindow.webContents.on('before-input-event', (_event, _input) => {
        if (mainReady && (splashOptions.revealMode !== 'full-intro' || splashRevealDelayReached)) {
          doReveal()
        }
      })

      const splashHtmlPath = join(app.getAppPath(), 'resources/splash/splash.html')
      splashWindow.loadFile(splashHtmlPath).catch((err) => {
        log.warn('[splash] loadFile failed, reveal delay skipped:', err)
        splashRevealDelayReached = true
        checkReveal()
      })
      splashOk = true
    } catch (err) {
      log.error('[splash] creation failed, falling back to normal startup:', err)
      try { splashWindow?.destroy() } catch { /* ignore */ }
      splashWindow = null
    }

    if (!splashOk) {
      createWindow(true)
    } else {
      createWindow(false)
      ipcMain.once(appChannelContract.splashReady.channel, () => {
        mainReady = true
        checkReveal()
      })
      maxTimeoutId = setTimeout(() => {
        log.warn('[splash] max-timeout (12 s) reached — forcing reveal')
        doReveal()
      }, 12_000)
    }
  }

  overlayReader.syncRegistration(startupSettings)
  // Packaged builds keep a notification-area icon while the app runs so testers
  // can right-click → Start Read While Working even with the window on screen.
  // Dev is unchanged: the tray only appears while RWW is enabled.
  if (!isDev()) overlayReader.ensureTray()
  startPackagedAutoUpdater(app.isPackaged, portable.portable)

  app.on('activate', () => {
    const shouldStayInBackground = db?.getSettings().read_while_working_enabled && process.platform !== 'darwin'
    if (BrowserWindow.getAllWindows().length === 0) createWindow(!shouldStayInBackground)
    else if (!shouldStayInBackground) mainWindow?.show()
  })
})

app.on('window-all-closed', () => {
  if (db?.getSettings().read_while_working_enabled && !allowQuit) return
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  allowQuit = true
  // Drops the process-lifetime armed flag, releases every global shortcut and
  // closes the standby pill — the sequencer owns that trio, not this file.
  overlayReader.shutdownForQuit()
})

function getTrayIconPath(): string {
  return join(app.getAppPath(), 'resources/logo.png')
}

function notifyReadWhileWorking(body: string): void {
  if (Notification.isSupported()) {
    new Notification({ title: 'WingletReader', body }).show()
  }
}

function raiseMainWindow(): void {
  cancelMainWindowFade()
  mainWindow?.show()
  mainWindow?.focus()
}

function restoreMainWindowFadeState(win: BrowserWindow | null): void {
  if (!win || win.isDestroyed()) return
  win.setIgnoreMouseEvents(false)
  win.setOpacity(1)
}

// Ease the main window to transparent, then hide it, so arming the Overlay Reader
// reads as the window dissolving into the standby pill rather than vanishing in a
// single frame. Opacity and input are restored before the next show().
function fadeOutMainWindowAndHide(): void {
  const win = mainWindow
  if (!win || win.isDestroyed()) return
  cancelMainWindowFade()
  if (!win.isVisible()) {
    win.hide()
    restoreMainWindowFadeState(win)
    return
  }

  mainWindowFadeWindow = win
  win.blur()
  win.setIgnoreMouseEvents(true)

  const start = performance.now()
  mainWindowFadeTimer = setInterval(() => {
    if (win.isDestroyed()) {
      cancelMainWindowFade()
      return
    }
    const opacity = fadeOutOpacityAt(performance.now() - start, MAIN_WINDOW_FADE_MS)
    if (opacity !== null) {
      win.setOpacity(opacity)
      return
    }
    win.hide()
    cancelMainWindowFade()
  }, MAIN_WINDOW_FADE_INTERVAL_MS)
}

// Stop an in-flight fade and restore the same window the fade captured so it
// never reappears mid-dissolve, stuck transparent, or unable to take clicks.
function cancelMainWindowFade(): void {
  const fadingWindow = mainWindowFadeWindow
  if (mainWindowFadeTimer) {
    clearInterval(mainWindowFadeTimer)
    mainWindowFadeTimer = null
  }
  mainWindowFadeWindow = null
  restoreMainWindowFadeState(fadingWindow)
}

function quitFromTray(): void {
  allowQuit = true
  globalShortcut.unregisterAll()
  destroyStandbyPillWindow()
  temporaryReaderWindow?.destroy()
  mainWindow?.destroy()
  app.quit()
}

function openStandbyPillWindow(
  bounds: OverlayReaderRect,
  handlers: StandbyPillHandlers
): void {
  standbyPillWindow = createStandbyBrowserWindow(bounds)
  attachStandbyPillWindowEvents(standbyPillWindow, handlers)
  loadRendererForWindow(standbyPillWindow, { standbyPill: '1' })
}

function destroyStandbyPillWindow(): void {
  const win = standbyPillWindow
  standbyPillWindow = null
  if (win && !win.isDestroyed()) win.destroy()
}

function hasActiveStandbyPillWindow(): boolean {
  return !!standbyPillWindow && !standbyPillWindow.isDestroyed()
}

function attachStandbyPillWindowEvents(
  win: BrowserWindow,
  handlers: StandbyPillHandlers
): void {
  win.on('ready-to-show', () => {
    win.showInactive()
  })
  win.on('moved', () => {
    if (win.isDestroyed()) return
    handlers.onMoved(win.getBounds())
  })
  win.on('closed', () => {
    if (standbyPillWindow === win) standbyPillWindow = null
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  attachLocalNavigationGuard(win, process.env['ELECTRON_RENDERER_URL'])
}

function createStandbyBrowserWindow(bounds: OverlayReaderRect): BrowserWindow {
  return new BrowserWindow({
    ...bounds,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    autoHideMenuBar: true,
    title: 'WingletReader - Overlay Reader standby',
    backgroundColor: '#00000000',
    hasShadow: false,
    icon: getTrayIconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true
    }
  })
}

function loadRendererForWindow(win: BrowserWindow, query?: Record<string, string>): void {
  if (isDev() && process.env['ELECTRON_RENDERER_URL']) {
    const url = new URL(process.env['ELECTRON_RENDERER_URL'])
    if (query) {
      for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
    }
    win.loadURL(url.toString())
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), query ? { query } : undefined)
  }
}

function openTemporaryReaderWindow(content: string, settings: OverlayReaderSettings): void {
  const size = clampTemporaryReaderSize(
    settings.read_while_working_window_width ?? 640,
    settings.read_while_working_window_height ?? 360
  )
  temporaryReaderSession = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: 'Selected text',
    content,
    createdAt: new Date().toISOString()
  }

  temporaryReaderWindow = new BrowserWindow({
    width: size.width,
    height: size.height,
    minWidth: TEMP_READER_WINDOW_LIMITS.minWidth,
    minHeight: TEMP_READER_WINDOW_LIMITS.minHeight,
    show: false,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    title: 'WingletReader - Overlay Reader',
    backgroundColor: '#111111',
    icon: getTrayIconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true
    }
  })

  attachZoomGuard(temporaryReaderWindow)
  attachLocalNavigationGuard(temporaryReaderWindow, process.env['ELECTRON_RENDERER_URL'])

  temporaryReaderWindow.on('ready-to-show', () => {
    temporaryReaderWindow?.show()
    temporaryReaderWindow?.focus()
  })
  temporaryReaderWindow.on('closed', () => {
    temporaryReaderWindow = null
    temporaryReaderSession = null
  })
  temporaryReaderWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  loadRendererForWindow(temporaryReaderWindow, {
    temporaryReader: '1',
    sessionId: temporaryReaderSession.id
  })
}

function destroyTemporaryReaderWindow(): void {
  const win = temporaryReaderWindow
  temporaryReaderWindow = null
  temporaryReaderSession = null
  if (win && !win.isDestroyed()) win.destroy()
}

function hasActiveTemporaryReaderWindow(): boolean {
  return !!temporaryReaderWindow && !temporaryReaderWindow.isDestroyed()
}

// ── Overlay Reader adapter ───────────────────────────────────────────────────
// The real half of the two adapters behind `OverlayReaderPort` (the other lives
// in `__tests__/overlayReader.test.ts`). Every member here is a primitive that
// touches Electron; not one of them decides *when* it runs. The sequencing —
// arm, capture, present, exit, disarm, the standby-pill lifecycle, shortcut
// registration and its failure states — lives in `overlayReader.ts`, which is
// why it can be tested without an Electron process.
const overlayReaderPort: OverlayReaderPort = {
  platform: process.platform,
  isDev: () => isDev(),

  getSettings: () => db?.getSettings() ?? {},
  saveSettings: (patch) => db?.saveSettings(patch) ?? { ...patch },

  registerShortcut: (accelerator, handler) => globalShortcut.register(accelerator, handler),
  unregisterShortcut: (accelerator) => globalShortcut.unregister(accelerator),
  unregisterAllShortcuts: () => globalShortcut.unregisterAll(),

  ensureTray: (template, onClick) => {
    if (!tray) tray = attachTray(getTrayIconPath(), createTrayMenu(template), onClick)
    else tray.setContextMenu(createTrayMenu(template))
  },
  setTrayMenu: (template) => {
    if (tray) tray.setContextMenu(createTrayMenu(template))
  },
  destroyTray: () => {
    tray?.destroy()
    tray = null
  },

  isMainWindowAlive: () => !!mainWindow && !mainWindow.isDestroyed(),
  createMainWindow: (showOnReady) => createWindow(showOnReady),
  raiseMainWindow,
  fadeOutMainWindowAndHide,
  navigateHome: () => sendNavigateHome(mainWindow),
  // Mirror of sendNavigateHome: push the enable failure to the renderer so the
  // tray-initiated path can route the user to Overlay Reader settings with the
  // error copy, matching the Start control's return-value-driven handling.
  sendEnableFailed: (error) => sendEnableFailed(mainWindow, error),

  getWorkArea: (anchor) =>
    (anchor
      ? screen.getDisplayMatching(anchor)
      : screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    ).workArea,
  isStandbyPillOpen: hasActiveStandbyPillWindow,
  openStandbyPill: openStandbyPillWindow,
  closeStandbyPill: destroyStandbyPillWindow,

  hasTemporaryReaderWindow: hasActiveTemporaryReaderWindow,
  focusTemporaryReader: () => temporaryReaderWindow?.focus(),
  openTemporaryReader: openTemporaryReaderWindow,
  destroyTemporaryReader: destroyTemporaryReaderWindow,

  captureSelectedText: (settings) => captureSelectedText(settings),
  notify: notifyReadWhileWorking,
  quitApp: quitFromTray
}

const overlayReader = createOverlayReader(overlayReaderPort)
