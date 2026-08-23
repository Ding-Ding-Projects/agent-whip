import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ProfileState } from '@agent-whip/core';
import type { Deps } from './commands.js';
import { runCrack, runProfile, runRegister, runSessions, runUnregister } from './commands.js';
import type { ResolveResult, SessionRecord } from './registry-bridge.js';
import { fakeIo } from './test-helpers.js';

const SENTINEL_TIER1 = 'sentinel-tier1-payload-must-never-be-printed-xk29';
const SENTINEL_TIER2 = 'sentinel-tier2-payload-must-never-be-printed-zq77';

function sentinelProfileState(): ProfileState {
  return {
    profile: { tier1: SENTINEL_TIER1, tier2: SENTINEL_TIER2 },
    source: 'file',
    schemaVersion: 1,
    reason: null,
  };
}

function record(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    sessionId: 'sess-1',
    pid: 4321,
    ppid: 1,
    createdAt: new Date(0).toISOString(),
    runtime: 'claude',
    cwd: '/work',
    nonce: 'abc',
    ...overrides,
  };
}

function baseDeps(overrides: Partial<Deps> = {}): Deps {
  const resolved: ResolveResult = { ok: true, record: record() };
  return {
    resolveTarget: () => resolved,
    resolveUniqueLiveSession: () => resolved,
    listSessions: () => [record()],
    registerSession: (p) => ({ ...record(), ...p, createdAt: new Date(0).toISOString(), nonce: 'n' }),
    unregisterSession: () => {},
    loadProfile: () => sentinelProfileState(),
    clearProfileCache: () => {},
    recordCrack: () => 1,
    routes: [],
    now: () => 0,
    ...overrides,
  };
}

// --- exit codes -------------------------------------------------------------

test('crack: refusal exits 1 and reports to stderr', async () => {
  const io = fakeIo();
  const deps = baseDeps({ resolveUniqueLiveSession: () => ({ ok: false, reason: 'not-registered' }) });
  const code = await runCrack({ cmd: 'crack', session: null, tier: null, dryRun: false, json: false }, io, deps);
  assert.equal(code, 1);
  assert.equal(io.out.length, 0);
  assert.ok(io.err.some((l) => l.includes('not-registered')));
});

test('crack: no route wired (non-dry-run) refuses with exit 1', async () => {
  const io = fakeIo();
  const deps = baseDeps(); // routes: []
  const code = await runCrack({ cmd: 'crack', session: null, tier: 1, dryRun: false, json: false }, io, deps);
  assert.equal(code, 1);
  assert.ok(io.err.some((l) => l.includes('no-route')));
});

test('crack: --dry-run succeeds with exit 0', async () => {
  const io = fakeIo();
  const deps = baseDeps();
  const code = await runCrack({ cmd: 'crack', session: null, tier: 1, dryRun: true, json: false }, io, deps);
  assert.equal(code, 0);
});

test('crack: forced --tier bypasses recordCrack', async () => {
  const io = fakeIo();
  let called = false;
  const deps = baseDeps({
    recordCrack: () => {
      called = true;
      return 1;
    },
  });
  await runCrack({ cmd: 'crack', session: null, tier: 2, dryRun: true, json: false }, io, deps);
  assert.equal(called, false);
});

test('sessions: exits 0 and lists rows', () => {
  const io = fakeIo();
  const code = runSessions({ cmd: 'sessions', json: false }, io, baseDeps());
  assert.equal(code, 0);
  assert.ok(io.out.some((l) => l.includes('sess-1')));
});

test('register: exits 0', () => {
  const io = fakeIo();
  const code = runRegister({ cmd: 'register', runtime: 'claude', session: 'x' }, io, baseDeps());
  assert.equal(code, 0);
});

test('unregister: exits 0', () => {
  const io = fakeIo();
  const code = runUnregister({ cmd: 'unregister', session: 'x' }, io, baseDeps());
  assert.equal(code, 0);
});

test('profile: exits 0', () => {
  const io = fakeIo();
  const code = runProfile({ cmd: 'profile', reload: false, path: null, json: false }, io, baseDeps());
  assert.equal(code, 0);
});

// --- --json is valid, single-object JSON ------------------------------------

function assertSingleJsonLine(lines: readonly string[]): unknown {
  assert.equal(lines.length, 1, `expected exactly one stdout line, got ${lines.length}: ${JSON.stringify(lines)}`);
  const parsed: unknown = JSON.parse(lines[0]);
  assert.ok(parsed !== null && typeof parsed === 'object');
  return parsed;
}

test('crack --json --dry-run emits one JSON object', async () => {
  const io = fakeIo();
  const code = await runCrack({ cmd: 'crack', session: null, tier: 1, dryRun: true, json: true }, io, baseDeps());
  assert.equal(code, 0);
  assertSingleJsonLine(io.out);
});

test('crack --json refusal emits one JSON object on stdout, nothing on stderr', async () => {
  const io = fakeIo();
  const deps = baseDeps({ resolveUniqueLiveSession: () => ({ ok: false, reason: 'ambiguous' }) });
  const code = await runCrack({ cmd: 'crack', session: null, tier: null, dryRun: false, json: true }, io, deps);
  assert.equal(code, 1);
  const parsed = assertSingleJsonLine(io.out) as { ok: boolean; reason: string };
  assert.equal(parsed.ok, false);
  assert.equal(parsed.reason, 'ambiguous');
  assert.equal(io.err.length, 0);
});

test('sessions --json emits one JSON array', () => {
  const io = fakeIo();
  runSessions({ cmd: 'sessions', json: true }, io, baseDeps());
  assert.equal(io.out.length, 1);
  const parsed: unknown = JSON.parse(io.out[0]);
  assert.ok(Array.isArray(parsed));
});

test('profile --json emits one JSON object', () => {
  const io = fakeIo();
  runProfile({ cmd: 'profile', reload: false, path: null, json: true }, io, baseDeps());
  assertSingleJsonLine(io.out);
});

// --- the payload text can NEVER be printed, by any command path -------------

function allCaptured(io: { out: string[]; err: string[] }): string {
  return [...io.out, ...io.err].join('\n');
}

test('SECURITY: no command path ever prints the payload text', async () => {
  const deps = baseDeps();
  const combined: string[] = [];

  for (const jsonMode of [false, true]) {
    for (const dryRun of [false, true]) {
      const io = fakeIo();
      await runCrack({ cmd: 'crack', session: null, tier: 1, dryRun, json: jsonMode }, io, deps);
      combined.push(allCaptured(io));
    }
    {
      const io = fakeIo();
      runSessions({ cmd: 'sessions', json: jsonMode }, io, deps);
      combined.push(allCaptured(io));
    }
    {
      const io = fakeIo();
      runProfile({ cmd: 'profile', reload: false, path: null, json: jsonMode }, io, deps);
      combined.push(allCaptured(io));
    }
    {
      const io = fakeIo();
      runProfile({ cmd: 'profile', reload: true, path: null, json: jsonMode }, io, deps);
      combined.push(allCaptured(io));
    }
  }
  {
    const io = fakeIo();
    runRegister({ cmd: 'register', runtime: 'claude', session: null }, io, deps);
    combined.push(allCaptured(io));
  }
  {
    const io = fakeIo();
    runUnregister({ cmd: 'unregister', session: 'x' }, io, deps);
    combined.push(allCaptured(io));
  }

  const everything = combined.join('\n---\n');

  // Harness sanity: prove the harness actually captured something concrete, so a mangled sentinel
  // or a silently-broken capture cannot make this test pass vacuously.
  assert.ok(everything.length > 0, 'harness captured nothing at all -- this test cannot prove anything');
  assert.ok(everything.includes('sess-1'), 'harness sanity check: expected session id did not appear');

  assert.equal(everything.includes(SENTINEL_TIER1), false, 'tier1 payload text leaked into output');
  assert.equal(everything.includes(SENTINEL_TIER2), false, 'tier2 payload text leaked into output');
});
