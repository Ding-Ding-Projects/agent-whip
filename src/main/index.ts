import { app, BrowserWindow } from 'electron';
import { IPC } from '../shared/ipc-contracts.js';
import { createTray } from './tray.js';
import { registerIpcHandlers } from './ipc.js';
import { SettingsStore } from './settings-store.js';
import { setProfilePath } from './profile-service.js';
import { openSettingsWindow } from './windows.js';

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    openSettingsWindow();
  });

  void app.whenReady().then(() => {
    const store = new SettingsStore(app.getPath('userData'));
    const settings = store.load();
    setProfilePath(settings.profilePath);

    createTray();

    registerIpcHandlers(store, () => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send(IPC.sessionsChanged);
      }
    });
  });

  // Tray-only app: never quit just because every window closed, and skip the
  // macOS/Linux dock-icon convention entirely since agent-whip lives in the tray.
  // No-arg 'window-all-closed' listener form: nothing to preventDefault() on that event, and
  // omitting the parameter avoids the implicit-any / overload mismatch of a zero-arg callback.
  app.on('window-all-closed', () => {
    // Tray-only app: intentionally do nothing so the app keeps running with every window closed.
  });
}
