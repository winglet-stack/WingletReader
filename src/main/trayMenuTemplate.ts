// The tray menu as data. Split out of `trayMenu.ts` so the template is a pure
// function with no Electron import at all: the Overlay Reader sequencer builds
// it (the menu's shape is a sequencing decision — which item the tray offers
// depends on whether the mode is armed), and only `trayMenu.ts` turns it into a
// real `Menu`.

export interface TrayMenuItem {
  label: string
  click: () => void
}

export function buildTrayMenuTemplate(options: {
  rwwEnabled: boolean
  onShow: () => void
  onStartReadWhileWorking: () => void
  onExitReadWhileWorking: () => void
  onQuit: () => void
}): TrayMenuItem[] {
  const template: TrayMenuItem[] = [
    { label: 'Show WingletReader', click: () => options.onShow() }
  ]
  if (options.rwwEnabled) {
    template.push({
      label: 'Exit Overlay Reader',
      click: () => options.onExitReadWhileWorking()
    })
  } else {
    template.push({
      label: 'Start Overlay Reader',
      click: () => options.onStartReadWhileWorking()
    })
  }
  template.push({ label: 'Quit', click: () => options.onQuit() })
  return template
}
