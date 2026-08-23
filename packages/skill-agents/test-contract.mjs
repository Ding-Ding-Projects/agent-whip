// Contract test for the agent-whip Codex/OpenCode skill package. Run with: node test-contract.mjs
//
// Every assertion here is anchored to a specific line, never to a bare substring — a substring
// check on "allow_implicit_invocation: false" would also match "allow_implicit_invocation: falsey"
// or a commented-out line reading "# allow_implicit_invocation: false", so this file matches the
// real YAML key/value pair at the start of a (possibly indented) line instead.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const skillPath = join(here, 'SKILL.md');
const openaiPath = join(here, 'agents', 'openai.yaml');
const skillText = readFileSync(skillPath, 'utf8');

function extractFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  assert.ok(match, 'SKILL.md must start with a --- frontmatter block');
  return match[1];
}

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

test('agents/openai.yaml exists and sets allow_implicit_invocation to literal false', () => {
  assert.ok(existsSync(openaiPath), 'agents/openai.yaml must exist');
  const yamlText = readFileSync(openaiPath, 'utf8');
  // Anchored: start of a line (allowing leading indentation), the exact key, a colon, optional
  // spaces, then the exact unquoted boolean literal `false` and nothing else on that line (a
  // trailing comment is tolerated, but "falsey" or "false-ish" is not, and neither is a line that
  // starts with a comment marker).
  const match = /^[ \t]*allow_implicit_invocation:[ \t]*false[ \t]*(#.*)?$/m.exec(yamlText);
  assert.ok(
    match,
    'agents/openai.yaml must set "allow_implicit_invocation: false" as a literal, uncommented boolean',
  );
});
