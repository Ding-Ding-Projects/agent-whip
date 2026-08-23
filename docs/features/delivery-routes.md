# Delivery routes

A crack has to reach a real target — a terminal, a window, or a hook channel
— and agent-whip supports more than one way to get there. Every route shares
the same validated, sanitized payload (see [Payload profiles](payload-profiles.md)
and `SECURITY.md`'s bracketed-paste section); what differs is the mechanism
of delivery.

## Pty injection

The most general route: write the wrapped, bracketed-paste payload directly
into a target pseudo-terminal's input stream. Works against any shell or TUI
that honors bracketed paste — which is effectively all of them on a modern
terminal.

## Codex hook channel

Where the target is a Slop Machine (OpenAI Codex CLI) session and a
hook/session channel is available, agent-whip prefers writing into that
channel directly over simulating a paste. This is a more precise delivery
mechanism when it's available; pty injection remains the documented fallback
for everything else.

## Standalone dispatcher GUI (planned)

A minimal GUI for picking a target session visually and cracking it — see
`ROADMAP.md` milestone 6. It uses the same window-targeting contract as
below; it doesn't get a shortcut.

## The window-targeting contract

> [!IMPORTANT]
> Delivering a crack to the wrong window isn't just wasted effort — it's a
> privacy and correctness hazard. A payload landing in an unrelated
> application because a targeting heuristic guessed wrong is the kind of bug
> that erodes trust in the whole tool.

A target window is resolved by **all three** of:

1. window **class** matches the expected target;
2. window **title is non-empty** and matches the expected pattern;
3. window **width and height are both non-zero**.

If zero windows match, or **more than one** matches, delivery is **refused**
— not attempted against "the first one" or "whichever seems most likely."
The refusal names exactly what was found (how many candidates, their
titles/classes) so the operator can see why and correct it (usually: close
the extra window, or be more specific about which session to target).

This mirrors the same discipline used elsewhere for resolving a target
window on a headless desktop: index-based selection is exactly the kind of
shortcut that silently targets a zero-by-zero helper window or an unrelated
process, and it's refused here for the same reason.

## Suggested articles

- [Crack tiers](crack-tiers.md) — what gets delivered and when.
- [Privacy](privacy.md) — why none of these routes ever touches a network.
- [Payload profiles](payload-profiles.md) — where the delivered text comes
  from before it reaches any of these routes.
