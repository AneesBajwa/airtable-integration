import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

/** AES-256-GCM helpers for encrypting OAuth tokens and scraper cookies at rest. */

export interface EncryptedBlob {
  ciphertext: string;
  iv: string;
  authTag: string;
}

const ALGO = 'aes-256-gcm';
const KEY_BYTES = 32;
const HEX_KEY_RE = /^[0-9a-f]{64}$/i;

function deriveKey(material: string): Buffer {
  if (!material) {
    throw new Error('Encryption key is missing or empty');
  }
  if (HEX_KEY_RE.test(material)) {
    return Buffer.from(material, 'hex');
  }
  if (material.length < 32) {
    throw new Error('Encryption key must be at least 32 characters (or 64 hex chars / 32 bytes)');
  }
  return createHash('sha256').update(material).digest();
}

export function assertKeyValid(material: string, varName: string): void {
  try {
    const k = deriveKey(material);
    if (k.length !== KEY_BYTES) {
      throw new Error(`derived key has wrong length: ${k.length}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid ${varName}: ${msg}`);
  }
}

export function encrypt(plaintext: string, key: string): EncryptedBlob {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, deriveKey(key), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ciphertext: enc.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

export function decrypt(blob: EncryptedBlob, key: string): string {
  const iv = Buffer.from(blob.iv, 'base64');
  const decipher = createDecipheriv(ALGO, deriveKey(key), iv);
  decipher.setAuthTag(Buffer.from(blob.authTag, 'base64'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(blob.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}
