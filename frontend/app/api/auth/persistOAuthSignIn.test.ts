import { describe, it, expect, vi, beforeEach } from 'vitest';
import { persistOAuthSignIn } from './persistOAuthSignIn';

const mockFetch = vi.fn();

describe('persistOAuthSignIn', () => {
  const db = {
    get: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
  });

  it('redirects brand-new users to onboarding', async () => {
    db.get.mockResolvedValue(undefined);

    const result = await persistOAuthSignIn({
      profile: {
        sub: 'google-sub-123',
        email: 'alex@example.com',
        name: 'Alex',
      },
      account: {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        scope: 'openid email profile https://www.googleapis.com/auth/gmail.readonly',
      },
      encryptionSecret: 'test-secret',
      db: db as never,
    });

    expect(result.isNewUser).toBe(true);
    expect(result.redirectUrl).toBe('/onboarding');
    expect(mockFetch).toHaveBeenCalled();
  });

  it('does not redirect returning users', async () => {
    db.get.mockResolvedValue({ user_id: 'google-sub-123' });

    const result = await persistOAuthSignIn({
      profile: {
        sub: 'google-sub-123',
        email: 'alex@example.com',
        name: 'Alex',
      },
      account: {
        access_token: 'access-token',
        scope: 'openid email profile',
      },
      encryptionSecret: 'test-secret',
      db: db as never,
    });

    expect(result.isNewUser).toBe(false);
    expect(result.redirectUrl).toBeNull();
  });
});
