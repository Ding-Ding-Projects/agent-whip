# @agent-whip/core

Trigger-phrase resolution and profile loading for agent-whip.

This package has no network access whatsoever, and it never logs a trigger
phrase. It resolves which phrase to inject for a given tier, and it loads an
optional local profile file that lets an operator override the shipped
neutral defaults with their own private wording — a file that is never
committed to this repository.

## Tiers

- **Tier 1** — a single crack. Asks the agent to keep going at full speed.
- **Tier 2** — a double crack (two cracks within the detection window).
  Additionally authorizes cleanup work, such as removing merged branches.

This package ships only neutral English placeholder phrases:

```
tier1: "continue at full speed"
tier2: "continue at full speed, then clean up merged branches"
```

Anyone who wants their own private trigger wording supplies it through a
local profile file (below); it is loaded from the user's home directory and
is never part of this repository.

## The local profile file

By default, the profile is read from:

```
~/.agent-whip/profile.json
```

(resolved via `os.homedir()`; exported as `DEFAULT_PROFILE_PATH`).

That file is **not** committed anywhere, is not distributed with this
package, and is not read from the repository. It is a purely local override.

### Shape (schemaVersion 1)

The schema is closed: only these keys are accepted, at exactly these
positions.

```json
{
  "schemaVersion": 1,
  "profile": {
    "tier1": "your own tier-1 phrase",
    "tier2": "your own tier-2 phrase"
  }
}
```

- Root object: exactly `schemaVersion` and `profile`. No other keys.
- `profile` object: exactly `tier1` and `tier2`. No other keys.
- Both `tier1` and `tier2` must be non-empty, single-line strings.

### Limits

| Constant             | Value | Meaning                                                        |
| --------------------- | ----- | ---------------------------------------------------------------- |
| `MAX_PROFILE_BYTES`   | 4096  | Hard cap on the whole file's byte size.                          |
| `MIN_PAYLOAD_CHARS`   | 4     | Minimum length of `tier1`/`tier2`, in UTF-16 code units.          |
| `MAX_PAYLOAD_CHARS`   | 240   | Maximum length of `tier1`/`tier2`, in UTF-16 code units.          |
| `MAX_PROFILE_DEPTH`   | 2     | Root object is depth 1, its `profile` object is depth 2. Nothing may nest deeper. |
| `SUPPORTED_SCHEMA_VERSIONS` | `[1]` | Schema versions this build understands.                 |

### Reject reasons

`validateProfileFile` never throws. It returns `{ ok: true, ... }` or
`{ ok: false, reason }`, where `reason` is one of:

| Reason                | Meaning                                                                 |
| ---------------------- | ------------------------------------------------------------------------ |
| `too-large`             | The file exceeds `MAX_PROFILE_BYTES`. Checked **before** any JSON parsing occurs — an oversized file is never even handed to a JSON parser. |
| `duplicate-key`         | The same key appears twice in one JSON object (e.g. two `"tier1"` entries). Detected on the raw text, because `JSON.parse` silently keeps only the last value and would hide the collision. |
| `malformed-json`        | The text is not valid JSON.                                             |
| `unsupported-version`   | `schemaVersion` is absent, not an integer, or not in `SUPPORTED_SCHEMA_VERSIONS`. |
| `missing-field`         | `profile`, `tier1`, or `tier2` is absent.                                |
| `unexpected-field`      | An unknown key exists at the root or inside `profile`.                  |
| `wrong-type`            | The root or `profile` isn't a plain object, or a tier value isn't a string. |
| `empty-string`          | A tier value is empty or whitespace-only.                               |
| `too-long`              | A tier value's length falls outside `MIN_PAYLOAD_CHARS`..`MAX_PAYLOAD_CHARS` (either too short or too long). |
| `multiline`             | A tier value contains a carriage return or line feed.                   |
| `control-character`     | A tier value contains any other control character (including the C1 control U+009B). |
| `too-deep`              | The document nests deeper than `MAX_PROFILE_DEPTH` (for example, a tier value that is itself an object). |
| `io-error`              | The file exists but could not be read.                                  |
| `missing-file`          | No file exists at the resolved path.                                    |

### No partial application

Validation builds and checks the whole candidate profile in memory before
anything is returned. There is no code path that mutates a live/active
profile field-by-field: either the whole file validates and both `tier1`
and `tier2` are accepted together, or the whole file is rejected and the
caller falls back to `DEFAULT_PROFILE` in its entirety. A valid `tier1`
sitting next to an invalid `tier2` rejects the entire file — it never keeps
the valid half.

## Fail-closed loading

`loadProfile(path?)` **never throws**. A missing file, an unreadable file, or
any validation failure all fall back to the neutral default profile plus a
`reason` code describing why:

```ts
interface ProfileState {
  profile: Profile;
  source: 'default' | 'file';
  schemaVersion: number | null;
  reason: ProfileRejectReason | null; // set only when source === 'default'
}
```

A crash mid-crack would be worse than quietly using the default trigger
phrases, so degrading is always preferred over throwing.

`loadProfile` revalidates on every call: it caches by resolved path plus the
file's `mtimeMs` and size, so an edited profile file is always re-read and
re-validated rather than trusted from a stale cache entry. `clearProfileCache()`
drops the whole cache, which is mainly useful in tests.

## Privacy

- **No network.** This package never imports `node:http`, `node:https`,
  `node:net`, `node:dgram`, and never calls `fetch`.
- **No payload logging.** Nothing in this package writes a `tier1`/`tier2`
  value to a logger. Failures are reported only as opaque `reason` codes,
  never as the text that was rejected.

## API

```ts
export type Tier = 1 | 2;
export interface Profile { tier1: string; tier2: string }
export type ProfileSource = 'default' | 'file';
export type ProfileRejectReason = /* see table above */;
export type ValidationResult =
  | { ok: true; profile: Profile; schemaVersion: number }
  | { ok: false; reason: ProfileRejectReason };
export interface ProfileState {
  profile: Profile;
  source: ProfileSource;
  schemaVersion: number | null;
  reason: ProfileRejectReason | null;
}

export const DEFAULT_PROFILE: Profile;
export const DEFAULT_PROFILE_PATH: string;
export const SUPPORTED_SCHEMA_VERSIONS: readonly number[];
export const MAX_PROFILE_BYTES: number;
export const MAX_PAYLOAD_CHARS: number;
export const MIN_PAYLOAD_CHARS: number;
export const MAX_PROFILE_DEPTH: number;

export function validateProfileFile(raw: Uint8Array): ValidationResult;
export function loadProfile(path?: string): ProfileState;
export function clearProfileCache(): void;
export function resolvePayload(tier: Tier, state: ProfileState): string;

export class CrackDetector {
  constructor(windowMs?: number); // default 2000
  onCrack(sessionId: string, now?: number): Tier;
  reset(sessionId?: string): void;
}
```

### `CrackDetector`

Tracks cracks per session (a `Map` keyed by `sessionId`, so cracking one
session never counts toward another). Two cracks landing within `windowMs`
of each other resolve to tier 2, and the boundary is **inclusive**
(`now - prev <= windowMs`). A tier-2 pair is **consumed**: a third crack
right after starts counting fresh, so three rapid cracks read
tier1 → tier2 → tier1, never an ambiguous chain.

## Building and testing

```
npm run build   # tsc -b
npm test        # node --test against the compiled dist output
```
