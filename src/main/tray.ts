import { join } from 'node:path';
import { Tray, nativeImage, type BrowserWindow } from 'electron';
import { createPopoverWindow } from './windows.ts';

let tray: Tray | null = null;
let popover: BrowserWindow | null = null;

function iconPath(): string {
  return join(__dirname, '..', '..', 'assets', 'icon.png');
}

export function createTray(): Tray {
  const image = nativeImage.createFromPath(iconPath());
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.setToolTip('agent-whip');
  tray.on('click', () => {
    if (!tray) return;
    if (popover && !popover.isDestroyed() && popover.isVisible()) {
      popover.hide();
      return;
    }
    popover = createPopoverWindow(tray.getBounds());
    popover.once('ready-to-show', () => popover?.show());
  });
  return tray;
}
