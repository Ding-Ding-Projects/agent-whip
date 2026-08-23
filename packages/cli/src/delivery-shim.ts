// @agent-whip/delivery currently exports the session registry (registerSession, listSessions,
// unregisterSession, resolveTarget — see registry.ts) but has not yet published the delivery-route
// layer described in the cross-package contract (`deliverWithFallback`, `noopRoute`). Rather than
// block this package on that work landing, or invent a fake route that pretends to deliver, this
// module declares the minimal local shape `agent-whip crack` needs and implements only the
// deliberately inert `noopRoute` (used by `--dry-run`) plus the fallback-iteration logic itself,
// which has no dependency on any real transport and is safe to own here.
//
// TODO(delivery-integration): once @agent-whip/delivery exports `DeliveryRoute`,
// `deliverWithFallback`, and `noopRoute` from a package index, delete this file and import them
// directly instead.
import type { SessionRecord } from './registry-bridge.js';

/** One way of getting a payload into a live session. */
export interface DeliveryRoute {
  readonly name: string;
  send(target: SessionRecord, payload: string): Promise<boolean>;
}

/** A route that does nothing and reports success — used for `--dry-run`. */
export const noopRoute: DeliveryRoute = {
  name: 'noop',
  send: async () => true,
};

export type DeliverResult =
  | { ok: true; route: string }
  | { ok: false; route: string | null; reason: string };

export interface DeliverOptions {
  /** Injectable for tests; defaults to no per-route timeout. */
  onRouteError?: (route: string, err: unknown) => void;
}

/**
 * Try each route in order until one reports success. No route ever receives the payload more than
 * once concurrently; routes are tried strictly in sequence so at most one write ever reaches the
 * target process.
 */
export async function deliverWithFallback(
  target: SessionRecord,
  payload: string,
  routes: readonly DeliveryRoute[],
  opts: DeliverOptions = {},
): Promise<DeliverResult> {
  if (routes.length === 0) {
    return { ok: false, route: null, reason: 'no-route' };
  }
  for (const route of routes) {
    try {
      const sent = await route.send(target, payload);
      if (sent) return { ok: true, route: route.name };
    } catch (err) {
      opts.onRouteError?.(route.name, err);
    }
  }
  return { ok: false, route: null, reason: 'all-routes-failed' };
}
