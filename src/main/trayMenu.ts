import { Menu, Tray } from 'electron'
import type { TrayMenuItem } from './trayMenuTemplate'

export function createTrayMenu(template: TrayMenuItem[]): Menu {
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
