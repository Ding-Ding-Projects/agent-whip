import { randomUUID } from 'node:crypto';
import {
  clearProfileCache,
  DEFAULT_PROFILE_PATH,
  loadProfile,
  resolvePayload,
  type ProfileState,
  type Tier,
} from '@agent-whip/core';
import { deliverWithFallback, noopRoute, type DeliveryRoute } from './delivery-shim.js';
import { describePayload } from './identity.js';
import {
  registerSession,
  resolveTarget,
  resolveUniqueLiveSession,
  unregisterSession,
  type ResolveResult,
  type SessionRecord,
} from './registry-bridge.js';
import { listSessions } from './registry-bridge.js';
import { recordCrack } from './crack-window.js';
import type { CrackArgs, ProfileArgs, RegisterArgs, SessionsArgs, UnregisterArgs } from './argv.js';

export interface Io {
  stdout(line: string): void;
  stderr(line: string): void;
}

export const realIo: Io = {
  stdout: (line) => process.stdout.write(line.endsWith('\n') ? line : `${line}\n`),
  stderr: (line) => process.stderr.write(line.endsWith('\n') ? line : `${line}\n`),
};

/** Injectable seams so tests never touch the real filesystem, real processes, or real time. */
export interface Deps {
  resolveTarget: typeof resolveTarget;
  resolveUniqueLiveSession: typeof resolveUniqueLiveSession;
  listSessions: typeof listSessions;
  registerSession: typeof registerSession;
  unregisterSession: typeof unregisterSession;
  loadProfile: (path?: string) => ProfileState;
  clearProfileCache: () => void;
  recordCrack: typeof recordCrack;
  routes: readonly DeliveryRoute[];
  now: () => number;
}

export const realDeps: Deps = {
  resolveTarget,
  resolveUniqueLiveSession,
  listSessions,
  registerSession,
  unregisterSession,
  loadProfile,
  clearProfileCache,
  recordCrack,
  routes: [],
  now: () => Date.now(),
};

function refusalReason(result: Exclude<ResolveResult, { ok: true }>): string {
  return result.reason;
}

function nextStep(reason: string): string {
  switch (reason) {
    case 'not-registered':
      return 'Register the session first: agent-whip register --runtime <claude|codex>';
    case 'stale-registration':
      return 'The registration file is malformed. Unregister and register again.';
    case 'ambiguous':
      return 'More than one live session is registered. Pass --session <id> to pick one.';
    case 'process-gone':
      return 'The registered process has exited. Unregister it and register the current one.';
    case 'lineage-mismatch':
      return 'The pid was reused by an unrelated process. Unregister and register again.';
    case 'io-error':
      return 'Could not read the session registry. Check permissions on ~/.agent-whip.';
    case 'no-route':
      return 'No delivery route is wired up yet. Use --dry-run to preview without delivering.';
    case 'all-routes-failed':
      return 'Every delivery route failed. Check that the target session is still responsive.';
    default:
      return 'See the reason above.';
  }
}

export async function runCrack(args: CrackArgs, io: Io, deps: Deps = realDeps): Promise<number> {
  const target: ResolveResult =
    args.session !== null ? deps.resolveTarget(args.session) : deps.resolveUniqueLiveSession();

  if (!target.ok) {
    const reason = refusalReason(target);
    if (args.json) {
      io.stdout(JSON.stringify({ ok: false, reason, nextStep: nextStep(reason) }));
    } else {
      io.stderr(`refused: ${reason}`);
      io.stderr(nextStep(reason));
    }
    return 1;
  }

  const tier: Tier = args.tier ?? deps.recordCrack(target.record.sessionId, { now: deps.now() });
  const profileState = deps.loadProfile();
  const payload = resolvePayload(tier, profileState);
  const identity = describePayload(payload);

  if (args.dryRun) {
    const result = await deliverWithFallback(target.record, payload, [noopRoute]);
    if (args.json) {
      io.stdout(
        JSON.stringify({
          ok: true,
          dryRun: true,
          tier,
          session: target.record.sessionId,
          route: result.ok ? result.route : null,
          profileSource: profileState.source,
          payload: identity,
        }),
      );
    } else {
      io.stdout(`dry run: would deliver tier ${tier} to session ${target.record.sessionId}`);
      io.stdout(`profile source: ${profileState.source}`);
      io.stdout(`payload: ${identity}`);
    }
    return 0;
  }

  const result = await deliverWithFallback(target.record, payload, deps.routes);
  if (!result.ok) {
    if (args.json) {
      io.stdout(
        JSON.stringify({ ok: false, tier, session: target.record.sessionId, reason: result.reason, nextStep: nextStep(result.reason) }),
      );
    } else {
      io.stderr(`refused: ${result.reason}`);
      io.stderr(nextStep(result.reason));
    }
    return 1;
  }

  if (args.json) {
    io.stdout(JSON.stringify({ ok: true, tier, session: target.record.sessionId, route: result.route }));
  } else {
    io.stdout(`delivered tier ${tier} to session ${target.record.sessionId} via ${result.route}`);
  }
  return 0;
}

export function runSessions(args: SessionsArgs, io: Io, deps: Deps = realDeps): number {
  const records: SessionRecord[] = deps.listSessions();
  const rows = records.map((r) => ({
    id: r.sessionId,
    runtime: r.runtime,
    pid: r.pid,
    cwd: r.cwd,
    resolves: deps.resolveTarget(r.sessionId).ok,
  }));

  if (args.json) {
    io.stdout(JSON.stringify(rows));
    return 0;
  }

  if (rows.length === 0) {
    io.stdout('No sessions registered. Register one with: agent-whip register --runtime <claude|codex>');
    return 0;
  }

  io.stdout(['ID', 'RUNTIME', 'PID', 'RESOLVES', 'CWD'].join('\t'));
  for (const row of rows) {
    io.stdout([row.id, row.runtime, String(row.pid), row.resolves ? 'yes' : 'no', row.cwd].join('\t'));
  }
  return 0;
}

export function runRegister(args: RegisterArgs, io: Io, deps: Deps = realDeps): number {
  const sessionId = args.session ?? randomUUID();
  const record = deps.registerSession({
    sessionId,
    pid: process.pid,
    ppid: process.ppid,
    runtime: args.runtime,
    cwd: process.cwd(),
  });
  io.stdout(`registered session ${record.sessionId} (${record.runtime}, pid ${record.pid})`);
  return 0;
}

export function runUnregister(args: UnregisterArgs, io: Io, deps: Deps = realDeps): number {
  deps.unregisterSession(args.session);
  io.stdout(`unregistered session ${args.session}`);
  return 0;
}

export function runProfile(args: ProfileArgs, io: Io, deps: Deps = realDeps): number {
  if (args.reload) {
    deps.clearProfileCache();
  }
  const state = deps.loadProfile(args.path ?? undefined);

  const summary = {
    source: state.source,
    schemaVersion: state.schemaVersion,
    reason: state.reason,
    defaultPath: DEFAULT_PROFILE_PATH,
    path: args.path ?? DEFAULT_PROFILE_PATH,
    tier1: describePayload(state.profile.tier1),
    tier2: describePayload(state.profile.tier2),
  };

  if (args.json) {
    io.stdout(JSON.stringify(summary));
    return 0;
  }

  io.stdout(`source: ${summary.source}${summary.reason ? ` (fell back: ${summary.reason})` : ''}`);
  io.stdout(`schema version: ${summary.schemaVersion ?? 'n/a'}`);
  io.stdout(`profile path: ${summary.path}`);
  io.stdout('This file is never committed. See the README for its format.');
  io.stdout(`tier1: ${summary.tier1}`);
  io.stdout(`tier2: ${summary.tier2}`);
  return 0;
}
