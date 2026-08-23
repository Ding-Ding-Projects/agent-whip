// Resolves this release's dim-sum code name and downloads its photo.
//
// Names come from the public catalog at Ding-Ding-Projects/dim-sum-photos; photos come from that
// repository's published `catalog-v1` release assets. Nothing is generated locally and no image is
// vendored into this repository — if the public catalog has no published photo for a record, that
// record is skipped rather than filled in from somewhere else.
//
// A dish is used once per project. Which ones are taken is derived from this repository's own
// release notes, so the mapping is auditable from the releases themselves rather than from a
// separate list that can drift.
//
// Usage:  node scripts/pick-dim-sum.mjs [--out <dir>]
// Prints JSON on stdout: { id, slug, nameEn, nameZh, jyutping, file }
//
// Never blocks a release. If the catalog is unreachable or every candidate is used, it exits 0
// with { skipped: <reason> } and the release simply ships without a photo, which the release
// rules explicitly allow.

import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const CATALOG = 'https://raw.githubusercontent.com/Ding-Ding-Projects/dim-sum-photos/main/catalog/index.json';
const PHOTO_REPO = 'Ding-Ding-Projects/dim-sum-photos';
const PHOTO_TAG = 'catalog-v1';
const SELF = process.env.GITHUB_REPOSITORY || 'Ding-Ding-Projects/agent-whip';

const outIdx = process.argv.indexOf('--out');
const outDir = outIdx !== -1 ? process.argv[outIdx + 1] : '.';

const skip = (reason) => {
  console.log(JSON.stringify({ skipped: reason }));
  process.exit(0);
};

async function main() {
  let items;
  try {
    const res = await fetch(CATALOG);
    if (!res.ok) return skip(`catalog HTTP ${res.status}`);
    const j = await res.json();
    items = Array.isArray(j) ? j : (j.items || j.dishes || j.records || []);
  } catch (err) {
    return skip(`catalog unreachable: ${err.code || err.message}`);
  }
  if (!items.length) return skip('catalog empty');

  // Which dishes has this project already used? Read its own release notes.
  const used = new Set();
  try {
    const raw = execFileSync('gh', ['release', 'list', '--repo', SELF, '--limit', '200', '--json', 'tagName'], { encoding: 'utf8' });
    for (const { tagName } of JSON.parse(raw)) {
      try {
        // Scan the notes AND the attached asset names. The first hand-cut release named its dish
        // in prose only — "Classic Har Gow · 蝦餃" — and never printed the hk-dish id, so a
        // body-only scan reported it unused and cheerfully handed the same code name to the next
        // release. The id is always present in the attached photo's filename, so that is the half
        // that can actually be relied on.
        const meta = execFileSync('gh', ['release', 'view', tagName, '--repo', SELF, '--json', 'body,assets'], { encoding: 'utf8' });
        const parsed = JSON.parse(meta);
        const haystack = (parsed.body || '') + ' ' + (parsed.assets || []).map((a) => a.name).join(' ');
        for (const m of haystack.matchAll(/hk-dish-(\d{4})/g)) used.add(`hk-dish-${m[1]}`);
      } catch { /* a release with no readable body simply contributes nothing */ }
    }
  } catch (err) {
    // Without the release history we cannot prove a dish is unused, and reusing one would make two
    // builds indistinguishable in conversation — the one job a code name has. So stop.
    return skip(`cannot read release history: ${err.message}`);
  }

  // Which photos are actually published? A name without a photo is not a usable code name.
  let published;
  try {
    const raw = execFileSync('gh', ['release', 'view', PHOTO_TAG, '--repo', PHOTO_REPO, '--json', 'assets', '--jq', '[.assets[].name]'], { encoding: 'utf8' });
    published = new Set(JSON.parse(raw));
  } catch (err) {
    return skip(`cannot list published photos: ${err.message}`);
  }

  const candidate = items.find((d) => {
    if (!d?.id || used.has(d.id)) return false;
    return [...published].some((n) => n.startsWith(`${d.id}-`));
  });
  if (!candidate) return skip('no unused dish with a published photo');

  const file = [...published].find((n) => n.startsWith(`${candidate.id}-`));
  const url = `https://github.com/${PHOTO_REPO}/releases/download/${PHOTO_TAG}/${file}`;

  let bytes;
  try {
    const res = await fetch(url);
    if (!res.ok) return skip(`photo HTTP ${res.status}`);
    bytes = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    return skip(`photo unreachable: ${err.message}`);
  }

  // Validate it decodes rather than trusting the extension.
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return skip('photo is not a valid PNG');

  mkdirSync(outDir, { recursive: true });
  const path = `${outDir}/${file}`;
  writeFileSync(path, bytes);

  console.log(JSON.stringify({
    id: candidate.id,
    slug: candidate.slug,
    nameEn: candidate.name?.en ?? candidate.id,
    nameZh: candidate.name?.zhHant ?? '',
    jyutping: candidate.jyutping ?? '',
    file,
    path,
    bytes: bytes.length,
  }));
}

main().catch((err) => skip(`unexpected: ${err.message}`));
