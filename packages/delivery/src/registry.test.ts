import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { ProcessFacts } from './process-facts.js';
import { listSessions, registerSession, resolveTarget, resolveUniqueLiveSession } from './registry.js';

function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), 'agent-whip-registry-'));
}

function fakeFacts(alive: Set<number>, parents: Map<number, number | null>): ProcessFacts {
  return {
    isAlive: (pid) => alive.has(pid),
    getParentPid: (pid) => parents.get(pid) ?? null,
  };
}

test('resolveTarget refuses when nothing was ever registered (fail closed, zero matches)', () => {
  const root = tempRoot();
  try {
    const result = resolveTarget('never-registered', { homeRoot: root });
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.reason, 'not-registered');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('resolveTarget succeeds for a live, lineage-matched registration', () => {
  const root = tempRoot();
  try {
    registerSession(
      { sessionId: 's1', pid: 111, ppid: 222, runtime: 'claude', cwd: '/x' },
      { homeRoot: root },
    );
    const facts = fakeFacts(new Set([111]), new Map([[111, 222]]));
    const result = resolveTarget('s1', { homeRoot: root, facts });
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.record.pid, 111);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('resolveTarget discards a stale registration whose PID no longer exists', () => {
  const root = tempRoot();
  try {
    registerSession(
      { sessionId: 's1', pid: 111, ppid: 222, runtime: 'claude', cwd: '/x' },
      { homeRoot: root },
    );
    const facts = fakeFacts(new Set(), new Map()); // pid 111 is not alive
    const result = resolveTarget('s1', { homeRoot: root, facts });
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.reason, 'process-gone');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('resolveTarget refuses on a positive lineage mismatch (PID reuse signature)', () => {
  const root = tempRoot();
  try {
    registerSession(
      { sessionId: 's1', pid: 111, ppid: 222, runtime: 'claude', cwd: '/x' },
      { homeRoot: root },
    );
    // pid 111 is alive, but its CURRENT parent is 999, not the 222 recorded at registration --
    // this is exactly what PID reuse looks like: a different process now sits at that number.
    const facts = fakeFacts(new Set([111]), new Map([[111, 999]]));
    const result = resolveTarget('s1', { homeRoot: root, facts });
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.reason, 'lineage-mismatch');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('resolveTarget does NOT refuse when current parent pid is merely unknown (null)', () => {
  const root = tempRoot();
  try {
    registerSession(
      { sessionId: 's1', pid: 111, ppid: 222, runtime: 'claude', cwd: '/x' },
      { homeRoot: root },
    );
    const facts = fakeFacts(new Set([111]), new Map()); // getParentPid returns null: unknown
    const result = resolveTarget('s1', { homeRoot: root, facts });
    assert.equal(result.ok, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('resolveUniqueLiveSession refuses on zero live sessions', () => {
  const root = tempRoot();
  try {
    const facts = fakeFacts(new Set(), new Map());
    const result = resolveUniqueLiveSession({ homeRoot: root, facts });
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.reason, 'not-registered');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('resolveUniqueLiveSession refuses ambiguous (more than one live match), never picks first', () => {
  const root = tempRoot();
  try {
    registerSession({ sessionId: 'a', pid: 1, ppid: 10, runtime: 'claude', cwd: '/a' }, { homeRoot: root });
    registerSession({ sessionId: 'b', pid: 2, ppid: 20, runtime: 'codex', cwd: '/b' }, { homeRoot: root });
    const facts = fakeFacts(new Set([1, 2]), new Map([[1, 10], [2, 20]]));
    const result = resolveUniqueLiveSession({ homeRoot: root, facts });
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.reason, 'ambiguous');
    // sanity: both were indeed registered and would each resolve individually
    assert.equal(listSessions({ homeRoot: root }).length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('resolveTarget re-resolves at fire time: a session replaced between calls is caught', () => {
  const root = tempRoot();
  try {
    registerSession(
      { sessionId: 's1', pid: 111, ppid: 222, runtime: 'claude', cwd: '/x' },
      { homeRoot: root },
    );
    // "Crack time": still alive, lineage matches.
    const aliveAtCrackTime = fakeFacts(new Set([111]), new Map([[111, 222]]));
    const first = resolveTarget('s1', { homeRoot: root, facts: aliveAtCrackTime });
    assert.equal(first.ok, true);

    // "Fire time": the pty was replaced by another process reusing the same pid, under a
    // different parent. A caller that re-resolves (as required) catches this; a caller that
    // cached the first result would not.
    const replacedAtFireTime = fakeFacts(new Set([111]), new Map([[111, 999]]));
    const second = resolveTarget('s1', { homeRoot: root, facts: replacedAtFireTime });
    assert.equal(second.ok, false);
    assert.equal(!second.ok && second.reason, 'lineage-mismatch');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
