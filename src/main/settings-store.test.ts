import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_SETTINGS, SettingsStore } from './settings-store.js';

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'agent-whip-settings-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('load() returns defaults when no file exists yet', () => {
  withTempDir((dir) => {
    const store = new SettingsStore(dir);
    assert.deepEqual(store.load(), DEFAULT_SETTINGS);
  });
});

test('save() persists a patch and reload picks it up from a fresh store instance', () => {
  withTempDir((dir) => {
    const store = new SettingsStore(dir);
    const saved = store.save({ theme: 'dark', accentColor: '#123456' });
    assert.equal(saved.theme, 'dark');
    assert.equal(saved.accentColor, '#123456');

    const reopened = new SettingsStore(dir);
    const loaded = reopened.load();
    assert.equal(loaded.theme, 'dark');
    assert.equal(loaded.accentColor, '#123456');
    // Untouched fields keep their defaults.
    assert.equal(loaded.density, DEFAULT_SETTINGS.density);
  });
});

test('a malformed accentColor in the patch is rejected, keeping the previous valid value', () => {
  withTempDir((dir) => {
    const store = new SettingsStore(dir);
    store.save({ accentColor: '#abcdef' });
    const after = store.save({ accentColor: 'not-a-hex-color' });
    assert.equal(after.accentColor, '#abcdef');
  });
});
