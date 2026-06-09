/**
 * Symmetric encryption/decryption helper for OAuth tokens.
 *
 * Gmail OAuth tokens must be stored encrypted at rest in the Users record
 * (Requirement 1.4). This helper uses AES-256-GCM, an authenticated cipher that
 * provides both confidentiality and integrity (tampered ciphertext fails to
 * decrypt rather than silently returning garbage).
 *
 * Serialised format (a single self-describing string, safe to store in
 * DynamoDB):
 *
 *   v1:<base64(iv)>:<base64(authTag)>:<base64(ciphertext)>
 *
 * The version prefix allows the scheme to evolve without ambiguity.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
  timingSafeEqual,
} from 'node:crypto';
import { ValidationError } from '../errors/index.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit nonce, recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit authentication tag
const KEY_LENGTH = 32; // 256-bit key
const VERSION = 'v1';

/**
 * Derive a fixed-length 256-bit key from the provided secret.
 *
 * Accepts either raw 32-byte key material (Buffer/base64 of exactly 32 bytes)
 * or an arbitrary-length passphrase, which is hashed with SHA-256 to a 32-byte
 * key. Using SHA-256 keeps key derivation deterministic and dependency-free;
 * callers holding raw 32-byte material get it used verbatim.
 */
function deriveKey(secret: string | Buffer): Buffer {
  const raw = typeof secret === 'string' ? Buffer.from(secret, 'utf8') : secret;
  if (raw.length === KEY_LENGTH) {
    return raw;
  }
  if (raw.length === 0) {
    throw new ValidationError('Encryption secret must not be empty');
  }
  return createHash('sha256').update(raw).digest();
}

/**
 * Encrypt a UTF-8 plaintext (e.g. an OAuth token) with the given secret.
 * Returns a self-describing string safe to persist.
 */
export function encrypt(plaintext: string, secret: string | Buffer): string {
  const key = deriveKey(secret);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

/**
 * Decrypt a string produced by {@link encrypt} using the same secret.
 *
 * Throws {@link ValidationError} when the input is malformed, uses an
 * unsupported version, or fails authentication (wrong key or tampered data).
 */
export function decrypt(serialised: string, secret: string | Buffer): string {
  const parts = serialised.split(':');
  if (parts.length !== 4) {
    throw new ValidationError('Malformed ciphertext: expected 4 segments');
  }
  const [version, ivB64, authTagB64, ciphertextB64] = parts as [
    string,
    string,
    string,
    string,
  ];
  if (version !== VERSION) {
    throw new ValidationError(`Unsupported ciphertext version: ${version}`);
  }

  const key = deriveKey(secret);
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');

  if (iv.length !== IV_LENGTH) {
    throw new ValidationError('Malformed ciphertext: invalid IV length');
  }
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new ValidationError('Malformed ciphertext: invalid auth tag length');
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  } catch {
    // Wrong key or tampered ciphertext — surface a uniform validation error.
    throw new ValidationError('Failed to decrypt: authentication failed');
  }
}

/**
 * Constant-time comparison of two strings, useful for comparing secrets or
 * tokens without leaking timing information.
 */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
