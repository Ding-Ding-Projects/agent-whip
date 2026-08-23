import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProfileStatus, buildTierIdentity } from './redact.ts';
import type { ProfileState } from '@agent-whip/core';

const SENTINEL = 'THIS-IS-THE-SECRET-TRIGGER-PHRASE-DO-NOT-LEAK-1234567890';

test('buildTierIdentity never contains the payload substring', () => {
  const vm = buildTierIdentity(1, SENTINEL);
  const serialized = JSON.stringify(vm);
  assert.equal(serialized.includes(SENTINEL), false, 'redacted view model must not contain the payload');
  // Vacuous-pass guard: prove the harness actually captured something non-empty, so an empty or
  // broken vm could never masquerade as "sentinel absent".
  assert.ok(serialized.length > 10, 'view model must be a real non-empty object');
  assert.equal(vm.tier, 1);
  assert.equal(vm.chars, SENTINEL.length);
  assert.match(vm.shortHash, /^sha256:[0-9a-f]{8}$/);
  assert.match(vm.label, /^tier 1 · sha256:[0-9a-f]{8} · \d+ chars$/);
});

test('buildTierIdentity produces a different hash for a different payload, same length', () => {
  const other = 'ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ';
  assert.equal(other.length, SENTINEL.length);
  const a = buildTierIdentity(2, SENTINEL);
  const b = buildTierIdentity(2, other);
  assert.notEqual(a.shortHash, b.shortHash);
});

test('buildProfileStatus (file source) never leaks profile contents and only reports metadata', () => {
  const state: ProfileState = {
    profile: { tier1: SENTINEL, tier2: SENTINEL + '-tier2' },
    source: 'file',
    schemaVersion: 1,
    reason: null,
  };
  const vm = buildProfileStatus(state);
  const serialized = JSON.stringify(vm);
  assert.equal(serialized.includes(SENTINEL), false);
  assert.ok(serialized.length > 10);
  assert.equal(vm.source, 'file');
  assert.equal(vm.schemaVersion, 1);
  assert.equal(vm.label, 'custom profile loaded (schemaVersion 1)');
});

test('buildProfileStatus (default fallback) reports the fallback reason, not the payload', () => {
  const state: ProfileState = {
    profile: { tier1: 'continue at full speed', tier2: 'continue at full speed, then clean up merged branches' },
    source: 'default',
    schemaVersion: null,
    reason: 'missing-file',
  };
  const vm = buildProfileStatus(state);
  assert.equal(vm.source, 'default');
  assert.equal(vm.label, 'shipped default profile — missing-file');
});
