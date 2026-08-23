#!/usr/bin/env node
// Guard: agent-whip never opens a network connection. It only writes text into a local
// pty/window. Fail closed if any networking primitive shows up under the packages that
// are supposed to be air-gapped (packages/core, packages/cli).
//
// Patterns are anchored to how each API is actually invoked/imported (a call, an import
// specifier, a require argument) rather than to a bare substring, so a comment mentioning
// "fetch" in prose, or a variable named `httpsProxyNote`, cannot trip the guard, and a
// renamed or re-exported binding cannot silently evade it either.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { walkSourceFiles } from './lib/walk-source.mjs';

const TARGET_DIRS = ['packages/core/src', 'packages/cli/src'];

const RULES = [
  { name: 'fetch(', re: /\bfetch\s*\(/ },
  { name: 'node:http import/require', re: /(?:from\s+|require\(\s*)['"]node:http['"]/ },
  { name: 'node:https import/require', re: /(?:from\s+|require\(\s*)['"]node:https['"]/ },
  { name: 'node:net import/require', re: /(?:from\s+|require\(\s*)['"]node:net['"]/ },
  { name: 'node:dgram import/require', re: /(?:from\s+|require\(\s*)['"]node:dgram['"]/ },
  { name: 'bare http import/require', re: /(?:from\s+|require\(\s*)['"]http['"]/ },
  { name: 'bare https import/require', re: /(?:from\s+|require\(\s*)['"]https['"]/ },
  { name: 'bare net import/require', re: /(?:from\s+|require\(\s*)['"]net['"]/ },
  { name: 'bare dgram import/require', re: /(?:from\s+|require\(\s*)['"]dgram['"]/ },
  { name: 'axios import/require', re: /(?:from\s+|require\(\s*)['"]axios['"]/ },
  { name: 'XMLHttpRequest', re: /\bnew\s+XMLHttpRequest\s*\(/ },
];

let violations = [];
let scanned = 0;
let skippedDirs = [];

for (const dir of TARGET_DIRS) {
  if (!existsSync(join(process.cwd(), dir))) {
    skippedDirs.push(dir);
    continue;
  }
  for (const file of walkSourceFiles(dir)) {
    scanned++;
    const text = readFileSync(file, 'utf8');
    const lines = text.split(/\r\n|\n|\r/);
    for (let i = 0; i < lines.length; i++) {
      for (const rule of RULES) {
        if (rule.re.test(lines[i])) {
          violations.push(`${file}:${i + 1}: forbidden network primitive (${rule.name}): ${lines[i].trim()}`);
        }
      }
    }
  }
}

if (skippedDirs.length) {
  console.log(`check-no-network: skipping not-yet-present dirs: ${skippedDirs.join(', ')}`);
}
console.log(`check-no-network: scanned ${scanned} file(s) under ${TARGET_DIRS.filter(d => !skippedDirs.includes(d)).join(', ') || '(none present yet)'}`);

if (violations.length) {
  console.error('check-no-network: FAIL — agent-whip must never open a network connection.');
  for (const v of violations) console.error('  ' + v);
  process.exit(1);
}

console.log('check-no-network: PASS');
