// The delivery ladder. `deliverWithFallback` is the single most important behavioural promise in
// this package: a route whose `interrupts` flag is true is SKIPPED unless the caller explicitly
// opts in, and when every non-interrupting route is unavailable the result is a plain refusal --
// never a silent escalation to something that would disturb the session's foreground process.
import { bracketedInjection, legacyInjection } from '@agent-whip/paste-frame';
import type { SessionRecord } from './registry.js';

export interface SessionTarget {
  record: SessionRecord;
  /** Whether the target has requested bracketed-paste mode (DECSET 2004). */
  bracketedPaste: boolean;
}

export type DeliveryResult =
  | { ok: true; route: string }
  | { ok: false; route: string | null; reason: string };

export interface DeliveryRoute {
  readonly name: string;
  /**
   * Must be `false` for every route enabled by default. A route that would need to interrupt the
   * target's running process (e.g. sending Ctrl-C first) sets this `true` and is then only ever
   * selected when the caller passes `allowInterrupting: true` to `deliverWithFallback`.
   */
  readonly interrupts: boolean;
  isAvailable(target: SessionTarget): Promise<boolean>;
  deliver(target: SessionTarget, payload: string): Promise<DeliveryResult>;
}

export interface DeliverOptions {
  /** Must be explicitly set to allow an `interrupts: true` route to be selected. Default false. */
  allowInterrupting?: boolean;
}

export async function deliverWithFallback(
  target: SessionTarget,
  payload: string,
  routes: DeliveryRoute[],
  opts: DeliverOptions = {},
): Promise<DeliveryResult> {
  const allowInterrupting = opts.allowInterrupting === true;
  for (const route of routes) {
    if (route.interrupts && !allowInterrupting) continue;
    let available: boolean;
    try {
      available = await route.isAvailable(target);
    } catch {
      available = false;
    }
    if (!available) continue;
    return route.deliver(target, payload);
  }
  return { ok: false, route: null, reason: 'no-route' };
}

/**
 * A writer function that performs exactly one raw write into the target's input stream. Injected
 * rather than hard-coded to a real pty/pipe so the route is testable without a real pty, and so
 * callers can supply whatever transport actually reaches the target (a node-pty instance, a named
 * pipe, a tmux `send-keys -l`, etc).
 */
export type PtyWriter = (target: SessionTarget, data: string) => Promise<void> | void;

/**
 * Writes into a pty/pane via an injected writer. When the target has requested bracketed paste,
 * the framed text AND the trailing Enter are sent in exactly ONE write -- see paste-frame's own
 * documentation for why splitting them races the receiving TUI's paste heuristics. When the
 * target has not requested bracketed paste, the legacy two-write delivery is used instead.
 */
export function ptyWriteRoute(writer: PtyWriter): DeliveryRoute {
  return {
    name: 'pty-write',
    interrupts: false,
    async isAvailable(target) {
      return target.record.pid > 0;
    },
    async deliver(target, payload) {
      try {
        if (target.bracketedPaste) {
          await writer(target, bracketedInjection(payload, true));
        } else {
          const { text, enter } = legacyInjection(payload, true);
          await writer(target, text);
          await writer(target, enter);
        }
        return { ok: true, route: 'pty-write' };
      } catch (err) {
        return { ok: false, route: 'pty-write', reason: (err as Error).message ?? 'write-failed' };
      }
    },
  };
}

/** Always available, writes nothing, always succeeds. For demos and dry runs. */
export const noopRoute: DeliveryRoute = {
  name: 'noop',
  interrupts: false,
  async isAvailable() {
    return true;
  },
  async deliver() {
    return { ok: true, route: 'noop' };
  },
};

// EXTENSION POINT, deliberately not implemented in this pass: a route that first sends an
// interrupt (e.g. Ctrl-C) to reclaim a busy foreground process before delivering the payload.
// Such a route MUST set `interrupts: true`, which means `deliverWithFallback` will never select it
// unless a caller passes `allowInterrupting: true` explicitly and knowingly. agent-whip's whole
// premise is that cracking a session never interrupts it, so this is opt-in-only by design, not an
// oversight -- do not flip a future interrupting route's default availability, and do not make
// `allowInterrupting` default to true anywhere in this package.
