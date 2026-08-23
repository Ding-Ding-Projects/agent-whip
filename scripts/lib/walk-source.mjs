// Shared helper: enumerate source files under a directory, skipping build output and
// dependency trees so a guard scanning `packages/*/src` never also scans its own dist.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const SKIP_DIR_NAMES = new Set(['node_modules', 'dist', 'out', '.git']);
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);

export function walkSourceFiles(rootDir) {
  const results = [];
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIR_NAMES.has(entry.name)) continue;
        stack.push(join(current, entry.name));
        continue;
      }
      const ext = entry.name.slice(entry.name.lastIndexOf('.'));
      if (SOURCE_EXTENSIONS.has(ext)) {
        results.push(join(current, entry.name));
      }
    }
  }
  return results;
}

export function walkAllFiles(rootDir) {
  const results = [];
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIR_NAMES.has(entry.name)) continue;
        stack.push(join(current, entry.name));
        continue;
      }
      results.push(join(current, entry.name));
    }
  }
  return results;
}
