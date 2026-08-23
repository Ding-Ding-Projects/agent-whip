import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const DEFAULT_CRACK_STATE_PATH = join(homedir(), '.agent-whip', 'cracks.json');

type CrackState = Record<string, number>;

function readState(path: string): CrackState {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as CrackState;
    }
  } catch {
    // Missing, unreadable, or corrupt state is treated as "no prior crack" -- fails open to
    // tier 1, never to tier 2 (the more privileged tier), which is the safe direction.
  }
  return {};
}

function writeState(path: string, state: CrackState): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state), { mode: 0o600 });
}

export interface RecordCrackOptions {
  /** Detection window in milliseconds; a second crack landing within it is tier 2. */
  windowMs?: number;
  /** Override state file location for tests. */
  path?: string;
  /** Override "now" for deterministic tests. */
  now?: number;
}

/**
 * File-backed crack-window tracker for one session. Mirrors @agent-whip/core's in-memory
 * `CrackDetector` algorithm exactly (a second crack within `windowMs` of the first consumes the
 * pair and resolves to tier 2; anything else is tier 1) but persists the last-crack timestamp to
 * disk, because `agent-whip crack` is a short-lived CLI process invoked once per crack rather than
 * a long-running process that could hold the state in memory between the two cracks of a double.
 */
export function recordCrack(sessionId: string, opts: RecordCrackOptions = {}): 1 | 2 {
  const windowMs = opts.windowMs ?? 2000;
  const path = opts.path ?? DEFAULT_CRACK_STATE_PATH;
  const now = opts.now ?? Date.now();
  const state = readState(path);
  const prev = state[sessionId];
  if (prev !== undefined && now - prev <= windowMs) {
    delete state[sessionId];
    writeState(path, state);
    return 2;
  }
  state[sessionId] = now;
  writeState(path, state);
  return 1;
}

/** Clears pending crack state for one session, or every session if omitted. */
export function resetCrackState(path: string = DEFAULT_CRACK_STATE_PATH, sessionId?: string): void {
  if (sessionId === undefined) {
    writeState(path, {});
    return;
  }
  const state = readState(path);
  delete state[sessionId];
  writeState(path, state);
}
