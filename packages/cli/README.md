# @agent-whip/cli

Command-line entry point for agent-whip: crack a whip at a running agent session and it
switches into a faster operating mode. A single crack is tier 1 (speed). A second crack
landing within the detection window is tier 2 (speed + cleanup authorization). **This is
never an interrupt** — the target session's own agent decides what to do with the trigger
phrase it receives.

## Install

This package ships the `agent-whip` binary (`"bin"` in `package.json`). Build the monorepo
and run it via `node dist/bin.js`, or install the package so `agent-whip` is on `PATH`.

## Commands

| Command | What it does | Exit codes |
|---|---|---|
| `agent-whip crack [--session <id>] [--tier 1\|2] [--dry-run] [--json]` | Resolves the target session, resolves the tier (single vs. double crack), and delivers the profile's trigger phrase into it. | `0` delivered · `1` refused (no target, no route, etc.) · `2` bad usage |
| `agent-whip sessions [--json]` | Lists registered sessions: id, runtime, pid, cwd, and whether the session still resolves. | `0` |
| `agent-whip register --runtime <claude\|codex> [--session <id>]` | Registers the current process as a crackable session. | `0` |
| `agent-whip unregister --session <id>` | Removes a session registration. | `0` |
| `agent-whip profile [--path <p>] [--json]` | Reports which profile is active, its source, and a non-reversible identity for each tier's phrase — **never the phrase text itself**. | `0` |
| `agent-whip profile reload [--path <p>] [--json]` | Clears the cached profile and re-reports. | `0` |
| `agent-whip --help` / `-h` | Usage. | `0` |
| `agent-whip --version` / `-v` | Prints the version. | `0` |

Every read command accepts `--json`, which prints exactly one JSON value on stdout and
nothing else, so it is safe to pipe into `jq` or another script.

## There is no way to send arbitrary text

`agent-whip crack` never accepts a `--payload`, `--message`, or `--text` flag. The phrase it
delivers always comes from the local, validated, **never-committed** profile file at
`~/.agent-whip/profile.json` (or a path given to the `core` loader). Accepting free text on
the command line would defeat the entire point of the profile mechanism: keeping the real
trigger wording out of shell history, process listings, CI logs, and this public repository.

If you want to see what a crack *would* send without sending it, use `--dry-run`. Even in
`--dry-run` mode, the CLI prints only a short, non-reversible identity for the payload
(`sha256:<12 hex> (NN chars)`) — never the payload text.

## The profile file

`agent-whip profile` reports:

- **source** — `default` (the neutral placeholder phrases shipped in `@agent-whip/core`) or
  `file` (a local profile was loaded).
- **schema version** and, if the file was rejected, **why** it fell back to the default.
- **tier1** / **tier2** — an identity + length for each phrase, never the phrase itself.

The file itself is never printed, never logged, and never leaves your machine through this
CLI. See `@agent-whip/core`'s documentation for the exact JSON schema.

## Delivery routes

A real, non-dry-run `crack` delivers through `@agent-whip/delivery`'s filesystem-mailbox
transport (`mailboxDeliveryRoute`, see `src/delivery-shim.ts`): the target session runs a
tiny listener keyed by its own session id and registration nonce, and this CLI (a separate,
short-lived process) drops a request and waits for a confirmed response before ever
reporting success. A session that has not started that listener, or that does not confirm
the delivery within the ack window, is refused (`no-route` or `all-routes-failed`) — never
silently treated as delivered.

## Development

```sh
npm run build   # tsc -b
npm test        # node --test --experimental-strip-types src/*.test.ts
```

Tests cover argv parsing (including deliberately rejecting a payload-override flag), exit
codes for every command, `--json` output validity, and — as a standing security guard — that
no command path can ever print a profile's payload text, proven by running every command
against a profile whose tiers are set to a distinctive sentinel string and asserting the
sentinel appears in neither stdout nor stderr.
