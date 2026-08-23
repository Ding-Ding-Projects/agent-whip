// Hand-rolled argv parsing. agent-whip has a handful of subcommands and does not need a
// dependency for this — every dependency here is unnecessary supply-chain surface for a repo that
// ships unsigned installers.
//
// Deliberately absent: any `--payload` / `--message` / `--text` override flag on `crack`. A flag
// that accepts arbitrary text on the command line would let a caller bypass the validated,
// never-committed profile entirely and re-open exactly the leak the profile mechanism exists to
// close (payload text landing in shell history, process lists, and CI logs). Use `--dry-run`
// instead of inventing one.

export type Tier = 1 | 2;

export interface CrackArgs {
  cmd: 'crack';
  session: string | null;
  tier: Tier | null;
  dryRun: boolean;
  json: boolean;
}

export interface SessionsArgs {
  cmd: 'sessions';
  json: boolean;
}

export interface RegisterArgs {
  cmd: 'register';
  runtime: 'claude' | 'codex';
  session: string | null;
}

export interface UnregisterArgs {
  cmd: 'unregister';
  session: string;
}

export interface ProfileArgs {
  cmd: 'profile';
  reload: boolean;
  path: string | null;
  json: boolean;
}

export interface HelpArgs {
  cmd: 'help';
}

export interface VersionArgs {
  cmd: 'version';
}

export type ParsedArgs = CrackArgs | SessionsArgs | RegisterArgs | UnregisterArgs | ProfileArgs | HelpArgs | VersionArgs;

export type ParseResult = { ok: true; args: ParsedArgs } | { ok: false; error: string };

function takeValue(argv: readonly string[], i: number, flag: string): { value: string; next: number } | { error: string } {
  const tok = argv[i];
  const eq = tok.indexOf('=');
  if (eq !== -1) {
    return { value: tok.slice(eq + 1), next: i + 1 };
  }
  const value = argv[i + 1];
  if (value === undefined || value.startsWith('--')) {
    return { error: `${flag} requires a value` };
  }
  return { value, next: i + 2 };
}

function isFlag(tok: string | undefined, name: string): boolean {
  return tok === name || (tok?.startsWith(`${name}=`) ?? false);
}

export function parseArgv(argv: readonly string[]): ParseResult {
  if (argv.length === 0 || isFlag(argv[0], '--help') || argv[0] === '-h') {
    return { ok: true, args: { cmd: 'help' } };
  }
  if (isFlag(argv[0], '--version') || argv[0] === '-v') {
    return { ok: true, args: { cmd: 'version' } };
  }

  const [cmd, ...rest] = argv;

  switch (cmd) {
    case 'crack':
      return parseCrack(rest);
    case 'sessions':
      return parseSessions(rest);
    case 'register':
      return parseRegister(rest);
    case 'unregister':
      return parseUnregister(rest);
    case 'profile':
      return parseProfile(rest);
    case '--help':
    case '-h':
      return { ok: true, args: { cmd: 'help' } };
    case '--version':
    case '-v':
      return { ok: true, args: { cmd: 'version' } };
    default:
      return { ok: false, error: `unknown command: ${cmd}` };
  }
}

function parseCrack(argv: readonly string[]): ParseResult {
  let session: string | null = null;
  let tier: Tier | null = null;
  let dryRun = false;
  let json = false;

  for (let i = 0; i < argv.length; ) {
    const tok = argv[i];
    if (isFlag(tok, '--session')) {
      const r = takeValue(argv, i, '--session');
      if ('error' in r) return { ok: false, error: r.error };
      session = r.value;
      i = r.next;
    } else if (isFlag(tok, '--tier')) {
      const r = takeValue(argv, i, '--tier');
      if ('error' in r) return { ok: false, error: r.error };
      if (r.value !== '1' && r.value !== '2') {
        return { ok: false, error: `--tier must be 1 or 2, got: ${r.value}` };
      }
      tier = r.value === '1' ? 1 : 2;
      i = r.next;
    } else if (tok === '--dry-run') {
      dryRun = true;
      i += 1;
    } else if (tok === '--json') {
      json = true;
      i += 1;
    } else {
      return { ok: false, error: `unknown option for crack: ${tok}` };
    }
  }

  return { ok: true, args: { cmd: 'crack', session, tier, dryRun, json } };
}

function parseSessions(argv: readonly string[]): ParseResult {
  let json = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--json') {
      json = true;
    } else {
      return { ok: false, error: `unknown option for sessions: ${argv[i]}` };
    }
  }
  return { ok: true, args: { cmd: 'sessions', json } };
}

function parseRegister(argv: readonly string[]): ParseResult {
  let runtime: 'claude' | 'codex' | null = null;
  let session: string | null = null;

  for (let i = 0; i < argv.length; ) {
    const tok = argv[i];
    if (isFlag(tok, '--runtime')) {
      const r = takeValue(argv, i, '--runtime');
      if ('error' in r) return { ok: false, error: r.error };
      if (r.value !== 'claude' && r.value !== 'codex') {
        return { ok: false, error: `--runtime must be claude or codex, got: ${r.value}` };
      }
      runtime = r.value;
      i = r.next;
    } else if (isFlag(tok, '--session')) {
      const r = takeValue(argv, i, '--session');
      if ('error' in r) return { ok: false, error: r.error };
      session = r.value;
      i = r.next;
    } else {
      return { ok: false, error: `unknown option for register: ${tok}` };
    }
  }

  if (runtime === null) {
    return { ok: false, error: '--runtime is required (claude or codex)' };
  }

  return { ok: true, args: { cmd: 'register', runtime, session } };
}

function parseUnregister(argv: readonly string[]): ParseResult {
  let session: string | null = null;
  for (let i = 0; i < argv.length; ) {
    const tok = argv[i];
    if (isFlag(tok, '--session')) {
      const r = takeValue(argv, i, '--session');
      if ('error' in r) return { ok: false, error: r.error };
      session = r.value;
      i = r.next;
    } else {
      return { ok: false, error: `unknown option for unregister: ${tok}` };
    }
  }
  if (session === null) {
    return { ok: false, error: '--session is required' };
  }
  return { ok: true, args: { cmd: 'unregister', session } };
}

function parseProfile(argv: readonly string[]): ParseResult {
  let reload = false;
  let path: string | null = null;
  let json = false;

  let i = 0;
  if (argv[0] === 'reload') {
    reload = true;
    i = 1;
  }

  for (; i < argv.length; ) {
    const tok = argv[i];
    if (isFlag(tok, '--path')) {
      const r = takeValue(argv, i, '--path');
      if ('error' in r) return { ok: false, error: r.error };
      path = r.value;
      i = r.next;
    } else if (tok === '--json') {
      json = true;
      i += 1;
    } else {
      return { ok: false, error: `unknown option for profile: ${tok}` };
    }
  }

  return { ok: true, args: { cmd: 'profile', reload, path, json } };
}
