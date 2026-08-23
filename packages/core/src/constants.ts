import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * A single crack ("tier 1") asks the agent to keep going at full speed.
 * A double crack within the detection window ("tier 2") additionally
 * authorizes cleanup work (merged-branch cleanup, etc).
 */
export type Tier = 1 | 2;

/** The two trigger phrases, one per tier. */
export interface Profile {
  tier1: string;
  tier2: string;
}

/** Where the active profile came from. */
export type ProfileSource = 'default' | 'file';

/** Why a candidate profile file was rejected (or why loading fell back). */
export type ProfileRejectReason =
  | 'too-large'
  | 'malformed-json'
  | 'duplicate-key'
  | 'unsupported-version'
  | 'missing-field'
  | 'unexpected-field'
  | 'wrong-type'
  | 'empty-string'
  | 'too-long'
  | 'control-character'
  | 'multiline'
  | 'too-deep'
  | 'io-error'
  | 'missing-file';

/** Result of validating raw profile-file bytes. */
export type ValidationResult =
  | { ok: true; profile: Profile; schemaVersion: number }
  | { ok: false; reason: ProfileRejectReason };

/** The profile currently in effect, and how it got there. */
export interface ProfileState {
  profile: Profile;
  source: ProfileSource;
  schemaVersion: number | null;
  /** Why we fell back to the default profile, when source === 'default'. Never set when a file loaded successfully. */
  reason: ProfileRejectReason | null;
}

/**
 * Neutral, public-safe default trigger phrases. These are placeholders,
 * not the operator's real payload text (which is never committed to this
 * repository). Override them with a local, uncommitted profile file at
 * DEFAULT_PROFILE_PATH.
 */
export const DEFAULT_PROFILE: Profile = {
  tier1: 'continue at full speed',
  tier2: 'continue at full speed, then clean up merged branches',
};

/** Default location of the local (never-committed) profile file. */
export const DEFAULT_PROFILE_PATH: string = join(homedir(), '.agent-whip', 'profile.json');

/** Schema versions this build knows how to read. */
export const SUPPORTED_SCHEMA_VERSIONS: readonly number[] = [1];

/** Hard byte cap on the profile file, checked before any JSON parsing occurs. */
export const MAX_PROFILE_BYTES = 4096;

/** Maximum length, in UTF-16 code units, of a single trigger phrase. */
export const MAX_PAYLOAD_CHARS = 240;

/** Minimum length, in UTF-16 code units, of a single trigger phrase. */
export const MIN_PAYLOAD_CHARS = 4;

/**
 * Maximum allowed object/array nesting depth of the profile document, where
 * the root object is depth 1 and its "profile" object is depth 2. Named so a
 * future schema revision has to raise it deliberately rather than by accident.
 */
export const MAX_PROFILE_DEPTH = 2;
