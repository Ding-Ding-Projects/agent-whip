import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ProfileState } from '@agent-whip/core';
import { run, USAGE, VERSION } from './cli.js';
import type { Deps } from './commands.js';
import type { ResolveResult, SessionRecord } from './registry-bridge.js';
import { fakeIo } from './test-helpers.js';

function record(): SessionRecord {
  return {
    sessionId: 'sess-1',
    pid: 1,
    ppid: 1,
    createdAt: new Date(0).toISOString(),
    runtime: 'claude',
    cwd: '/work',
    nonce: 'n',
  };
}

function testProfileState(): ProfileState {
  return { profile: { tier1: 't1', tier2: 't2' }, source: 'default', schemaVersion: null, reason: null };
}

function testDeps(overrides: Partial<Deps> = {}): Deps {
  const resolved: ResolveResult = { ok: true, record: record() };
  return {
    resolveTarget: () => resolved,
    resolveUniqueLiveSession: () => resolved,
    listSessions: () => [record()],
    registerSession: (p) => ({ ...record(), ...p }),
    unregisterSession: () => {},
    loadProfile: () => testProfileState(),
    clearProfileCache: () => {},
    recordCrack: () => 1,
    routes: [],
    now: () => 0,
    ...overrides,
  };
}

test('run(): no args prints usage and exits 0', async () => {
  const io = fakeIo();
  const code = await run([], io, testDeps());
  assert.equal(code, 0);
  assert.equal(io.out.join('\n'), USAGE);
});

test('run(): --version prints the version and exits 0', async () => {
  const io = fakeIo();
  const code = await run(['--version'], io, testDeps());
  assert.equal(code, 0);
  assert.deepEqual(io.out, [VERSION]);
});

test('run(): a usage error exits 2 and never touches stdout', async () => {
  const io = fakeIo();
  const code = await run(['crack', '--tier', '9'], io, testDeps());
  assert.equal(code, 2);
  assert.equal(io.out.length, 0);
  assert.ok(io.err.length > 0);
});

test('run(): unknown command exits 2', async () => {
  const io = fakeIo();
  const code = await run(['not-a-command'], io, testDeps());
  assert.equal(code, 2);
});

test('run(): crack dispatches through to a real refusal (exit 1) when nothing is registered', async () => {
  const io = fakeIo();
  const deps = testDeps({ resolveUniqueLiveSession: () => ({ ok: false, reason: 'not-registered' }) });
  const code = await run(['crack'], io, deps);
  assert.equal(code, 1);
});

test('run(): sessions dispatches and exits 0', async () => {
  const io = fakeIo();
  const code = await run(['sessions', '--json'], io, testDeps());
  assert.equal(code, 0);
  assert.equal(io.out.length, 1);
  JSON.parse(io.out[0]); // must not throw
});

test('run(): register requires --runtime, else exit 2', async () => {
  const io = fakeIo();
  const code = await run(['register'], io, testDeps());
  assert.equal(code, 2);
});

test('run(): register --runtime claude exits 0', async () => {
  const io = fakeIo();
  const code = await run(['register', '--runtime', 'claude'], io, testDeps());
  assert.equal(code, 0);
});

test('run(): unregister without --session exits 2', async () => {
  const io = fakeIo();
  const code = await run(['unregister'], io, testDeps());
  assert.equal(code, 2);
});

test('run(): profile reload exits 0 and clears the cache', async () => {
  const io = fakeIo();
  let cleared = false;
  const deps = testDeps({ clearProfileCache: () => { cleared = true; } });
  const code = await run(['profile', 'reload'], io, deps);
  assert.equal(code, 0);
  assert.equal(cleared, true);
});
