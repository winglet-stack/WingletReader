/**
 * Overlay Reader — the *sequencing* half of Read While Working.
 *
 * `readWhileWorkingCore.ts` owns the decisions that are pure (shortcut
 * normalization, pill bounds, capture readiness, clipboard restore). This module
 * owns the order those decisions are applied in: arm, capture, present, exit,
 * disarm, the standby-pill lifecycle, and shortcut registration with its failure
 * states. Everything it needs from Electron — windows, tray, global shortcuts,
 * clipboard capture, notifications, screen geometry — arrives through
 * `OverlayReaderPort`. `src/main/index.ts` supplies the real adapter; the tests
 * supply a fake one. Two adapters is what makes this a seam rather than a split.
 *
 * Naming: **Overlay Reader** is the user-facing label and the name of this
 * module (ADR-0017); **RWW** stays the code term for the persisted
 * `read_while_working_*` settings keys and the IPC channel family, and neither
 * is touched here.
 */
import {
  READ_WHILE_WORKING_DEFAULTS,
  STANDBY_PILL_WINDOW,
  classifyCaptureReadiness,
  normalizeShortcutInput,
  resolveStandbyPillBounds,
  shouldShowStandbyPill,
  type CaptureInterpretation,
  type ReadWhileWorkingStatus,
  type WorkAreaBounds
} from './readWhileWorkingCore'
import { buildTrayMenuTemplate, type TrayMenuItem } from './trayMenuTemplate'

// ── Copy owned by the sequencer ─────────────────────────────────────────────
// Every user-visible string the Overlay Reader emits, in one place, so the
// fake-adapter tests assert the same literals the real adapter shows.
export const OVERLAY_READER_COPY = {
  exited: 'Exited Overlay Reader.',
  busy: 'Already capturing selected text.',
  unsupported: 'Overlay Reader is supported on Windows in this version.',
  noSelection: 'No text selected to read.',
  enableFailed: 'Read while working could not be enabled.',
  shortcutInUse: (shortcut: string): string => `Shortcut ${shortcut} is already in use.`,
  exitShortcutInUse: (shortcut: string): string =>
    `Exit shortcut ${shortcut} is already in use.`,
  captureFailed: (message: string): string => `Could not capture selected text: ${message}`
} as const

// A dragged pill fires 'moved' continuously; coalesce the writes so one drag
// costs one settings save.
export const STANDBY_PILL_POSITION_SAVE_DEBOUNCE_MS = 250

export interface OverlayReaderRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * The settings this module reads and writes. A structural subset of the store's
 * flat `Settings` — the full record is assignable to it — so the port can be
 * satisfied without dragging the store's type into the test fakes.
 */
export interface OverlayReaderSettings {
  read_while_working_enabled?: boolean
  read_while_working_shortcut?: string
  read_while_working_exit_shortcut?: string
  read_while_working_window_width?: number
  read_while_working_window_height?: number
  read_while_working_restore_clipboard?: boolean
  read_while_working_show_standby_control?: boolean
  read_while_working_standby_x?: number | null
  read_while_working_standby_y?: number | null
}

export interface StandbyPillHandlers {
  /** The pill was dragged; `bounds` is its new position. */
  onMoved(bounds: OverlayReaderRect): void
}

/**
 * The Electron surface the Overlay Reader needs. Every member is a primitive —
 * it does something to a window, the tray, the shortcut table, the clipboard or
 * the screen. No member decides *when* it should happen; that is this module's
 * job, and it is why the fake adapter can drive the whole sequence.
 */
export interface OverlayReaderPort {
  readonly platform: NodeJS.Platform
  isDev(): boolean

  // Settings store
  getSettings(): OverlayReaderSettings
  saveSettings(patch: Partial<OverlayReaderSettings>): OverlayReaderSettings

  // Global shortcuts
  registerShortcut(accelerator: string, handler: () => void): boolean
  unregisterShortcut(accelerator: string): void
  unregisterAllShortcuts(): void

  // Tray
  ensureTray(template: TrayMenuItem[], onClick: () => void): void
  setTrayMenu(template: TrayMenuItem[]): void
  destroyTray(): void

  // Main window
  isMainWindowAlive(): boolean
  createMainWindow(showOnReady: boolean): void
  /** Cancel any in-flight fade, then show and focus the existing main window. */
  raiseMainWindow(): void
  fadeOutMainWindowAndHide(): void
  navigateHome(): void
  sendEnableFailed(error: string): void

  // Standby pill window
  /**
   * Work area of the display the pill belongs on: the one matching `anchor`
   * when a position was stored, else the one nearest the cursor.
   */
  getWorkArea(anchor: OverlayReaderRect | null): WorkAreaBounds
  isStandbyPillOpen(): boolean
  openStandbyPill(bounds: OverlayReaderRect, handlers: StandbyPillHandlers): void
  closeStandbyPill(): void

  // Temporary reader (the overlay reading window)
  hasTemporaryReaderWindow(): boolean
  focusTemporaryReader(): void
  openTemporaryReader(content: string, settings: OverlayReaderSettings): void
  destroyTemporaryReader(): void

  // Capture + notifications
  captureSelectedText(settings: OverlayReaderSettings): Promise<CaptureInterpretation>
  notify(body: string): void

  // Quit, from the tray menu
  quitApp(): void
}

export type CaptureBlockReason = Extract<
  ReturnType<typeof classifyCaptureReadiness>,
  { ok: false }
>['reason']

export type OverlayReaderCaptureOutcome =
  | { kind: 'blocked'; reason: CaptureBlockReason }
  | { kind: 'opened' }
  | { kind: 'no-selection' }
  | { kind: 'failed'; error: string }

function initialStatus(platform: NodeJS.Platform): ReadWhileWorkingStatus {
  return {
    enabled: false,
    supported: platform === 'win32',
    registered: false,
    shortcut: READ_WHILE_WORKING_DEFAULTS.shortcut,
    exitShortcut: READ_WHILE_WORKING_DEFAULTS.exitShortcut,
    exitRegistered: false,
    error: null,
    exitError: null
  }
}

export class OverlayReader {
  private readonly port: OverlayReaderPort
  private status: ReadWhileWorkingStatus
  private registeredShortcut: string | null = null
  private registeredExitShortcut: string | null = null
  private captureBusy = false
  private standbyPositionTimer: ReturnType<typeof setTimeout> | null = null

  constructor(port: OverlayReaderPort) {
    this.port = port
    this.status = initialStatus(port.platform)
  }

  /** The status as of the last registration sync. */
  getStatus(): ReadWhileWorkingStatus {
    return this.status
  }

  /**
   * `read_while_working_enabled` is persisted state used as a **process-lifetime
   * flag**: it is written false at startup and again on quit, so a process that
   * died while armed cannot leave the next launch hidden in the tray. That is
   * odd — a lifetime flag in durable storage — but it is the shipped contract
   * and it is preserved verbatim (issue 10 records it rather than changing it).
   */
  clearArmedFlag(): OverlayReaderSettings {
    return this.port.saveSettings({ read_while_working_enabled: false })
  }

  /** Quit path: drop the armed flag, release every shortcut, close the pill. */
  shutdownForQuit(): void {
    this.clearArmedFlag()
    this.port.unregisterAllShortcuts()
    this.registeredShortcut = null
    this.registeredExitShortcut = null
    this.closeStandbyPill()
  }

  // ── Arm / disarm ──────────────────────────────────────────────────────────

  /**
   * Shared enable path for the Overlay Reader settings Start control (via the
   * `rww:enableAndHideToTray` IPC) and the tray "Start Overlay Reader" item:
   * persist the flag, register shortcuts, then hide on success or re-show the
   * window on failure. Returns the registration status for the caller to surface.
   */
  arm(): ReadWhileWorkingStatus {
    const settings = this.port.saveSettings({ read_while_working_enabled: true })
    const status = this.syncRegistration(settings)
    if (status.enabled && status.registered) {
      // Bring the standby pill up first, then dissolve the main window, so the
      // two cross over instead of the window blinking out before the pill arrives.
      this.openStandbyPill(settings, status)
      this.port.fadeOutMainWindowAndHide()
    } else {
      this.closeStandbyPill()
      this.showMainWindow()
    }
    return status
  }

  /** Tray "Start Overlay Reader": arm, and route a failure to the renderer. */
  startFromTray(): void {
    const status = this.arm()
    if (!status.supported || !status.registered) {
      this.port.sendEnableFailed(status.error ?? OVERLAY_READER_COPY.enableFailed)
    }
  }

  /** Exit/disarm: the pill click, the exit shortcut, the tray item and `rww:exit`. */
  exit(notification?: string): void {
    const settings = this.port.saveSettings({ read_while_working_enabled: false })
    this.syncRegistration(settings)
    this.closeStandbyPill()
    this.finishTemporarySession()
    this.restoreMainWindow()

    // Land on the Library when the main window reappears, regardless of the view
    // it was last on (or whether it was just recreated). Deterministic
    // counterpart to the entry-side setView('library') — does not depend on the
    // renderer's view surviving the hide/show round-trip.
    this.port.navigateHome()

    if (notification) this.port.notify(notification)
  }

  showMainWindow(): void {
    if (!this.port.isMainWindowAlive()) this.port.createMainWindow(true)
    this.port.raiseMainWindow()
  }

  private restoreMainWindow(): void {
    // A destroyed main window is recreated showing on ready; a live one is
    // raised out of the fade. Deliberately not `showMainWindow()`: a fresh
    // window must not be shown before it can paint.
    if (!this.port.isMainWindowAlive()) this.port.createMainWindow(true)
    else this.port.raiseMainWindow()
  }

  // ── Shortcut registration ─────────────────────────────────────────────────

  /**
   * Recompute the whole registration from `settings` (the store's current
   * values when omitted) and return the resulting status. Idempotent: it always
   * releases what it registered before re-registering.
   */
  syncRegistration(settings: OverlayReaderSettings = this.port.getSettings()): ReadWhileWorkingStatus {
    const shortcut = normalizeShortcutInput(
      settings.read_while_working_shortcut ?? READ_WHILE_WORKING_DEFAULTS.shortcut
    )
    const exitShortcut = normalizeShortcutInput(
      settings.read_while_working_exit_shortcut ?? READ_WHILE_WORKING_DEFAULTS.exitShortcut
    )
    this.unregisterShortcuts()

    this.status = {
      enabled: settings.read_while_working_enabled ?? false,
      supported: this.port.platform === 'win32',
      registered: false,
      shortcut,
      exitShortcut,
      exitRegistered: false,
      error: null,
      exitError: null
    }

    if (!this.status.enabled) {
      this.applyDisarmedSurfaces()
      return this.status
    }

    this.ensureTray()

    if (this.port.platform !== 'win32') {
      this.status.error = OVERLAY_READER_COPY.unsupported
      return this.status
    }

    this.registerShortcuts(shortcut, exitShortcut)
    return this.status
  }

  private applyDisarmedSurfaces(): void {
    this.closeStandbyPill()
    // Packaged: keep the always-on tray and refresh its menu back to "Start".
    // Dev: tear the tray down so it only exists while RWW is enabled.
    if (this.port.isDev()) this.port.destroyTray()
    else this.rebuildTrayMenu()
  }

  private registerShortcuts(shortcut: string, exitShortcut: string): void {
    const ok = this.port.registerShortcut(shortcut, () => {
      void this.handleCaptureShortcut()
    })
    this.status.registered = ok
    this.status.error = ok ? null : OVERLAY_READER_COPY.shortcutInUse(shortcut)
    if (ok) this.registeredShortcut = shortcut

    if (exitShortcut === shortcut) {
      // One accelerator cannot mean both capture and exit, so when they collide
      // the exit handler is deliberately never registered and exit rides the
      // capture registration's outcome (ADR-0017 Fact 1 — with the default
      // Ctrl+Space on both, the tray/pill are the only way out).
      this.status.exitRegistered = ok
      this.status.exitError = ok ? null : this.status.error
      return
    }

    const exitOk = this.port.registerShortcut(exitShortcut, () => {
      this.exit(OVERLAY_READER_COPY.exited)
    })
    this.status.exitRegistered = exitOk
    this.status.exitError = exitOk ? null : OVERLAY_READER_COPY.exitShortcutInUse(exitShortcut)
    if (exitOk) this.registeredExitShortcut = exitShortcut
  }

  private unregisterShortcuts(): void {
    if (this.registeredShortcut) {
      this.port.unregisterShortcut(this.registeredShortcut)
      this.registeredShortcut = null
    }
    if (this.registeredExitShortcut) {
      this.port.unregisterShortcut(this.registeredExitShortcut)
      this.registeredExitShortcut = null
    }
  }

  // ── Capture → present ─────────────────────────────────────────────────────

  async handleCaptureShortcut(): Promise<OverlayReaderCaptureOutcome> {
    const settings = this.port.getSettings()
    const readiness = classifyCaptureReadiness({
      platform: this.port.platform,
      enabled: settings.read_while_working_enabled ?? false,
      busy: this.captureBusy,
      hasActiveSession: this.port.hasTemporaryReaderWindow()
    })

    if (!readiness.ok) {
      this.applyCaptureBlock(readiness.reason)
      return { kind: 'blocked', reason: readiness.reason }
    }

    this.captureBusy = true
    try {
      const result = await this.port.captureSelectedText(settings)
      // 'no-selection' surfaces a notice only — the Overlay Reader stays armed
      // (shortcuts registered, tray and pill alive). No teardown. A copy
      // keystroke that throws or times out is handled by the catch below.
      if (result.kind === 'open') {
        this.present(result.text, settings)
        return { kind: 'opened' }
      }
      this.port.notify(OVERLAY_READER_COPY.noSelection)
      return { kind: 'no-selection' }
    } catch (err) {
      const message = (err as Error).message
      this.port.notify(OVERLAY_READER_COPY.captureFailed(message))
      return { kind: 'failed', error: message }
    } finally {
      this.captureBusy = false
    }
  }

  /**
   * Every readiness reason the Core can return, mapped to its effect. The
   * `never` fallthrough makes a new reason a compile error rather than a
   * silently ignored press — 'disabled' used to fall on the floor here.
   */
  private applyCaptureBlock(reason: CaptureBlockReason): void {
    switch (reason) {
      case 'active-session':
        this.port.focusTemporaryReader()
        return
      case 'busy':
        this.port.notify(OVERLAY_READER_COPY.busy)
        return
      case 'unsupported':
        this.port.notify(OVERLAY_READER_COPY.unsupported)
        return
      case 'disabled':
        // The accelerator fired while the mode is off, so the registration is
        // stale — the only way here is a shortcut that outlived its disarm.
        // Re-sync from the store, which releases it (and tears the tray/pill
        // down per the dev/packaged rule). No notification: the user asked for
        // nothing and the mode is already off.
        this.syncRegistration()
        return
      default: {
        const exhaustive: never = reason
        return exhaustive
      }
    }
  }

  private present(content: string, settings: OverlayReaderSettings): void {
    if (this.port.hasTemporaryReaderWindow()) {
      this.port.focusTemporaryReader()
      return
    }
    this.port.openTemporaryReader(content, settings)
  }

  finishTemporarySession(): { ok: boolean } {
    this.port.destroyTemporaryReader()
    return { ok: true }
  }

  // ── Standby pill ──────────────────────────────────────────────────────────

  private openStandbyPill(
    settings: OverlayReaderSettings,
    status: ReadWhileWorkingStatus
  ): void {
    const wanted = shouldShowStandbyPill({
      enabled: status.enabled,
      registered: status.registered,
      showStandbyControl: settings.read_while_working_show_standby_control ?? true
    })
    if (!wanted) {
      this.closeStandbyPill()
      return
    }
    if (this.port.isStandbyPillOpen()) return

    this.port.openStandbyPill(this.computeStandbyPillBounds(settings), {
      onMoved: (bounds) => this.persistStandbyPillPosition(bounds)
    })
  }

  private computeStandbyPillBounds(settings: OverlayReaderSettings): OverlayReaderRect {
    return resolveStandbyPillBounds({
      storedX: settings.read_while_working_standby_x,
      storedY: settings.read_while_working_standby_y,
      workArea: this.port.getWorkArea(this.standbyPillAnchor(settings))
    })
  }

  /**
   * A stored position anchors the pill to the display it was left on; with no
   * stored position it opens on the display nearest the cursor (`null`).
   */
  private standbyPillAnchor(settings: OverlayReaderSettings): OverlayReaderRect | null {
    if (
      Number.isFinite(settings.read_while_working_standby_x) &&
      Number.isFinite(settings.read_while_working_standby_y)
    ) {
      return {
        x: settings.read_while_working_standby_x as number,
        y: settings.read_while_working_standby_y as number,
        width: STANDBY_PILL_WINDOW.width,
        height: STANDBY_PILL_WINDOW.height
      }
    }
    return null
  }

  private persistStandbyPillPosition(bounds: OverlayReaderRect): void {
    if (this.standbyPositionTimer) clearTimeout(this.standbyPositionTimer)
    this.standbyPositionTimer = setTimeout(() => {
      this.standbyPositionTimer = null
      this.port.saveSettings({
        read_while_working_standby_x: bounds.x,
        read_while_working_standby_y: bounds.y
      })
    }, STANDBY_PILL_POSITION_SAVE_DEBOUNCE_MS)
  }

  private closeStandbyPill(): void {
    if (this.standbyPositionTimer) {
      clearTimeout(this.standbyPositionTimer)
      this.standbyPositionTimer = null
    }
    this.port.closeStandbyPill()
  }

  // ── Tray ──────────────────────────────────────────────────────────────────

  ensureTray(): void {
    this.port.ensureTray(this.trayTemplate(), () => this.showMainWindow())
  }

  private rebuildTrayMenu(): void {
    this.port.setTrayMenu(this.trayTemplate())
  }

  private trayTemplate(): TrayMenuItem[] {
    return buildTrayMenuTemplate({
      rwwEnabled: !!this.port.getSettings().read_while_working_enabled,
      onShow: () => this.showMainWindow(),
      onStartReadWhileWorking: () => this.startFromTray(),
      onExitReadWhileWorking: () => this.exit(OVERLAY_READER_COPY.exited),
      onQuit: () => this.port.quitApp()
    })
  }
}

export function createOverlayReader(port: OverlayReaderPort): OverlayReader {
  return new OverlayReader(port)
}
