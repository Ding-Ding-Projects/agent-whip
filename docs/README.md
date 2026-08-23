# Documentation index

This is the categorized documentation for `agent-whip`. Each article below
covers one feature area in depth: behavior, configuration, failure modes,
security considerations, and how it's verified.

## Feature articles

- [Payload profiles](features/payload-profiles.md) — the versioned schema,
  the neutral shipped defaults, and how a local `~/.agent-whip/profile.json`
  overrides them without ever being committed.
- [Crack tiers](features/crack-tiers.md) — single vs. double crack, why
  there's no confirmation prompt, and the append-only crack log.
- [Delivery routes](features/delivery-routes.md) — pty injection, the Codex
  hook channel, and the window-targeting contract that refuses to guess.
- [Privacy](features/privacy.md) — no network access, no telemetry, and
  exactly what does and doesn't get logged.

## Where this fits

`docs/` is the in-repo Markdown source. See `ROADMAP.md`'s v1.1 milestone for
the plan to publish this as a documentation site via GitHub Pages
(`.github/workflows/pages.yml`); until that lands, this directory is the
canonical read path.
