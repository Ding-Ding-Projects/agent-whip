// Contract test for scripts/install-skills.mjs. Run with: node scripts/install-skills.test.mjs
//
// Uses AGENT_WHIP_SKILLS_TEST_HOME (a test-only override baked into install-skills.mjs) so this
// test never touches the real user's ~/.claude or ~/.agents directories.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const installerPath = join(here, 'install-skills.mjs');

function runInstaller(testHome, extraArgs = []) {
  try {
    const stdout = execFileSync(process.execPath, [installerPath, ...extraArgs], {
      env: { ...process.env, AGENT_WHIP_SKILLS_TEST_HOME: testHome },
      encoding: 'utf8',
    });
    return { code: 0, stdout };
  } catch (err) {
    return { code: err.status ?? 1, stdout: (err.stdout ?? '') + (err.stderr ?? '') };
  }
}

test('refuses to overwrite an unmarked existing destination, and leaves it untouched', () => {
  const testHome = mkdtempSync(join(tmpdir(), 'agent-whip-install-test-'));
  const claudeDest = join(testHome, '.claude', 'skills', 'agent-whip');
  mkdirSync(claudeDest, { recursive: true });
  const sentinelPath = join(claudeDest, 'someone-elses-file.txt');
  writeFileSync(sentinelPath, 'do not touch me');

  const result = runInstaller(testHome);

  assert.notEqual(result.code, 0, 'installer must exit non-zero when a destination is refused');
  assert.match(result.stdout, /refused/);
  assert.match(result.stdout, new RegExp(escapeRegExp(claudeDest)));

  // The destination must be entirely untouched: the sentinel file remains with its original
  // content, and no ownership marker or skill file was written into it.
  assert.ok(existsSync(sentinelPath), 'sentinel file must still exist');
  assert.equal(readFileSync(sentinelPath, 'utf8'), 'do not touch me');
  assert.ok(!existsSync(join(claudeDest, '.agent-whip-install-marker.json')), 'no marker must be written on refusal');
  assert.ok(!existsSync(join(claudeDest, 'SKILL.md')), 'no skill content must be written on refusal');

  rmSync(testHome, { recursive: true, force: true });
});

test('installs cleanly into a fresh, unmarked-absent destination', () => {
  const testHome = mkdtempSync(join(tmpdir(), 'agent-whip-install-test-'));
  const claudeDest = join(testHome, '.claude', 'skills', 'agent-whip');

  const result = runInstaller(testHome);

  assert.equal(result.code, 0, 'installer must exit zero when every target installs cleanly');
  assert.ok(existsSync(join(claudeDest, 'SKILL.md')));
  assert.ok(existsSync(join(claudeDest, '.agent-whip-install-marker.json')));

  rmSync(testHome, { recursive: true, force: true });
});

test('--dry-run writes nothing to disk', () => {
  const testHome = mkdtempSync(join(tmpdir(), 'agent-whip-install-test-'));
  const claudeDest = join(testHome, '.claude', 'skills', 'agent-whip');

  const result = runInstaller(testHome, ['--dry-run']);

  assert.equal(result.code, 0);
  assert.ok(!existsSync(claudeDest), '--dry-run must not create the destination directory');

  rmSync(testHome, { recursive: true, force: true });
});

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
