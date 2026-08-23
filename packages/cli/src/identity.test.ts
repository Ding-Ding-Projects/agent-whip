import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describePayload, payloadIdentity } from './identity.js';

test('payloadIdentity never contains the source text', () => {
  const secret = 'this exact string must never appear in the identity output';
  const id = payloadIdentity(secret);
  assert.equal(id.includes(secret), false);
});

test('payloadIdentity is deterministic for the same input', () => {
  assert.equal(payloadIdentity('abc'), payloadIdentity('abc'));
});

test('payloadIdentity differs for different input', () => {
  assert.notEqual(payloadIdentity('abc'), payloadIdentity('abd'));
});

test('describePayload reports length but never the text', () => {
  const secret = 'do-not-print-me';
  const described = describePayload(secret);
  assert.equal(described.includes(secret), false);
  assert.ok(described.includes(`${secret.length} chars`));
});
