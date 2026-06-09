import { describe, it, expect, vi, beforeEach } from 'vitest';
import { persistOAuthSignIn } from './persistOAuthSignIn';

const mockOnCallback = vi.fn();

vi.mock('@worksignal/backend', () => ({
  createAuthService: () => ({ onCallback: mockOnCallback }),
  GMAIL_READONLY_SCOPE: 'https://www.googleapis.com/auth/gmail.readonly',
  USERS_TABLE: 'Users',
}));

describe('persistOAuthSignIn', () => {
  const db = {
    get: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnCallback.mockResolvedValue({
      userId: 'google-sub-123',
      email: 'alex@example.com',
      name: 'Alex',
      inboxMonitoringAvailable: true,
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
    expect(mockOnCallback).toHaveBeenCalledWith(
      {
        sub: 'google-sub-123',
        email: 'alex@example.com',
        name: 'Alex',
      },
      expect.objectContaining({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        gmailScopeGranted: true,
      }),
    );
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
