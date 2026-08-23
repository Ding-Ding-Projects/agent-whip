// @agent-whip/delivery's package.json points "main" at dist/index.js, which does not exist yet
// (only routes.js has been compiled so far -- see packages/delivery/dist/). Importing the package
// by name would fail module resolution at both typecheck and runtime today.
//
// TODO(delivery-integration): once `npm run build --workspace @agent-whip/delivery` has produced
// dist/index.js, delete this file, add "@agent-whip/delivery" to this app's package.json
// dependencies (it is already present under node_modules/@agent-whip/delivery via the workspace
// symlink), and replace every import of this shim in src/main/session-service.ts with
// `from '@agent-whip/delivery'`. The shapes below are copied from packages/delivery/src/registry.ts
// and routes.ts and must be kept in sync with that source until the swap happens.
export interface SessionRecord {
  sessionId: string;
  pid: number;
  ppid: number;
  createdAt: string;
  runtime: 'claude' | 'codex' | 'unknown';
  cwd: string;
  nonce: string;
}

export type ResolveFailure =
  | 'not-registered'
  | 'stale-registration'
  | 'ambiguous'
  | 'process-gone'
  | 'lineage-mismatch'
  | 'io-error';

export type ResolveResult = { ok: true; record: SessionRecord } | { ok: false; reason: ResolveFailure };

export type DeliveryResult = { ok: true; route: string } | { ok: false; route: string | null; reason: string };

/**
 * Attempts a real dynamic import of the built package. Returns null when the package has not been
 * built yet (or fails to load for any other reason), so callers can degrade to an honest "delivery
 * package not built yet" state instead of crashing the whole app.
 */
export async function tryLoadDelivery(): Promise<null | {
  listSessions(): SessionRecord[];
  resolveTarget(id: string): ResolveResult;
}> {
  try {
    // Import by name, not by relative path into packages/, so this automatically starts using the
    // real package the moment its dist/ exists -- no code change required beyond deleting this file.
    const mod = (await import('@agent-whip/delivery')) as unknown as {
      listSessions(): SessionRecord[];
      resolveTarget(id: string): ResolveResult;
    };
    return mod;
  } catch {
    return null;
  }
}
