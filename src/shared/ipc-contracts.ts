// Pure types only -- no Node built-ins here. This file is included by both
// tsconfig.main.json and tsconfig.renderer.json, and the renderer must never
// pull in a Node-only module transitively through a "shared" import.
//
// Everything below is a REDACTED view model. None of these shapes may ever
// carry a trigger-phrase payload string. See src/main/redact.ts for the one
// place that is allowed to look at a real payload, and for why it only ever
// hands back a hash and a length.

export type Tier = 1 | 2;

export type ProfileSource = 'default' | 'file';

/** What the settings/popover UI is allowed to know about the active profile. */
export interface ProfileStatusViewModel {
  source: ProfileSource;
  schemaVersion: number | null;
  /** e.g. "custom profile loaded (schemaVersion 1)" or "shipped default profile — missing-file" */
  label: string;
}

/** A one-tier identity line: "tier 1 · sha256:a1b2c3d4 · 37 chars". Never the payload itself. */
export interface TierIdentityViewModel {
  tier: Tier;
  shortHash: string; // "sha256:xxxxxxxx" (first 8 hex chars of the full digest)
  chars: number;
  label: string;
}

export type SessionRuntime = 'claude' | 'codex' | 'unknown';

export interface SessionViewModel {
  id: string;
  runtime: SessionRuntime;
  cwd: string;
  /** Whether resolveTarget(id) currently succeeds -- i.e. this session can actually be cracked. */
  resolvable: boolean;
  /** Present, and only present, when resolvable is false. Never blank when hidden would be wrong. */
  unavailableReason: string | null;
}

export interface CrackResultViewModel {
  ok: boolean;
  sessionId: string;
  tier: Tier;
  route: string | null;
  reason: string | null;
}

export type ThemeMode = 'light' | 'dark' | 'system';
export type Density = 'comfortable' | 'compact';

export interface AppSettings {
  doubleCrackWindowMs: number;
  perSessionCooldownMs: number;
  theme: ThemeMode;
  density: Density;
  /** Hex string, e.g. "#6750a4". */
  accentColor: string;
  profilePath: string;
}

export type SettingsPatch = Partial<AppSettings>;

export interface FilePickResult {
  path: string | null;
}

/**
 * The one and only IPC surface exposed to the renderer via contextBridge.
 * Every method here is intentionally narrow: no generic "invoke(channel, ...)"
 * escape hatch, so the renderer literally cannot ask the main process for
 * anything this contract does not already redact.
 */
export interface AgentWhipBridge {
  listSessions(): Promise<SessionViewModel[]>;
  crack(sessionId: string): Promise<CrackResultViewModel>;
  getProfileStatus(): Promise<ProfileStatusViewModel>;
  getTierIdentity(tier: Tier): Promise<TierIdentityViewModel>;
  reloadProfile(): Promise<ProfileStatusViewModel>;
  pickProfileFile(): Promise<FilePickResult>;
  getSettings(): Promise<AppSettings>;
  setSettings(patch: SettingsPatch): Promise<AppSettings>;
  openSettingsWindow(): Promise<void>;
  onSessionsChanged(cb: () => void): () => void;
}

export const IPC = {
  listSessions: 'agent-whip:list-sessions',
  crack: 'agent-whip:crack',
  getProfileStatus: 'agent-whip:profile-status',
  getTierIdentity: 'agent-whip:tier-identity',
  reloadProfile: 'agent-whip:reload-profile',
  pickProfileFile: 'agent-whip:pick-profile-file',
  getSettings: 'agent-whip:get-settings',
  setSettings: 'agent-whip:set-settings',
  openSettingsWindow: 'agent-whip:open-settings-window',
  sessionsChanged: 'agent-whip:sessions-changed',
} as const;
