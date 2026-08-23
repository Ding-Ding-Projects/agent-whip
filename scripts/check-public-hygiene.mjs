#!/usr/bin/env node
// Guard: this repository is public. It must never carry a committed local profile
// (the file holding the owner's real, private crack phrases), and no raw C1/ESC control
// byte may sit in a source file outside packages/paste-frame/ — that package is the one
// place raw escape bytes are expected, because it exists to detect and strip them from a
// bracketed-paste. Anywhere else, a raw control byte in source is either an accident
// (invisible, can be silently eaten by a formatter) or a smuggled payload fragment.
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { relative, sep } from 'node:path';
import { walkAllFiles } from './lib/walk-source.mjs';

let violations = [];

// 1. No committed profile.json anywhere in the tracked tree.
try {
  const tracked = execSync('git ls-files', { encoding: 'utf8' }).split(/\r\n|\n|\r/).filter(Boolean);
  const PROFILE_NAME = /(^|[\/])(profile\.json|[^\/]*\.profile\.json)$/;
  for (const p of tracked) {
    if (PROFILE_NAME.test(p)) {
      violations.push(`committed local profile file must never be tracked: ${p}`);
    }
  }
} catch (err) {
  console.log('check-public-hygiene: git ls-files unavailable, skipping tracked-file scan (' + err.message + ')');
}

// 2. No raw C1 (U+0080-U+009F) or ESC (U+001B) control CODEPOINT in source outside
// packages/paste-frame/. This must decode the file as UTF-8 text and inspect codepoints,
// NOT raw bytes: a UTF-8-encoded em dash (—) is the byte sequence E2 80 94, whose middle
// byte is 0x80 — the same value as the raw C1 control byte we're hunting for. Scanning raw
// bytes flags every non-ASCII punctuation mark in the repository as a false positive.
// Decoding first and checking the resulting string's code points sidesteps that entirely.
const SOURCE_EXT = /\.(ts|tsx|js|mjs|cjs)$/;
const EXEMPT_PREFIX = ['packages', 'paste-frame', 'src'].join(sep);

if (existsSync('packages') || existsSync('src')) {
  for (const dir of ['packages', 'src'].filter(existsSync)) {
    for (const file of walkAllFiles(dir)) {
      if (!SOURCE_EXT.test(file)) continue;
      const rel = relative(process.cwd(), file);
      if (rel.startsWith(EXEMPT_PREFIX + sep) || rel === EXEMPT_PREFIX) continue;
      // Also exempt that package's own test fixtures, wherever paste-frame lives.
      if (rel.includes(`${sep}paste-frame${sep}`)) continue;
      const text = readFileSync(file, 'utf8');
      const lines = text.split(/\r\n|\n|\r/);
      outer: for (let li = 0; li < lines.length; li++) {
        for (const ch of lines[li]) {
          const cp = ch.codePointAt(0);
          const isEsc = cp === 0x1b;
          const isC1 = cp >= 0x80 && cp <= 0x9f;
          if (isEsc || isC1) {
            violations.push(`${rel}:${li + 1}: raw control codepoint U+${cp.toString(16).padStart(4, '0')} outside packages/paste-frame/`);
            break outer; // one report per file is enough to fail closed
          }
        }
      }
    }
  }
} else {
  console.log('check-public-hygiene: skipping control-byte scan — neither packages/ nor src/ exists yet');
}

if (violations.length) {
  console.error('check-public-hygiene: FAIL — this repository is public.');
  for (const v of violations) console.error('  ' + v);
  process.exit(1);
}

console.log('check-public-hygiene: PASS');
