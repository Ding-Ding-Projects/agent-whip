# Agent instructions for this repository

This file is a **sanitized mirror** of the maintainer's shared cross-project
agent instructions. It is kept generic on purpose — no private paths, machine
names, hosts, tokens, or account-specific detail. If you're an agent working
in this repository, the durable rules below apply; edit them here only to fix
a genuine sanitization gap, not to change policy (policy changes happen in the
canonical instructions source, then get re-mirrored).

## Scope of this project

`agent-whip` injects a short trigger phrase into a running coding-agent
session to switch it into a faster operating mode. It is explicitly **not**
an interrupt-based tool — see `README.md`'s "Why this is not an interrupt"
section before changing anything about delivery timing or the interrupt
question.

## The privacy boundary is the load-bearing constraint

This is a **public** repository. The maintainer's real trigger phrases are
private and must never be committed here, in any form — not in a fixture, not
in a test, not in a comment, not in a commit message. The repo ships only a
generic payload-profile schema with neutral English defaults
(`continue at full speed` / `continue at full speed, then clean up merged
branches`); real phrases load at runtime from a local, gitignored file outside
the repository. Before touching `packages/core` or `packages/cli`, or
anything under `scripts/`, read `SECURITY.md` and `docs/features/privacy.md`.

Never weaken, bypass, or "temporarily disable for testing" any of:

- `scripts/check-no-network.mjs`
- `scripts/check-no-payload-logging.mjs`
- `scripts/check-public-hygiene.mjs`

All three run in CI as a non-gating reported step by house policy on test/lint
gating, but they exist specifically to catch privacy and safety regressions,
so treat a failure from any of them as a real defect to fix, not noise to
suppress.

## No code signing, ever

Installers built by `release.yml` are permanently unsigned, by explicit
standing policy. Never add a signing step, never source a certificate, and
say so plainly in release notes (the workflow already does this — don't
remove it).

## No test/lint gating on CI, by design

`ci.yml` runs the build, typecheck, and test suite, but none of it blocks
anything — there is no required status check derived from test results.
Don't "fix" this by making a job required; if you disagree with the policy,
raise it as an issue rather than changing the workflow unilaterally.

## Git and GitHub practice

- Use the `git` CLI and `gh` CLI directly; don't reach for a browser or REST
  client as a substitute.
- Bilingual, honest commit messages describing the actual change; never claim
  an unverified success.
- Every push-triggered validation-only workflow should carry a `concurrency`
  group with `cancel-in-progress: true`; release/publish workflows should not
  (a cancelled release can strand a tag without its artifact).
- Prefer small, reviewable commits per logical change over one giant commit.

## When in doubt

Read the relevant `docs/features/*.md` article first — this project documents
its own design decisions (the no-confirmation delivery, the profile-loading
mechanism, the window-targeting contract) specifically so an agent working
here doesn't have to guess at intent.
