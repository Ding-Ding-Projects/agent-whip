// The real, wired-up delivery transport. `agent-whip crack` runs as a short-lived, separate OS
// process from the session it targets, so it has no in-memory handle to that session's pty/input
// stream -- it has to reach across process boundaries. This package's stated privacy contract
// (see README.md) forbids `node:net`/`node:http(s)`/`node:dgram` outright, which rules out a
// socket or named pipe. Filesystem IPC is the transport that is left, and it is a fine one: a
// session that wants to be crackable runs `startSessionDeliveryServer` (its "session-side"
// listener), which watches a small per-session mailbox directory for delivery requests and calls
// an injected writer -- its OWN pty/stdin writer -- on anything that arrives there with the exact
// nonce recorded at registration time. `agent-whip crack` is the client: it drops a request file
// and waits for a response file.
//
// This is the module that makes "positively confirm it reached the intended session" true rather
// than aspirational: the response can only ever come from the one process that (a) is actually
// running `startSessionDeliveryServer` for this exact sessionId, and (b) knows the nonce that was
// generated at registration time and never appears anywhere else (not in the registry file's
// public fields sense -- it IS in the registry file, but the registry file is 0600 and lives next
// to the mailbox; an attacker who can read one can read the other, which is the same trust
// boundary the registry itself already relies on). A client that gets no response within the ack
// timeout gets a hard failure, never a guess.
import { randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { bracketedInjection, legacyInjection } from '@agent-whip/paste-frame';
import type { DeliveryRoute, PtyWriter, SessionTarget } from '../routes.js';
import type { SessionRecord } from '../registry.js';

const DEFAULT_ACK_TIMEOUT_MS = 1500;
const DEFAULT_POLL_INTERVAL_MS = 15;
const DEFAULT_SERVER_POLL_INTERVAL_MS = 20;

export interface MailboxOptions {
  /** Override for `~/.agent-whip` during tests; defaults to the real home directory. */
  homeRoot?: string;
  /** How long a client waits for a response file before failing closed. */
  ackTimeoutMs?: number;
  /** How often the client polls for a response file. */
  pollIntervalMs?: number;
}

function mailboxDir(sessionId: string, homeRoot = homedir()): string {
  return join(homeRoot, '.agent-whip', 'sessions', `${sessionId}.mailbox`);
}

function requestPath(dir: string, requestId: string): string {
  return join(dir, `request-${requestId}.json`);
}

function responsePath(dir: string, requestId: string): string {
  return join(dir, `response-${requestId}.json`);
}

/** Writes `contents` to `path` atomically: write to a sibling temp file, then rename over it. */
function writeAtomic(path: string, contents: string): void {
  const tmp = `${path}.${randomBytes(6).toString('hex')}.tmp`;
  writeFileSync(tmp, contents, { mode: 0o600 });
  renameSync(tmp, path);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface MailboxRequest {
  nonce: string;
  data: string;
}

interface MailboxResponse {
  ok: boolean;
  reason?: string;
}

export interface DeliveryServerHandle {
  /** Stops watching for requests. Safe to call more than once. */
  close(): void;
}

/**
 * The session-side listener. Call this once, from inside the process that owns the target's real
 * input stream, right after (or instead of relying on) registration. `write` performs the actual
 * injection into that process's own pty/stdin -- this function never touches any transport of its
 * own beyond the mailbox files used to receive the request.
 *
 * Deliberately polling rather than `fs.watch`: `fs.watch` is not reliable across platforms/
 * filesystems (notably network shares and some container filesystems silently never fire), and a
 * missed event here would look exactly like "the session isn't there," which is the one failure
 * this module exists to avoid. A 20ms poll is cheap and bounded.
 */
export function startSessionDeliveryServer(
  record: Pick<SessionRecord, 'sessionId' | 'nonce'>,
  write: (data: string) => Promise<void> | void,
  opts: MailboxOptions = {},
): DeliveryServerHandle {
  const dir = mailboxDir(record.sessionId, opts.homeRoot);
  mkdirSync(dir, { recursive: true });
  // Best-effort cleanup of anything left over from a previous run of this same session id -- a
  // stale request from a crashed prior instance must never be replayed against a fresh writer.
  for (const name of safeReaddir(dir)) {
    try {
      unlinkSync(join(dir, name));
    } catch {
      // Racing with something else cleaning the same file is fine; either way it's gone.
    }
  }

  const processing = new Set<string>();
  let closed = false;

  async function tick(): Promise<void> {
    if (closed) return;
    for (const name of safeReaddir(dir)) {
      if (!name.startsWith('request-') || !name.endsWith('.json')) continue;
      const requestId = name.slice('request-'.length, -'.json'.length);
      if (processing.has(requestId)) continue;
      processing.add(requestId);
      void handleRequest(dir, requestId, record.nonce, write).finally(() => {
        processing.delete(requestId);
      });
    }
  }

  const timer = setInterval(() => {
    void tick();
  }, DEFAULT_SERVER_POLL_INTERVAL_MS);
  // Never let this listener keep the process alive on its own; the session owns its own lifetime.
  timer.unref?.();

  return {
    close(): void {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Best-effort: a session shutting down must never fail on mailbox cleanup.
      }
    },
  };
}

async function handleRequest(
  dir: string,
  requestId: string,
  expectedNonce: string,
  write: (data: string) => Promise<void> | void,
): Promise<void> {
  const reqPath = requestPath(dir, requestId);
  let raw: string;
  try {
    raw = readFileSync(reqPath, 'utf8');
  } catch {
    // Already consumed by a racing tick, or removed by cleanup; nothing to do.
    return;
  }
  // Claim it immediately so a concurrent tick (or a retried poll) cannot double-process it.
  try {
    unlinkSync(reqPath);
  } catch {
    return;
  }

  let response: MailboxResponse;
  try {
    const parsed = JSON.parse(raw) as Partial<MailboxRequest>;
    if (typeof parsed.nonce !== 'string' || typeof parsed.data !== 'string') {
      response = { ok: false, reason: 'bad-request' };
    } else if (parsed.nonce !== expectedNonce) {
      // The writer is NEVER invoked on a nonce mismatch. This is the entire proof-of-identity: a
      // request that does not carry the exact nonce generated at registration time cannot cause
      // anything to be written anywhere.
      response = { ok: false, reason: 'nonce-mismatch' };
    } else {
      await write(parsed.data);
      response = { ok: true };
    }
  } catch (err) {
    response = { ok: false, reason: (err as Error).message || 'write-failed' };
  }

  try {
    writeAtomic(responsePath(dir, requestId), JSON.stringify(response));
  } catch {
    // If the response cannot be written, the client will simply time out and fail closed -- it
    // never treats a missing response as success.
  }
}

function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/**
 * Client-side: drop a request file for `sessionId`/`nonce` and wait for the matching response.
 * Rejects (never resolves with a guess) on: no mailbox directory, ack timeout, or an explicit
 * `{ ok: false }` response from the session-side listener.
 */
async function sendToMailbox(
  sessionId: string,
  nonce: string,
  data: string,
  opts: MailboxOptions,
): Promise<void> {
  const dir = mailboxDir(sessionId, opts.homeRoot);
  if (!existsSync(dir)) {
    throw new Error('mailbox-not-found');
  }
  const requestId = randomBytes(9).toString('hex');
  const reqPath = requestPath(dir, requestId);
  const resPath = responsePath(dir, requestId);
  const body: MailboxRequest = { nonce, data };
  writeAtomic(reqPath, JSON.stringify(body));

  const ackTimeoutMs = opts.ackTimeoutMs ?? DEFAULT_ACK_TIMEOUT_MS;
  const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const deadline = Date.now() + ackTimeoutMs;
  try {
    while (Date.now() < deadline) {
      if (existsSync(resPath)) {
        let parsed: MailboxResponse;
        try {
          const raw = readFileSync(resPath, 'utf8');
          parsed = JSON.parse(raw) as MailboxResponse;
        } catch {
          throw new Error('bad-ack');
        }
        if (parsed.ok === true) return;
        throw new Error(parsed.reason || 'delivery-refused');
      }
      await sleep(pollIntervalMs);
    }
    throw new Error('ack-timeout');
  } finally {
    try {
      unlinkSync(resPath);
    } catch {
      // Nothing to clean up if it never appeared, or was already removed.
    }
    try {
      unlinkSync(reqPath);
    } catch {
      // Normal case: the server already claimed (deleted) the request before responding.
    }
  }
}

/**
 * The real, non-interrupting `DeliveryRoute`. `isAvailable` only checks that a mailbox directory
 * exists for this session (a real, positive signal that *some* process registered a listener for
 * it) -- it is deliberately NOT a full round trip, so a healthy ladder can move past a session
 * whose listener has died without paying the full ack timeout twice. `deliver` performs the full
 * confirmed round trip and is the one that actually fails closed: any error from `sendToMailbox`
 * (missing mailbox, timeout, nonce mismatch, an explicit refusal from the writer) becomes
 * `{ ok: false }` here -- it is never swallowed into a silent "delivered".
 */
export function mailboxDeliveryRoute(opts: MailboxOptions = {}): DeliveryRoute {
  const writer: PtyWriter = async (target: SessionTarget, data: string) => {
    await sendToMailbox(target.record.sessionId, target.record.nonce, data, opts);
  };
  return {
    name: 'session-mailbox',
    interrupts: false,
    async isAvailable(target: SessionTarget): Promise<boolean> {
      if (!(target.record.pid > 0)) return false;
      return existsSync(mailboxDir(target.record.sessionId, opts.homeRoot));
    },
    async deliver(target, payload) {
      try {
        if (target.bracketedPaste) {
          await writer(target, bracketedInjection(payload, true));
        } else {
          const { text, enter } = legacyInjection(payload, true);
          await writer(target, text);
          await writer(target, enter);
        }
        return { ok: true, route: 'session-mailbox' };
      } catch (err) {
        return {
          ok: false,
          route: 'session-mailbox',
          reason: (err as Error).message || 'write-failed',
        };
      }
    },
  };
}

export { mailboxDir };
