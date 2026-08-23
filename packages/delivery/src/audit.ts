// Append-only audit log of crack attempts. This is the real mitigation for firing with no
// confirmation prompt: every attempt is recorded, so a wrongly-targeted crack is at minimum
// discoverable after the fact. The payload text itself is NEVER written -- only a short hash
// prefix identifying it, so the log cannot become a second place a secret-laden payload leaks to.
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface CrackAttempt {
  tier: number;
  sessionId: string;
  pid: number | null;
  route: string | null;
  outcome: 'delivered' | 'refused' | 'error';
  detail?: string;
  payload: string;
}

export interface AuditLine {
  ts: string;
  tier: number;
  sessionId: string;
  pid: number | null;
  route: string | null;
  outcome: 'delivered' | 'refused' | 'error';
  detail?: string;
  payloadHash: string;
}

export interface AuditLogOptions {
  /** Override for `~/.agent-whip` during tests; defaults to the real home directory. */
  homeRoot?: string;
}

function logPath(root = homedir()): string {
  return join(root, '.agent-whip', 'cracks.log');
}

/** First 12 hex characters of the payload's SHA-256 -- enough to correlate, not to recover. */
export function payloadIdentity(payload: string): string {
  return createHash('sha256').update(payload, 'utf8').digest('hex').slice(0, 12);
}

/**
 * Appends one JSONL line describing a crack attempt. Never throws: a logging failure must never
 * fail the crack itself, since the crack is the thing the user actually asked for.
 */
export function recordCrackAttempt(attempt: CrackAttempt, opts: AuditLogOptions = {}): void {
  const line: AuditLine = {
    ts: new Date().toISOString(),
    tier: attempt.tier,
    sessionId: attempt.sessionId,
    pid: attempt.pid,
    route: attempt.route,
    outcome: attempt.outcome,
    ...(attempt.detail !== undefined ? { detail: attempt.detail } : {}),
    payloadHash: payloadIdentity(attempt.payload),
  };
  try {
    const path = logPath(opts.homeRoot);
    mkdirSync(join(path, '..'), { recursive: true });
    appendFileSync(path, `${JSON.stringify(line)}\n`, { mode: 0o600 });
  } catch {
    // A failed audit write must never fail the crack it is trying to record.
  }
}

export { logPath as auditLogPath };
