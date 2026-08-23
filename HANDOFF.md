# Handoff

## Current state (2026-08-22)

This is a brand-new public repository. The scaffold below was assembled by
several agents working in parallel over disjoint ownership lanes:

- **Root files, workflows, scripts, docs** (this handoff's author): `README.md`,
  `ROADMAP.md`, `HANDOFF.md`, `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`,
  `CODE_OF_CONDUCT.md`, `AGENTS.md`, `.github/workflows/{ci,release,pages}.yml`,
  `scripts/check-*.mjs` + `scripts/lib/walk-source.mjs`, `docs/` (index +
  four feature articles).
- **`packages/`, `src/`, `site/`**: owned by other agents in this same pass;
  not touched here. At the time of writing, `packages/core/src` had
  `constants.ts` and `dup-key-scanner.ts`, `packages/paste-frame/src` had
  `index.ts`, and `packages/delivery` had only its manifest files — none of
  that was inspected in depth or modified by this lane.

## What was verified in this pass

- All three guard scripts (`check-no-network`, `check-no-payload-logging`,
  `check-public-hygiene`) run clean against the tree as it stood at handoff
  time, and each was proven load-bearing by deliberately introducing the
  exact violation it exists to catch, confirming a non-zero exit and the
  expected message, then deleting the fixture and confirming a clean exit
  again. See the session transcript for exact command output; summarized:
  - `check-no-network`: red on a `fetch(...)` call under
    `packages/core/src`, green after removal.
  - `check-no-payload-logging`: red on `console.log('sending', payload.tier1)`,
    green after removal.
  - `check-public-hygiene`: red on a tracked `profile.json` and on a raw
    `ESC` (0x1B) byte in a fixture file under `packages/core/src`, green
    after both were removed/untracked.
- `npm run check:no-network`, `npm run check:no-payload-logging`, and
  `npm run check:public-hygiene` (as wired in the pre-existing `package.json`)
  all resolve to these exact scripts and were not renamed.

## What was NOT done in this pass

- No `git commit` was made — integration is left to the orchestrating agent
  per this lane's instructions.
- `npm run build` / `npm run typecheck` / the real test suite were not run —
  they depend on `packages/*` source this lane does not own, and much of it
  did not exist yet at handoff time (e.g. `packages/cli` had no `src/`).
- No screenshots or release were produced — nothing in `packages/` is far
  enough along to run yet.
- The docs site (v1.1 milestone) was not started; `docs/` is the in-repo
  Markdown source only, not yet published anywhere.

## Next steps for whoever picks this up

1. Once `packages/core`, `packages/cli`, and `packages/paste-frame` have real
   implementations, re-run `npm run check` from repo root and fix anything
   the guards catch — they were written to fail closed, not to be tuned to
   pass.
2. Wire `ci.yml`'s test step against the real `packages/*/dist/**/*.test.js`
   output once packages actually build.
3. `release.yml` is ready to run but has never actually published anything —
   the first real run will be the first proof it works end to end. Watch it,
   don't assume it from reading the YAML.
4. `pages.yml` triggers on `site/**` and on the Release workflow completing —
   confirm `site/` actually produces a deployable `dist`/output directory
   before trusting a green Pages run.
5. Populate `README.md`'s screenshot section with real captures once there's
   a working CLI or dispatcher GUI to point a camera at.
