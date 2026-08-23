import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePayload } from './resolve.js';
import type { ProfileState } from './constants.js';

const state: ProfileState = {
  profile: { tier1: 'go go go', tier2: 'go go go, then tidy up' },
  source: 'default',
  schemaVersion: null,
  reason: null,
};

test('resolves tier 1 to the tier1 phrase', () => {
  assert.equal(resolvePayload(1, state), 'go go go');
});

test('resolves tier 2 to the tier2 phrase', () => {
  assert.equal(resolvePayload(2, state), 'go go go, then tidy up');
});
