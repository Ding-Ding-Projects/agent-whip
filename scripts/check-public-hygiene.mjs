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

// 2. No raw C1 (0x80-0x9F) or ESC (0x1B) control byte in source outside packages/paste-frame/.
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
      const buf = readFileSync(file);
      for (let i = 0; i < buf.length; i++) {
        const byte = buf[i];
        const isEsc = byte === 0x1b;
        const isC1 = byte >= 0x80 && byte <= 0x9f;
        if (isEsc || isC1) {
          const upto = buf.subarray(0, i).toString('utf8');
          const line = upto.split(/\r\n|\n|\r/).length;
          violations.push(`${rel}:${line}: raw control byte 0x${byte.toString(16)} outside packages/paste-frame/`);
          break; // one report per file is enough to fail closed
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
