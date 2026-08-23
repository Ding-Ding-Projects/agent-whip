// @agent-whip/delivery now publishes a real index (registry, routes, and the mailbox transport --
// see packages/delivery/src/index.ts and src/transports/mailbox-route.ts). This file keeps this
// CLI's own, deliberately simpler `DeliveryRoute`/`deliverWithFallback` shape (`send(target,
// payload): Promise<boolean>`, no `interrupts` flag) so `commands.ts` and its tests never had to
// change, and adapts the real package's richer `mailboxDeliveryRoute` onto that shape.
//
// `noopRoute` remains exactly as it was (used by `--dry-run`, which must never touch a real
// transport). `realRoutes` is the actual fix for the `no-route` refusal this CLI used to always
// return outside `--dry-run`: it wraps the real, cross-process, filesystem-mailbox transport.
import { mailboxDeliveryRoute, type SessionTarget } from '@agent-whip/delivery';
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

/**
 * Adapts `@agent-whip/delivery`'s real `mailboxDeliveryRoute` to this CLI's simpler
 * `send(target, payload): Promise<boolean>` shape.
 *
 * `bracketedPaste` is hardcoded `false` here: this CLI has no mechanism yet to detect whether the
 * resolved target's terminal has requested bracketed-paste mode (DECSET 2004), so every delivery
 * from this CLI uses the legacy two-write delivery. That is the SAFE default in the absence of
 * that detection -- it is slower to race a receiving TUI's own paste heuristics than a single
 * bracketed write would be, but it is correct against every target regardless of whether that
 * target supports bracketed paste, whereas guessing `true` against a target that never requested
 * it would be a real correctness bug. Detecting the real mode is tracked as follow-up work, not
 * silently pretended to already exist.
 */
export function sessionMailboxRoute(): DeliveryRoute {
  const real = mailboxDeliveryRoute();
  return {
    name: real.name,
    async send(target: SessionRecord, payload: string): Promise<boolean> {
      const sessionTarget: SessionTarget = { record: target, bracketedPaste: false };
      const available = await real.isAvailable(sessionTarget);
      if (!available) return false;
      const result = await real.deliver(sessionTarget, payload);
      return result.ok;
    },
  };
}

/**
 * The real, non-dry-run route ladder. A CLI process is short-lived and has no in-memory handle to
 * any session's pty/input stream, so this is the ONLY real transport available to it: the
 * filesystem-mailbox route, which fails closed (returns `false`, never throws past this adapter)
 * whenever the target session's own listener cannot be found or does not positively confirm the
 * write. `noopRoute` is deliberately NOT appended here -- appending it would turn every genuine
 * delivery failure into a silent, always-"successful" no-op for a real (non-dry-run) crack, which
 * is exactly the failure mode this whole package exists to prevent.
 */
export const realRoutes: readonly DeliveryRoute[] = [sessionMailboxRoute()];

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
