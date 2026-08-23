import type { ProfileState, Tier } from './constants.js';

/** Picks the trigger phrase for `tier` out of the active profile state. */
export function resolvePayload(tier: Tier, state: ProfileState): string {
  return tier === 1 ? state.profile.tier1 : state.profile.tier2;
}
