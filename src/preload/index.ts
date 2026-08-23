import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type AgentWhipBridge } from '../shared/ipc-contracts.js';

// A deliberately narrow bridge: every method here is a one-to-one wrapper around a single
// ipcRenderer.invoke/on call for a fixed channel. There is no generic `invoke(channel, ...args)`
// escape hatch exposed to the renderer -- the renderer literally cannot ask main for anything this
// file does not already name, and nothing named here is shaped to carry a raw trigger-phrase
// payload string (see src/shared/ipc-contracts.ts and src/main/redact.ts).
const bridge: AgentWhipBridge = {
  listSessions: () => ipcRenderer.invoke(IPC.listSessions),
  crack: (sessionId) => ipcRenderer.invoke(IPC.crack, sessionId),
  getProfileStatus: () => ipcRenderer.invoke(IPC.getProfileStatus),
  getTierIdentity: (tier) => ipcRenderer.invoke(IPC.getTierIdentity, tier),
  reloadProfile: () => ipcRenderer.invoke(IPC.reloadProfile),
  pickProfileFile: () => ipcRenderer.invoke(IPC.pickProfileFile),
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  setSettings: (patch) => ipcRenderer.invoke(IPC.setSettings, patch),
  openSettingsWindow: () => ipcRenderer.invoke(IPC.openSettingsWindow),
  onSessionsChanged: (cb) => {
    const listener = () => cb();
    ipcRenderer.on(IPC.sessionsChanged, listener);
    return () => ipcRenderer.removeListener(IPC.sessionsChanged, listener);
  },
};

contextBridge.exposeInMainWorld('agentWhip', bridge);
