import { createHash, randomBytes } from 'node:crypto';

/** PKCE helpers for the OAuth 2.0 authorization-code-with-PKCE flow (RFC 7636). */

const VERIFIER_BYTES = 32;
const STATE_BYTES = 16;

const base64url = (buf: Buffer): string =>
  buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

/** RFC 7636 §4.1: 43–128 chars from the unreserved character set. */
export const generateCodeVerifier = (): string => base64url(randomBytes(VERIFIER_BYTES));

/** RFC 7636 §4.2: SHA-256 of the verifier, base64url-encoded. */
export const codeChallengeFromVerifier = (verifier: string): string =>
  base64url(createHash('sha256').update(verifier).digest());

/** Opaque CSRF token returned to Airtable and validated on the callback. */
export const generateState = (): string => base64url(randomBytes(STATE_BYTES));
