// End-to-end proof against a REAL, SEPARATE OS process -- not an injected writer standing in for
// one. A unit test that hands `mailboxDeliveryRoute`/`startSessionDeliveryServer` an in-memory
// spy function proves the mailbox protocol; it proves nothing about whether a genuinely separate
// process (the shape `agent-whip crack` actually runs in) can register itself, run the listener,
// and receive a delivery from a client that only knows its sessionId. This file spawns a real
// child `node` process that registers itself via the real `registerSession`, starts the real
// `startSessionDeliveryServer`, and echoes every write it receives back over its own stdout so the
// parent (acting exactly as the CLI would) can assert on the literal bytes a second process
// received -- via `resolveTarget` and `mailboxDeliveryRoute`, the same production path.
import assert from 'node:assert/strict';
import { type ChildProcessByStdio, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { PASTE_END, PASTE_START } from '@agent-whip/paste-frame';
import { resolveTarget } from '../registry.js';
import { mailboxDeliveryRoute } from './mailbox-route.js';

const DIST_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist');

const REGISTRY_URL = pathToFileURL(join(DIST_ROOT, 'registry.js')).href;
const MAILBOX_ROUTE_URL = pathToFileURL(join(DIST_ROOT, 'transports', 'mailbox-route.js')).href;

const CHILD_SOURCE = `
import { registerSession } from ${JSON.stringify(REGISTRY_URL)};
import { startSessionDeliveryServer } from ${JSON.stringify(MAILBOX_ROUTE_URL)};

const [, , homeRoot, sessionId] = process.argv;

const record = registerSession(
  { sessionId, pid: process.pid, ppid: process.ppid, runtime: 'claude', cwd: process.cwd() },
  { homeRoot },
);

startSessionDeliveryServer(
  record,
  (data) => {
    process.stdout.write('RECEIVED:' + JSON.stringify(data) + '\\n');
  },
  { homeRoot },
);

process.stdout.write('READY\\n');
// Behave like a genuine long-lived session: never exit on its own, and keep reading its own
// stdin (which the delivery mechanism never touches -- delivery happens entirely via the mailbox
// files, proving the transport does not depend on writing into this process's stdin at all).
process.stdin.resume();
`;

function tempHome(): string {
  return mkdtempSync(join(tmpdir(), 'agent-whip-e2e-'));
}

/**
 * A PERSISTENT reader over a child's stdout, backed by one `data` listener attached once for the
 * child's whole lifetime. This replaced an earlier version of this helper that attached and
 * removed a fresh `data` listener per `waitForLine` call -- that version lost real bytes on this
 * host: a write from the child that lands in the (necessarily nonzero) window between one
 * `waitForLine` call finishing and the next one attaching its listener is simply gone, because
 * nothing was listening when it arrived. Every complete line the child has ever printed is kept in
 * `lines`, so a `waitFor` call started after a matching line was already emitted still finds it by
 * scanning the backlog first, and nothing is ever missed.
 */
class LineReader {
  private readonly lines: string[] = [];
  private buf = '';
  private readonly waiters: Array<{
    predicate: (line: string) => boolean;
    resolve: (line: string) => void;
    timer: NodeJS.Timeout;
  }> = [];

  constructor(stream: Readable) {
    stream.on('data', (chunk: Buffer) => {
      this.buf += chunk.toString('utf8');
      const parts = this.buf.split('\n');
      this.buf = parts.pop() ?? '';
      for (const line of parts) {
        this.lines.push(line);
        this.tryResolveWaiters();
      }
    });
  }

  private tryResolveWaiters(): void {
    for (let i = this.waiters.length - 1; i >= 0; i--) {
      const waiter = this.waiters[i];
      const match = this.lines.find(waiter.predicate);
      if (match !== undefined) {
        clearTimeout(waiter.timer);
        this.waiters.splice(i, 1);
        waiter.resolve(match);
      }
    }
  }

  async waitFor(predicate: (line: string) => boolean, timeoutMs: number): Promise<string> {
    const already = this.lines.find(predicate);
    if (already !== undefined) return already;
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.resolve === wrappedResolve);
        if (idx !== -1) this.waiters.splice(idx, 1);
        reject(
          new Error(`timed out waiting for a line matching predicate; saw: ${JSON.stringify(this.lines)}`),
        );
      }, timeoutMs);
      const wrappedResolve = (line: string): void => resolve(line);
      this.waiters.push({ predicate, resolve: wrappedResolve, timer });
    });
  }

  /**
   * Waits for the Nth (0-indexed) line matching `predicate` to have arrived. Polls the backlog
   * rather than composing with a stateful predicate: a predicate passed to `waitFor` can be
   * invoked repeatedly against the full backlog every time a new line arrives, so a mutable
   * counter closed over by the predicate itself would double-count.
   */
  async waitForNth(predicate: (line: string) => boolean, n: number, timeoutMs: number): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const matches = this.lines.filter(predicate);
      if (matches.length > n) return matches[n];
      if (Date.now() >= deadline) {
        throw new Error(
          `timed out waiting for match #${n}; saw ${matches.length} match(es) of ${this.lines.length} line(s): ${JSON.stringify(this.lines)}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

test('a real, separate child process receives the exact framed legacy payload via the mailbox transport', async () => {
  const homeRoot = tempHome();
  const scriptPath = join(homeRoot, 'session-child.mjs');
  writeFileSync(scriptPath, CHILD_SOURCE, 'utf8');
  const sessionId = 'e2e-legacy';

  const child: ChildProcessByStdio<Writable, Readable, null> = spawn(
    process.execPath,
    [scriptPath, homeRoot, sessionId],
    { stdio: ['pipe', 'pipe', 'inherit'] },
  );
  const reader = new LineReader(child.stdout);

  try {
    await reader.waitFor((l) => l === 'READY', 10_000);

    const resolved = resolveTarget(sessionId, { homeRoot });
    assert.equal(resolved.ok, true, `expected the child to have registered itself: ${JSON.stringify(resolved)}`);
    if (!resolved.ok) return;
    assert.equal(resolved.record.pid, child.pid, 'resolveTarget must see the real child pid, not a guess');

    const route = mailboxDeliveryRoute({ homeRoot });
    const target = { record: resolved.record, bracketedPaste: false };

    assert.equal(await route.isAvailable(target), true);

    const result = await route.deliver(target, 'hello from a real crack');
    assert.equal(result.ok, true, `expected delivery to succeed: ${JSON.stringify(result)}`);
    assert.equal(result.route, 'session-mailbox');

    const isReceived = (l: string): boolean => l.startsWith('RECEIVED:');
    const firstLine = await reader.waitForNth(isReceived, 0, 5_000);
    const firstReceived = JSON.parse(firstLine.slice('RECEIVED:'.length)) as string;
    assert.equal(firstReceived, 'hello from a real crack');

    const secondLine = await reader.waitForNth(isReceived, 1, 5_000);
    const secondReceived = JSON.parse(secondLine.slice('RECEIVED:'.length)) as string;
    assert.equal(secondReceived, '\r', 'the Enter must arrive as its own separate write in legacy mode');
  } finally {
    child.kill();
    rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('a real, separate child process receives a SINGLE bracketed-paste write with the trailing Enter inside it', async () => {
  const homeRoot = tempHome();
  const scriptPath = join(homeRoot, 'session-child.mjs');
  writeFileSync(scriptPath, CHILD_SOURCE, 'utf8');
  const sessionId = 'e2e-bracketed';

  const child: ChildProcessByStdio<Writable, Readable, null> = spawn(
    process.execPath,
    [scriptPath, homeRoot, sessionId],
    { stdio: ['pipe', 'pipe', 'inherit'] },
  );
  const reader = new LineReader(child.stdout);

  try {
    await reader.waitFor((l) => l === 'READY', 10_000);

    const resolved = resolveTarget(sessionId, { homeRoot });
    assert.equal(resolved.ok, true);
    if (!resolved.ok) return;

    const route = mailboxDeliveryRoute({ homeRoot });
    const target = { record: resolved.record, bracketedPaste: true };

    const result = await route.deliver(target, 'go faster please');
    assert.equal(result.ok, true, `expected delivery to succeed: ${JSON.stringify(result)}`);

    const line = await reader.waitFor((l) => l.startsWith('RECEIVED:'), 5_000);
    const received = JSON.parse(line.slice('RECEIVED:'.length)) as string;
    assert.ok(received.startsWith(PASTE_START));
    assert.ok(received.includes('go faster please'));
    assert.ok(received.includes(PASTE_END));
    assert.ok(received.endsWith('\r'));

    // The load-bearing cross-process assertion: exactly one write ever reaches the real child in
    // bracketed mode. Give it a real grace window (not the whole 5s ack budget) to rule out a
    // second, delayed write showing up -- which would mean the Enter got split out into a second
    // write even in bracketed mode, exactly the bug the single-write invariant exists to prevent.
    await new Promise((resolve) => setTimeout(resolve, 500));
    let sawSecond = false;
    try {
      await reader.waitFor((l) => l.startsWith('RECEIVED:') && l !== line, 10);
      sawSecond = true;
    } catch {
      // Expected: no second write ever arrives.
    }
    assert.equal(sawSecond, false, 'bracketed-paste delivery must be exactly one write, never two');
  } finally {
    child.kill();
    rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('resolveTarget refuses delivery once the real child process has actually exited', async () => {
  const homeRoot = tempHome();
  const scriptPath = join(homeRoot, 'session-child.mjs');
  writeFileSync(scriptPath, CHILD_SOURCE, 'utf8');
  const sessionId = 'e2e-gone';

  const child: ChildProcessByStdio<Writable, Readable, null> = spawn(
    process.execPath,
    [scriptPath, homeRoot, sessionId],
    { stdio: ['pipe', 'pipe', 'inherit'] },
  );
  const reader = new LineReader(child.stdout);
  await reader.waitFor((l) => l === 'READY', 10_000);
  child.kill();
  await new Promise((resolve) => child.once('exit', resolve));
  // Give the OS a brief moment to fully reap the process on platforms where liveness checks can
  // otherwise race a just-killed pid.
  await new Promise((resolve) => setTimeout(resolve, 200));

  try {
    const resolved = resolveTarget(sessionId, { homeRoot });
    assert.equal(resolved.ok, false);
    assert.equal(!resolved.ok && resolved.reason, 'process-gone');
  } finally {
    rmSync(homeRoot, { recursive: true, force: true });
  }
});
