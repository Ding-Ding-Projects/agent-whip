# @agent-whip/delivery

Resolves a live agent session by positive process identity and delivers a trigger phrase into it
— without ever interrupting the running process.

agent-whip fires with **no confirmation prompt**. That is a deliberate speed choice, and it means
this package is the only thing standing between a correct delivery and typing a cleanup
authorization into someone else's shell. Everything below follows from taking that seriously.

## Why window title matching is not enough

The obvious way to find "the Claude Code window" is to enumerate top-level windows and match on
class, title, and size. That is **necessary but not sufficient**:

- A window's title is attacker- and accident-controlled text. Anything can rename a window, and a
  session that legitimately changed its own title (a shell prompt, a `cd`, a tab rename) breaks a
  title-based match with no warning.
- Real terminals spawn decoy windows constantly: IME composition windows, tooltips, hidden helper
  windows, zero-dimension helper windows that exist only to receive messages. A naive enumeration
  routinely finds several plausible-looking matches for one real session.
- Resolving "the match" by picking the first or the largest is a well-known trap: it is silently
  wrong exactly when it matters, and never announces that it guessed.

So this package requires **positive proof of identity** instead: a session is only ever a valid
target because it registered itself, once, from inside itself.

## The target registry

`registerSession` is called from inside a running session (Claude Code or Codex CLI) and writes a
marker file to `~/.agent-whip/sessions/<sessionId>.json` containing the session's own `pid`,
`ppid`, `runtime`, `cwd`, and a random `nonce`.

`resolveTarget(sessionId)` re-reads that record and only returns a usable target when:

1. The record exists at all (`not-registered` otherwise).
2. Its recorded `pid` is currently alive (`process-gone` otherwise — a session that has exited
   leaves a stale record on disk, and a stale record must never be treated as live).
3. Its current parent pid — queried fresh from the OS, not read from the record — matches the
   `ppid` recorded at registration time (`lineage-mismatch` otherwise). This is the check that
   catches **PID reuse**: the OS handed the same numeric pid to an unrelated process after the
   original session exited, and a pid-only check would happily "resolve" straight into it.

A current parent pid that cannot be determined (no `ps`/`wmic` available, permission denied, …) is
treated as *unknown*, not as a mismatch — refusing to fire in every environment that lacks a
process inspector would make the tool useless there. Refusal only fires on a **positive, known**
mismatch.

`resolveUniqueLiveSession()` does the same liveness/lineage filtering across every registered
session and refuses — `ambiguous` — the moment more than one is live. It never picks the first
match. Zero live sessions is `not-registered`.

**Callers must re-resolve at fire time**, not cache a handle from whenever the target was first
chosen. A session can exit and be replaced (PID reuse) on the same pane between those two moments;
`resolveTarget`'s tests exercise exactly this race.

## Firing guards

`Cooldown` enforces a minimum interval (default 1500 ms) between fires for the same session, so a
stuck key or a jittery double-click cannot machine-gun a target. A refused attempt (one still
inside the cooldown window) does not itself reset the window.

## The delivery ladder — the no-interrupt promise

`deliverWithFallback(target, payload, routes, opts)` tries each `DeliveryRoute` in order and uses
the first one whose `isAvailable` returns true.

**The single most important behavioural promise in this package**: a route with
`interrupts: true` is *skipped* unless the caller passes `allowInterrupting: true` explicitly. If
every non-interrupting route is unavailable, the result is `{ ok: false, reason: 'no-route' }` —
never a silent escalation to something that would disturb the target's foreground process. This
holds even when an interrupting route is the *only* available one; it still does not run.

Shipped routes:

- **`ptyWriteRoute(writer)`** — delivers by calling an injected writer function. When the target
  has requested bracketed-paste mode, the framed payload **and** the trailing Enter are sent in a
  single write (via `@agent-whip/paste-frame`'s `bracketedInjection`), because splitting them
  races the receiving TUI's paste heuristics — see that package's own documentation for why. When
  the target has not requested bracketed paste, the legacy two-write delivery (`legacyInjection`)
  is used instead.
- **`mailboxDeliveryRoute()`** — the real, shipped cross-process route (`src/transports/
  mailbox-route.ts`), built on `ptyWriteRoute`'s exact framing rules but reaching a target that
  lives in a *different OS process* than the caller, which is what `agent-whip crack` always is. A
  session that wants to be crackable calls `startSessionDeliveryServer(record, write)` once, from
  inside the process that owns its real input stream; that call watches a small per-session
  mailbox directory under `~/.agent-whip/sessions/<id>.mailbox/` and invokes `write` on any request
  that carries the *exact* nonce generated at registration time. The client (`agent-whip crack`,
  or this app's own main process) drops a request file and waits for a confirmed response file
  before ever reporting success; a missing mailbox, an ack timeout, a nonce mismatch, or an
  explicit writer failure all become `{ ok: false }` — never a silent "delivered". This is
  filesystem IPC rather than a socket or named pipe specifically because this package's privacy
  contract (below) forbids `node:net`.
- **`noopRoute`** — always available, writes nothing, always succeeds. For demos and dry runs.

No Ctrl-C route ships in this package. The extension point is documented directly in
`src/routes.ts`: an interrupting route must set `interrupts: true`, which means
`deliverWithFallback` will never select it by default — that is by design, not an oversight, and
`allowInterrupting` must never default to `true` anywhere in this package.

This package never imports the sanitizer's frame-building logic itself; it calls
`bracketedInjection` / `legacyInjection` from `@agent-whip/paste-frame` so there is exactly one
implementation of the escape-stripping and framing rules in the whole project.

## Audit log

Every crack attempt appends one JSONL line to `~/.agent-whip/cracks.log`: timestamp, tier, session
id, resolved pid, route name, outcome, and a **payload identity** — the first 12 hex characters of
the payload's SHA-256 — never the payload text itself. This is the real mitigation for firing with
no confirmation prompt: a wrongly-targeted crack is at minimum discoverable after the fact, without
the log becoming a second place a secret-laden payload could leak to. A failed audit write never
fails the crack it was trying to record.

## Privacy

No network access anywhere in this package (no `fetch`, no `node:http(s)`, no `node:net`, no
`node:dgram`). Payload text is never passed to `console.*` or written anywhere except as a hash
prefix in the audit log.

## Testing this package's own guarantees

Every guard in this package is exercised by a test that has been deliberately broken, watched red,
and then restored, per the project's own rule that "a guard nobody has watched fail proves
nothing." Notably: the ambiguous-match refusal (broken to always pick the first match), the
single-write invariant for bracketed paste (broken to split into two writes), and the interrupt
gate (broken by removing it) were each confirmed to fail loudly before being restored.
