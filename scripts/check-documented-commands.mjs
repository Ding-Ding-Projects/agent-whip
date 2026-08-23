// Every `agent-whip ...` command shown in the documentation must actually parse.
//
// This exists because the README's very first example was `agent-whip crack --double`, and
// --double is not a flag. It exits 2 as an unknown option. The first command a new reader copies
// would have failed, and nothing in the build noticed: the docs were prose, the CLI was code, and
// the two had no relationship a check could see.
//
// The rule is narrow on purpose. It asserts only that a documented command PARSES — exit code 2 is
// a usage error and is a failure here. Exit 1 is fine and expected: a refusal ("no session
// registered") means the command was understood, which is all this guard claims to prove. It does
// not run anything with side effects, because it never gets past argument parsing on a machine
// with no registered sessions.
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { execSync } from 'node:child_process';

const BIN = new URL('../packages/cli/dist/bin.js', import.meta.url);
if (!existsSync(BIN)) {
  console.log('check-documented-commands: SKIP — packages/cli is not built yet.');
  console.log('  Run: npx tsc -b packages/cli');
  process.exit(0);
}

const docs = execSync('git ls-files', { encoding: 'utf8' })
  .trim().split('\n')
  .filter((f) => f.endsWith('.md'));

// Commands that would do something real if they parsed. We still check that they parse, but we
// pass --help alongside nothing destructive: every one of these refuses without a live session
// anyway, and none of them writes outside ~/.agent-whip.
const seen = new Map(); // command string -> first file:line it appeared in

for (const file of docs) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (!inFence) continue;
    const m = line.match(/^\s*(?:\$\s*)?agent-whip\s+(.+?)\s*$/);
    if (!m) continue;
    // strip a trailing comment
    const args = m[1].replace(/\s+#.*$/, '').trim();
    if (!args) continue;
    // skip lines that are obviously placeholders rather than real invocations
    if (/[<>]/.test(args)) continue;
    if (!seen.has(args)) seen.set(args, `${file}:${i + 1}`);
  }
}

if (seen.size === 0) {
  console.log('check-documented-commands: no documented commands found. Nothing to check.');
  process.exit(0);
}

let bad = 0;
for (const [args, where] of seen) {
  let code = 0;
  try {
    execFileSync(process.execPath, [BIN.pathname.replace(/^\/([A-Za-z]:)/, '$1'), ...args.split(/\s+/)], {
      stdio: 'ignore',
    });
  } catch (err) {
    code = typeof err.status === 'number' ? err.status : 1;
  }
  if (code === 2) {
    console.error(`check-documented-commands: FAIL — ${where}: "agent-whip ${args}" is a usage error (exit 2).`);
    console.error('  The documentation describes a flag or subcommand the CLI does not have.');
    bad++;
  }
}

if (bad > 0) {
  console.error(`check-documented-commands: ${bad} documented command(s) do not parse.`);
  process.exit(1);
}
console.log(`check-documented-commands: PASS — ${seen.size} documented command(s) all parse.`);
