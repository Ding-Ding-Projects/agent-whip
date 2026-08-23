# Why `agent-whip` is safe to fire with no confirmation prompt

`agent-whip crack` sends its trigger phrase with no interactive "are you sure?" step. That is a
deliberate design choice, not an oversight — a confirmation prompt would itself be an interrupt,
and the entire point of this tool is that it is never an interrupt. The safety burden that a
confirmation prompt would normally carry is instead pushed onto two other mechanisms, both of
which this skill must respect and never bypass.

## It is not an interrupt

Cracking a session never cancels, stops, or discards its in-flight turn. Tier 1 asks the target to
continue at full speed; tier 2 asks it to continue at full speed and additionally grants a
cleanup/branch-management authorization. Neither tier touches whatever the session is currently
doing. If a user wants to actually stop or interrupt an agent, `agent-whip` is the wrong tool
regardless of tier.

## Safety boundary #1: target resolution, not a prompt

A session is only a valid crack target if it was **registered by a deliberate one-time action
taken from inside that session** (`agent-whip register`, run in the session being registered).
Window titles, terminal titles, or any other on-screen text are never used to pick a target —
title text is attacker- and accident-controlled, and decoy windows (IME helpers, tooltips,
renamed terminals) are common enough that title matching would be unsafe as an identity check.

At fire time, `agent-whip crack` re-resolves the registration against **live process identity**:
the recorded PID must still be alive, and its current parent PID must still match the parent PID
recorded at registration time. This catches PID reuse — the case where a registered process has
exited and its PID has been recycled by an unrelated process — which a naive "is this PID alive"
check would miss.

Every failure path here **fails closed**:
- Zero matches → refusal (`not-registered`).
- More than one ambiguous match → refusal (`ambiguous`) — the CLI never guesses and picks the
  first.
- A stale, corrupt, or partially-written registration record → refusal, never silently trusted.
- A live PID whose current parent no longer matches the recorded parent → refusal
  (`lineage-mismatch`).
- An inconclusive parent-PID check (some environments cannot report it) is treated as "unknown,"
  never as a positive mismatch — but it also never overrides the requirement that the PID itself
  be alive.

Because resolution happens again at fire time rather than being cached from when the user picked a
target, a session that exited between selection and firing is refused with a concrete reason
rather than silently doing nothing or hitting whatever process now holds that PID.

## Safety boundary #2: an append-only audit log, never the payload text

Every crack attempt — delivered, refused, or errored — is appended as one JSON line to a local
log. The log never contains the trigger-phrase text itself, only:
- a timestamp,
- the tier,
- the session id, PID, and delivery route (if any),
- the outcome (`delivered` / `refused` / `error`),
- and a **hash prefix** identifying the payload, sufficient to confirm "this was the same phrase
  as before" without making the log a second place the actual phrase text could leak from.

A logging failure never blocks or fails the crack itself — the crack is the thing the user asked
for, and a failed audit write must not stand in its way. This means the log is a forensic record
for after the fact, not a gate.

## What this skill must never do

- Never read `~/.agent-whip/profile.json` or `~/.agent-whip/sessions/*.json` directly. Always go
  through the CLI.
- Never invent, guess, or print the tier-1/tier-2 phrase text. The CLI resolves it from the local
  profile; the skill has no visibility into it and must say so if asked.
- Never pick a target by title text, "the most recently opened terminal," or similar heuristics —
  only a session id returned by `agent-whip sessions` (which itself only lists sessions that
  passed registration) is a valid target.
- Never treat a refusal (exit code `1`) as a bug to work around by retrying blindly — relay the
  stated reason to the user, since it is almost always telling them something true and actionable
  (the session exited, the target was ambiguous, etc).
