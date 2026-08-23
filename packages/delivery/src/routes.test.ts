import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PASTE_END, PASTE_START } from '@agent-whip/paste-frame';
import type { SessionRecord } from './registry.js';
import {
  deliverWithFallback,
  noopRoute,
  ptyWriteRoute,
  type DeliveryRoute,
  type SessionTarget,
} from './routes.js';

function target(bracketedPaste: boolean): SessionTarget {
  const record: SessionRecord = {
    sessionId: 's1',
    pid: 111,
    ppid: 222,
    createdAt: new Date().toISOString(),
    runtime: 'claude',
    cwd: '/x',
    nonce: 'n',
  };
  return { record, bracketedPaste };
}

test('bracketed-paste delivery is a SINGLE write containing the framed text and trailing \\r', async () => {
  const calls: string[] = [];
  const route = ptyWriteRoute((_t, data) => {
    calls.push(data);
  });
  const t = target(true);
  const result = await route.deliver(t, 'hello agent');
  assert.equal(result.ok, true);
  // The load-bearing assertion: exactly one write, spying the actual writer primitive.
  assert.equal(calls.length, 1);
  const written = calls[0];
  assert.ok(written.startsWith(PASTE_START), 'must start with the paste-start marker');
  assert.ok(written.includes('hello agent'), 'must contain the payload text');
  assert.ok(written.includes(PASTE_END), 'must contain the paste-end marker');
  assert.ok(written.endsWith('\r'), 'the Enter must be in the SAME write as the frame');
  // The Enter must come after the closing marker, not be swallowed inside the frame.
  assert.ok(written.indexOf(PASTE_END) < written.lastIndexOf('\r'));
});

test('legacy (non-bracketed) delivery is two writes: text, then a separate Enter', async () => {
  const calls: string[] = [];
  const route = ptyWriteRoute((_t, data) => {
    calls.push(data);
  });
  const t = target(false);
  const result = await route.deliver(t, 'hello agent');
  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0], 'hello agent');
  assert.equal(calls[1], '\r');
});

test('deliverWithFallback tries routes in order and uses the first available one', async () => {
  const unavailable: DeliveryRoute = {
    name: 'unavailable',
    interrupts: false,
    async isAvailable() {
      return false;
    },
    async deliver() {
      throw new Error('must not be called');
    },
  };
  const result = await deliverWithFallback(target(false), 'payload', [unavailable, noopRoute]);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.route, 'noop');
});

test('deliverWithFallback returns no-route when every non-interrupting route is unavailable', async () => {
  const unavailable: DeliveryRoute = {
    name: 'unavailable',
    interrupts: false,
    async isAvailable() {
      return false;
    },
    async deliver() {
      throw new Error('must not be called');
    },
  };
  const result = await deliverWithFallback(target(false), 'payload', [unavailable]);
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.reason, 'no-route');
  assert.equal(!result.ok && result.route, null);
});

test('an interrupting route is NEVER auto-selected, even when it is the only available route', async () => {
  let delivered = false;
  const interrupting: DeliveryRoute = {
    name: 'ctrl-c-then-write',
    interrupts: true,
    async isAvailable() {
      return true; // the only "available" route in this ladder
    },
    async deliver() {
      delivered = true;
      return { ok: true, route: 'ctrl-c-then-write' };
    },
  };
  const result = await deliverWithFallback(target(false), 'payload', [interrupting]);
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.reason, 'no-route');
  assert.equal(delivered, false, 'the interrupting route must never actually run');
});

test('an interrupting route CAN be selected, but only with explicit allowInterrupting: true', async () => {
  const interrupting: DeliveryRoute = {
    name: 'ctrl-c-then-write',
    interrupts: true,
    async isAvailable() {
      return true;
    },
    async deliver() {
      return { ok: true, route: 'ctrl-c-then-write' };
    },
  };
  const result = await deliverWithFallback(target(false), 'payload', [interrupting], {
    allowInterrupting: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.route, 'ctrl-c-then-write');
});
