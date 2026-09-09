import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  OVERLAY_READER_COPY,
  STANDBY_PILL_POSITION_SAVE_DEBOUNCE_MS,
  createOverlayReader,
  type CaptureBlockReason,
  type OverlayReader,
  type OverlayReaderPort,
  type OverlayReaderRect,
  type OverlayReaderSettings,
  type StandbyPillHandlers
} from '../overlayReader'
import { STANDBY_PILL_WINDOW, type CaptureInterpretation } from '../readWhileWorkingCore'
import type { TrayMenuItem } from '../trayMenuTemplate'

// ── The fake adapter ────────────────────────────────────────────────────────
// The second implementation of `OverlayReaderPort` (the first is the Electron
// adapter in `index.ts`). It records what the sequencer asked Electron to do and
// lets a test decide what Electron answers — a failing shortcut registration, a
// capture that throws, a destroyed main window — none of which is reachable by
// driving the real process.

const WORK_AREA = { x: 0, y: 0, width: 1920, height: 1040 }

interface FakeAdapter {
  port: OverlayReaderPort
  log: string[]
  settings: OverlayReaderSettings
  savedPatches: Partial<OverlayReaderSettings>[]
  shortcuts: Map<string, () => void>
  failingShortcuts: Set<string>
  tray: { attached: boolean; template: TrayMenuItem[] | null; onClick: (() => void) | null }
  notifications: string[]
  enableFailures: string[]
  mainWindowAlive: boolean
  workArea: { x: number; y: number; width: number; height: number }
  workAreaAnchors: (OverlayReaderRect | null)[]
  standbyPill: {
    open: boolean
    bounds: OverlayReaderRect | null
    handlers: StandbyPillHandlers | null
  }
  temporaryReader: { open: boolean; content: string | null; settings: OverlayReaderSettings | null }
  capture: () => Promise<CaptureInterpretation>
  captureCalls: OverlayReaderSettings[]
}

function createFakeAdapter(
  options: {
    platform?: NodeJS.Platform
    isDev?: boolean
    settings?: OverlayReaderSettings
  } = {}
): FakeAdapter {
  const platform = options.platform ?? 'win32'
  const isDev = options.isDev ?? false

  const state: FakeAdapter = {
    port: null as unknown as OverlayReaderPort,
    log: [] as string[],
    settings: { read_while_working_enabled: false, ...options.settings } as OverlayReaderSettings,
    savedPatches: [] as Partial<OverlayReaderSettings>[],
    shortcuts: new Map<string, () => void>(),
    failingShortcuts: new Set<string>(),
    tray: { attached: false, template: null, onClick: null },
    notifications: [] as string[],
    enableFailures: [] as string[],
    mainWindowAlive: true,
    workArea: { ...WORK_AREA },
    workAreaAnchors: [] as (OverlayReaderRect | null)[],
    standbyPill: { open: false, bounds: null, handlers: null },
    temporaryReader: { open: false, content: null, settings: null },
    capture: async (): Promise<CaptureInterpretation> => ({ kind: 'no-selection' }),
    captureCalls: [] as OverlayReaderSettings[]
  }

  state.port = {
    platform,
    isDev: () => isDev,

    getSettings: () => ({ ...state.settings }),
    saveSettings: (patch) => {
      state.savedPatches.push({ ...patch })
      Object.assign(state.settings, patch)
      state.log.push(`settings:save(${Object.keys(patch).join(',')})`)
      return { ...state.settings }
    },

    registerShortcut: (accelerator, handler) => {
      if (state.failingShortcuts.has(accelerator)) {
        state.log.push(`shortcut:refused(${accelerator})`)
        return false
      }
      state.shortcuts.set(accelerator, handler)
      state.log.push(`shortcut:register(${accelerator})`)
      return true
    },
    unregisterShortcut: (accelerator) => {
      state.shortcuts.delete(accelerator)
      state.log.push(`shortcut:unregister(${accelerator})`)
    },
    unregisterAllShortcuts: () => {
      state.shortcuts.clear()
      state.log.push('shortcut:unregisterAll')
    },

    ensureTray: (template, onClick) => {
      state.tray.attached = true
      state.tray.template = template
      state.tray.onClick = onClick
      state.log.push('tray:ensure')
    },
    setTrayMenu: (template) => {
      if (state.tray.attached) state.tray.template = template
      state.log.push('tray:setMenu')
    },
    destroyTray: () => {
      state.tray.attached = false
      state.tray.template = null
      state.log.push('tray:destroy')
    },

    isMainWindowAlive: () => state.mainWindowAlive,
    createMainWindow: (showOnReady) => {
      state.mainWindowAlive = true
      state.log.push(`main:create(${showOnReady})`)
    },
    raiseMainWindow: () => {
      state.log.push('main:raise')
    },
    fadeOutMainWindowAndHide: () => {
      state.log.push('main:fadeOutAndHide')
    },
    navigateHome: () => {
      state.log.push('main:navigateHome')
    },
    sendEnableFailed: (error) => {
      state.enableFailures.push(error)
      state.log.push('main:enableFailed')
    },

    getWorkArea: (anchor) => {
      state.workAreaAnchors.push(anchor)
      return state.workArea
    },
    isStandbyPillOpen: () => state.standbyPill.open,
    openStandbyPill: (bounds, handlers) => {
      state.standbyPill = { open: true, bounds, handlers }
      state.log.push('pill:open')
    },
    closeStandbyPill: () => {
      state.standbyPill.open = false
      state.standbyPill.handlers = null
      state.log.push('pill:close')
    },

    hasTemporaryReaderWindow: () => state.temporaryReader.open,
    focusTemporaryReader: () => {
      state.log.push('temp:focus')
    },
    openTemporaryReader: (content, settings) => {
      state.temporaryReader = { open: true, content, settings }
      state.log.push('temp:open')
    },
    destroyTemporaryReader: () => {
      state.temporaryReader.open = false
      state.log.push('temp:destroy')
    },

    captureSelectedText: (settings) => {
      state.captureCalls.push(settings)
      return state.capture()
    },
    notify: (body) => {
      state.notifications.push(body)
      state.log.push('notify')
    },
    quitApp: () => {
      state.log.push('quit')
    }
  }

  return state
}

function pillAt(x: number, y: number): OverlayReaderRect {
  return { x, y, width: STANDBY_PILL_WINDOW.width, height: STANDBY_PILL_WINDOW.height }
}

function armed(
  options: Parameters<typeof createFakeAdapter>[0] = {}
): { fake: FakeAdapter; overlay: OverlayReader } {
  const fake = createFakeAdapter(options)
  const overlay = createOverlayReader(fake.port)
  overlay.arm()
  return { fake, overlay }
}

afterEach(() => {
  vi.useRealTimers()
})

// ── arm → capture → present → exit ──────────────────────────────────────────

describe('Overlay Reader — the armed sequence', () => {
  it('drives arm → capture → present → exit through the fake adapter', async () => {
    const fake = createFakeAdapter()
    fake.capture = async () => ({ kind: 'open', text: 'selected words' })
    const overlay = createOverlayReader(fake.port)

    // Arm: flag persisted, shortcut registered, pill up, main window dissolved.
    const status = overlay.arm()
    expect(status.enabled).toBe(true)
    expect(status.registered).toBe(true)
    expect(status.error).toBeNull()
    expect(fake.settings.read_while_working_enabled).toBe(true)
    expect(fake.shortcuts.has('Control+Space')).toBe(true)
    expect(fake.standbyPill.open).toBe(true)
    expect(fake.log).toContain('main:fadeOutAndHide')
    // The pill must be up before the window dissolves, or the two do not cross.
    expect(fake.log.indexOf('pill:open')).toBeLessThan(fake.log.indexOf('main:fadeOutAndHide'))

    // Capture → present.
    const outcome = await overlay.handleCaptureShortcut()
    expect(outcome).toEqual({ kind: 'opened' })
    expect(fake.temporaryReader.open).toBe(true)
    expect(fake.temporaryReader.content).toBe('selected words')

    // Exit: flag cleared, shortcut released, pill and session torn down, window back.
    overlay.exit(OVERLAY_READER_COPY.exited)
    expect(fake.settings.read_while_working_enabled).toBe(false)
    expect(fake.shortcuts.size).toBe(0)
    expect(fake.standbyPill.open).toBe(false)
    expect(fake.temporaryReader.open).toBe(false)
    expect(fake.log).toContain('main:raise')
    expect(fake.log).toContain('main:navigateHome')
    expect(fake.notifications).toEqual([OVERLAY_READER_COPY.exited])
  })

  it('arms from the shortcut the registration installed', async () => {
    const { fake } = armed()
    fake.capture = async () => ({ kind: 'open', text: 'from the accelerator' })

    fake.shortcuts.get('Control+Space')!()
    await vi.waitFor(() => expect(fake.temporaryReader.open).toBe(true))

    expect(fake.temporaryReader.content).toBe('from the accelerator')
  })

  it('passes the live settings to capture and to the overlay window', async () => {
    const { fake, overlay } = armed({
      settings: { read_while_working_restore_clipboard: false, read_while_working_window_width: 800 }
    })
    fake.capture = async () => ({ kind: 'open', text: 'text' })

    await overlay.handleCaptureShortcut()

    expect(fake.captureCalls[0].read_while_working_restore_clipboard).toBe(false)
    expect(fake.temporaryReader.settings?.read_while_working_window_width).toBe(800)
  })

  it('focuses the existing overlay window instead of opening a second one', async () => {
    const { fake, overlay } = armed()
    fake.capture = async () => ({ kind: 'open', text: 'text' })
    await overlay.handleCaptureShortcut()
    fake.log.length = 0

    // The session is open, so the readiness check blocks before capture runs.
    const outcome = await overlay.handleCaptureShortcut()

    expect(outcome).toEqual({ kind: 'blocked', reason: 'active-session' })
    expect(fake.log).toEqual(['temp:focus'])
  })

  it('reports an empty selection without tearing the mode down', async () => {
    const { fake, overlay } = armed()
    fake.capture = async () => ({ kind: 'no-selection' })

    const outcome = await overlay.handleCaptureShortcut()

    expect(outcome).toEqual({ kind: 'no-selection' })
    expect(fake.notifications).toEqual([OVERLAY_READER_COPY.noSelection])
    expect(fake.shortcuts.has('Control+Space')).toBe(true)
    expect(fake.standbyPill.open).toBe(true)
    expect(fake.settings.read_while_working_enabled).toBe(true)
  })

  it('reports a capture that throws and releases the busy latch', async () => {
    const { fake, overlay } = armed()
    fake.capture = async () => {
      throw new Error('SendKeys timed out')
    }

    const failed = await overlay.handleCaptureShortcut()

    expect(failed).toEqual({ kind: 'failed', error: 'SendKeys timed out' })
    expect(fake.notifications).toEqual([
      OVERLAY_READER_COPY.captureFailed('SendKeys timed out')
    ])

    // The latch is released, so the very next press captures normally.
    fake.capture = async () => ({ kind: 'open', text: 'second try' })
    expect(await overlay.handleCaptureShortcut()).toEqual({ kind: 'opened' })
  })

  it('finishes the overlay session on request', () => {
    const { fake, overlay } = armed()

    expect(overlay.finishTemporarySession()).toEqual({ ok: true })
    expect(fake.log).toContain('temp:destroy')
  })
})

// ── Readiness reasons ───────────────────────────────────────────────────────

// One entry per reason `classifyCaptureReadiness` can return. Typed as a total
// `Record`, so a new reason in the Core is a compile error here until it is both
// handled and asserted — which is exactly how 'disabled' used to escape.
const BLOCK_CASES: Record<CaptureBlockReason, () => Promise<void>> = {
  'active-session': async () => {
    const { fake, overlay } = armed()
    fake.temporaryReader.open = true

    expect(await overlay.handleCaptureShortcut()).toEqual({
      kind: 'blocked',
      reason: 'active-session'
    })
    expect(fake.log).toContain('temp:focus')
    expect(fake.notifications).toEqual([])
  },

  busy: async () => {
    const { fake, overlay } = armed()
    let release!: (value: CaptureInterpretation) => void
    fake.capture = () =>
      new Promise<CaptureInterpretation>((resolve) => {
        release = resolve
      })

    const inFlight = overlay.handleCaptureShortcut()
    expect(await overlay.handleCaptureShortcut()).toEqual({ kind: 'blocked', reason: 'busy' })
    expect(fake.notifications).toEqual([OVERLAY_READER_COPY.busy])

    release({ kind: 'no-selection' })
    await inFlight
  },

  unsupported: async () => {
    const fake = createFakeAdapter({ platform: 'darwin' })
    const overlay = createOverlayReader(fake.port)
    overlay.arm()

    expect(await overlay.handleCaptureShortcut()).toEqual({
      kind: 'blocked',
      reason: 'unsupported'
    })
    expect(fake.notifications).toContain(OVERLAY_READER_COPY.unsupported)
  },

  // The accelerator outlived its disarm. Nothing was said to the user before
  // this issue and nothing is said now — but the stale registration is released
  // instead of being left live for the next press.
  disabled: async () => {
    const { fake, overlay } = armed()
    fake.settings.read_while_working_enabled = false
    fake.notifications.length = 0

    expect(await overlay.handleCaptureShortcut()).toEqual({ kind: 'blocked', reason: 'disabled' })
    expect(fake.shortcuts.size).toBe(0)
    expect(fake.standbyPill.open).toBe(false)
    expect(fake.notifications).toEqual([])
  }
}

describe('Overlay Reader — every capture-readiness reason is handled', () => {
  for (const [reason, run] of Object.entries(BLOCK_CASES)) {
    it(`handles '${reason}'`, run)
  }
})

// ── Shortcut registration and its failure states ────────────────────────────

describe('Overlay Reader — shortcut registration', () => {
  it('registers a distinct exit shortcut that exits the mode', () => {
    const fake = createFakeAdapter({
      settings: { read_while_working_exit_shortcut: 'Control+Shift+X' }
    })
    const overlay = createOverlayReader(fake.port)

    const status = overlay.arm()
    expect(status.exitRegistered).toBe(true)
    expect(status.exitShortcut).toBe('Control+Shift+X')

    fake.shortcuts.get('Control+Shift+X')!()

    expect(fake.settings.read_while_working_enabled).toBe(false)
    expect(fake.standbyPill.open).toBe(false)
    expect(fake.notifications).toEqual([OVERLAY_READER_COPY.exited])
  })

  it('does not register a second handler when both shortcuts are the same key', () => {
    const { fake, overlay } = armed()

    expect(fake.shortcuts.size).toBe(1)
    expect(overlay.getStatus().exitRegistered).toBe(true)
    expect(overlay.getStatus().exitError).toBeNull()
  })

  it('surfaces a refused capture shortcut and leaves the mode unarmed on screen', () => {
    const fake = createFakeAdapter()
    fake.failingShortcuts.add('Control+Space')
    const overlay = createOverlayReader(fake.port)

    const status = overlay.arm()

    expect(status.registered).toBe(false)
    expect(status.error).toBe(OVERLAY_READER_COPY.shortcutInUse('Control+Space'))
    // Same accelerator on both, so the exit half inherits the capture failure.
    expect(status.exitRegistered).toBe(false)
    expect(status.exitError).toBe(status.error)
    expect(fake.standbyPill.open).toBe(false)
    expect(fake.log).toContain('main:raise')
    expect(fake.log).not.toContain('main:fadeOutAndHide')
  })

  it('surfaces a refused exit shortcut while the capture shortcut still works', () => {
    const fake = createFakeAdapter({
      settings: { read_while_working_exit_shortcut: 'Control+Shift+X' }
    })
    fake.failingShortcuts.add('Control+Shift+X')
    const overlay = createOverlayReader(fake.port)

    const status = overlay.arm()

    expect(status.registered).toBe(true)
    expect(status.error).toBeNull()
    expect(status.exitRegistered).toBe(false)
    expect(status.exitError).toBe(OVERLAY_READER_COPY.exitShortcutInUse('Control+Shift+X'))
    expect(fake.standbyPill.open).toBe(true)
  })

  it('normalizes stored accelerators before registering them', () => {
    const fake = createFakeAdapter({
      settings: { read_while_working_shortcut: 'ctrl + alt + j' }
    })
    const overlay = createOverlayReader(fake.port)

    expect(overlay.arm().shortcut).toBe('Control+Alt+J')
    expect(fake.shortcuts.has('Control+Alt+J')).toBe(true)
  })

  it('releases the previous accelerators before registering new ones', () => {
    const { fake, overlay } = armed()

    fake.settings.read_while_working_shortcut = 'Control+Alt+K'
    fake.settings.read_while_working_exit_shortcut = 'Control+Alt+K'
    overlay.syncRegistration()

    expect(fake.log).toContain('shortcut:unregister(Control+Space)')
    expect(fake.shortcuts.has('Control+Space')).toBe(false)
    expect(fake.shortcuts.has('Control+Alt+K')).toBe(true)
  })

  it('reports the unsupported platform without registering anything', () => {
    const fake = createFakeAdapter({ platform: 'linux' })
    const overlay = createOverlayReader(fake.port)

    const status = overlay.arm()

    expect(status.supported).toBe(false)
    expect(status.registered).toBe(false)
    expect(status.error).toBe(OVERLAY_READER_COPY.unsupported)
    expect(fake.shortcuts.size).toBe(0)
    expect(fake.standbyPill.open).toBe(false)
  })
})

// ── Standby pill ────────────────────────────────────────────────────────────

describe('Overlay Reader — standby pill', () => {
  it('opens the pill bottom-right of the cursor display when no position is stored', () => {
    const { fake } = armed()

    expect(fake.workAreaAnchors).toEqual([null])
    expect(fake.standbyPill.bounds).toEqual({
      x: WORK_AREA.width - STANDBY_PILL_WINDOW.width - STANDBY_PILL_WINDOW.margin,
      y: WORK_AREA.height - STANDBY_PILL_WINDOW.height - STANDBY_PILL_WINDOW.margin,
      width: STANDBY_PILL_WINDOW.width,
      height: STANDBY_PILL_WINDOW.height
    })
  })

  it('anchors a stored position to the display it was left on', () => {
    const { fake } = armed({
      settings: { read_while_working_standby_x: 240, read_while_working_standby_y: 120 }
    })

    expect(fake.workAreaAnchors).toEqual([
      { x: 240, y: 120, width: STANDBY_PILL_WINDOW.width, height: STANDBY_PILL_WINDOW.height }
    ])
    expect(fake.standbyPill.bounds).toMatchObject({ x: 240, y: 120 })
  })

  it('clamps a stored position back into the visible work area', () => {
    const { fake } = armed({
      settings: { read_while_working_standby_x: 9_000, read_while_working_standby_y: -500 }
    })

    expect(fake.standbyPill.bounds).toMatchObject({
      x: WORK_AREA.width - STANDBY_PILL_WINDOW.width,
      y: WORK_AREA.y
    })
  })

  it('persists a dragged position once per drag, after the debounce', () => {
    vi.useFakeTimers()
    const { fake } = armed()
    const handlers = fake.standbyPill.handlers!

    handlers.onMoved(pillAt(100, 100))
    handlers.onMoved(pillAt(140, 160))
    expect(fake.settings.read_while_working_standby_x).toBeUndefined()

    vi.advanceTimersByTime(STANDBY_PILL_POSITION_SAVE_DEBOUNCE_MS)

    expect(fake.settings.read_while_working_standby_x).toBe(140)
    expect(fake.settings.read_while_working_standby_y).toBe(160)
    expect(
      fake.savedPatches.filter((patch) => 'read_while_working_standby_x' in patch)
    ).toHaveLength(1)
  })

  it('drops a pending position write when the pill closes', () => {
    vi.useFakeTimers()
    const { fake, overlay } = armed()

    fake.standbyPill.handlers!.onMoved(pillAt(100, 100))
    overlay.exit()
    vi.advanceTimersByTime(STANDBY_PILL_POSITION_SAVE_DEBOUNCE_MS * 4)

    expect(
      fake.savedPatches.some((patch) => 'read_while_working_standby_x' in patch)
    ).toBe(false)
  })

  it('re-opens at the persisted position on the next arm', () => {
    vi.useFakeTimers()
    const { fake, overlay } = armed()

    fake.standbyPill.handlers!.onMoved(pillAt(640, 480))
    vi.advanceTimersByTime(STANDBY_PILL_POSITION_SAVE_DEBOUNCE_MS)
    overlay.exit()
    overlay.arm()

    expect(fake.standbyPill.bounds).toMatchObject({ x: 640, y: 480 })
  })

  it('honours the standby-control setting being off', () => {
    const { fake, overlay } = armed({
      settings: { read_while_working_show_standby_control: false }
    })

    expect(fake.standbyPill.open).toBe(false)
    // The mode is still armed: tray and shortcut exit both remain.
    expect(overlay.getStatus().registered).toBe(true)
    expect(fake.shortcuts.has('Control+Space')).toBe(true)
    expect(fake.tray.attached).toBe(true)
    expect(fake.log).toContain('main:fadeOutAndHide')
  })

  it('does not open a second pill when one is already up', () => {
    const { fake, overlay } = armed()
    const openCount = () => fake.log.filter((entry) => entry === 'pill:open').length
    expect(openCount()).toBe(1)

    overlay.arm()

    expect(openCount()).toBe(1)
  })
})

// ── Exit and disarm ─────────────────────────────────────────────────────────

describe('Overlay Reader — exit and disarm', () => {
  it('recreates a destroyed main window instead of raising it', () => {
    const { fake, overlay } = armed()
    fake.mainWindowAlive = false
    fake.log.length = 0

    overlay.exit()

    expect(fake.log).toContain('main:create(true)')
    expect(fake.log).not.toContain('main:raise')
    expect(fake.log).toContain('main:navigateHome')
  })

  it('exits silently when no notification is given', () => {
    const { fake, overlay } = armed()

    overlay.exit()

    expect(fake.notifications).toEqual([])
    expect(fake.settings.read_while_working_enabled).toBe(false)
  })

  it('clears the armed flag and releases everything on quit', () => {
    const { fake, overlay } = armed()

    overlay.shutdownForQuit()

    expect(fake.settings.read_while_working_enabled).toBe(false)
    expect(fake.log).toContain('shortcut:unregisterAll')
    expect(fake.shortcuts.size).toBe(0)
    expect(fake.standbyPill.open).toBe(false)
  })

  it('clears the armed flag at startup — the process-lifetime flag rule', () => {
    const fake = createFakeAdapter({ settings: { read_while_working_enabled: true } })
    const overlay = createOverlayReader(fake.port)

    const settings = overlay.clearArmedFlag()

    expect(settings.read_while_working_enabled).toBe(false)
    expect(fake.savedPatches).toEqual([{ read_while_working_enabled: false }])
  })
})

// ── Tray lifecycle ──────────────────────────────────────────────────────────

describe('Overlay Reader — tray lifecycle', () => {
  it('keeps the tray and flips its menu back to Start when disarmed in a packaged build', () => {
    const { fake, overlay } = armed({ isDev: false })
    expect(fake.tray.template?.[1].label).toBe('Exit Overlay Reader')

    overlay.exit()

    expect(fake.tray.attached).toBe(true)
    expect(fake.tray.template?.[1].label).toBe('Start Overlay Reader')
  })

  it('tears the tray down when disarmed in a dev build', () => {
    const { fake, overlay } = armed({ isDev: true })
    expect(fake.tray.attached).toBe(true)

    overlay.exit()

    expect(fake.tray.attached).toBe(false)
  })

  it('arms from the tray Start item', () => {
    const fake = createFakeAdapter()
    const overlay = createOverlayReader(fake.port)
    overlay.ensureTray()

    fake.tray.template!.find((item) => item.label === 'Start Overlay Reader')!.click()

    expect(fake.settings.read_while_working_enabled).toBe(true)
    expect(fake.standbyPill.open).toBe(true)
    expect(fake.enableFailures).toEqual([])
  })

  it('routes a failed tray arm to the renderer', () => {
    const fake = createFakeAdapter()
    fake.failingShortcuts.add('Control+Space')
    const overlay = createOverlayReader(fake.port)
    overlay.ensureTray()

    fake.tray.template!.find((item) => item.label === 'Start Overlay Reader')!.click()

    expect(fake.enableFailures).toEqual([OVERLAY_READER_COPY.shortcutInUse('Control+Space')])
  })

  it('routes an unsupported-platform arm to the renderer too', () => {
    const fake = createFakeAdapter({ platform: 'darwin' })
    const overlay = createOverlayReader(fake.port)

    overlay.startFromTray()

    expect(fake.enableFailures).toEqual([OVERLAY_READER_COPY.unsupported])
  })

  it('exits from the tray Exit item', () => {
    const { fake, overlay } = armed()

    overlay.ensureTray()
    fake.tray.template!.find((item) => item.label === 'Exit Overlay Reader')!.click()

    expect(fake.settings.read_while_working_enabled).toBe(false)
    expect(fake.notifications).toEqual([OVERLAY_READER_COPY.exited])
  })

  it('shows the main window from the tray click and the Show item', () => {
    const { fake } = armed()
    fake.mainWindowAlive = false
    fake.log.length = 0

    fake.tray.onClick!()
    fake.tray.template!.find((item) => item.label === 'Show WingletReader')!.click()

    expect(fake.log.filter((entry) => entry === 'main:create(true)')).toHaveLength(1)
    expect(fake.log.filter((entry) => entry === 'main:raise')).toHaveLength(2)
  })

  it('quits from the tray Quit item', () => {
    const { fake, overlay } = armed()

    overlay.ensureTray()
    fake.tray.template!.find((item) => item.label === 'Quit')!.click()

    expect(fake.log).toContain('quit')
  })

  it('ensures the tray while armed and leaves it alone otherwise', () => {
    const fake = createFakeAdapter({ isDev: true })
    const overlay = createOverlayReader(fake.port)

    // Disarmed dev sync: no tray to keep, and nothing to attach.
    overlay.syncRegistration()
    expect(fake.tray.attached).toBe(false)

    overlay.arm()
    expect(fake.tray.attached).toBe(true)
  })
})
