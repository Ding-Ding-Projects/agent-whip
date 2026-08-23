import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgv } from './argv.js';

test('no args -> help', () => {
  const r = parseArgv([]);
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.args.cmd, 'help');
});

test('--help and -h -> help', () => {
  for (const flag of ['--help', '-h']) {
    const r = parseArgv([flag]);
    assert.equal(r.ok, true);
    assert.equal(r.ok && r.args.cmd, 'help');
  }
});

test('--version and -v -> version', () => {
  for (const flag of ['--version', '-v']) {
    const r = parseArgv([flag]);
    assert.equal(r.ok, true);
    assert.equal(r.ok && r.args.cmd, 'version');
  }
});

test('unknown command is a usage error', () => {
  const r = parseArgv(['nonsense']);
  assert.equal(r.ok, false);
});

test('crack: bare', () => {
  const r = parseArgv(['crack']);
  assert.deepEqual(r, { ok: true, args: { cmd: 'crack', session: null, tier: null, dryRun: false, json: false } });
});

test('crack: all flags, space-separated', () => {
  const r = parseArgv(['crack', '--session', 'abc', '--tier', '2', '--dry-run', '--json']);
  assert.deepEqual(r, { ok: true, args: { cmd: 'crack', session: 'abc', tier: 2, dryRun: true, json: true } });
});

test('crack: flags with = form', () => {
  const r = parseArgv(['crack', '--session=abc', '--tier=1']);
  assert.deepEqual(r, { ok: true, args: { cmd: 'crack', session: 'abc', tier: 1, dryRun: false, json: false } });
});

test('crack: bad tier value is a usage error', () => {
  const r = parseArgv(['crack', '--tier', '3']);
  assert.equal(r.ok, false);
});

test('crack: --session with missing value is a usage error', () => {
  const r = parseArgv(['crack', '--session']);
  assert.equal(r.ok, false);
});

test('crack: --session followed by another flag is a usage error (no value consumed)', () => {
  const r = parseArgv(['crack', '--session', '--dry-run']);
  assert.equal(r.ok, false);
});

test('crack: unknown option is a usage error', () => {
  const r = parseArgv(['crack', '--nope']);
  assert.equal(r.ok, false);
});

test('crack: there is no --payload/--message/--text override flag', () => {
  for (const flag of ['--payload', '--message', '--text']) {
    const r = parseArgv(['crack', flag, 'anything']);
    assert.equal(r.ok, false, `${flag} must not be accepted`);
  }
});

test('sessions: bare and --json', () => {
  assert.deepEqual(parseArgv(['sessions']), { ok: true, args: { cmd: 'sessions', json: false } });
  assert.deepEqual(parseArgv(['sessions', '--json']), { ok: true, args: { cmd: 'sessions', json: true } });
});

test('sessions: unknown option is a usage error', () => {
  assert.equal(parseArgv(['sessions', '--bogus']).ok, false);
});

test('register: requires --runtime', () => {
  const r = parseArgv(['register']);
  assert.equal(r.ok, false);
});

test('register: rejects unknown runtime', () => {
  const r = parseArgv(['register', '--runtime', 'gpt']);
  assert.equal(r.ok, false);
});

test('register: accepts claude and codex, with optional --session', () => {
  assert.deepEqual(parseArgv(['register', '--runtime', 'claude']), {
    ok: true,
    args: { cmd: 'register', runtime: 'claude', session: null },
  });
  assert.deepEqual(parseArgv(['register', '--runtime', 'codex', '--session', 'x']), {
    ok: true,
    args: { cmd: 'register', runtime: 'codex', session: 'x' },
  });
});

test('unregister: requires --session', () => {
  assert.equal(parseArgv(['unregister']).ok, false);
});

test('unregister: accepts --session', () => {
  assert.deepEqual(parseArgv(['unregister', '--session', 'x']), {
    ok: true,
    args: { cmd: 'unregister', session: 'x' },
  });
});

test('profile: bare, --path, --json', () => {
  assert.deepEqual(parseArgv(['profile']), { ok: true, args: { cmd: 'profile', reload: false, path: null, json: false } });
  assert.deepEqual(parseArgv(['profile', '--path', '/tmp/p.json', '--json']), {
    ok: true,
    args: { cmd: 'profile', reload: false, path: '/tmp/p.json', json: true },
  });
});

test('profile reload', () => {
  assert.deepEqual(parseArgv(['profile', 'reload']), {
    ok: true,
    args: { cmd: 'profile', reload: true, path: null, json: false },
  });
  assert.deepEqual(parseArgv(['profile', 'reload', '--json']), {
    ok: true,
    args: { cmd: 'profile', reload: true, path: null, json: true },
  });
});

test('profile: unknown option is a usage error', () => {
  assert.equal(parseArgv(['profile', '--bogus']).ok, false);
});
