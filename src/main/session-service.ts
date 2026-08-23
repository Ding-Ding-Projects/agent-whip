import type { SessionViewModel } from '../shared/ipc-contracts.js';
import { tryLoadDelivery, type ResolveResult, type SessionRecord } from './delivery-shim.js';

/**
 * Builds the redacted session list shown in the popover. Never returns anything from a
 * SessionRecord beyond id/runtime/cwd -- in particular never the nonce, which exists purely as a
 * server-side proof-of-registration secret and has no business anywhere near the renderer.
 */
export async function listSessionViewModels(): Promise<SessionViewModel[]> {
  const delivery = await tryLoadDelivery();
  if (!delivery) {
    return [];
  }
  const records = delivery.listSessions();
  return records.map((record) => toViewModel(record, delivery.resolveTarget(record.sessionId)));
}

function toViewModel(record: SessionRecord, resolved: ResolveResult): SessionViewModel {
  return {
    id: record.sessionId,
    runtime: record.runtime,
    cwd: record.cwd,
    resolvable: resolved.ok,
    unavailableReason: resolved.ok ? null : resolved.reason,
  };
}

export interface CrackOutcome {
  ok: boolean;
  route: string | null;
  reason: string | null;
}

/**
 * Resolves `sessionId` and attempts delivery of `payload` into it, never allowing an interrupting
 * route (agent-whip's whole promise is that it never interrupts).
 *
 * TODO(delivery-integration): this currently only wires up `noopRoute` (a route that always
 * "succeeds" without writing anywhere), because a real PtyWriter for the target's actual transport
 * is owned by the delivery/main-integration lane, not this GUI lane. Once that lane exposes a
 * factory for a real writer keyed by SessionRecord, replace the single-route array below with
 * `[ptyWriteRoute(realWriterFor(resolved.record)), noopRoute]` so a genuine delivery is attempted
 * before the safe no-op fallback.
 */
export async function crackSession(sessionId: string, payload: string): Promise<CrackOutcome> {
  const delivery = await tryLoadDelivery();
  if (!delivery) {
    return { ok: false, route: null, reason: 'delivery-package-not-built' };
  }
  const resolved = delivery.resolveTarget(sessionId);
  if (!resolved.ok) {
    return { ok: false, route: null, reason: resolved.reason };
  }
  const full = (await import('@agent-whip/delivery')) as unknown as {
    deliverWithFallback: (
      target: { record: SessionRecord; bracketedPaste: boolean },
      payload: string,
      routes: unknown[],
      opts?: { allowInterrupting?: boolean },
    ) => Promise<{ ok: boolean; route: string | null; reason?: string }>;
    noopRoute: unknown;
  };
  const target = { record: resolved.record, bracketedPaste: false };
  const result = await full.deliverWithFallback(target, payload, [full.noopRoute], { allowInterrupting: false });
  return { ok: result.ok, route: result.route, reason: result.ok ? null : (result.reason ?? null) };
}
