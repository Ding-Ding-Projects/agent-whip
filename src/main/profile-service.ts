import { clearProfileCache, DEFAULT_PROFILE_PATH, loadProfile, resolvePayload, type ProfileState } from '@agent-whip/core';
import type { ProfileStatusViewModel, Tier, TierIdentityViewModel } from '../shared/ipc-contracts.ts';
import { buildProfileStatus, buildTierIdentity } from './redact.ts';

let currentPath = DEFAULT_PROFILE_PATH;

export function setProfilePath(path: string): void {
  currentPath = path;
}

export function getProfilePath(): string {
  return currentPath;
}

function currentState(): ProfileState {
  return loadProfile(currentPath);
}

export function getProfileStatus(): ProfileStatusViewModel {
  return buildProfileStatus(currentState());
}

export function reloadProfile(): ProfileStatusViewModel {
  clearProfileCache();
  return getProfileStatus();
}

/** Redacted only: the caller receives a hash and a length, never state.profile[...] itself. */
export function getTierIdentity(tier: Tier): TierIdentityViewModel {
  const state = currentState();
  const payload = resolvePayload(tier, state);
  return buildTierIdentity(tier, payload);
}

/** The one place a real payload string leaves this module -- and it goes straight into delivery, never into an IPC reply. */
export function getPayloadForDelivery(tier: Tier): string {
  return resolvePayload(tier, currentState());
}
