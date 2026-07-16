import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  globalShortcut,
  Notification,
  screen
} from 'electron'
import { join, dirname } from 'path'
import { existsSync } from 'fs'
import { Database } from './database'
import {
  STANDBY_PILL_WINDOW,
  TEMP_READER_WINDOW_LIMITS,
  clampTemporaryReaderSize,
  classifyCaptureReadiness,
  normalizeShortcutInput,
  resolveStandbyPillBounds,
  shouldShowStandbyPill,
  type ReadWhileWorkingStatus,
  type TemporaryReaderSession
} from './readWhileWorkingCore'
import { registerHandlers, type WindowRefs } from './ipcHandlers'
import { runSeedLoader } from './seedLibrary'
import { startPackagedAutoUpdater } from './updater'
import log from 'electron-log'
import { attachTray, buildTrayMenuTemplate, createTrayMenu } from './trayMenu'
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
let registeredReadWhileWorkingShortcut: string | null = null
let registeredReadWhileWorkingExitShortcut: string | null = null
let readWhileWorkingStatus: ReadWhileWorkingStatus = {
  enabled: false,
  supported: process.platform === 'win32',
  registered: false,
  shortcut: 'Control+Space',
  exitShortcut: 'Control+Space',
  exitRegistered: false,
  error: null,
  exitError: null
}
let captureBusy = false
let temporaryReaderWindow: BrowserWindow | null = null
let temporaryReaderSession: TemporaryReaderSession | null = null
let standbyPillWindow: BrowserWindow | null = null
let standbyPillPositionTimer: ReturnType<typeof setTimeout> | null = null

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

// Reader Seed loader (ADR-0018): ingest the curated default-library bundle from
// resources/ and seed any books new to the permanent ledger. Strictly additive
// and best-effort — a missing or malformed bundle must never block launch, so any
// failure is logged and swallowed.
function seedDefaultLibrary(database: Database): void {
  try {
    const seedResult = runSeedLoader(database, join(app.getAppPath(), 'resources'))
    if (seedResult.ranScan) {
      log.info(
        `Seed loader: inserted ${seedResult.seeded.length} book(s), skipped ${seedResult.skipped.length}.`
      )
    }
  } catch (err) {
    log.error('Seed loader failed (continuing launch):', err)
  }
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
      ensureTray()
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

  seedDefaultLibrary(db)

  const windowRefs: WindowRefs = {
    get mainWindow() { return mainWindow },
    get temporaryReaderWindow() { return temporaryReaderWindow },
    get temporaryReaderSession() { return temporaryReaderSession },
    updateReadWhileWorkingRegistration: (s) => updateReadWhileWorkingRegistration(s),
    ensureTray,
    enableReadWhileWorkingAndHide,
    finishTemporaryReaderSession,
    exitReadWhileWorkingMode
  }
  registerHandlers(ipcMain, db, windowRefs)
  const startupSettings = db.saveSettings({ read_while_working_enabled: false })

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
    ipcMain.once('splash:renderer-ready', showMain)
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
      ipcMain.once('splash:renderer-ready', () => {
        mainReady = true
        checkReveal()
      })
      maxTimeoutId = setTimeout(() => {
        log.warn('[splash] max-timeout (12 s) reached — forcing reveal')
        doReveal()
      }, 12_000)
    }
  }

  updateReadWhileWorkingRegistration(startupSettings)
  // Packaged builds keep a notification-area icon while the app runs so testers
  // can right-click → Start Read While Working even with the window on screen.
  // Dev is unchanged: the tray only appears while RWW is enabled.
  if (!isDev()) ensureTray()
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
  if (db) db.saveSettings({ read_while_working_enabled: false })
  globalShortcut.unregisterAll()
  destroyStandbyPillWindow()
})

type StoredSettings = ReturnType<Database['getSettings']>

function getTrayIconPath(): string {
  return join(app.getAppPath(), 'resources/logo.png')
}

function notifyReadWhileWorking(body: string): void {
  if (Notification.isSupported()) {
    new Notification({ title: 'WingletReader', body }).show()
  }
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow()
  mainWindow?.show()
  mainWindow?.focus()
}

function quitFromTray(): void {
  allowQuit = true
  globalShortcut.unregisterAll()
  destroyStandbyPillWindow()
  temporaryReaderWindow?.destroy()
  mainWindow?.destroy()
  app.quit()
}

function buildTrayMenu() {
  return createTrayMenu(buildTrayMenuTemplate({
    rwwEnabled: !!db?.getSettings().read_while_working_enabled,
    onShow: () => showMainWindow(),
    onStartReadWhileWorking: () => {
      const status = enableReadWhileWorkingAndHide()
      if (!status.supported || !status.registered) {
        sendEnableFailed(mainWindow, status.error ?? 'Read while working could not be enabled.')
      }
    },
    onExitReadWhileWorking: () => exitReadWhileWorkingMode('Exited Overlay Reader.'),
    onQuit: () => quitFromTray(),
  }))
}

function rebuildTrayMenu(): void {
  if (tray) tray.setContextMenu(buildTrayMenu())
}

function ensureTray(): void {
  if (!tray) {
    tray = attachTray(getTrayIconPath(), buildTrayMenu(), () => showMainWindow())
  } else {
    rebuildTrayMenu()
  }
}

function destroyTray(): void {
  tray?.destroy()
  tray = null
}

// Shared enable path for both the Library header button (via the
// rww:enableAndHideToTray IPC) and the tray "Start Read While Working" item:
// persist the flag, register shortcuts, then hide on success or re-show the
// window on failure. Returns the registration status for the caller to surface.
function enableReadWhileWorkingAndHide(): ReadWhileWorkingStatus {
  const settings = db.saveSettings({ read_while_working_enabled: true })
  const status = updateReadWhileWorkingRegistration(settings)
  if (status.enabled && status.registered) {
    mainWindow?.hide()
    createStandbyPillWindow(settings, status)
  } else {
    destroyStandbyPillWindow()
    showMainWindow()
  }
  return status
}

// Mirror of sendNavigateHome: push the enable failure to the renderer so the
// tray-initiated path can route the user to Global Settings with the error copy,
// matching the Library button's return-value-driven failure handling.

function unregisterReadWhileWorkingShortcut(): void {
  if (registeredReadWhileWorkingShortcut) {
    globalShortcut.unregister(registeredReadWhileWorkingShortcut)
    registeredReadWhileWorkingShortcut = null
  }
  if (registeredReadWhileWorkingExitShortcut) {
    globalShortcut.unregister(registeredReadWhileWorkingExitShortcut)
    registeredReadWhileWorkingExitShortcut = null
  }
}

function updateReadWhileWorkingRegistration(settings = db.getSettings()): ReadWhileWorkingStatus {
  const shortcut = normalizeShortcutInput(settings.read_while_working_shortcut ?? 'Control+Space')
  const exitShortcut = normalizeShortcutInput(settings.read_while_working_exit_shortcut ?? 'Control+Space')
  unregisterReadWhileWorkingShortcut()

  readWhileWorkingStatus = {
    enabled: settings.read_while_working_enabled ?? false,
    supported: process.platform === 'win32',
    registered: false,
    shortcut,
    exitShortcut,
    exitRegistered: false,
    error: null,
    exitError: null
  }

  if (!settings.read_while_working_enabled) {
    destroyStandbyPillWindow()
    // Packaged: keep the always-on tray and refresh its menu back to "Start".
    // Dev: tear the tray down so it only exists while RWW is enabled.
    if (isDev()) destroyTray()
    else rebuildTrayMenu()
    return readWhileWorkingStatus
  }

  ensureTray()

  if (process.platform !== 'win32') {
    readWhileWorkingStatus.error = 'Overlay Reader is supported on Windows in this version.'
    return readWhileWorkingStatus
  }

  const ok = globalShortcut.register(shortcut, () => {
    void handleReadWhileWorkingShortcut()
  })

  readWhileWorkingStatus.registered = ok
  readWhileWorkingStatus.error = ok ? null : `Shortcut ${shortcut} is already in use.`
  if (ok) registeredReadWhileWorkingShortcut = shortcut

  if (exitShortcut === shortcut) {
    readWhileWorkingStatus.exitRegistered = ok
    readWhileWorkingStatus.exitError = ok ? null : readWhileWorkingStatus.error
    return readWhileWorkingStatus
  }

  const exitOk = globalShortcut.register(exitShortcut, () => {
    exitReadWhileWorkingMode('Exited Overlay Reader.')
  })

  readWhileWorkingStatus.exitRegistered = exitOk
  readWhileWorkingStatus.exitError = exitOk ? null : `Exit shortcut ${exitShortcut} is already in use.`
  if (exitOk) registeredReadWhileWorkingExitShortcut = exitShortcut
  return readWhileWorkingStatus
}

async function handleReadWhileWorkingShortcut(): Promise<void> {
  const settings = db.getSettings()
  const readiness = classifyCaptureReadiness({
    platform: process.platform,
    enabled: settings.read_while_working_enabled ?? false,
    busy: captureBusy,
    hasActiveSession: !!temporaryReaderWindow && !temporaryReaderWindow.isDestroyed()
  })

  if (!readiness.ok) {
    if (readiness.reason === 'active-session') temporaryReaderWindow?.focus()
    if (readiness.reason === 'busy') notifyReadWhileWorking('Already capturing selected text.')
    if (readiness.reason === 'unsupported') notifyReadWhileWorking('Overlay Reader is supported on Windows in this version.')
    return
  }

  captureBusy = true
  try {
    const result = await captureSelectedText(settings)
    // 'no-selection' surfaces a notice only — Read While Working stays running
    // (shortcuts registered, tray alive). No teardown. A copy keystroke that
    // throws/times out is handled by the catch below.
    if (result.kind === 'open') {
      openTemporaryReaderWindow(result.text, settings)
    } else {
      notifyReadWhileWorking('No text selected to read.')
    }
  } catch (err) {
    notifyReadWhileWorking(`Could not capture selected text: ${(err as Error).message}`)
  } finally {
    captureBusy = false
  }
}

function exitReadWhileWorkingMode(notification?: string): void {
  const settings = db.saveSettings({ read_while_working_enabled: false })
  updateReadWhileWorkingRegistration(settings)
  destroyStandbyPillWindow()
  finishTemporaryReaderSession()

  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow(true)
  } else {
    mainWindow.show()
    mainWindow.focus()
  }

  // Land on the Library when the main window reappears, regardless of the view it
  // was last on (or whether it was just recreated). Deterministic counterpart to
  // the entry-side setView('library') — does not depend on the renderer's view
  // surviving the hide/show round-trip.
  sendNavigateHome(mainWindow)

  if (notification) notifyReadWhileWorking(notification)
}

function getStandbyPillDisplay(settings: StoredSettings): Electron.Display {
  if (
    Number.isFinite(settings.read_while_working_standby_x) &&
    Number.isFinite(settings.read_while_working_standby_y)
  ) {
    return screen.getDisplayMatching({
      x: settings.read_while_working_standby_x!,
      y: settings.read_while_working_standby_y!,
      width: STANDBY_PILL_WINDOW.width,
      height: STANDBY_PILL_WINDOW.height
    })
  }
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
}

function persistStandbyPillPosition(bounds: Electron.Rectangle): void {
  if (standbyPillPositionTimer) clearTimeout(standbyPillPositionTimer)
  standbyPillPositionTimer = setTimeout(() => {
    standbyPillPositionTimer = null
    if (!db) return
    db.saveSettings({
      read_while_working_standby_x: bounds.x,
      read_while_working_standby_y: bounds.y
    })
  }, 250)
}

function destroyStandbyPillWindow(): void {
  if (standbyPillPositionTimer) {
    clearTimeout(standbyPillPositionTimer)
    standbyPillPositionTimer = null
  }
  const win = standbyPillWindow
  standbyPillWindow = null
  if (win && !win.isDestroyed()) win.destroy()
}

function createStandbyPillWindow(
  settings = db.getSettings(),
  status = readWhileWorkingStatus
): void {
  if (!shouldOpenStandbyPillWindow(settings, status)) {
    destroyStandbyPillWindow()
    return
  }

  if (hasActiveStandbyPillWindow()) return

  standbyPillWindow = createStandbyBrowserWindow(resolveStandbyPillWindowBounds(settings))
  attachStandbyPillWindowEvents(standbyPillWindow)
  loadRendererForWindow(standbyPillWindow, { standbyPill: '1' })
}

function shouldOpenStandbyPillWindow(
  settings: StoredSettings,
  status: ReadWhileWorkingStatus
): boolean {
  return shouldShowStandbyPill({
    enabled: status.enabled,
    registered: status.registered,
    showStandbyControl: settings.read_while_working_show_standby_control ?? true
  })
}

function hasActiveStandbyPillWindow(): boolean {
  return !!standbyPillWindow && !standbyPillWindow.isDestroyed()
}

function resolveStandbyPillWindowBounds(settings: StoredSettings): Electron.Rectangle {
  const display = getStandbyPillDisplay(settings)
  return resolveStandbyPillBounds({
    storedX: settings.read_while_working_standby_x,
    storedY: settings.read_while_working_standby_y,
    workArea: display.workArea
  })
}

function attachStandbyPillWindowEvents(win: BrowserWindow): void {
  win.on('ready-to-show', () => {
    win.showInactive()
  })
  win.on('moved', handleStandbyPillMoved)
  win.on('closed', () => {
    if (standbyPillWindow === win) standbyPillWindow = null
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  attachLocalNavigationGuard(win, process.env['ELECTRON_RENDERER_URL'])
}

function handleStandbyPillMoved(): void {
  const win = standbyPillWindow
  if (!win || win.isDestroyed()) return
  persistStandbyPillPosition(win.getBounds())
}

function createStandbyBrowserWindow(bounds: Electron.Rectangle): BrowserWindow {
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

function openTemporaryReaderWindow(content: string, settings: StoredSettings): void {
  if (temporaryReaderWindow && !temporaryReaderWindow.isDestroyed()) {
    temporaryReaderWindow.focus()
    return
  }

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

function finishTemporaryReaderSession(): { ok: boolean } {
  const win = temporaryReaderWindow
  temporaryReaderWindow = null
  temporaryReaderSession = null
  if (win && !win.isDestroyed()) win.destroy()
  return { ok: true }
}
