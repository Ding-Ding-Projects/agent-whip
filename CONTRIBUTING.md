# Contributing to agent-whip

Thanks for looking at the whip. A few things that will save you a round trip.

## The privacy boundary is load-bearing

This repository is public. It ships a **generic, versioned payload-profile
schema** with neutral English defaults only. Nobody's real trigger phrases —
including the maintainer's — ever get committed here. If your change touches
`packages/core` or `packages/cli`, run:

```
npm run check
```

before opening a PR. It runs three guards:

- `check-no-network` — the core and CLI packages must never import a
  networking primitive. agent-whip writes text into a local terminal/window;
  it has no reason to ever open a socket.
- `check-no-payload-logging` — the tier payload text must never be
  interpolated into a `console.*` call, in any package.
- `check-public-hygiene` — no `profile.json` (or `*.profile.json`) may ever be
  a tracked file, and no raw C1/ESC control byte may sit in source outside
  `packages/paste-frame/` (the one package whose job is detecting and
  stripping such bytes from a pasted stream).

These are anchored to real usage, not to bare substrings, on purpose — see the
comments at the top of each script in `scripts/` before "fixing" a false
positive by loosening the pattern. If a guard is wrong, the fix is almost
always in the guard's specificity, not in weakening what it checks.

## Local setup

```
npm install
npm run build
npm run typecheck
npm run check
```

## What we're not looking for

- A confirmation-prompt-before-delivery PR. That's an explicit, documented
  design decision (see `docs/features/crack-tiers.md`) — the tool only sends
  words, the receiving agent's own safety rules are what actually gate
  anything destructive. If you disagree, open an issue and make the case
  there first.
- Network telemetry, analytics, or "phone home" of any kind. See
  `docs/features/privacy.md`.

## Pull requests

- Keep PRs scoped to one concern.
- Update the relevant `docs/features/*.md` article in the same PR as any
  behavior change.
- CI runs the build, typecheck, and test suite on every push, but does **not**
  gate merges on test results (see the comment in `.github/workflows/ci.yml`
  for why) — reviewers still expect tests to actually pass, they're just not
  a required status check.

## Reporting a security or privacy issue

See `SECURITY.md` — please do not open a public issue for anything that could
expose a delivery-targeting or escape-sequence hazard before a fix ships.
