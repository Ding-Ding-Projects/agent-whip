import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { auditLogPath, payloadIdentity, recordCrackAttempt } from './audit.js';

function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), 'agent-whip-audit-'));
}

test('recordCrackAttempt writes the hash prefix and never the raw payload text', () => {
  const root = tempRoot();
  try {
    const secretPayload = 'the quick brown fox: totally-a-secret-token-value';
    recordCrackAttempt(
      { tier: 1, sessionId: 's1', pid: 111, route: 'pty-write', outcome: 'delivered', payload: secretPayload },
      { homeRoot: root },
    );
    const raw = readFileSync(auditLogPath(root), 'utf8');
    // Assert against the RAW BYTES read back off disk, not a typed field -- a field that happens
    // to be undefined proves nothing about what actually landed on disk.
    assert.ok(!raw.includes(secretPayload), 'the raw log bytes must never contain the payload text');
    assert.ok(!raw.includes('quick brown fox'), 'no fragment of the payload text may leak either');
    const expectedHash = payloadIdentity(secretPayload);
    assert.ok(raw.includes(expectedHash), 'the raw log bytes must contain the payload hash prefix');

    const line = JSON.parse(raw.trim().split('\n')[0]);
    assert.equal(line.payloadHash, expectedHash);
    assert.equal(line.sessionId, 's1');
    assert.equal(line.tier, 1);
    assert.equal(line.route, 'pty-write');
    assert.equal(line.outcome, 'delivered');
    assert.ok(typeof line.ts === 'string' && line.ts.length > 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('recordCrackAttempt appends multiple lines (JSONL) rather than overwriting', () => {
  const root = tempRoot();
  try {
    recordCrackAttempt({ tier: 1, sessionId: 's1', pid: 1, route: 'noop', outcome: 'delivered', payload: 'a' }, { homeRoot: root });
    recordCrackAttempt({ tier: 2, sessionId: 's2', pid: 2, route: null, outcome: 'refused', detail: 'no-route', payload: 'b' }, { homeRoot: root });
    const raw = readFileSync(auditLogPath(root), 'utf8');
    const lines = raw.trim().split('\n');
    assert.equal(lines.length, 2);
    const second = JSON.parse(lines[1]);
    assert.equal(second.sessionId, 's2');
    assert.equal(second.outcome, 'refused');
    assert.equal(second.detail, 'no-route');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('recordCrackAttempt never throws even if the log directory cannot be created', () => {
  // homeRoot pointing through a path component that is actually a file, not a directory.
  const root = tempRoot();
  try {
    const blockerFile = join(root, 'blocker');
    writeFileSync(blockerFile, 'x');
    assert.doesNotThrow(() => {
      recordCrackAttempt(
        { tier: 1, sessionId: 's1', pid: 1, route: 'noop', outcome: 'delivered', payload: 'a' },
        { homeRoot: join(blockerFile, 'impossible') },
      );
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
