#!/usr/bin/env node
// Guard: the crack payload text (tier1/tier2 phrases, whether the neutral defaults or a
// loaded local profile's real phrases) must never be written to a console/log call. The
// crack log is append-only metadata (timestamp, tier, delivery route) — never the phrase
// text itself. This is what keeps a shared terminal/CI log from leaking a private phrase.
//
// Anchored to a console.* call whose argument text actually contains `.tier1` or `.tier2`,
// not to the bare substring "tier1" anywhere in a file (which would also flag legitimate
// type definitions, schema keys, and tests asserting tier *shape* rather than *content*).
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { walkSourceFiles } from './lib/walk-source.mjs';

const TARGET_DIR = 'packages';

const CONSOLE_CALL = /console\s*\.\s*(log|info|warn|error|debug|trace)\s*\(([^)]*)\)/g;
const TIER_FIELD = /\.\s*tier[12]\b/;

let violations = [];
let scanned = 0;

if (!existsSync(join(process.cwd(), TARGET_DIR))) {
  console.log(`check-no-payload-logging: skipping — ${TARGET_DIR} does not exist yet`);
  console.log('check-no-payload-logging: PASS');
  process.exit(0);
}

for (const file of walkSourceFiles(TARGET_DIR)) {
  scanned++;
  const text = readFileSync(file, 'utf8');
  const lines = text.split(/\r\n|\n|\r/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    CONSOLE_CALL.lastIndex = 0;
    let match;
    while ((match = CONSOLE_CALL.exec(line))) {
      const args = match[2];
      if (TIER_FIELD.test(args)) {
        violations.push(`${file}:${i + 1}: console.${match[1]}() interpolates a .tier1/.tier2 payload field: ${line.trim()}`);
      }
    }
  }
}

console.log(`check-no-payload-logging: scanned ${scanned} file(s) under ${TARGET_DIR}`);

if (violations.length) {
  console.error('check-no-payload-logging: FAIL — payload text must never reach a console/log call.');
  for (const v of violations) console.error('  ' + v);
  process.exit(1);
}

console.log('check-no-payload-logging: PASS');
