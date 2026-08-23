// Firing guards. There is no confirmation dialog before a crack fires, so these guards are what
// keep a stuck key, a jittery double-click, or a runaway retry loop from machine-gunning a
// session.
export type FireRefusal = 'cooldown' | 'no-route' | 'target-unresolved' | 'payload-rejected';

export interface CooldownOptions {
  /** Minimum milliseconds between fires for the same session. Default 1500. */
  cooldownMs?: number;
  /** Injectable clock for testing. Defaults to Date.now. */
  now?: () => number;
}

/**
 * Tracks a per-session cooldown. `tryFire` returns true (and records the fire) exactly when the
 * session is not currently in cooldown; otherwise it returns false and records nothing, so a
 * caller can retry later without the rejected attempt itself resetting the window.
 */
export class Cooldown {
  private readonly cooldownMs: number;
  private readonly now: () => number;
  private readonly lastFireAt = new Map<string, number>();

  constructor(opts: CooldownOptions = {}) {
    this.cooldownMs = opts.cooldownMs ?? 1500;
    this.now = opts.now ?? Date.now;
  }

  isCoolingDown(sessionId: string): boolean {
    const last = this.lastFireAt.get(sessionId);
    if (last === undefined) return false;
    return this.now() - last < this.cooldownMs;
  }

  tryFire(sessionId: string): boolean {
    if (this.isCoolingDown(sessionId)) return false;
    this.lastFireAt.set(sessionId, this.now());
    return true;
  }

  reset(sessionId: string): void {
    this.lastFireAt.delete(sessionId);
  }
}
