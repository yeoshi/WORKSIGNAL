import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { encrypt, decrypt, safeEqual } from './crypto.js';
import { ValidationError } from '../errors/index.js';

const SECRET = 'unit-test-secret-passphrase';

describe('crypto: OAuth token encryption', () => {
  it('round-trips a token (encrypt then decrypt yields the original)', () => {
    const token = 'ya29.a0AfH6SMexample-refresh-token';
    const ct = encrypt(token, SECRET);
    expect(ct).not.toContain(token);
    expect(decrypt(ct, SECRET)).toBe(token);
  });

  it('produces a versioned, 4-segment serialised format', () => {
    const ct = encrypt('hello', SECRET);
    const parts = ct.split(':');
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe('v1');
  });

  it('uses a fresh IV so ciphertexts differ for identical plaintext', () => {
    const a = encrypt('same', SECRET);
    const b = encrypt('same', SECRET);
    expect(a).not.toBe(b);
    expect(decrypt(a, SECRET)).toBe('same');
    expect(decrypt(b, SECRET)).toBe('same');
  });

  it('accepts an exact 32-byte key buffer verbatim', () => {
    const key = Buffer.alloc(32, 7);
    const ct = encrypt('keyed', key);
    expect(decrypt(ct, key)).toBe('keyed');
  });

  it('fails decryption with the wrong secret', () => {
    const ct = encrypt('secret-data', SECRET);
    expect(() => decrypt(ct, 'wrong-secret')).toThrow(ValidationError);
  });

  it('fails decryption when the ciphertext is tampered with', () => {
    const ct = encrypt('secret-data', SECRET);
    const parts = ct.split(':');
    // Flip a byte in the ciphertext segment.
    const tampered = Buffer.from(parts[3]!, 'base64');
    tampered[0] = tampered[0]! ^ 0xff;
    parts[3] = tampered.toString('base64');
    expect(() => decrypt(parts.join(':'), SECRET)).toThrow(ValidationError);
  });

  it('rejects malformed input', () => {
    expect(() => decrypt('not-valid', SECRET)).toThrow(ValidationError);
    expect(() => decrypt('v2:a:b:c', SECRET)).toThrow(/Unsupported/);
  });

  it('rejects an empty secret', () => {
    expect(() => encrypt('x', '')).toThrow(ValidationError);
  });

  // Property: for any plaintext and any non-empty secret, decrypt(encrypt(x)) === x.
  it('round-trips arbitrary plaintexts and secrets', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string({ minLength: 1 }),
        (plaintext, secret) => {
          return decrypt(encrypt(plaintext, secret), secret) === plaintext;
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('crypto: safeEqual', () => {
  it('returns true for equal strings and false otherwise', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});
