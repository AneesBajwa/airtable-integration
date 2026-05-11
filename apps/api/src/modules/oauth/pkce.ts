import { createHash, randomBytes } from 'node:crypto';

const VERIFIER_BYTES = 32;
const STATE_BYTES = 16;

const base64url = (buf: Buffer): string =>
  buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

// RFC 7636 §4.1: verifier must be 43–128 chars from the unreserved set.
export const generateCodeVerifier = (): string => base64url(randomBytes(VERIFIER_BYTES));

// RFC 7636 §4.2: challenge = base64url(SHA-256(verifier)).
export const codeChallengeFromVerifier = (verifier: string): string =>
  base64url(createHash('sha256').update(verifier).digest());

export const generateState = (): string => base64url(randomBytes(STATE_BYTES));
