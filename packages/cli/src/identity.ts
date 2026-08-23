import { createHash } from 'node:crypto';

/**
 * A short, non-reversible identity for a payload string, for use anywhere a command must prove
 * "this is the same text" (or "this changed") WITHOUT ever printing the text itself. Never treat
 * this as a secret-safe digest for anything beyond that comparison purpose — it is a display aid,
 * not a cryptographic commitment.
 */
export function payloadIdentity(text: string): string {
  const digest = createHash('sha256').update(text, 'utf8').digest('hex');
  return `sha256:${digest.slice(0, 12)}`;
}

/** Human-facing "identity (length)" string, e.g. "sha256:ab12cd34ef56 (37 chars)". */
export function describePayload(text: string): string {
  return `${payloadIdentity(text)} (${text.length} chars)`;
}
