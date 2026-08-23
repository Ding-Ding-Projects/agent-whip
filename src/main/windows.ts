import { join } from 'node:path';
import { BrowserWindow, screen, type Rectangle } from 'electron';

const isDev = !!process.env.VITE_DEV_SERVER_URL;

function preloadPath(): string {
  return join(__dirname, '..', 'preload', 'index.cjs');
}

function loadPage(win: BrowserWindow, htmlFile: string): void {
  if (isDev) {
    void win.loadURL(`${process.env.VITE_DEV_SERVER_URL}/${htmlFile}`);
  } else {
    void win.loadFile(join(__dirname, '..', 'renderer', htmlFile));
  }
}

/** A small frameless popover anchored near the tray icon's bounds. Never focuses or steals foreground -- click-away closes it. */
export function createPopoverWindow(trayBounds: Rectangle): BrowserWindow {
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });
  const width = 340;
  const height = 420;
  const x = Math.min(Math.max(trayBounds.x - width / 2, display.workArea.x), display.workArea.x + display.workArea.width - width);
  const y = trayBounds.y + trayBounds.height;

  const win = new BrowserWindow({
    width,
    height,
    x: Math.round(x),
    y: Math.round(y),
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  loadPage(win, 'popover.html');
  win.on('blur', () => win.hide());
  return win;
}

let settingsWindow: BrowserWindow | null = null;

/** Reuses a single settings window rather than piling up duplicates on repeated opens. */
export function openSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 640,
    height: 520,
    title: 'agent-whip settings',
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  loadPage(settingsWindow, 'settings.html');
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}
