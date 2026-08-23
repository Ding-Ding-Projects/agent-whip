# Crack tiers

## The two tiers

| Crack             | Timing                           | Delivers | Effect                                       |
|-------------------|-----------------------------------|----------|-----------------------------------------------|
| Single crack      | one trigger                       | `tier1`  | Switch the session to a faster operating mode. |
| Double crack      | two triggers within ~2 seconds    | `tier2`  | Speed mode **plus** cleanup authorization.     |

A double crack is detected purely by timing between two single-crack events —
there's no separate "double crack" gesture to learn. Crack it, crack it again
inside the window, and the second delivery carries `tier2` instead of a
repeated `tier1`.

## There is no confirmation prompt — on either tier

This is a deliberate, documented decision, not an oversight:

- **agent-whip's job ends at delivering text.** It writes a short phrase into
  a live session. It does not, and structurally cannot, know what the
  receiving agent will do with that phrase — that's entirely up to the
  agent's own instructions and safety rules (in this project's own case,
  see `AGENTS.md`).
- **A confirmation prompt in agent-whip would be theater.** The tool has no
  way to evaluate whether "clean up merged branches" is currently safe to
  authorize — that judgment belongs to the agent that receives the phrase
  and to whatever guardrails govern *its* destructive actions. Putting a
  yes/no dialog in front of a whip crack would create a false sense that
  agent-whip is the safety boundary, when the actual safety boundary is
  (and must be) on the receiving end.
- **The double-crack tier itself is the intentional friction.** Requiring
  two deliberate, closely-timed cracks — rather than one crack plus a
  dialog click — keeps the "grant cleanup authorization" action distinct
  from an idle mouse click landing on the wrong button, while not adding a
  step that has to be dismissed on every single ordinary crack.

## The mitigation: a local, append-only crack log

Every crack — successful or refused — is recorded locally:

- timestamp
- tier (1 or 2)
- delivery route attempted (pty, hook channel, etc. — see
  [Delivery routes](delivery-routes.md))
- outcome (delivered / refused, and why, if refused)

The log **never contains the payload text itself** — see
[Privacy](privacy.md) for exactly what is and isn't recorded and why. It
exists so that "I cracked and didn't mean to" has an answer: look at the
log, see exactly what was sent, when, and to which target, and take it from
there. It's an audit trail, not a gate — nothing waits on it before
delivering.

## Suggested articles

- [Payload profiles](payload-profiles.md) — where `tier1` and `tier2` text
  actually comes from.
- [Delivery routes](delivery-routes.md) — how a resolved payload actually
  reaches a session, and the targeting contract that refuses to guess which
  window to hit.
- [Privacy](privacy.md) — exactly what the crack log records and what it
  never will.
