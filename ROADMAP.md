# Roadmap

A real checklist. Nothing here is ticked until it's implemented, verified, and
(where it has a visible surface) captured from the real built artifact — see
the project's completeness rules. Nothing below has been verified yet, so
nothing is ticked.

## Milestone 1 — Paste-frame extraction

- [ ] `packages/paste-frame`: detect and strip raw ESC/C1 control bytes from a
      candidate payload before it is ever wrapped or delivered
- [ ] Fixed-length ceiling enforced on any candidate payload
- [ ] Self-tests proving a break-out attempt (a payload containing the
      paste-end sequence, or a bare ESC) is rejected, not delivered
- [ ] Self-tests proving ordinary short phrases pass through unchanged

## Milestone 2 — Core validator + detector

- [ ] `packages/core`: payload-profile schema (versioned, bounded, tier1/tier2
      string fields only)
- [ ] Neutral English default profile shipped in-repo
- [ ] Local profile loader: reads `~/.agent-whip/profile.json` if present,
      validates it against the schema, falls back to defaults on any
      validation failure (never partially applies a bad profile)
- [ ] Single-crack vs. double-crack (two cracks within ~2s) detector
- [ ] Append-only local crack log (metadata only — timestamp, tier, route,
      outcome; never payload text)
- [ ] `check-no-network` and `check-no-payload-logging` guards passing against
      real (non-fixture) core source

## Milestone 3 — CLI

- [ ] `agent-whip crack` (and `agent-whip crack --double`) as a real command
- [ ] `agent-whip profile` subcommands: show resolved profile source (default
      vs. local), validate a candidate profile file, never print phrase text
      to a shared/CI-visible log
- [ ] `agent-whip log` to review the local crack log

## Milestone 4 — Pty injection

- [ ] Deliver a validated, wrapped payload into a target pty
- [ ] Verified against at least one real shell and one real TUI without
      producing stray keystrokes or a broken prompt

## Milestone 5 — Codex hook channel

- [ ] A delivery route that writes into Slop Machine's own hook/session
      channel where one exists, instead of only simulating a paste
- [ ] Documented fallback to pty injection where the hook channel isn't
      available

## Milestone 6 — Standalone dispatcher GUI

- [ ] A minimal cross-platform GUI: pick a target session, crack it, see the
      log
- [ ] Window-targeting contract enforced (class + non-empty title + non-zero
      size; refuse on ambiguity) — see `docs/features/delivery-routes.md`

## Milestone 7 — Skill packages

- [ ] Packaged skill/plugin form for at least one agent runtime, so "install
      agent-whip" doesn't require hand-wiring a hook

## Milestone 8 — Docs and release

- [ ] `docs/` complete and cross-linked (this milestone's own bar: every
      feature article has real "Suggested articles" links, not stubs)
- [ ] `release.yml` publishing a real, uniquely tagged, non-draft, unsigned
      release with working timing metadata
- [ ] `README.md` capture section populated with real screenshots of a crack
      landing in a real terminal

## v1.1 — nodeterm canvas control and docs site

- [ ] Control surface for cracking a session from within a nodeterm canvas
- [ ] Published documentation site (GitHub Pages) mirroring `docs/`, with the
      full site feature contract (tabs, search, appearance, etc.) applied
