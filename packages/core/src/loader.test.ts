import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadProfile, clearProfileCache } from './loader.js';
import { DEFAULT_PROFILE } from './constants.js';

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'agent-whip-core-test-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('missing-file: falls back to the default profile when the path does not exist', () => {
  withTempDir((dir) => {
    clearProfileCache();
    const state = loadProfile(join(dir, 'does-not-exist.json'));
    assert.deepEqual(state, {
      profile: DEFAULT_PROFILE,
      source: 'default',
      schemaVersion: null,
      reason: 'missing-file',
    });
  });
});

test('io-error: falls back to the default profile when the path cannot be read as a file', () => {
  withTempDir((dir) => {
    clearProfileCache();
    // statSync succeeds on a directory, but readFileSync on it throws (EISDIR),
    // so this exercises the io-error fallback distinctly from missing-file.
    const state = loadProfile(dir);
    assert.equal(state.source, 'default');
    assert.equal(state.reason, 'io-error');
    assert.deepEqual(state.profile, DEFAULT_PROFILE);
  });
});

test('loads a valid file successfully', () => {
  withTempDir((dir) => {
    clearProfileCache();
    const path = join(dir, 'profile.json');
    writeFileSync(
      path,
      JSON.stringify({ schemaVersion: 1, profile: { tier1: 'go go go', tier2: 'tidy up now' } }),
    );
    const state = loadProfile(path);
    assert.equal(state.source, 'file');
    assert.equal(state.schemaVersion, 1);
    assert.equal(state.reason, null);
    assert.deepEqual(state.profile, { tier1: 'go go go', tier2: 'tidy up now' });
  });
});

test('an invalid file falls back to defaults and carries the reject reason, never throws', () => {
  withTempDir((dir) => {
    clearProfileCache();
    const path = join(dir, 'profile.json');
    writeFileSync(path, '{ not json');
    const state = loadProfile(path);
    assert.deepEqual(state, {
      profile: DEFAULT_PROFILE,
      source: 'default',
      schemaVersion: null,
      reason: 'malformed-json',
    });
  });
});

test('revalidates when the on-disk file changes (cache is keyed on path + mtime + size)', () => {
  withTempDir((dir) => {
    clearProfileCache();
    const path = join(dir, 'profile.json');

    writeFileSync(
      path,
      JSON.stringify({ schemaVersion: 1, profile: { tier1: 'go go go', tier2: 'tidy up now' } }),
    );
    const first = loadProfile(path);
    assert.equal(first.source, 'file');
    assert.equal(first.profile.tier1, 'go go go');

    // Overwrite with different content (different size, so the cache key
    // changes even if the filesystem's mtime resolution is coarse).
    writeFileSync(
      path,
      JSON.stringify({ schemaVersion: 1, profile: { tier1: 'go go go faster', tier2: 'tidy up now' } }),
    );
    const second = loadProfile(path);
    assert.equal(second.source, 'file');
    assert.equal(second.profile.tier1, 'go go go faster');
  });
});

test('clearProfileCache forces a fresh read on the next call', () => {
  withTempDir((dir) => {
    clearProfileCache();
    const path = join(dir, 'profile.json');
    writeFileSync(
      path,
      JSON.stringify({ schemaVersion: 1, profile: { tier1: 'go go go', tier2: 'tidy up now' } }),
    );
    loadProfile(path);
    clearProfileCache();
    const state = loadProfile(path);
    assert.equal(state.source, 'file');
    assert.equal(state.profile.tier1, 'go go go');
  });
});

test('defaults to DEFAULT_PROFILE_PATH when no path is given (must not throw)', () => {
  clearProfileCache();
  const state = loadProfile();
  assert.ok(state.source === 'default' || state.source === 'file');
});
