// @agent-whip/delivery does not yet publish an index.ts (only registry.ts, process-facts.ts, and
// types.ts exist at the time this package was written), so a bare `from '@agent-whip/delivery'`
// import would fail: its package.json "main" points at "dist/index.js", which does not exist yet.
// Its package.json declares no "exports" map, so a deep subpath import of the compiled registry
// module is permitted and stable until an index lands.
//
// TODO(delivery-integration): once @agent-whip/delivery publishes an index.ts re-exporting these
// names, replace this deep import with `from '@agent-whip/delivery'`.
export {
  listSessions,
  registerSession,
  unregisterSession,
  resolveTarget,
  resolveUniqueLiveSession,
  type SessionRecord,
  type ResolveFailure,
  type ResolveResult,
  type RegistryOptions,
} from '@agent-whip/delivery/dist/registry.js';
