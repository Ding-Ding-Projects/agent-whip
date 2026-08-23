import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AppSettings, SettingsPatch } from '../shared/ipc-contracts.ts';
import { DEFAULT_PROFILE_PATH } from '@agent-whip/core';

export const DEFAULT_SETTINGS: AppSettings = {
  doubleCrackWindowMs: 2000,
  perSessionCooldownMs: 1500,
  theme: 'system',
  density: 'comfortable',
  accentColor: '#6750a4',
  profilePath: DEFAULT_PROFILE_PATH,
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Merges parsed JSON onto `base` field-by-field, ignoring anything malformed rather than throwing.
 * `base` defaults to DEFAULT_SETTINGS for loading a settings file from scratch, but save() passes
 * the current in-memory settings as `base` so an invalid field in a patch falls back to the
 * PREVIOUS valid value rather than silently reverting to the shipped default.
 */
function sanitize(raw: unknown, base: AppSettings = DEFAULT_SETTINGS): AppSettings {
  const out = { ...base };
  if (!isPlainRecord(raw)) return out;
  if (typeof raw.doubleCrackWindowMs === 'number' && raw.doubleCrackWindowMs > 0) out.doubleCrackWindowMs = raw.doubleCrackWindowMs;
  if (typeof raw.perSessionCooldownMs === 'number' && raw.perSessionCooldownMs >= 0) out.perSessionCooldownMs = raw.perSessionCooldownMs;
  if (raw.theme === 'light' || raw.theme === 'dark' || raw.theme === 'system') out.theme = raw.theme;
  if (raw.density === 'comfortable' || raw.density === 'compact') out.density = raw.density;
  if (typeof raw.accentColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.accentColor)) out.accentColor = raw.accentColor;
  if (typeof raw.profilePath === 'string' && raw.profilePath.length > 0) out.profilePath = raw.profilePath;
  return out;
}

export class SettingsStore {
  readonly #filePath: string;
  #cached: AppSettings | null = null;

  constructor(userDataDir: string) {
    this.#filePath = join(userDataDir, 'agent-whip-settings.json');
  }

  load(): AppSettings {
    if (this.#cached) return this.#cached;
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(this.#filePath, 'utf8'));
    } catch {
      raw = undefined;
    }
    this.#cached = sanitize(raw);
    return this.#cached;
  }

  save(patch: SettingsPatch): AppSettings {
    const current = this.load();
    const next = sanitize({ ...current, ...patch }, current);
    this.#cached = next;
    mkdirSync(dirname(this.#filePath), { recursive: true });
    writeFileSync(this.#filePath, JSON.stringify(next, null, 2), 'utf8');
    return next;
  }
}

export { sanitize as sanitizeSettingsForTest };
