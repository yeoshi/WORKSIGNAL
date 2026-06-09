/**
 * Unit tests for the Auth_Service branches (Task 11.2, Requirements 1.4–1.6).
 *
 * These tests exercise the four behavioural branches of {@link AuthServiceImpl}
 * using an injected in-memory fake DynamoDB document client and a fixed
 * encryption secret, so no real AWS or network access is required:
 *
 *   1. Gmail scope GRANTED  → a Users record is created with an encrypted
 *      `gmail_oauth_token` and `inbox_monitoring_available = true`; decrypting
 *      the stored token recovers the original token (round-trip)   (Req 1.4).
 *   2. Gmail scope DECLINED → `inbox_monitoring_available = false` and no token
 *      is stored                                                    (Req 1.5).
 *   3. OAuth FAILURE        → an `AuthError` is thrown and NO Users record is
 *      created (via both `onOAuthFailure` and a missing sub/email)  (Req 1.6).
 *   4. EXISTING user retrieved by `sub` preserves the original `created_at`.
 */

import { describe, it, expect } from 'vitest';
import {
  DynamoDBWrapper,
  decrypt,
  type DocumentClientLike,
  type GoogleProfile,
  type OAuthTokens,
} from '@worksignal/shared';
import { AuthServiceImpl, USERS_TABLE, type AuthUserRecord } from './authService.js';
import { AuthError, isAuthError } from './errors.js';

/** A fixed 32-byte-ish secret so encryption is deterministic across a run. */
const ENCRYPTION_SECRET = 'test-encryption-secret-0123456789';

/**
 * Minimal in-memory DynamoDB document client.
 *
 * It only implements the two operations the Auth_Service uses (`GetCommand`
 * and `PutCommand`), keyed by `TableName#user_id`. It records how many writes
 * occurred so a test can assert that NO record was created on OAuth failure.
 */
function createInMemoryClient(): {
  client: DocumentClientLike;
  store: Map<string, AuthUserRecord>;
  putCount: () => number;
} {
  const store = new Map<string, AuthUserRecord>();
  let writes = 0;

  const keyOf = (table: string, userId: unknown): string =>
    `${table}#${String(userId)}`;

  const client: DocumentClientLike = {
    async send(command: unknown): Promise<unknown> {
      const input = (command as { input: Record<string, unknown> }).input;
      const tableName = input.TableName as string;

      // PutCommand carries an `Item`; GetCommand carries a `Key`.
      if ('Item' in input) {
        const item = input.Item as AuthUserRecord;
        store.set(keyOf(tableName, item.user_id), item);
        writes += 1;
        return {};
      }
      if ('Key' in input) {
        const key = input.Key as { user_id: unknown };
        return { Item: store.get(keyOf(tableName, key.user_id)) };
      }
      throw new Error('Unsupported command in fake DynamoDB client');
    },
  };

  return { client, store, putCount: () => writes };
}

/** Build an Auth_Service backed by the in-memory fake, plus the raw store. */
function buildService(now?: () => Date) {
  const fake = createInMemoryClient();
  const db = new DynamoDBWrapper({ client: fake.client });
  const service = new AuthServiceImpl({
    db,
    encryptionSecret: ENCRYPTION_SECRET,
    now,
  });
  return { service, ...fake };
}

const profile = (overrides: Partial<GoogleProfile> = {}): GoogleProfile => ({
  sub: 'google-sub-123',
  email: 'jobseeker@example.com',
  name: 'Job Seeker',
  ...overrides,
});

const tokens = (overrides: Partial<OAuthTokens> = {}): OAuthTokens => ({
  accessToken: 'access-token-abc',
  refreshToken: 'refresh-token-xyz',
  gmailScopeGranted: true,
  ...overrides,
});

describe('AuthServiceImpl.onCallback — Gmail scope granted (Req 1.4)', () => {
  it('creates a record with inbox monitoring available and an encrypted token', async () => {
    const { service, store, putCount } = buildService();

    const session = await service.onCallback(profile(), tokens());

    expect(session).toMatchObject({
      userId: 'google-sub-123',
      email: 'jobseeker@example.com',
      name: 'Job Seeker',
      inboxMonitoringAvailable: true,
    });

    expect(putCount()).toBe(1);
    const record = store.get(`${USERS_TABLE}#google-sub-123`);
    expect(record).toBeDefined();
    expect(record?.inbox_monitoring_available).toBe(true);

    // The stored token must be encrypted (not the plaintext value).
    expect(record?.gmail_oauth_token).toBeDefined();
    expect(record?.gmail_oauth_token).not.toBe('refresh-token-xyz');
  });

  it('round-trips the token: decrypting the stored value recovers it (Req 1.4)', async () => {
    const { service, store } = buildService();

    await service.onCallback(profile(), tokens({ refreshToken: 'rt-roundtrip' }));

    const record = store.get(`${USERS_TABLE}#google-sub-123`);
    const stored = record?.gmail_oauth_token as string;
    expect(decrypt(stored, ENCRYPTION_SECRET)).toBe('rt-roundtrip');
  });

  it('falls back to the access token when no refresh token is present', async () => {
    const { service, store } = buildService();

    await service.onCallback(
      profile(),
      tokens({ refreshToken: undefined, accessToken: 'at-only' }),
    );

    const record = store.get(`${USERS_TABLE}#google-sub-123`);
    expect(decrypt(record?.gmail_oauth_token as string, ENCRYPTION_SECRET)).toBe(
      'at-only',
    );
  });
});

describe('AuthServiceImpl.onCallback — Gmail scope declined (Req 1.5)', () => {
  it('completes sign-in with inbox monitoring unavailable and no token stored', async () => {
    const { service, store, putCount } = buildService();

    const session = await service.onCallback(
      profile(),
      tokens({ gmailScopeGranted: false }),
    );

    expect(session.inboxMonitoringAvailable).toBe(false);
    expect(putCount()).toBe(1); // sign-in still completes and persists the user

    const record = store.get(`${USERS_TABLE}#google-sub-123`);
    expect(record?.inbox_monitoring_available).toBe(false);
    expect(record?.gmail_oauth_token).toBeUndefined();
  });
});

describe('AuthServiceImpl — OAuth failure creates no record (Req 1.6)', () => {
  it('onOAuthFailure throws an AuthError and writes nothing', () => {
    const { service, putCount } = buildService();

    expect(() => service.onOAuthFailure('user_denied')).toThrowError(AuthError);
    expect(putCount()).toBe(0);
  });

  it('onOAuthFailure carries the oauth_failed reason', () => {
    const { service } = buildService();
    try {
      service.onOAuthFailure('invalid_grant');
      expect.unreachable('onOAuthFailure should throw');
    } catch (err) {
      expect(isAuthError(err)).toBe(true);
      expect((err as AuthError).reason).toBe('oauth_failed');
    }
  });

  it('a callback missing the subject identifier throws before any write', async () => {
    const { service, putCount } = buildService();

    await expect(
      service.onCallback(profile({ sub: '   ' }), tokens()),
    ).rejects.toMatchObject({ reason: 'missing_subject' });
    expect(putCount()).toBe(0);
  });

  it('a callback missing the email throws before any write', async () => {
    const { service, putCount } = buildService();

    await expect(
      service.onCallback(profile({ email: '' }), tokens()),
    ).rejects.toMatchObject({ reason: 'missing_email' });
    expect(putCount()).toBe(0);
  });
});

describe('AuthServiceImpl.onCallback — existing user (Req 1.2)', () => {
  it('preserves the original created_at when retrieving by sub', async () => {
    const firstAt = new Date('2024-01-01T00:00:00.000Z');
    const secondAt = new Date('2024-06-15T12:30:00.000Z');
    let current = firstAt;
    const { service, store } = buildService(() => current);

    await service.onCallback(profile(), tokens());
    const firstCreatedAt = store.get(`${USERS_TABLE}#google-sub-123`)?.created_at;

    // Second sign-in at a later time should not move created_at.
    current = secondAt;
    await service.onCallback(profile(), tokens());
    const record = store.get(`${USERS_TABLE}#google-sub-123`);

    expect(record?.created_at).toBe(firstCreatedAt);
    expect(record?.created_at).toBe(firstAt.toISOString());
    expect(record?.updated_at).toBe(secondAt.toISOString());
  });
});
