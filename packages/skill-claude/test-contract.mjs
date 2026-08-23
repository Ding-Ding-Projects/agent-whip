// Contract test for the agent-whip Claude Code skill package. Run with: node test-contract.mjs
//
// Every assertion here is anchored to a specific line or a specific YAML key, never to a bare
// substring, so a commented-out or renamed occurrence cannot satisfy it. See the header comment
// in the sibling skill-agents/test-contract.mjs for the same discipline applied to that package.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const skillPath = join(here, 'SKILL.md');
const skillText = readFileSync(skillPath, 'utf8');

/** Extracts the YAML frontmatter block (between the first pair of `---` lines) as raw text. */
function extractFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  assert.ok(match, 'SKILL.md must start with a --- frontmatter block');
  return match[1];
}

/** Parses the frontmatter as a flat key: value map (sufficient for this skill's two-key shape). */
function parseFlatYamlKeys(frontmatterText) {
  const keys = [];
  for (const rawLine of frontmatterText.split(/\r?\n/)) {
    if (rawLine.trim() === '') continue;
    const keyMatch = /^([A-Za-z0-9_-]+):\s?/.exec(rawLine);
    if (keyMatch) keys.push(keyMatch[1]);
  }
  return keys;
}

test('frontmatter parses and has exactly the two allowed keys', () => {
  const fm = extractFrontmatter(skillText);
  const keys = parseFlatYamlKeys(fm);
  assert.deepEqual(keys.sort(), ['description', 'name'].sort());
});

test('name is agent-whip', () => {
  const fm = extractFrontmatter(skillText);
  const nameLine = /^name:\s*(.+)$/m.exec(fm);
  assert.ok(nameLine, 'name key must be present');
  assert.equal(nameLine[1].trim(), 'agent-whip');
});

test('description is non-empty and contains a "Use when" clause', () => {
  const fm = extractFrontmatter(skillText);
  const descMatch = /^description:\s*(.+)$/m.exec(fm);
  assert.ok(descMatch, 'description key must be present');
  const description = descMatch[1].trim();
  assert.ok(description.length > 0, 'description must not be empty');
  assert.match(description, /Use when/, 'description must contain a "Use when" clause');
});

test('every references/*.md file named in the body actually exists', () => {
  const body = skillText.slice(skillText.indexOf('\n---\n', 4) + 5);
  const linkPattern = /\(references\/([A-Za-z0-9._-]+\.md)\)/g;
  const referenced = new Set();
  let m;
  while ((m = linkPattern.exec(body)) !== null) {
    referenced.add(m[1]);
  }
  assert.ok(referenced.size > 0, 'SKILL.md body should link at least one references/*.md file');
  for (const name of referenced) {
    const full = join(here, 'references', name);
    assert.ok(existsSync(full), `referenced file references/${name} must exist at ${full}`);
  }
});
