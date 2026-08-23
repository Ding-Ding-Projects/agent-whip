import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recordCrack, resetCrackState } from './crack-window.js';

function withTempPath<T>(fn: (path: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'agent-whip-crack-'));
  const path = join(dir, 'cracks.json');
  try {
    return fn(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('a single crack is tier 1', () => {
  withTempPath((path) => {
    const tier = recordCrack('s1', { path, now: 1000 });
    assert.equal(tier, 1);
  });
});

test('a second crack within the window is tier 2', () => {
  withTempPath((path) => {
    assert.equal(recordCrack('s1', { path, now: 1000 }), 1);
    assert.equal(recordCrack('s1', { path, now: 1500, windowMs: 2000 }), 2);
  });
});

test('the window boundary is inclusive', () => {
  withTempPath((path) => {
    assert.equal(recordCrack('s1', { path, now: 1000, windowMs: 2000 }), 1);
    assert.equal(recordCrack('s1', { path, now: 3000, windowMs: 2000 }), 2);
  });
});

test('a crack after the window resets to tier 1', () => {
  withTempPath((path) => {
    assert.equal(recordCrack('s1', { path, now: 1000, windowMs: 2000 }), 1);
    assert.equal(recordCrack('s1', { path, now: 3001, windowMs: 2000 }), 1);
  });
});

test('a consumed pair does not chain into a third tier 2', () => {
  withTempPath((path) => {
    assert.equal(recordCrack('s1', { path, now: 0 }), 1);
    assert.equal(recordCrack('s1', { path, now: 100 }), 2);
    assert.equal(recordCrack('s1', { path, now: 150 }), 1);
  });
});

test('sessions are tracked independently', () => {
  withTempPath((path) => {
    assert.equal(recordCrack('a', { path, now: 0 }), 1);
    assert.equal(recordCrack('b', { path, now: 0 }), 1);
    assert.equal(recordCrack('a', { path, now: 100 }), 2);
    assert.equal(recordCrack('b', { path, now: 5000 }), 1);
  });
});

test('resetCrackState clears one session without touching others', () => {
  withTempPath((path) => {
    recordCrack('a', { path, now: 0 });
    recordCrack('b', { path, now: 0 });
    resetCrackState(path, 'a');
    assert.equal(recordCrack('a', { path, now: 100 }), 1);
    assert.equal(recordCrack('b', { path, now: 100 }), 2);
  });
});

test('resetCrackState with no session id clears everything', () => {
  withTempPath((path) => {
    recordCrack('a', { path, now: 0 });
    recordCrack('b', { path, now: 0 });
    resetCrackState(path);
    assert.equal(recordCrack('a', { path, now: 100 }), 1);
    assert.equal(recordCrack('b', { path, now: 100 }), 1);
  });
});

test('a missing state file fails open to tier 1, not tier 2', () => {
  withTempPath((path) => {
    assert.equal(recordCrack('s1', { path, now: 999 }), 1);
  });
});
