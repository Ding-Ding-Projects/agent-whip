export type { Tier } from './types.js';

export type {
  SessionRecord,
  ResolveResult,
  ResolveFailure,
  RegistryOptions,
} from './registry.js';
export {
  registerSession,
  unregisterSession,
  listSessions,
  resolveTarget,
  resolveUniqueLiveSession,
} from './registry.js';

export type { ProcessFacts } from './process-facts.js';
export { realProcessFacts } from './process-facts.js';

export type { FireRefusal, CooldownOptions } from './guards.js';
export { Cooldown } from './guards.js';

export type {
  SessionTarget,
  DeliveryResult,
  DeliveryRoute,
  DeliverOptions,
  PtyWriter,
} from './routes.js';
export { deliverWithFallback, ptyWriteRoute, noopRoute } from './routes.js';

export type { CrackAttempt, AuditLine, AuditLogOptions } from './audit.js';
export { recordCrackAttempt, payloadIdentity, auditLogPath } from './audit.js';
