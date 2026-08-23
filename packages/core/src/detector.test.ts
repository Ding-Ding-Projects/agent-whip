import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CrackDetector } from './detector.js';

test('a single crack resolves to tier 1', () => {
  const d = new CrackDetector(2000);
  assert.equal(d.onCrack('s1', 1000), 1);
});

test('a second crack strictly inside the window resolves to tier 2', () => {
  const d = new CrackDetector(2000);
  assert.equal(d.onCrack('s1', 1000), 1);
  assert.equal(d.onCrack('s1', 2500), 2);
});

test('the window boundary is inclusive: exactly windowMs apart is still tier 2', () => {
  const d = new CrackDetector(2000);
  assert.equal(d.onCrack('s1', 1000), 1);
  assert.equal(d.onCrack('s1', 3000), 2); // 3000 - 1000 === 2000, inclusive boundary
});

test('one millisecond past the window resolves to a fresh tier 1', () => {
  const d = new CrackDetector(2000);
  assert.equal(d.onCrack('s1', 1000), 1);
  assert.equal(d.onCrack('s1', 3001), 1);
});

test('a tier-2 pair is consumed: a third rapid crack starts a fresh tier 1', () => {
  const d = new CrackDetector(2000);
  assert.equal(d.onCrack('s1', 0), 1);
  assert.equal(d.onCrack('s1', 500), 2);
  // Third crack, still well inside what would have been the window from crack 2,
  // but the pair was consumed so this reads as a brand new tier 1.
  assert.equal(d.onCrack('s1', 700), 1);
  assert.equal(d.onCrack('s1', 900), 2);
});

test('sessions are isolated from one another', () => {
  const d = new CrackDetector(2000);
  assert.equal(d.onCrack('a', 1000), 1);
  // A crack on a completely different session must not pair with session a's crack.
  assert.equal(d.onCrack('b', 1500), 1);
  // Session a's second crack still pairs correctly with its own first crack.
  assert.equal(d.onCrack('a', 1500), 2);
});

test('reset(sessionId) clears only that session', () => {
  const d = new CrackDetector(2000);
  d.onCrack('a', 1000);
  d.onCrack('b', 1000);
  d.reset('a');
  assert.equal(d.onCrack('a', 1500), 1); // forgotten, fresh tier 1
  assert.equal(d.onCrack('b', 1500), 2); // still paired
});

test('reset() with no argument clears every session', () => {
  const d = new CrackDetector(2000);
  d.onCrack('a', 1000);
  d.onCrack('b', 1000);
  d.reset();
  assert.equal(d.onCrack('a', 1500), 1);
  assert.equal(d.onCrack('b', 1500), 1);
});

test('defaults to a 2000ms window when none is given', () => {
  const d = new CrackDetector();
  assert.equal(d.onCrack('s1', 0), 1);
  assert.equal(d.onCrack('s1', 2000), 2);
});
