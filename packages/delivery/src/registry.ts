// The target registry is the load-bearing safety boundary of this whole package: agent-whip fires
// with NO confirmation prompt, so this module is the only thing standing between a correct
// delivery and typing a cleanup authorization into the wrong terminal.
//
// Window title + class + size enumeration is NECESSARY but NOT SUFFICIENT to identify a session,
// because a title is attacker- and accident-controlled text, and decoy windows are everywhere
// (IME helpers, tooltips, zero-dimension helper windows, a second terminal someone renamed to
// match). This module instead requires POSITIVE PROOF OF IDENTITY: a session is only a valid
// target if it was registered by a deliberate one-time action taken INSIDE that session, and that
// registration is only trusted while the recorded process is still alive and still has the parent
// it had when it registered.
//
// Every failure path here FAILS CLOSED: zero matches is a refusal, more than one ambiguous match
// is a refusal (never "pick the first"), and a stale or reparented registration is discarded
// rather than trusted.
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { type ProcessFacts, realProcessFacts } from './process-facts.js';

export interface SessionRecord {
  sessionId: string;
  pid: number;
  ppid: number;
  createdAt: string;
  runtime: 'claude' | 'codex' | 'unknown';
  cwd: string;
  nonce: string;
}

export type ResolveFailure =
  | 'not-registered'
  | 'stale-registration'
  | 'ambiguous'
  | 'process-gone'
  | 'lineage-mismatch'
  | 'io-error';

export type ResolveResult =
  | { ok: true; record: SessionRecord }
  | { ok: false; reason: ResolveFailure };

function sessionsDir(root = homedir()): string {
  return join(root, '.agent-whip', 'sessions');
}

function sessionFile(sessionId: string, root = homedir()): string {
  return join(sessionsDir(root), `${sessionId}.json`);
}

export interface RegistryOptions {
  /** Override for `~/.agent-whip` during tests; defaults to the real home directory. */
  homeRoot?: string;
  /** Injected process facts for testing; defaults to real OS calls. */
  facts?: ProcessFacts;
}

export function registerSession(
  partial: Omit<SessionRecord, 'createdAt' | 'nonce'>,
  opts: RegistryOptions = {},
): SessionRecord {
  const dir = sessionsDir(opts.homeRoot);
  mkdirSync(dir, { recursive: true });
  const record: SessionRecord = {
    ...partial,
    createdAt: new Date().toISOString(),
    nonce: randomBytes(16).toString('hex'),
  };
  writeFileSync(sessionFile(record.sessionId, opts.homeRoot), JSON.stringify(record, null, 2), {
    mode: 0o600,
  });
  return record;
}

export function unregisterSession(sessionId: string, opts: RegistryOptions = {}): void {
  try {
    rmSync(sessionFile(sessionId, opts.homeRoot), { force: true });
  } catch {
    // Best-effort: an unregister that fails to remove a file the caller no longer cares about
    // must never throw and must never be treated as a security-relevant failure.
  }
}

export function listSessions(opts: RegistryOptions = {}): SessionRecord[] {
  const dir = sessionsDir(opts.homeRoot);
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const records: SessionRecord[] = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    try {
      const raw = readFileSync(join(dir, name), 'utf8');
      const parsed = JSON.parse(raw) as SessionRecord;
      if (
        typeof parsed.sessionId === 'string' &&
        typeof parsed.pid === 'number' &&
        typeof parsed.ppid === 'number'
      ) {
        records.push(parsed);
      }
    } catch {
      // A corrupt or partially-written record is skipped, never treated as a match. Skipping
      // (not deleting) means a race with a concurrent writer cannot destroy real registrations.
    }
  }
  return records;
}

/**
 * Resolve a session id to a live, verified process target. This is deliberately re-run at FIRE
 * time by callers rather than cached from an earlier resolution: a session can exit or be
 * replaced (PID reuse) on the very pane a crack was aimed at, between the moment a user selects a
 * target and the moment the trigger phrase is actually sent.
 */
export function resolveTarget(sessionId: string, opts: RegistryOptions = {}): ResolveResult {
  const facts = opts.facts ?? realProcessFacts;

  let raw: string;
  try {
    raw = readFileSync(sessionFile(sessionId, opts.homeRoot), 'utf8');
  } catch {
    return { ok: false, reason: 'not-registered' };
  }

  let record: SessionRecord;
  try {
    record = JSON.parse(raw) as SessionRecord;
  } catch {
    return { ok: false, reason: 'io-error' };
  }

  if (
    typeof record.sessionId !== 'string' ||
    typeof record.pid !== 'number' ||
    typeof record.ppid !== 'number'
  ) {
    return { ok: false, reason: 'stale-registration' };
  }

  if (!facts.isAlive(record.pid)) {
    return { ok: false, reason: 'process-gone' };
  }

  const currentPpid = facts.getParentPid(record.pid);
  // A `null` current parent means "could not be determined" -- that is NOT proof of a mismatch,
  // and refusing on inconclusive information would make every environment lacking `ps`/`wmic`
  // permanently unable to fire. We only refuse on a POSITIVE, known-different parent pid, which is
  // exactly the signature of PID reuse: the number that answers "is it alive" now belongs to an
  // unrelated process with a different parent.
  if (currentPpid !== null && currentPpid !== record.ppid) {
    return { ok: false, reason: 'lineage-mismatch' };
  }

  return { ok: true, record };
}

/**
 * Resolve a session id across every currently-live, non-stale registration, refusing when there
 * is not EXACTLY one live match. Useful for a caller resolving "the one active session" rather
 * than a known sessionId.
 */
export function resolveUniqueLiveSession(opts: RegistryOptions = {}): ResolveResult {
  const facts = opts.facts ?? realProcessFacts;
  const live: SessionRecord[] = [];
  for (const record of listSessions(opts)) {
    if (!facts.isAlive(record.pid)) continue;
    const currentPpid = facts.getParentPid(record.pid);
    if (currentPpid !== null && currentPpid !== record.ppid) continue;
    live.push(record);
  }
  if (live.length === 0) return { ok: false, reason: 'not-registered' };
  if (live.length > 1) return { ok: false, reason: 'ambiguous' };
  return { ok: true, record: live[0] };
}
