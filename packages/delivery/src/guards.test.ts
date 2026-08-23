import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Cooldown } from './guards.js';

test('Cooldown allows the first fire and blocks an immediate second fire', () => {
  let t = 1000;
  const cooldown = new Cooldown({ cooldownMs: 1500, now: () => t });
  assert.equal(cooldown.tryFire('s1'), true);
  assert.equal(cooldown.tryFire('s1'), false);
});

test('Cooldown allows firing again once the window has elapsed', () => {
  let t = 1000;
  const cooldown = new Cooldown({ cooldownMs: 1500, now: () => t });
  assert.equal(cooldown.tryFire('s1'), true);
  t += 1499;
  assert.equal(cooldown.tryFire('s1'), false);
  t += 2;
  assert.equal(cooldown.tryFire('s1'), true);
});

test('Cooldown tracks sessions independently', () => {
  let t = 1000;
  const cooldown = new Cooldown({ cooldownMs: 1500, now: () => t });
  assert.equal(cooldown.tryFire('a'), true);
  assert.equal(cooldown.tryFire('b'), true);
  assert.equal(cooldown.tryFire('a'), false);
  assert.equal(cooldown.tryFire('b'), false);
});

test('a refused attempt (still cooling down) does not itself reset the window', () => {
  let t = 1000;
  const cooldown = new Cooldown({ cooldownMs: 1500, now: () => t });
  assert.equal(cooldown.tryFire('s1'), true);
  t += 100;
  assert.equal(cooldown.tryFire('s1'), false);
  t += 100;
  assert.equal(cooldown.tryFire('s1'), false);
  // Still measured from the original fire at t=1000, not from either rejected attempt.
  t = 1000 + 1500;
  assert.equal(cooldown.tryFire('s1'), true);
});
