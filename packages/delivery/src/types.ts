// @agent-whip/core is being written in parallel and does not yet export anything (its src/
// directory is empty at the time this package was written). Rather than add a project reference
// that would fail `tsc -b` on an empty composite project, or import names that do not exist yet,
// this package declares the minimal local shape it needs and leaves this TODO:
//
// TODO(core-integration): once @agent-whip/core exports `Tier`, `ProfileState`, and
// `resolvePayload`, replace the local `Tier` alias below with an import from `@agent-whip/core`,
// add `{ "path": "../core" }` to this package's tsconfig `references`, and add
// `"@agent-whip/core"` to this package's `dependencies`.
export type Tier = 1 | 2;
