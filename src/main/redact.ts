// THE HARD PRIVACY RULE lives here, and only here: this is the one module in
// the whole app that is allowed to look at a real trigger-phrase payload
// string. Every function below takes a payload in and returns a value that
// provably cannot be turned back into that payload -- a truncated hash and a
// character count. No caller of this module, anywhere in main/, may forward
// the raw payload string to the renderer. The renderer process never has a
// contextBridge method that could receive one, by construction (see
// src/shared/ipc-contracts.ts: AgentWhipBridge has no such method) -- so this
// is belt AND suspenders: even if a future call site slipped up and tried to
// send a payload across, there is no bridge method shaped to carry it.
import { createHash } from 'node:crypto';
import type { ProfileRejectReason, ProfileState } from '@agent-whip/core';
import type { ProfileStatusViewModel, Tier, TierIdentityViewModel } from '../shared/ipc-contracts.ts';

function shortHash(payload: string): string {
  const full = createHash('sha256').update(payload, 'utf8').digest('hex');
  return `sha256:${full.slice(0, 8)}`;
}

/** Builds the redacted tier-identity line shown in both the popover and settings. Never logs, never returns, the payload. */
export function buildTierIdentity(tier: Tier, payload: string): TierIdentityViewModel {
  const hash = shortHash(payload);
  const chars = payload.length;
  return { tier, shortHash: hash, chars, label: `tier ${tier} · ${hash} · ${chars} chars` };
}

function reasonLabel(reason: ProfileRejectReason | null): string {
  return reason ?? 'unknown';
}

/** Builds the redacted profile-status line. Reads only ProfileState metadata (source/schemaVersion/reason), never state.profile itself. */
export function buildProfileStatus(state: ProfileState): ProfileStatusViewModel {
  if (state.source === 'file') {
    return {
      source: 'file',
      schemaVersion: state.schemaVersion,
      label: `custom profile loaded (schemaVersion ${state.schemaVersion ?? '?'})`,
    };
  }
  return {
    source: 'default',
    schemaVersion: state.schemaVersion,
    label: `shipped default profile — ${reasonLabel(state.reason)}`,
  };
}
