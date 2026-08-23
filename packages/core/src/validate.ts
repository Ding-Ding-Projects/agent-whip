import {
  MAX_PAYLOAD_CHARS,
  MAX_PROFILE_BYTES,
  MAX_PROFILE_DEPTH,
  MIN_PAYLOAD_CHARS,
  SUPPORTED_SCHEMA_VERSIONS,
  type ProfileRejectReason,
  type ValidationResult,
} from './constants.js';
import { hasDuplicateKey } from './dup-key-scanner.js';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function computeDepth(value: unknown): number {
  if (value === null || typeof value !== 'object') return 0;
  const children: unknown[] = Array.isArray(value) ? value : Object.values(value);
  let maxChild = 0;
  for (const child of children) {
    const d = computeDepth(child);
    if (d > maxChild) maxChild = d;
  }
  return 1 + maxChild;
}

function classifyControlChars(value: string): 'multiline' | 'control-character' | null {
  if (/[\r\n]/.test(value)) return 'multiline';
  for (const ch of value) {
    const cp = ch.codePointAt(0)!;
    if ((cp >= 0x00 && cp <= 0x1f) || cp === 0x7f || (cp >= 0x80 && cp <= 0x9f)) {
      return 'control-character';
    }
  }
  return null;
}

/** Validates a single tier payload string. Returns a reject reason, or null when it is acceptable. */
function classifyPayloadString(value: unknown): ProfileRejectReason | null {
  if (typeof value !== 'string') return 'wrong-type';
  if (value.trim().length === 0) return 'empty-string';
  if (value.length < MIN_PAYLOAD_CHARS || value.length > MAX_PAYLOAD_CHARS) return 'too-long';
  const controlReason = classifyControlChars(value);
  if (controlReason) return controlReason;
  return null;
}

/**
 * Validates raw profile-file bytes against the closed schemaVersion-1 shape:
 *   { "schemaVersion": 1, "profile": { "tier1": "...", "tier2": "..." } }
 *
 * The whole candidate object is built and checked in memory before anything
 * is returned to the caller — there is no code path here that mutates a
 * live/active profile field-by-field, so a profile can never be partially
 * applied. A caller that gets `{ ok: true }` gets a complete, fully-checked
 * Profile; anything else and the caller must fall back to defaults wholesale.
 */
export function validateProfileFile(raw: Uint8Array): ValidationResult {
  // Rule 1: byte cap, checked before JSON.parse is ever invoked.
  if (raw.byteLength > MAX_PROFILE_BYTES) {
    return { ok: false, reason: 'too-large' };
  }

  const text = new TextDecoder('utf-8', { fatal: false }).decode(raw);

  // Rule 2: duplicate keys are detected on the raw text, before parsing,
  // because JSON.parse silently keeps only the last value for a repeated key.
  if (hasDuplicateKey(text)) {
    return { ok: false, reason: 'duplicate-key' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'malformed-json' };
  }

  if (!isPlainObject(parsed)) {
    return { ok: false, reason: 'wrong-type' };
  }

  const rootKeys = Object.keys(parsed);
  const allowedRootKeys = new Set(['schemaVersion', 'profile']);
  for (const key of rootKeys) {
    if (!allowedRootKeys.has(key)) return { ok: false, reason: 'unexpected-field' };
  }

  const schemaVersion = parsed.schemaVersion;
  if (
    typeof schemaVersion !== 'number' ||
    !Number.isInteger(schemaVersion) ||
    !SUPPORTED_SCHEMA_VERSIONS.includes(schemaVersion)
  ) {
    // Covers an absent schemaVersion too: `undefined` fails the typeof check.
    return { ok: false, reason: 'unsupported-version' };
  }

  if (!('profile' in parsed)) {
    return { ok: false, reason: 'missing-field' };
  }

  const profileRaw = parsed.profile;
  if (!isPlainObject(profileRaw)) {
    return { ok: false, reason: 'wrong-type' };
  }

  const profileKeys = Object.keys(profileRaw);
  const allowedProfileKeys = new Set(['tier1', 'tier2']);
  for (const key of profileKeys) {
    if (!allowedProfileKeys.has(key)) return { ok: false, reason: 'unexpected-field' };
  }
  if (!('tier1' in profileRaw)) return { ok: false, reason: 'missing-field' };
  if (!('tier2' in profileRaw)) return { ok: false, reason: 'missing-field' };

  // Nesting depth: root object (1) + profile object (2) is the whole shape
  // this schema allows. Anything deeper means a value that should be a
  // string is itself a container.
  const depth = computeDepth(parsed);
  if (depth > MAX_PROFILE_DEPTH) {
    return { ok: false, reason: 'too-deep' };
  }

  const tier1Reason = classifyPayloadString(profileRaw.tier1);
  if (tier1Reason) return { ok: false, reason: tier1Reason };

  const tier2Reason = classifyPayloadString(profileRaw.tier2);
  if (tier2Reason) return { ok: false, reason: tier2Reason };

  return {
    ok: true,
    schemaVersion,
    profile: { tier1: profileRaw.tier1 as string, tier2: profileRaw.tier2 as string },
  };
}
