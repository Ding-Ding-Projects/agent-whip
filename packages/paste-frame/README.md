# @agent-whip/paste-frame

Bracketed-paste framing for injecting text into a live TUI without the payload becoming
structure. See `src/index.ts` for the full security rationale behind `sanitizePasteText`.

## This package is vendored (duplicated), not depended on, by `material-nodeterm`

`material-nodeterm` is a **public repository**; this package is **not published to any
registry**. That combination means `material-nodeterm` cannot take a normal dependency on it: a
`file:`-protocol or path dependency pointing at this sibling checkout resolves fine on the
machine that authors it and **dangles for anyone who clones `material-nodeterm` on its own** — a
green `npm install` followed by a runtime `ERR_MODULE_NOT_FOUND`.

So `material-nodeterm/src/core/paste-injection.ts` is a deliberate, vendored copy of this
package's `src/index.ts`. **This is a mitigation, not the fix.**

## The drift guard

`scripts/check-paste-frame-parity.mjs`, wired into `npm run check` (as `check:paste-frame-parity`)
in this repository, compares this file's normative content against `material-nodeterm`'s copy
whenever that sibling repository is checked out beside this one. It fails loudly on disagreement
and skips cleanly — printing why — when the sibling is absent, so this package's own checks still
pass on a machine without `material-nodeterm` present. `material-nodeterm` carries the mirror
image of this same guard, wired into its `npm run typecheck`.

## The real fix

Publish this package to a registry once rights exist. `material-nodeterm` then depends on the
published package directly, and its vendored copy plus both guard scripts are deleted.
