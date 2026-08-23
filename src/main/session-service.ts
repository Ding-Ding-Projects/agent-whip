import type { SessionViewModel } from '../shared/ipc-contracts.ts';
import { crackViaMailbox, tryLoadDelivery, type ResolveResult, type SessionRecord } from './delivery-shim.ts';

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
 * Resolves `sessionId` and attempts delivery of `payload` into it via the real, non-interrupting
 * filesystem-mailbox transport (`@agent-whip/delivery`'s `mailboxDeliveryRoute`) -- the same route
 * `agent-whip crack` uses. This app never owns the target session's actual input stream any more
 * than the CLI does, so it is the same kind of client and reaches a session the same way: over the
 * mailbox that session's own registered process is (or is not) listening on. A session that is not
 * reachable that way is reported as such, never silently treated as delivered.
 */
export async function crackSession(sessionId: string, payload: string): Promise<CrackOutcome> {
  const outcome = await crackViaMailbox(sessionId, payload);
  return {
    ok: outcome.ok,
    route: outcome.ok ? outcome.route : outcome.route,
    reason: outcome.ok ? null : outcome.reason,
  };
}
