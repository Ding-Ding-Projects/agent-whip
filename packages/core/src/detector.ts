import type { Tier } from './constants.js';

/**
 * Detects single vs. double "cracks" per session. A single crack is tier 1.
 * A second crack landing within the detection window of the first is tier 2,
 * and that pair is consumed: a third crack immediately after starts a fresh
 * count at tier 1 again, rather than chaining into another tier 2.
 */
export class CrackDetector {
  readonly #windowMs: number;
  readonly #lastCrackAt = new Map<string, number>();

  constructor(windowMs = 2000) {
    this.#windowMs = windowMs;
  }

  /**
   * Records a crack for `sessionId` at `now` (defaults to Date.now()) and
   * returns which tier it resolves to. The window boundary is inclusive:
   * a second crack at exactly `now - prev === windowMs` still counts as
   * tier 2.
   */
  onCrack(sessionId: string, now: number = Date.now()): Tier {
    const prev = this.#lastCrackAt.get(sessionId);
    if (prev !== undefined && now - prev <= this.#windowMs) {
      // The pair is consumed: forget it, so a third crack starts fresh.
      this.#lastCrackAt.delete(sessionId);
      return 2;
    }
    this.#lastCrackAt.set(sessionId, now);
    return 1;
  }

  /** Clears pending crack state for one session, or every session if omitted. */
  reset(sessionId?: string): void {
    if (sessionId === undefined) {
      this.#lastCrackAt.clear();
    } else {
      this.#lastCrackAt.delete(sessionId);
    }
  }
}
