import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encrypt, decrypt, assertKeyValid } from '@/crypto/aes-gcm.js';

const KEY = 'a'.repeat(64);

test('encrypt/decrypt round-trips', () => {
  const blob = encrypt('hello world', KEY);
  assert.equal(decrypt(blob, KEY), 'hello world');
});

test('tampered ciphertext fails decryption', () => {
  const blob = encrypt('hello', KEY);
  const tampered = { ...blob, ciphertext: Buffer.from('zzzz').toString('base64') };
  assert.throws(() => decrypt(tampered, KEY));
});

test('assertKeyValid accepts a 32-byte hex key', () => {
  assert.doesNotThrow(() => assertKeyValid(KEY, 'TEST_KEY'));
});

test('assertKeyValid rejects empty key', () => {
  assert.throws(() => assertKeyValid('', 'TEST_KEY'), /missing|empty/i);
});

test('assertKeyValid rejects too-short non-hex key', () => {
  assert.throws(() => assertKeyValid('shortkey', 'TEST_KEY'), /at least 32/);
});
