# `agent-whip` CLI usage

The skill never implements whip logic itself; it always shells out to this CLI. This page is the
subcommand and exit-code reference.

## Subcommands

| Command | Flags | Purpose |
| --- | --- | --- |
| `agent-whip register` | `--runtime <claude\|codex>` (required), `--session <id>` (optional) | Registers the current session as a valid crack target. Must be run from inside the session being registered — registration is the positive proof-of-identity step; see `safety.md`. |
| `agent-whip unregister` | `--session <id>` (required) | Removes a session's registration. Best-effort; never throws if the record is already gone. |
| `agent-whip sessions` | `--json` (optional) | Lists currently registered sessions. Use `--json` when parsing output programmatically. |
| `agent-whip crack` | `--session <id>`, `--tier <1\|2>`, `--dry-run`, `--json` | Delivers a tier-1 or tier-2 crack to the named session. `--dry-run` resolves the target and reports what would happen without sending anything. There is intentionally no flag to pass literal payload text. |
| `agent-whip profile` | `[reload]`, `--path <file>`, `--json` | Inspects the active local profile (source: file or default; and if fallen back to default, why) or reloads it from disk. Never prints the phrase text itself in a way meant for redistribution — treat any shown value as local operator data, not something to relay elsewhere. |
| `agent-whip --help` / `-h` | | Help text. |
| `agent-whip --version` / `-v` | | Version. |

## Flag syntax

Flags accept either `--flag value` or `--flag=value`. A flag expecting a value that is missing, or
that looks like another flag (starts with `--`), is a parse error.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success — the command completed and, for `crack`, the crack was delivered (or, under `--dry-run`, would have been). |
| `1` | Refusal with a reason — the command understood the request and declined it for a concrete, stated cause (for example: session not registered, ambiguous match, process gone, lineage mismatch, no delivery route succeeded). Always relay the exact reason string to the user; never soften it into "something went wrong." |
| `2` | Usage error — bad or missing arguments (unknown command, unknown option, missing required flag, invalid `--tier` value). Fix the invocation rather than retrying the same command. |

## Practical notes for driving this from an agent

- Prefer `--json` when you intend to parse the result programmatically rather than just show it to
  the user.
- `crack` re-resolves its target at fire time, not at selection time — a session that exited
  between listing and cracking will refuse with a concrete reason (`process-gone` or similar)
  rather than silently doing nothing or hitting the wrong process.
- `register` should be run by the user or from inside the session itself, not guessed at by
  picking a PID from a process list — the whole safety model in `safety.md` depends on
  registration being a deliberate act taken from inside the target session.
