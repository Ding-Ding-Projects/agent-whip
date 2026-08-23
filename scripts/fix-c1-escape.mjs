// One-shot: replace a raw U+009B byte inside the sanitizer character class with its  escape.
// A raw C1 control character in source is invisible, so a formatter, editor or copy-paste can eat
// it and silently weaken the guard with no error anywhere. The escape survives all three.
import { readFileSync, writeFileSync } from 'node:fs';

const path = new URL('../packages/paste-frame/src/index.ts', import.meta.url);
const before = readFileSync(path, 'utf8');

const RAW = String.fromCharCode(0x9b);
if (!before.includes(RAW)) {
  console.log('nothing to do: no raw U+009B present');
  process.exit(0);
}

const from = `/[\\x1b${RAW}]/g`;
const to = '/[\\x1b\\u009b]/g';
if (!before.includes(from)) {
  console.error('ABORT: raw U+009B present but not in the expected character class. Not guessing.');
  process.exit(1);
}

const after = before.replace(from, to);
if (after.includes(RAW)) {
  console.error('ABORT: a raw U+009B still remains after replacement.');
  process.exit(1);
}
writeFileSync(path, after, 'utf8');
console.log('rewritten: literal U+009B -> \\u009b escape');
