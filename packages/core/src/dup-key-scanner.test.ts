import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasDuplicateKey } from './dup-key-scanner.js';

test('detects a root-level duplicate key', () => {
  assert.equal(hasDuplicateKey('{"a":1,"a":2}'), true);
});

test('detects a nested duplicate key', () => {
  assert.equal(hasDuplicateKey('{"schemaVersion":1,"profile":{"tier1":"a","tier1":"b"}}'), true);
});

test('does not flag the same key name used at different nesting levels', () => {
  assert.equal(hasDuplicateKey('{"tier1":{"tier1":"nested is fine"}}'), false);
});

test('does not flag a well-formed document with no duplicates', () => {
  assert.equal(
    hasDuplicateKey('{"schemaVersion":1,"profile":{"tier1":"a","tier2":"b"}}'),
    false,
  );
});

test('ignores a key-like string that only appears inside a string VALUE', () => {
  assert.equal(hasDuplicateKey('{"tier1":"contains \\"tier1\\" as text","tier2":"b"}'), false);
});

test('does not crash on malformed input and reports no duplicate found', () => {
  assert.equal(hasDuplicateKey('{ this is not json'), false);
  assert.equal(hasDuplicateKey('not json at all'), false);
  assert.equal(hasDuplicateKey('{"unterminated": "str'), false);
});
