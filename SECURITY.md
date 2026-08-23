# Security policy

`agent-whip` injects text into a running terminal session. That is a small
surface, but it is a real one, and this document names every hazard we know
about and exactly how the codebase answers it.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting (Security tab → **Report a
vulnerability**) rather than a public issue, for anything in the categories
below. We'll acknowledge within a few days.

## Threat model

agent-whip has three jobs: read a short trigger phrase, validate it, and
deliver it to a target (a pty, a window, or a hook channel). Each job has a
failure mode.

### 1. The bracketed-paste escape-out hazard

> [!WARNING]
> Delivering text through a pty by simulating a paste is the single riskiest
> primitive in this project. Get it wrong and a crafted or malformed payload
> could break out of the paste frame and be interpreted as live keystrokes —
> including control sequences — by the receiving shell or TUI.

**How we answer it:** every delivery route wraps its payload in a bracketed
paste (`ESC[200~ ... ESC[201~`) and, before that, the payload passes through
`packages/paste-frame`'s sanitizer, which:

- rejects (does not deliver) any payload containing a raw `ESC` (`\x1b`) or C1
  control byte (`\u0080`–`\u009f`) — including the paste-end sequence itself
  appearing *inside* the payload, which is exactly the string a break-out
  attempt needs;
- rejects a payload above a fixed, small length ceiling — a whip crack is a
  short phrase, never an arbitrary script;
- never assembles the outer bracketed-paste wrapper from anything other than
  its own fixed constant strings, so the payload text itself can never
  contribute to what the terminal treats as the escape sequence.

The `check-public-hygiene` guard (`scripts/check-public-hygiene.mjs`) enforces
the flip side of this: a raw control byte is allowed to exist in source **only**
inside `packages/paste-frame/`, because that's the one place such bytes are
expected (as literals being matched against, not emitted). Anywhere else in the
tree, a raw control byte in a source file is either an accident or a smuggled
fragment, and the guard fails the build.

### 2. Payloads are validated, never arbitrary

The payload delivered on a crack is always one of exactly two fixed strings —
tier 1 or tier 2 — resolved from a schema-validated profile (see
`docs/features/payload-profiles.md`). There is no code path that accepts
free-form text from an untrusted source and delivers it. A malformed or
oversized profile entry fails closed at load time; it never partially applies.

### 3. No network access, no telemetry

agent-whip does not open a socket. `packages/core` and `packages/cli` are
enforced network-free by `scripts/check-no-network.mjs`, which fails the build
on any `fetch`, `node:http`/`https`/`net`/`dgram` import, or `axios`/
`XMLHttpRequest` usage in those packages. There is no analytics, no crash
reporting, no update check, and no phone-home of any kind. Everything the tool
does happens on your machine, against a session on your machine.

### 4. The profile file is local-only and never logged

Your real trigger phrases live in `~/.agent-whip/profile.json`, a file this
repository's `.gitignore` refuses to let back in even if you try to commit it
from inside a clone. `scripts/check-public-hygiene.mjs` additionally fails the
build if a `profile.json` or `*.profile.json` is ever a tracked file in this
repository. `scripts/check-no-payload-logging.mjs` fails the build if payload
text (the resolved tier 1/tier 2 string, from either the shipped neutral
defaults or your loaded profile) is ever interpolated into a `console.*` call
anywhere in `packages/`. The append-only crack log (see
`docs/features/crack-tiers.md`) records *metadata only* — timestamp, tier,
delivery route, and whether it succeeded — never the phrase text.

### 5. Wrong-target delivery

Delivering a crack to the wrong window is a privacy and correctness hazard in
its own right — think a payload landing in a chat client instead of the coding
agent's terminal. See `docs/features/delivery-routes.md` for the full
targeting contract; the short version:

- a target window is resolved by window **class AND a non-empty title AND
  non-zero width/height**, never by index or by "the first match";
- if more than one candidate matches, or zero do, delivery is **refused** with
  an explicit message naming what was found — it never guesses and never
  falls back to "whichever one seems right."

### 6. No confirmation gate before delivery — and why that's not a bug

There is deliberately no "are you sure?" prompt on either a single or double
crack. See `docs/features/crack-tiers.md` for the full reasoning: agent-whip's
job ends at delivering words to a session; the receiving agent's own safety
rules (including everything in this project's own `AGENTS.md`) are what
actually gate a destructive action. The mitigation for "I cracked and didn't
mean to" is the local append-only crack log, which is always available to
review what was sent, when, and to what.

## Supported versions

Only the latest tagged release receives security fixes. There is no LTS
branch at this stage of the project.
