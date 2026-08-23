import { readFileSync, statSync } from 'node:fs';
import { DEFAULT_PROFILE, DEFAULT_PROFILE_PATH, type ProfileRejectReason, type ProfileState } from './constants.js';
import { validateProfileFile } from './validate.js';

interface CacheEntry {
  mtimeMs: number;
  size: number;
  state: ProfileState;
}

/**
 * Keyed by resolved path. Never trusted on path equality alone: an entry is
 * only reused when the file's mtime and size still match what was read last
 * time, so an edited profile file is always re-validated.
 */
const cache = new Map<string, CacheEntry>();

function fallback(reason: ProfileRejectReason): ProfileState {
  return { profile: DEFAULT_PROFILE, source: 'default', schemaVersion: null, reason };
}

/**
 * Loads and validates the local profile file, or falls back to the neutral
 * default profile. This function never throws: a missing file, an
 * unreadable file, or any validation failure all degrade to the default
 * profile plus a reason code, because a crash mid-crack would be worse than
 * quietly using the default trigger phrases.
 */
export function loadProfile(path: string = DEFAULT_PROFILE_PATH): ProfileState {
  let stat;
  try {
    stat = statSync(path);
  } catch {
    return fallback('missing-file');
  }

  const cached = cache.get(path);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.state;
  }

  let raw: Buffer;
  try {
    raw = readFileSync(path);
  } catch {
    return fallback('io-error');
  }

  const result = validateProfileFile(raw);
  const state: ProfileState = result.ok
    ? { profile: result.profile, source: 'file', schemaVersion: result.schemaVersion, reason: null }
    : fallback(result.reason);

  cache.set(path, { mtimeMs: stat.mtimeMs, size: stat.size, state });
  return state;
}

/** Clears the mtime/size-keyed profile cache. Mainly useful for tests. */
export function clearProfileCache(): void {
  cache.clear();
}
