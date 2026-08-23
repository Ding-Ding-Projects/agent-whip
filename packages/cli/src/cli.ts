import { parseArgv } from './argv.js';
import { realDeps, realIo, runCrack, runProfile, runRegister, runSessions, runUnregister, type Deps, type Io } from './commands.js';

export const USAGE = `agent-whip - crack a whip at a running agent session

Usage:
  agent-whip crack [--session <id>] [--tier 1|2] [--dry-run] [--json]
  agent-whip sessions [--json]
  agent-whip register --runtime <claude|codex> [--session <id>]
  agent-whip unregister --session <id>
  agent-whip profile [--path <p>] [--json]
  agent-whip profile reload [--path <p>] [--json]
  agent-whip --help
  agent-whip --version

A single crack is tier 1 (speed). A second crack within the detection window is tier 2
(speed + cleanup authorization). agent-whip never interrupts the target session; it only
delivers a trigger phrase that the session's own agent chooses to act on.

There is no flag to send arbitrary text. The delivered phrase always comes from the local,
never-committed profile file (see: agent-whip profile). Use --dry-run to preview.`;

export const VERSION = '0.1.0';

/**
 * Runs one CLI invocation end to end and returns the process exit code. Never calls
 * process.exit itself, so it is directly testable in-process.
 */
export async function run(argv: readonly string[], io: Io = realIo, deps: Deps = realDeps): Promise<number> {
  const parsed = parseArgv(argv);
  if (!parsed.ok) {
    io.stderr(`error: ${parsed.error}`);
    io.stderr('Run "agent-whip --help" for usage.');
    return 2;
  }

  const { args } = parsed;
  switch (args.cmd) {
    case 'help':
      io.stdout(USAGE);
      return 0;
    case 'version':
      io.stdout(VERSION);
      return 0;
    case 'crack':
      return runCrack(args, io, deps);
    case 'sessions':
      return runSessions(args, io, deps);
    case 'register':
      return runRegister(args, io, deps);
    case 'unregister':
      return runUnregister(args, io, deps);
    case 'profile':
      return runProfile(args, io, deps);
  }
}
