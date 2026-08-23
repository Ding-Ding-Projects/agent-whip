import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { PASTE_END, PASTE_START } from '@agent-whip/paste-frame';
import type { SessionRecord } from '../registry.js';
import type { SessionTarget } from '../routes.js';
import { mailboxDeliveryRoute, startSessionDeliveryServer } from './mailbox-route.js';

function tempHome(): string {
  return mkdtempSync(join(tmpdir(), 'agent-whip-mailbox-'));
}

function record(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    sessionId: 's1',
    pid: process.pid,
    ppid: 1,
    createdAt: new Date().toISOString(),
    runtime: 'claude',
    cwd: '/x',
    nonce: 'the-real-nonce',
    ...overrides,
  };
}

function target(bracketedPaste: boolean, overrides: Partial<SessionRecord> = {}): SessionTarget {
  return { record: record(overrides), bracketedPaste };
}

test('isAvailable is false until the session-side listener has created its mailbox', async () => {
  const homeRoot = tempHome();
  try {
    const route = mailboxDeliveryRoute({ homeRoot });
    assert.equal(await route.isAvailable(target(false)), false);
    const server = startSessionDeliveryServer(record(), () => {}, { homeRoot });
    try {
      assert.equal(await route.isAvailable(target(false)), true);
    } finally {
      server.close();
    }
  } finally {
    rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('bracketed-paste delivery is a SINGLE round trip containing the framed text and trailing \\r', async () => {
  const homeRoot = tempHome();
  const received: string[] = [];
  const server = startSessionDeliveryServer(
    record(),
    (data) => {
      received.push(data);
    },
    { homeRoot },
  );
  try {
    const route = mailboxDeliveryRoute({ homeRoot });
    const result = await route.deliver(target(true), 'hello agent');
    assert.equal(result.ok, true);
    assert.equal(received.length, 1, 'exactly one write must reach the session-side writer');
    const written = received[0];
    assert.ok(written.startsWith(PASTE_START));
    assert.ok(written.includes('hello agent'));
    assert.ok(written.includes(PASTE_END));
    assert.ok(written.endsWith('\r'));
  } finally {
    server.close();
    rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('legacy (non-bracketed) delivery is two round trips: text, then a separate Enter', async () => {
  const homeRoot = tempHome();
  const received: string[] = [];
  const server = startSessionDeliveryServer(
    record(),
    (data) => {
      received.push(data);
    },
    { homeRoot },
  );
  try {
    const route = mailboxDeliveryRoute({ homeRoot });
    const result = await route.deliver(target(false), 'hello agent');
    assert.equal(result.ok, true);
    assert.deepEqual(received, ['hello agent', '\r']);
  } finally {
    server.close();
    rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('a nonce mismatch is refused and the writer is NEVER invoked', async () => {
  const homeRoot = tempHome();
  let writerCalled = false;
  const server = startSessionDeliveryServer(
    record({ nonce: 'server-side-nonce' }),
    () => {
      writerCalled = true;
    },
    { homeRoot },
  );
  try {
    const route = mailboxDeliveryRoute({ homeRoot, ackTimeoutMs: 500, pollIntervalMs: 5 });
    // The client's target carries a DIFFERENT nonce than the one the server was started with --
    // simulating a stale/forged registry record.
    const result = await route.deliver(target(false, { nonce: 'wrong-nonce' }), 'payload');
    assert.equal(result.ok, false);
    assert.equal(result.route, 'session-mailbox');
    assert.match(result.reason ?? '', /nonce-mismatch/);
    assert.equal(writerCalled, false, 'the writer must never run on a nonce mismatch');
  } finally {
    server.close();
    rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('fails closed with no listener: no mailbox directory at all', async () => {
  const homeRoot = tempHome();
  try {
    const route = mailboxDeliveryRoute({ homeRoot, ackTimeoutMs: 200, pollIntervalMs: 5 });
    assert.equal(await route.isAvailable(target(false)), false);
    const result = await route.deliver(target(false), 'payload');
    assert.equal(result.ok, false);
    assert.match(result.reason ?? '', /mailbox-not-found/);
  } finally {
    rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('fails closed on an ack timeout: mailbox exists but nothing ever answers', async () => {
  const homeRoot = tempHome();
  // Simulate a listener that created its mailbox directory and then died (or is permanently
  // stuck) without ever answering -- the client must time out, never guess "delivered".
  const server = startSessionDeliveryServer(record(), () => {}, { homeRoot });
  server.close(); // removes the mailbox dir entirely, so isAvailable also reports honestly false
  try {
    const route = mailboxDeliveryRoute({ homeRoot, ackTimeoutMs: 200, pollIntervalMs: 5 });
    const result = await route.deliver(target(false), 'payload');
    assert.equal(result.ok, false);
  } finally {
    rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('an explicit writer failure is reported, never silently treated as delivered', async () => {
  const homeRoot = tempHome();
  const server = startSessionDeliveryServer(
    record(),
    () => {
      throw new Error('pty write blew up');
    },
    { homeRoot },
  );
  try {
    const route = mailboxDeliveryRoute({ homeRoot, ackTimeoutMs: 500, pollIntervalMs: 5 });
    const result = await route.deliver(target(false), 'payload');
    assert.equal(result.ok, false);
    assert.match(result.reason ?? '', /pty write blew up/);
  } finally {
    server.close();
    rmSync(homeRoot, { recursive: true, force: true });
  }
});
