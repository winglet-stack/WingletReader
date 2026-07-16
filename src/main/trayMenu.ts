import { Menu, Tray, type MenuItemConstructorOptions } from 'electron'

export function buildTrayMenuTemplate(options: {
  rwwEnabled: boolean
  onShow: () => void
  onStartReadWhileWorking: () => void
  onExitReadWhileWorking: () => void
  onQuit: () => void
}): MenuItemConstructorOptions[] {
  const template: MenuItemConstructorOptions[] = [
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

export function createTrayMenu(template: MenuItemConstructorOptions[]): Menu {
  return Menu.buildFromTemplate(template)
}

export function attachTray(
  iconPath: string,
  menu: Menu,
  onClick: () => void
): Tray {
  const tray = new Tray(iconPath)
  tray.setToolTip('WingletReader')
  tray.setContextMenu(menu)
  tray.on('click', onClick)
  return tray
}
