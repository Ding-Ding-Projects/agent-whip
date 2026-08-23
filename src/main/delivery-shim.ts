// @agent-whip/delivery now publishes a real dist/index.js (registry, delivery ladder, and the
// mailbox transport -- see packages/delivery/src/index.ts and src/transports/mailbox-route.ts).
// This shim is kept anyway, deliberately: it is the one place this app tolerates the delivery
// package not being built yet (a genuinely possible state during development), degrading to an
// honest `null` rather than crashing the whole Electron main process on a missing dist/. The
// shapes below mirror the real package's public types and must be kept in sync with it.
export interface SessionRecord {
  sessionId: string;
  pid: number;
  ppid: number;
  createdAt: string;
  runtime: 'claude' | 'codex' | 'unknown';
  cwd: string;
  nonce: string;
}

export type ResolveFailure =
  | 'not-registered'
  | 'stale-registration'
  | 'ambiguous'
  | 'process-gone'
  | 'lineage-mismatch'
  | 'io-error';

export type ResolveResult = { ok: true; record: SessionRecord } | { ok: false; reason: ResolveFailure };

export type DeliveryResult = { ok: true; route: string } | { ok: false; route: string | null; reason: string };

interface SessionTarget {
  record: SessionRecord;
  bracketedPaste: boolean;
}

interface DeliveryRoute {
  readonly name: string;
  readonly interrupts: boolean;
  isAvailable(target: SessionTarget): Promise<boolean>;
  deliver(target: SessionTarget, payload: string): Promise<DeliveryResult>;
}

/**
 * The full shape this app actually uses from `@agent-whip/delivery`. Kept as one loaded module
 * object (rather than several separate dynamic imports scattered across call sites) so there is
 * exactly one place that tolerates the package being unbuilt.
 */
export interface DeliveryModule {
  listSessions(): SessionRecord[];
  resolveTarget(id: string): ResolveResult;
  mailboxDeliveryRoute(): DeliveryRoute;
}

/**
 * Attempts a real dynamic import of the built package. Returns null when the package has not been
 * built yet (or fails to load for any other reason), so callers can degrade to an honest "delivery
 * package not built yet" state instead of crashing the whole app.
 */
export async function tryLoadDelivery(): Promise<DeliveryModule | null> {
  try {
    const mod = (await import('@agent-whip/delivery')) as unknown as DeliveryModule;
    return mod;
  } catch {
    return null;
  }
}

/**
 * Resolves `sessionId` and delivers `payload` to it via the real filesystem-mailbox transport --
 * the same non-interrupting, fail-closed route the CLI uses. This GUI process is, in this regard,
 * exactly the same kind of client as `agent-whip crack`: neither owns the target session's actual
 * input stream, so both reach it the same way, over the mailbox a registered session's own process
 * is (or is not) listening on.
 *
 * `bracketedPaste` is hardcoded `false` for the same reason it is in the CLI shim: this app has no
 * mechanism yet to detect the target's bracketed-paste mode, so it uses the legacy two-write
 * delivery, which is correct (if not maximally race-resistant) against every target regardless of
 * that capability.
 */
export async function crackViaMailbox(sessionId: string, payload: string): Promise<CrackViaMailboxOutcome> {
  const delivery = await tryLoadDelivery();
  if (!delivery) {
    return { ok: false, route: null, reason: 'delivery-package-not-built' };
  }
  const resolved = delivery.resolveTarget(sessionId);
  if (!resolved.ok) {
    return { ok: false, route: null, reason: resolved.reason };
  }
  const route = delivery.mailboxDeliveryRoute();
  const target: SessionTarget = { record: resolved.record, bracketedPaste: false };
  const available = await route.isAvailable(target);
  if (!available) {
    return { ok: false, route: null, reason: 'no-route' };
  }
  const result = await route.deliver(target, payload);
  return result.ok
    ? { ok: true, route: result.route }
    : { ok: false, route: result.route, reason: result.reason ?? 'delivery-failed' };
}

export type CrackViaMailboxOutcome =
  | { ok: true; route: string }
  | { ok: false; route: string | null; reason: string };
