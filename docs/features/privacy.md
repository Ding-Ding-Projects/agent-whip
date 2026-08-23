# Privacy

agent-whip's whole reason for existing — poking a running session to switch
modes — only works if it's trustworthy to run against a real, live agent
session. That trust rests on a short, absolute list.

## No network access

`packages/core` and `packages/cli` are enforced network-free by
`scripts/check-no-network.mjs`, which fails the build on any of:

- `fetch(...)`
- an import or `require` of `node:http`, `node:https`, `node:net`,
  `node:dgram`, or their bare (non-`node:`-prefixed) equivalents
- an import or `require` of `axios`
- `new XMLHttpRequest(...)`

There is no analytics, no crash reporting, no update-check ping, and no
telemetry of any kind. Every crack agent-whip delivers happens entirely on
the machine it's running on, against a session on that same machine.

## No payload text in logs

The append-only crack log (see [Crack tiers](crack-tiers.md)) records
timestamp, tier, delivery route, and outcome — **never** the resolved
`tier1`/`tier2` text itself, whether that text came from the shipped
neutral defaults or from a loaded local profile.

`scripts/check-no-payload-logging.mjs` enforces this at the source level: it
fails the build if any `console.*` call anywhere in `packages/` interpolates
a `.tier1` or `.tier2` field. This is checked at build time, not just
documented, because a debug `console.log` slipped in during development is
exactly the kind of thing that's easy to forget to remove.

## The profile file is local-only

Real trigger phrases live in `~/.agent-whip/profile.json` — outside this
repository, outside version control, never referenced from a committed
fixture or test. `.gitignore` refuses `profile.json` and `*.profile.json`
by name, and `scripts/check-public-hygiene.mjs` fails the build if either
pattern is ever a **tracked** file, so an accidental `git add -f` from a
contributor's own clone gets caught before it can reach a pull request.

See [Payload profiles](payload-profiles.md) for exactly how this file is
loaded, validated, and falls back to defaults.

## No raw control bytes outside the sanitizer

`scripts/check-public-hygiene.mjs` also fails the build if a raw ESC
(`\x1b`) or C1 control byte (`\u0080`–`\u009f`) shows up in source anywhere
outside `packages/paste-frame/` — the one package whose whole job is
detecting and stripping such bytes from a pasted stream. See `SECURITY.md`'s
bracketed-paste section for why that boundary matters for more than tidiness.

## What this means in practice

If you're deciding whether to trust agent-whip enough to run it against a
real coding session: everything it does is visible in this repository, none
of it phones home, and the three guard scripts above are exactly what stand
between "we said so" and "the build fails if it stops being true." Run
`npm run check` yourself if you want to verify it rather than take the docs'
word for it.

## Suggested articles

- [Crack tiers](crack-tiers.md) — what the crack log records and why there's
  no confirmation prompt.
- [Payload profiles](payload-profiles.md) — the profile-loading mechanism
  this page assumes.
- [Delivery routes](delivery-routes.md) — why every delivery route stays
  local by construction.
