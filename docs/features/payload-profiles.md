# Payload profiles

## What it is

A payload profile resolves the exact text agent-whip delivers on a crack. It
has exactly two string fields:

| Field   | Meaning                                                   |
|---------|------------------------------------------------------------|
| `tier1` | Delivered on a single crack — switch to speed mode.        |
| `tier2` | Delivered on a double crack — speed mode + cleanup authorization. |

## The shipped defaults

This repository ships **neutral English defaults only**, because it is
public and the maintainer's real trigger phrases are private:

```json
{
  "version": 1,
  "tier1": "continue at full speed",
  "tier2": "continue at full speed, then clean up merged branches"
}
```

These are real, usable defaults — not placeholders — for anyone who clones
this repository and never sets up a local profile. They'll do exactly what
the field names say.

## Loading a local override

At startup, agent-whip looks for `~/.agent-whip/profile.json`. If it exists
and validates against the schema below, its `tier1`/`tier2` values replace
the shipped defaults for the rest of the session. If it doesn't exist, or
fails validation, the shipped defaults are used — silently for "doesn't
exist" (that's the normal no-local-profile case), loudly (a clear error
naming what's wrong) for "exists but is malformed."

This file is never read from, or written into, this repository. It lives
outside the clone entirely, in the user's home directory.

## The schema

- `version`: integer, currently must be `1`.
- `tier1`: non-empty string, bounded length (short phrases only — this is a
  trigger, not a script).
- `tier2`: non-empty string, same bound.
- No other top-level fields are accepted; an unknown field fails validation
  rather than being silently ignored, so a typo in your own profile file
  tells you about it instead of quietly doing nothing.

A profile that fails validation **never partially applies** — either both
fields load from it, or neither does and the defaults are used for both.

## Why this is the whole privacy mechanism

Every guard in `scripts/` that touches privacy exists to protect this
boundary from two directions:

- `scripts/check-public-hygiene.mjs` fails the build if a `profile.json` (or
  `*.profile.json`) is ever a tracked file in this repository — so even a
  contributor's accidental `git add -f` on their own local profile gets
  caught before it ships.
- `scripts/check-no-payload-logging.mjs` fails the build if the *resolved*
  `tier1`/`tier2` text — whether it came from the shipped defaults or a
  loaded local profile — is ever interpolated into a `console.*` call
  anywhere in `packages/`.

See [Privacy](privacy.md) for the full picture, including what the crack log
does and does not record.

## Suggested articles

- [Crack tiers](crack-tiers.md) — how `tier1` and `tier2` map to single vs.
  double crack, and why delivery has no confirmation gate.
- [Delivery routes](delivery-routes.md) — where the resolved payload text
  actually goes once it's chosen.
- [Privacy](privacy.md) — the full non-negotiable list of what never leaves
  the local machine.
