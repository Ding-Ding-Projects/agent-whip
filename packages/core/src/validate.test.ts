import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateProfileFile } from './validate.js';
import {
  DEFAULT_PROFILE,
  MAX_PAYLOAD_CHARS,
  MAX_PROFILE_BYTES,
  MIN_PAYLOAD_CHARS,
} from './constants.js';

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

const VALID = JSON.stringify({
  schemaVersion: 1,
  profile: { tier1: 'go go go', tier2: 'go go go, then tidy up' },
});

test('accepts a well-formed schemaVersion 1 profile', () => {
  const result = validateProfileFile(bytes(VALID));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.schemaVersion, 1);
    assert.equal(result.profile.tier1, 'go go go');
    assert.equal(result.profile.tier2, 'go go go, then tidy up');
  }
});

test('too-large: rejects a file over MAX_PROFILE_BYTES, and never calls JSON.parse', () => {
  const huge = JSON.stringify({
    schemaVersion: 1,
    profile: { tier1: 'x'.repeat(MAX_PROFILE_BYTES), tier2: 'go' },
  });
  assert.ok(bytes(huge).byteLength > MAX_PROFILE_BYTES);

  const originalParse = JSON.parse;
  let called = false;
  JSON.parse = ((...args: Parameters<typeof JSON.parse>) => {
    called = true;
    return originalParse(...args);
  }) as typeof JSON.parse;
  try {
    const result = validateProfileFile(bytes(huge));
    assert.deepEqual(result, { ok: false, reason: 'too-large' });
    assert.equal(called, false, 'JSON.parse must never be called for an oversized file');
  } finally {
    JSON.parse = originalParse;
  }
});

test('malformed-json: rejects text that is not valid JSON', () => {
  const result = validateProfileFile(bytes('{ this is not json'));
  assert.deepEqual(result, { ok: false, reason: 'malformed-json' });
});

test('duplicate-key: rejects a nested duplicate key (built as a raw string literal)', () => {
  const raw = '{"schemaVersion":1,"profile":{"tier1":"go go go","tier1":"again","tier2":"tidy up now"}}';
  const result = validateProfileFile(bytes(raw));
  assert.deepEqual(result, { ok: false, reason: 'duplicate-key' });
});

test('duplicate-key: rejects a root-level duplicate key', () => {
  const raw = '{"schemaVersion":1,"schemaVersion":2,"profile":{"tier1":"go go go","tier2":"tidy up now"}}';
  const result = validateProfileFile(bytes(raw));
  assert.deepEqual(result, { ok: false, reason: 'duplicate-key' });
});

test('unsupported-version: rejects an absent schemaVersion', () => {
  const raw = JSON.stringify({ profile: { tier1: 'go go go', tier2: 'tidy up now' } });
  const result = validateProfileFile(bytes(raw));
  assert.deepEqual(result, { ok: false, reason: 'unsupported-version' });
});

test('unsupported-version: rejects a future/unknown version', () => {
  const raw = JSON.stringify({ schemaVersion: 2, profile: { tier1: 'go go go', tier2: 'tidy up now' } });
  const result = validateProfileFile(bytes(raw));
  assert.deepEqual(result, { ok: false, reason: 'unsupported-version' });
});

test('unsupported-version: rejects a non-integer version', () => {
  const raw = JSON.stringify({ schemaVersion: 1.5, profile: { tier1: 'go go go', tier2: 'tidy up now' } });
  const result = validateProfileFile(bytes(raw));
  assert.deepEqual(result, { ok: false, reason: 'unsupported-version' });
});

test('missing-field: rejects an absent profile object', () => {
  const raw = JSON.stringify({ schemaVersion: 1 });
  const result = validateProfileFile(bytes(raw));
  assert.deepEqual(result, { ok: false, reason: 'missing-field' });
});

test('missing-field: rejects an absent tier1', () => {
  const raw = JSON.stringify({ schemaVersion: 1, profile: { tier2: 'tidy up now' } });
  const result = validateProfileFile(bytes(raw));
  assert.deepEqual(result, { ok: false, reason: 'missing-field' });
});

test('missing-field: rejects an absent tier2', () => {
  const raw = JSON.stringify({ schemaVersion: 1, profile: { tier1: 'go go go' } });
  const result = validateProfileFile(bytes(raw));
  assert.deepEqual(result, { ok: false, reason: 'missing-field' });
});

test('unexpected-field: rejects an unknown root key', () => {
  const raw = JSON.stringify({
    schemaVersion: 1,
    profile: { tier1: 'go go go', tier2: 'tidy up now' },
    extra: true,
  });
  const result = validateProfileFile(bytes(raw));
  assert.deepEqual(result, { ok: false, reason: 'unexpected-field' });
});

test('unexpected-field: rejects an unknown profile key', () => {
  const raw = JSON.stringify({
    schemaVersion: 1,
    profile: { tier1: 'go go go', tier2: 'tidy up now', tier3: 'nope' },
  });
  const result = validateProfileFile(bytes(raw));
  assert.deepEqual(result, { ok: false, reason: 'unexpected-field' });
});

test('wrong-type: rejects a non-string tier1', () => {
  const raw = JSON.stringify({ schemaVersion: 1, profile: { tier1: 42, tier2: 'tidy up now' } });
  const result = validateProfileFile(bytes(raw));
  assert.deepEqual(result, { ok: false, reason: 'wrong-type' });
});

test('wrong-type: rejects a non-object root', () => {
  const result = validateProfileFile(bytes(JSON.stringify(['nope'])));
  assert.deepEqual(result, { ok: false, reason: 'wrong-type' });
});

test('empty-string: rejects a whitespace-only tier1', () => {
  const raw = JSON.stringify({ schemaVersion: 1, profile: { tier1: '   ', tier2: 'tidy up now' } });
  const result = validateProfileFile(bytes(raw));
  assert.deepEqual(result, { ok: false, reason: 'empty-string' });
});

test('too-long: rejects a tier1 shorter than MIN_PAYLOAD_CHARS', () => {
  assert.ok(MIN_PAYLOAD_CHARS > 1);
  const raw = JSON.stringify({ schemaVersion: 1, profile: { tier1: 'go', tier2: 'tidy up now' } });
  const result = validateProfileFile(bytes(raw));
  assert.deepEqual(result, { ok: false, reason: 'too-long' });
});

test('too-long: rejects a tier1 longer than MAX_PAYLOAD_CHARS', () => {
  const raw = JSON.stringify({
    schemaVersion: 1,
    profile: { tier1: 'a'.repeat(MAX_PAYLOAD_CHARS + 1), tier2: 'tidy up now' },
  });
  const result = validateProfileFile(bytes(raw));
  assert.deepEqual(result, { ok: false, reason: 'too-long' });
});

test('multiline: rejects a tier1 containing a newline', () => {
  const raw = JSON.stringify({ schemaVersion: 1, profile: { tier1: 'go go\ngo', tier2: 'tidy up now' } });
  const result = validateProfileFile(bytes(raw));
  assert.deepEqual(result, { ok: false, reason: 'multiline' });
});

test('multiline: rejects a tier1 containing a carriage return', () => {
  const raw = JSON.stringify({ schemaVersion: 1, profile: { tier1: 'go go\rgo', tier2: 'tidy up now' } });
  const result = validateProfileFile(bytes(raw));
  assert.deepEqual(result, { ok: false, reason: 'multiline' });
});

test('control-character: rejects a tier1 containing a non-newline control character', () => {
  const tier1 = 'go go' + String.fromCodePoint(0x07) + 'go';
  const raw = JSON.stringify({ schemaVersion: 1, profile: { tier1, tier2: 'tidy up now' } });
  const result = validateProfileFile(bytes(raw));
  assert.deepEqual(result, { ok: false, reason: 'control-character' });
});

test('control-character: rejects a tier1 containing U+009B', () => {
  const tier1 = 'go go' + String.fromCodePoint(0x9b) + 'go';
  const raw = JSON.stringify({ schemaVersion: 1, profile: { tier1, tier2: 'tidy up now' } });
  const result = validateProfileFile(bytes(raw));
  assert.deepEqual(result, { ok: false, reason: 'control-character' });
});

test('too-deep: rejects a tier1 that is itself an object', () => {
  const raw = JSON.stringify({ schemaVersion: 1, profile: { tier1: { nested: 'go' }, tier2: 'tidy up now' } });
  const result = validateProfileFile(bytes(raw));
  assert.deepEqual(result, { ok: false, reason: 'too-deep' });
});

test('no partial application: valid tier1 plus invalid tier2 rejects the whole profile, not half of it', () => {
  const raw = JSON.stringify({ schemaVersion: 1, profile: { tier1: 'go go go', tier2: '' } });
  const result = validateProfileFile(bytes(raw));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'empty-string');
});

test('sanity: the shipped default profile itself validates successfully', () => {
  const raw = JSON.stringify({ schemaVersion: 1, profile: DEFAULT_PROFILE });
  const result = validateProfileFile(bytes(raw));
  assert.equal(result.ok, true);
});
