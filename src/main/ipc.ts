import { dialog, ipcMain, BrowserWindow } from 'electron';
import { CrackDetector } from '@agent-whip/core';
import { IPC, type AppSettings, type SettingsPatch, type Tier } from '../shared/ipc-contracts.js';
import { crackSession, listSessionViewModels } from './session-service.js';
import { getPayloadForDelivery, getProfileStatus, getTierIdentity, reloadProfile, setProfilePath } from './profile-service.js';
import type { SettingsStore } from './settings-store.js';

function isTier(value: unknown): value is Tier {
  return value === 1 || value === 2;
}

/** Registers every handle() for the narrow AgentWhipBridge contract. Nothing here ever sends a raw payload string across ipcMain.handle's return value. */
export function registerIpcHandlers(store: SettingsStore, broadcastSessionsChanged: () => void): void {
  // Re-created whenever doubleCrackWindowMs changes, because CrackDetector's window is fixed at
  // construction time -- see @agent-whip/core's CrackDetector constructor.
  let detector = new CrackDetector(store.load().doubleCrackWindowMs);

  ipcMain.handle(IPC.listSessions, async () => listSessionViewModels());

  ipcMain.handle(IPC.crack, async (_event, sessionId: unknown) => {
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      return { ok: false, sessionId: '', tier: 1, route: null, reason: 'invalid-session-id' };
    }
    const tier = detector.onCrack(sessionId);
    const payload = getPayloadForDelivery(tier);
    const outcome = await crackSession(sessionId, payload);
    broadcastSessionsChanged();
    return { ok: outcome.ok, sessionId, tier, route: outcome.route, reason: outcome.reason };
  });

  ipcMain.handle(IPC.getProfileStatus, async () => getProfileStatus());
  ipcMain.handle(IPC.getTierIdentity, async (_event, tier: unknown) => {
    const t = isTier(tier) ? tier : 1;
    return getTierIdentity(t);
  });
  ipcMain.handle(IPC.reloadProfile, async () => reloadProfile());

  ipcMain.handle(IPC.pickProfileFile, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: 'Choose your agent-whip profile.json',
      properties: ['openFile'] as Array<'openFile'>,
      filters: [{ name: 'agent-whip profile', extensions: ['json'] }],
    };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) {
      return { path: null };
    }
    const path = result.filePaths[0];
    setProfilePath(path);
    store.save({ profilePath: path });
    reloadProfile();
    return { path };
  });

  ipcMain.handle(IPC.getSettings, async () => store.load());
  ipcMain.handle(IPC.setSettings, async (_event, patch: unknown): Promise<AppSettings> => {
    const typedPatch = (patch ?? {}) as SettingsPatch;
    const next = store.save(typedPatch);
    if (typeof typedPatch.profilePath === 'string') {
      setProfilePath(next.profilePath);
      reloadProfile();
    }
    if (typeof typedPatch.doubleCrackWindowMs === 'number') {
      detector = new CrackDetector(next.doubleCrackWindowMs);
    }
    return next;
  });

  ipcMain.handle(IPC.openSettingsWindow, async () => {
    const { openSettingsWindow } = await import('./windows.js');
    openSettingsWindow();
  });
}
