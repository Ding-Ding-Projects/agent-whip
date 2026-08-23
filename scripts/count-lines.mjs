// Prints the line-count table the release notes publish.
//
// Committed as a script so the figure in a release is reproducible by anyone, and so nobody has to
// re-derive it with an ad-hoc `wc -l` sweep that silently drops whatever directory it forgot.
//
// Attribution is per SURVIVING line via `git blame`, never by summing added lines from the log:
// churn is not authorship, and a line written and later deleted belongs to nobody.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const sh = (c) => execSync(c, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const CATEGORIES = [
  ['Source (TypeScript)', (f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.startsWith('scripts/')],
  ['Tests', (f) => /\.test\.(tsx?|mjs)$/.test(f) || /test-contract\.mjs$/.test(f)],
  ['Build & guard scripts', (f) => f.startsWith('scripts/') && !/\.test\.mjs$/.test(f)],
  ['Styles & markup', (f) => /\.(css|html)$/.test(f)],
  ['Windows batch', (f) => /\.bat$/.test(f)],
  ['Config (json, yml)', (f) => /\.(json|ya?ml)$/.test(f) && f !== 'package-lock.json'],
  ['Documentation', (f) => /\.md$/.test(f)],
];

// Excluded, and said out loud rather than silently: a count that quietly folds in a lockfile or a
// generated artifact misrepresents the project.
const EXCLUDED = [
  ['package-lock.json', (f) => f === 'package-lock.json'],
  ['Generated digests', (f) => f === 'scripts/reserved-terms.lock.json'],
];

const all = sh('git ls-files').trim().split('\n').filter(Boolean);
const isBinary = (f) => /\.(png|ico|jpg|jpeg|gif|webp|zip|exe|nupkg)$/i.test(f);
const text = all.filter((f) => !isBinary(f));

const stat = (files) => {
  let total = 0, nonBlank = 0;
  for (const f of files) {
    const lines = readFileSync(f, 'utf8').split(/\r?\n/);
    if (lines.at(-1) === '') lines.pop();   // a trailing newline is not a line; git blame agrees
    total += lines.length;
    nonBlank += lines.filter((l) => l.trim()).length;
  }
  return { total, nonBlank, files: files.length };
};

const rows = [];
const claimed = new Set();
for (const [name, pred] of CATEGORIES) {
  const files = text.filter((f) => !claimed.has(f) && pred(f) && !EXCLUDED.some(([, p]) => p(f)));
  files.forEach((f) => claimed.add(f));
  if (files.length) rows.push([name, stat(files)]);
}
const other = text.filter((f) => !claimed.has(f) && !EXCLUDED.some(([, p]) => p(f)));
if (other.length) rows.push(['Other', stat(other)]);   // catch-all: no file may vanish from the total

const projectFiles = text.filter((f) => !EXCLUDED.some(([, p]) => p(f)));
const project = stat(projectFiles);
const grand = stat(text);

// ---- authorship, by surviving line ----
const AGENT = /^(Claude|.*\[bot\])/i;
let agentLines = 0, humanLines = 0;
for (const f of projectFiles) {
  let out;
  try { out = sh(`git blame --line-porcelain -- "${f}"`); } catch { continue; }
  for (const line of out.split('\n')) {
    if (line.startsWith('author ')) {
      const who = line.slice(7).trim();
      if (AGENT.test(who)) agentLines++; else humanLines++;
    }
  }
}

const pad = (s, n) => String(s).padEnd(n);
const num = (s, n) => String(s).padStart(n);
console.log('| Category | Files | Lines | Non-blank |');
console.log('|---|---:|---:|---:|');
for (const [name, s] of rows) {
  console.log(`| ${pad(name, 22)} | ${num(s.files, 5)} | ${num(s.total, 6)} | ${num(s.nonBlank, 9)} |`);
}
console.log(`| **Project total** | **${project.files}** | **${project.total}** | **${project.nonBlank}** |`);
for (const [name, pred] of EXCLUDED) {
  const f = text.filter(pred);
  if (f.length) { const s = stat(f); console.log(`| _${name} (excluded)_ | ${s.files} | ${s.total} | ${s.nonBlank} |`); }
}
console.log(`| **Grand total (everything counted)** | **${grand.files}** | **${grand.total}** | **${grand.nonBlank}** |`);
console.log();
console.log(`Attribution by surviving line (git blame): agent ${agentLines}, human ${humanLines}, total ${agentLines + humanLines}.`);
if (agentLines + humanLines !== project.total) {
  console.log(`NOTE: attribution total (${agentLines + humanLines}) differs from the project line total (${project.total}).`);
  console.log('      Usually a trailing-newline convention difference; reported rather than hidden.');
}
