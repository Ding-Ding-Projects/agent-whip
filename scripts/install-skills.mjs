#!/usr/bin/env node
// Installs the agent-whip skill packages into the local per-runtime skill roots:
//   - packages/skill-claude  -> ~/.claude/skills/agent-whip
//   - packages/skill-agents  -> ${CODEX_HOME:-~/.agents}/skills/agent-whip
//                               (and, when set, also ${OPENCODE_CONFIG_DIR}/skills/agent-whip --
//                                Codex and OpenCode share the ~/.agents root by default, but an
//                                OpenCode install that points its config dir elsewhere still gets
//                                the skill copied there too)
//
// This script only ever writes inside a directory it can prove it owns: a fresh install writes an
// ownership marker file, and a later run refuses to touch a destination that exists and does NOT
// carry that marker -- that destination might be something a person or another tool put there on
// purpose, and clobbering it silently would be exactly the kind of destructive surprise this
// project's own safety posture (see packages/skill-claude/references/safety.md) argues against
// elsewhere.
import { mkdirSync, existsSync, readdirSync, rmSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MARKER_NAME = '.agent-whip-install-marker.json';
const SKILL_DIR_NAME = 'agent-whip';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');

function markerPath(destDir) {
  return join(destDir, MARKER_NAME);
}

function readMarker(destDir) {
  const p = markerPath(destDir);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null; // Corrupt marker is treated as "not ours" -- fail closed, never trust a marker we cannot parse.
  }
}

function isOwnedByUs(destDir) {
  const marker = readMarker(destDir);
  return marker !== null && marker.owner === 'agent-whip/install-skills';
}

/**
 * Copies `sourceDir` (a skill package directory) into `destDir` (e.g. ~/.claude/skills/agent-whip).
 * Refuses when destDir exists and is not ours, unless `force` is set AND it IS ours (force only
 * ever re-overwrites something we already own -- it is not a bypass of the ownership check).
 */
function installOne(label, sourceDir, destDir) {
  const exists = existsSync(destDir);
  const owned = exists ? isOwnedByUs(destDir) : false;

  if (exists && !owned) {
    return { label, destDir, status: 'refused', reason: `destination exists and is not agent-whip-owned: ${destDir}` };
  }

  if (exists && owned && !force) {
    // Already installed by us; re-installing without --force is a normal update, not a special case,
    // so we still proceed -- but we note it so --dry-run output is accurate.
  }

  if (dryRun) {
    const action = exists ? (owned ? 'would update (owned)' : 'would refuse (unowned)') : 'would create';
    return { label, destDir, status: 'dry-run', reason: action };
  }

  if (exists && owned) {
    rmSync(destDir, { recursive: true, force: true });
  }
  mkdirSync(destDir, { recursive: true });
  cpSync(sourceDir, destDir, { recursive: true });

  const marker = {
    owner: 'agent-whip/install-skills',
    package: label,
    installedAt: new Date().toISOString(),
  };
  writeFileSync(markerPath(destDir), JSON.stringify(marker, null, 2) + '\n', 'utf8');

  return { label, destDir, status: 'installed', reason: null };
}

function testHomeOverride() {
  // Test-only escape hatch: install-skills.mjs otherwise always resolves the real OS home via
  // node:os homedir(), which does not honor `HOME` on Windows (it reads USERPROFILE there). The
  // contract test needs to point installs at a scratch directory instead of the real user home,
  // so it sets this variable explicitly; production use must never set it.
  const v = process.env.AGENT_WHIP_SKILLS_TEST_HOME;
  return v && v.trim() !== '' ? v : null;
}

function resolveClaudeSkillsRoot() {
  return join(testHomeOverride() ?? homedir(), '.claude', 'skills');
}

function resolveAgentsSkillsRoots() {
  const roots = new Set();
  const codexHome = process.env.CODEX_HOME && process.env.CODEX_HOME.trim() !== ''
    ? process.env.CODEX_HOME
    : join(testHomeOverride() ?? homedir(), '.agents');
  roots.add(join(codexHome, 'skills'));

  const openCodeConfigDir = process.env.OPENCODE_CONFIG_DIR;
  if (openCodeConfigDir && openCodeConfigDir.trim() !== '') {
    roots.add(join(openCodeConfigDir, 'skills'));
  }
  return [...roots];
}

const targets = [];

// packages/skill-claude -> ~/.claude/skills/agent-whip
{
  const sourceDir = join(repoRoot, 'packages', 'skill-claude');
  const destDir = join(resolveClaudeSkillsRoot(), SKILL_DIR_NAME);
  targets.push({ label: 'skill-claude', sourceDir, destDir });
}

// packages/skill-agents -> every resolved agents skills root
{
  const sourceDir = join(repoRoot, 'packages', 'skill-agents');
  for (const root of resolveAgentsSkillsRoots()) {
    const destDir = join(root, SKILL_DIR_NAME);
    targets.push({ label: 'skill-agents', sourceDir, destDir });
  }
}

const results = [];
for (const t of targets) {
  if (!existsSync(t.sourceDir)) {
    results.push({ label: t.label, destDir: t.destDir, status: 'error', reason: `source package missing: ${t.sourceDir}` });
    continue;
  }
  results.push(installOne(t.label, t.sourceDir, t.destDir));
}

console.log('agent-whip install-skills' + (dryRun ? ' (dry run)' : ''));
console.log('');
let hadRefusalOrError = false;
for (const r of results) {
  const marker = r.status === 'installed' ? 'OK' : r.status === 'dry-run' ? '--' : 'XX';
  console.log(`[${marker}] ${r.label.padEnd(14)} ${r.destDir}`);
  if (r.reason) console.log(`      ${r.status}: ${r.reason}`);
  if (r.status === 'refused' || r.status === 'error') hadRefusalOrError = true;
}
console.log('');
console.log(`${results.length} target(s): ` +
  `${results.filter(r => r.status === 'installed').length} installed, ` +
  `${results.filter(r => r.status === 'dry-run').length} dry-run, ` +
  `${results.filter(r => r.status === 'refused').length} refused, ` +
  `${results.filter(r => r.status === 'error').length} error`);

process.exitCode = hadRefusalOrError ? 1 : 0;
