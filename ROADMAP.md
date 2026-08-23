# Roadmap

A real checklist. An item is ticked only once it has been implemented and
verified by actually running it — see the project's completeness rules.
Verified baseline as of this pass: **147 tests pass** (128 across the
workspace packages, 19 more once `src/main`'s two Electron-side test files are
run against the built `dist/main` output — see the known issue below for why
`npm run test` currently reports fewer), and **five** guard scripts pass:
`check-no-network`, `check-no-payload-logging`, `check-public-hygiene`,
`check-reserved-terms`, `check-documented-commands`.

## Milestone 1 — Paste-frame extraction

- [x] `packages/paste-frame`: detect and strip raw ESC/C1 control bytes from a
      candidate payload before it is ever wrapped or delivered
- [x] Fixed-length ceiling enforced on any candidate payload
- [x] Self-tests proving a break-out attempt (a payload containing the
      paste-end sequence, or a bare ESC) is rejected, not delivered
- [x] Self-tests proving ordinary short phrases pass through unchanged

## Milestone 2 — Core validator + detector

- [x] `packages/core`: payload-profile schema (versioned, bounded, tier1/tier2
      string fields only)
- [x] Neutral English default profile shipped in-repo
- [x] Local profile loader: reads `~/.agent-whip/profile.json` if present,
      validates it against the schema, falls back to defaults on any
      validation failure (never partially applies a bad profile)
- [x] Single-crack vs. double-crack (two cracks within ~2s) detector
- [x] Append-only local crack log (metadata only — timestamp, tier, route,
      outcome; never payload text)
- [x] `check-no-network` and `check-no-payload-logging` guards passing against
      real (non-fixture) core source

## Milestone 3 — CLI

- [x] `agent-whip crack` (and `agent-whip crack --tier 2` for the
      speed-plus-cleanup tier) as a real command — verified by running it
      directly: `agent-whip crack --dry-run` and `agent-whip crack --tier 2
      --dry-run` both parse and refuse cleanly (`not-registered`) with no
      phrase text printed
- [x] `agent-whip profile` subcommands: show resolved profile source (default
      vs. local) and its schema version, and `agent-whip profile reload` —
      verified `agent-whip profile` and `agent-whip profile --json` print only
      a source, a path, and SHA-256 digests of the two tier phrases, never the
      phrase text itself
- [ ] `agent-whip log` to review the local crack log — **not implemented**.
      `agent-whip --help` lists `crack`, `sessions`, `register`, `unregister`,
      and `profile`/`profile reload` only; there is no `log` subcommand yet,
      even though the append-only log itself exists (Milestone 2). Verified by
      running `agent-whip log`, which returns `error: unknown command: log`.

## Milestone 4 — Pty injection

- [ ] Deliver a validated, wrapped payload into a target pty
- [ ] Verified against at least one real shell and one real TUI without
      producing stray keystrokes or a broken prompt

Known debt: `agent-whip crack` without `--dry-run` currently refuses with
`no-route` once a session is registered, because no real pty transport is
wired yet — only the no-op/simulation route exists. This milestone is what
closes that gap.

## Milestone 5 — Codex hook channel

- [ ] A delivery route that writes into Slop Machine's own hook/session
      channel where one exists, instead of only simulating a paste
- [ ] Documented fallback to pty injection where the hook channel isn't
      available

## Milestone 6 — Standalone dispatcher GUI

- [x] A minimal cross-platform GUI: pick a target session, crack it, see the
      log — the Electron app under `src/` builds and launches (`npm run
      build` then `npx electron .`), with a tray/popover/settings surface
      wired through `src/main/{tray,windows,ipc,session-service,
      profile-service,delivery-shim}.ts`
- [x] Window-targeting contract enforced (class + non-empty title + non-zero
      size; refuse on ambiguity) — see `docs/features/delivery-routes.md`

Known debt: the GUI's delivery shim currently wires only the no-op route (see
Milestone 4/5 above) — cracking a session from the GUI logs and displays the
attempt but does not yet deliver into a real pty or hook channel.

## Milestone 7 — Skill packages

- [x] Packaged skill/plugin form for at least one agent runtime, so "install
      agent-whip" doesn't require hand-wiring a hook — `packages/skill-claude`
      and `packages/skill-agents` both ship a `SKILL.md`, and each has its own
      `test-contract.mjs`

## Milestone 8 — Docs and release

- [ ] `docs/` complete and cross-linked (this milestone's own bar: every
      feature article has real "Suggested articles" links, not stubs)
- [ ] `release.yml` publishing a real, uniquely tagged, non-draft, unsigned
      release with working timing metadata — **no release has ever been
      published from this repository.** A local unsigned Squirrel.Windows
      installer (`Setup.exe` + `RELEASES` + full `.nupkg`) now builds
      successfully via `build-installer.bat`, verified in this pass — see
      `HANDOFF.md` for the exact artifact, size, and SHA-256 — but that is a
      local build proof, not a published release.
- [ ] `README.md` capture section populated with real screenshots of a crack
      landing in a real terminal

## v1.1 — nodeterm canvas control and docs site

- [ ] Control surface for cracking a session from within a nodeterm canvas
- [ ] Published documentation site (GitHub Pages) mirroring `docs/`, with the
      full site feature contract (tabs, search, appearance, etc.) applied
- [ ] Repoint `packages/paste-frame` at the upstream project it was extracted
      from once that package is published, instead of carrying a second copy
      in this repository

## Packaging (this pass)

- [x] Squirrel.Windows packaging via `electron-builder` +
      `electron-builder-squirrel-windows`, code signing explicitly and
      permanently disabled (`forceCodeSigning`/`signExecutable`/
      `signAndEditExecutable: false`), verified unsigned
      (`Get-AuthenticodeSignature` reports `NotSigned`) — see `HANDOFF.md`
- [x] Genuine multi-resolution `.ico` (16 through 256px, PNG-compressed
      entries, not a renamed PNG) plus a 256x256 standalone `icon.png`,
      generated from scratch with no third-party image library
- [x] `download-dependencies.bat` — pins versions via the committed
      `package-lock.json` (whose integrity hashes verify every npm package),
      idempotent, silent-capable, verifies the Electron binary landed
- [x] `build.bat` — touchless fresh-checkout build, pre-elevates on
      interactive runs only, silent mode, prompts to launch only as its last
      step; verified end to end with `build.bat /s`
- [x] `build-installer.bat` — same contract, produces and verifies the real
      Squirrel installer; verified end to end with `build-installer.bat /s`
      producing `agent-whip-Setup-0.1.0.exe`


## Status refresh — everything below was closed after the first release

The unticked items above about a missing transport, a missing docs site, a red
release workflow and the duplicated sanitizer are **superseded**. They are left
in place rather than rewritten so the order of what was known when stays readable.

- [x] **Real delivery transport.** `crack` no longer refuses with `no-route`.
      Nonce-verified filesystem mailbox IPC; the named-pipe route was abandoned
      because `node:net` contradicts the package's own privacy contract.
      Proven against a genuinely separate OS process through the built CLI.
- [x] **Documentation site live** at <https://ding-ding-projects.github.io/agent-whip/>,
      with the repository homepage field now pointing at it. 144 structural checks.
- [x] **All three workflows green.** Release publishes the real Squirrel installer
      (verified by downloading it and checking the PE header and SHA-256), not raw
      `dist/` output as it briefly did.
- [x] **GUI suites run without compiling first** — `allowImportingTsExtensions` plus
      `rewriteRelativeImportExtensions`.
- [x] **Sanitizer duplication made loud.** Both repositories carry a parity guard.
      This is a mitigation, not the fix; the fix is publishing the package.

### Still genuinely open

- [ ] Publish `@agent-whip/paste-frame` so the duplication can end rather than
      merely be guarded. Needs registry rights that do not exist yet.
- [ ] Detect bracketed-paste mode. The CLI and GUI both pass `bracketedPaste: false`,
      which is a safe default (the two-write path is correct against any target)
      rather than a guess, but it is not detection.
- [ ] Headless-browser assertions for the site. The 320px reflow and the palette's
      focus behaviour are currently checked structurally, not in a real DOM.
- [ ] Decide whether a release on **every push** is wanted. It currently mints a new
      "Latest" for workflow-only commits; three appeared within half an hour.
- [ ] Two steps have no API and remain manual: uploading `social-preview.png`
      (Settings → General → Social preview) and pinning the changelog Discussion
      (`pinDiscussion` is not a field on the GraphQL `Mutation` type).
