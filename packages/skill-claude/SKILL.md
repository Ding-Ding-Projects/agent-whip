---
name: agent-whip
description: Crack a whip at a running AI coding agent session by shelling out to the `agent-whip` CLI, switching it into a faster operating mode without interrupting its in-flight turn. Use when the user asks to register the current session with agent-whip, list registered sessions, crack (tier 1 speed, or tier 2 speed plus cleanup authorization) a session, or inspect/reload its local profile. Do not use for stopping, cancelling, or interrupting an agent, and do not invent or guess the tier-1/tier-2 phrase text yourself — the CLI resolves that from a local profile the skill never reads or prints.
---

# Agent Whip

`agent-whip` is a CLI. This skill's whole job is to shell out to it correctly — never to
reimplement whip logic, guess at trigger phrases, or read the local profile file directly.

## What a "crack" is, and what it is not

- A single crack (tier 1) asks the target session to continue at full speed.
- A double crack within a short detection window (tier 2) asks it to continue at full speed
  **and** grants a cleanup/branch-management authorization on top.
- **A crack is never an interrupt.** It does not cancel, stop, or discard the target session's
  in-flight turn. If the user wants to stop or interrupt a session, that is a different action —
  do not reach for `agent-whip` to do it.

## Commands

Run these with the Bash tool, exactly as written. Full flag reference and exit codes are in
[`references/usage.md`](references/usage.md); the identity-resolution and audit-log guarantees
that make firing with no confirmation prompt safe are in [`references/safety.md`](references/safety.md).

1. **Register the current session** (once, from inside the session that should become a target):
   `agent-whip register --runtime <claude|codex> [--session <id>]`
2. **List registered sessions**: `agent-whip sessions [--json]`
3. **Crack a session**: `agent-whip crack --session <id> --tier <1|2> [--dry-run] [--json]`
4. **Unregister a session**: `agent-whip unregister --session <id>`
5. **Inspect or reload the local profile**: `agent-whip profile [reload] [--path <file>] [--json]`

## Rules for this skill specifically

- **Never pass payload text on the command line.** There is deliberately no `--payload` /
  `--message` flag on `crack`; the CLI resolves the tier-1/tier-2 text from the user's local,
  never-committed `~/.agent-whip/profile.json`. If asked what the phrases say, answer that the
  skill cannot see them — see `references/safety.md`.
- **Always resolve a session id first** with `agent-whip sessions --json` when the user has not
  given one explicitly; never guess a session id or assume "the most recent one" without asking.
- **Use `--dry-run` when the user is unsure**, or when the request is exploratory ("what would
  happen if..."). It exercises target resolution without delivering anything.
- **Report the exit code and stated reason verbatim** when a command refuses or errors — do not
  paraphrase a refusal into "it didn't work." See `references/usage.md` for what each code means.
- This is a public repository. Never describe the configured phrases as anything other than "the
  configured tier-1/tier-2 phrase"; do not invent alternate wording for them.
