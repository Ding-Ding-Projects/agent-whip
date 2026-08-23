# Handoff

## 2026-08-22 — paste-frame vendored into material-nodeterm + drift guard

`packages/paste-frame` is duplicated (not depended on) by `material-nodeterm/src/core/paste-injection.ts`, because material-nodeterm is public and this package is unpublished — a `file:` dependency across that boundary installs green and dangles at runtime for anyone cloning material-nodeterm alone. `scripts/check-paste-frame-parity.mjs` is now the sixth guard in `npm run check` (`check:paste-frame-parity`); it fails when the two implementations drift and skips cleanly when the sibling repo is absent. Details in `packages/paste-frame/README.md`. This is a mitigation, not the fix — publish the package once registry rights exist and delete both the vendored copy and both guard scripts.

## Current state (2026-08-22)

Six implementation lanes have landed against this scaffold, plus this
packaging lane (the last one). Nothing has been merged/rewritten out from
under another lane's ownership; this document reports what was verified,
not what was asserted.

## Verified test and guard counts

- **Type-checking**: `npx tsc -b packages/paste-frame packages/core
  packages/delivery packages/cli` exits 0.
- **Workspace package tests**: `node --test packages/*/dist/**/*.test.js` —
  **152 tests, 152 pass, 0 fail** — 128 in `packages/*`, 7 GUI main, 5 GUI renderer,
  9 skills, 3 skills-installer.
- **`src/main` tests**: `node --test --experimental-strip-types
  src/main/*.test.ts` currently **fails to run** (`redact.test.ts` and
  `settings-store.test.ts`, 2 test files / a further several `test()` blocks
  each — not run to completion, so no pass count from these two files can be
  claimed). The cause is a module-resolution mismatch: these test files
  import their subject with a `.js` extension (`from './redact.js'`) as
  written source next to `.ts` siblings, and without `"type": "module"` in
  the root `package.json`, Node's ESM resolver (even under
  `--experimental-strip-types`) does not remap that `.js` specifier onto the
  sibling `.ts` file, so it throws `ERR_MODULE_NOT_FOUND`. This reproduces
  identically before and after a full `npm run build` — it is not a stale-
  build problem. It is **not fixed in this pass**: `src/main` is owned by the
  Electron/tray lane, not by packaging, and the fix (almost certainly adding
  `"type": "module"` to the root manifest, or having the test files import
  compiled `dist/main/*.js` instead of sibling source) touches shared root
  configuration and/or that lane's test files, so it is left as a named,
  reproducible defect rather than silently worked around here.
- **Guards**: `npm run check` — **five guards, all pass**:
  `check-no-network`, `check-no-payload-logging`, `check-public-hygiene`,
  `check-reserved-terms` (114 files scanned, 54 digests enforced),
  `check-documented-commands` (2 documented commands, all parse).

Re-derived after both earlier figures were wrong. "128" counted only `packages/*`;
"147" missed the renderer suite. The correct total is 152, and it is
the actual number of tests this pass could run to a real pass/fail verdict.
The `src/main` suite is real and not fake-empty (it visibly attempts to run
and throws), so its tests are neither passing nor failing yet — they are
unrunnable in their current form.

## What this pass (packaging) added

- **`electron-builder.yml`** — a Squirrel.Windows target via
  `electron-builder` + `electron-builder-squirrel-windows`. Code signing is
  explicitly and permanently disabled: `forceCodeSigning: false`,
  `signExecutable: false`, `signAndEditExecutable: false`. No `setupExe` or
  `noMsi` keys (they fail schema validation on this version); `squirrelWindows.msi:
  false` is used instead. A non-empty `author` field was added to the root
  `package.json` (Squirrel packaging requires one).
- **`scripts/generate-icon.mjs`** — extended (was 32x32-PNG-only) to also
  emit a genuine multi-resolution `assets/icon.ico` (16, 24, 32, 48, 64, 128,
  256px, each entry PNG-compressed — verified by reading the ICO directory
  back, not by trusting the write), and to emit `assets/icon.png` at 256x256
  instead of 32x32 (electron-builder's own PNG-icon floor; verified by
  reading the IHDR chunk back: `256x256`).
- **`download-dependencies.bat`** — fetches everything the build needs:
  Node/npm presence check, `npm ci` (falls back to `npm install`) against the
  committed `package-lock.json` (whose per-package `integrity` field is the
  pinned, verified digest for every npm dependency), then approves and runs
  Electron's own install step when `node_modules/electron/dist/electron.exe`
  is missing (npm's install-script gate can leave it un-run even after `npm
  ci` reports success — verified this actually happens on this machine: the
  binary was missing after a clean install and `node
  node_modules/electron/install.js` fixed it). Idempotent; `/s` /
  `--silent` / `SILENT=1` all suppress prompts and it exits non-zero on the
  first real failure.
- **`build.bat`** — pre-elevates on interactive runs only (never in silent
  mode, so CI never hangs on a UAC prompt), calls
  `download-dependencies.bat` itself, refreshes `PATH` from the registry
  after installing anything, runs `npm run build`, verifies
  `dist/main/index.js` exists, and only then — as its last step — asks
  whether to launch the app. **Verified**: `build.bat /s` on this machine
  exits 0 and produces a working `dist/`.
- **`build-installer.bat`** — same contract, then runs `npx electron-builder
  --win squirrel --config electron-builder.yml`, locates the produced
  `Setup*.exe` under `dist/installer/squirrel-windows/` (not the `dist/`
  root — electron-builder's own output layout), rejects it if implausibly
  small, and reports its exact size, SHA-256, and Authenticode signature
  status. **Verified**: `build-installer.bat /s` on this machine exits 0 and
  produced:
  - `dist/installer/squirrel-windows/agent-whip-Setup-0.1.0.exe`
    (147,575,808 bytes)
  - `dist/installer/squirrel-windows/RELEASES`
  - `dist/installer/squirrel-windows/agent-whip-0.1.0-full.nupkg`
    (146,879,782 bytes)
  - SHA-256 of the setup exe:
    `8C00FD3FC7C2A93D4CE1168163A4A92A3455700557FCCCBB6AE5953A1487307F`
  - `Get-AuthenticodeSignature` on the setup exe reports `NotSigned`, as
    required by the permanent no-signing policy.
  - This script does **not** publish, tag, or create a release — it only
    builds and verifies the local artifact. No release has ever been
    published from this repository; the above is a local build proof only.

## What was NOT done in this pass

- `src/main`'s two test files were not fixed (see above) — that's the
  Electron/tray lane's source, not packaging's.
- No `git commit` was made in this pass; per the assignment, this lane's own
  files are left for the orchestrator to review and commit.
- No release was published, no tag was created, and CI (`release.yml`) was
  not exercised — only the local `build-installer.bat` path was run and
  verified, on this one machine.
- Non-Windows (`build.sh` / `build-installer.sh` / `download-dependencies.sh`)
  equivalents were not added — this project's active delivery scope is
  Windows only per the shared instructions, and no other-OS packaging exists
  yet to mirror.
- `docs/`, the screenshot section of `README.md`, the nodeterm canvas control
  surface, and the documentation site (all v1.1 / Milestone 8 items) were not
  touched — out of this lane's ownership and out of scope for packaging.

## Next steps for whoever picks this up

1. Fix `src/main`'s two test files (or the root `package.json` module type)
   so `npm run test` actually runs and reports a real pass/fail count for
   them, then update this document's test-count section with the real
   number — don't guess it.
2. Wire `ci.yml` and `release.yml` to actually invoke
   `build.bat`/`build-installer.bat` (or the underlying `npm run build` +
   `npx electron-builder` commands they wrap) rather than duplicating the
   steps inline, so a change to the packaging contract can't silently drift
   from what CI runs.
3. The first real `release.yml` run will be the first proof any of this
   works end-to-end in CI rather than just on one developer machine — watch
   it, don't assume it from a green YAML lint.
4. `electron-builder.yml`'s `squirrelWindows.iconUrl` points at a
   `raw.githubusercontent.com` URL for a repo (`Ding-Ding-Projects/agent-whip`) that
   may not match this project's real GitHub org/name — confirm and correct
   the URL before the first real release.

## Release status (updated after packaging landed)

**v0.1.0 is published.** The two lines above stating that no release exists were
true when written and are now superseded; they are left in place rather than
rewritten so the sequence of what was known when stays readable.

- Tag `v0.1.0`, non-draft, target `main`.
- <https://github.com/Ding-Ding-Projects/agent-whip/releases/tag/v0.1.0>
- Assets: `agent-whip-Setup-0.1.0.exe` (147,575,808 bytes), `agent-whip-0.1.0-full.nupkg`,
  `RELEASES`, `SHA256SUMS.txt`, and the dim-sum photo `hk-dish-0001-classic-har-gow.png`.
- Code name: **Classic Har Gow · 蝦餃** (`hk-dish-0001`), resolved from the public catalog.
- Setup SHA-256 `8C00FD3FC7C2A93D4CE1168163A4A92A3455700557FCCCBB6AE5953A1487307F`,
  verified against the built file and published in `SHA256SUMS.txt`.
- Verified downloadable unauthenticated; the first 2 MB carries a valid `MZ` header.
- `Get-AuthenticodeSignature` → `NotSigned`, as policy requires.

**It was built and published by hand, not by CI.** `release.yml` exists and has never
run. Do not read the release's existence as evidence the workflow works.

**Discussion pinning is not available through the API.** `pinDiscussion` does not exist
on the GraphQL `Mutation` type, so the changelog Announcement (Discussion #2) is
unpinned. Pin it by hand if it matters.


## Status refresh (second update)

Supersedes the strip-types note and the earlier release/limitation lists above.

**Tests: 152 passing.** 128 `packages/*`, 12 GUI (main + renderer), 9 skills,
3 skills-installer. The GUI suites now run **both** compiled and directly under
`--experimental-strip-types`; the earlier note saying they only run compiled is
obsolete.

**Guards: six.** `check:no-network`, `check:no-payload-logging`,
`check:public-hygiene`, `check:reserved-terms`, `check:documented-commands`,
`check:paste-frame-parity`.

**`crack` works.** It delivers through nonce-verified filesystem mailbox IPC and
was proven against a separate OS process via the built CLI binary — tier 1 and
tier 2 both landed in the child's stdout. The `no-route` limitation recorded
earlier is closed.

**Site is live** at <https://ding-ding-projects.github.io/agent-whip/>; the
repository homepage points at it. Pages uses the **workflow** build type and
publishes `site/` directly — legacy Pages had been serving the repository root,
so the public landing page was the Electron placeholder while returning HTTP 200.

**All three workflows are green** and Release publishes the real installer.

**Sanitizer parity guard** is present in this repo and in the sibling terminal
project. It is a mitigation, not the fix.

**Two manual steps remain, and neither has an API**: the social-preview upload
and pinning the changelog Discussion.
