/**
 * Persists a successful Google OAuth sign-in via AuthServiceImpl and decides
 * whether the user should be sent to onboarding (first sign-in only).
 */

import {
  createAuthService,
  GMAIL_READONLY_SCOPE,
  USERS_TABLE,
  type AuthUserRecord,
} from '@worksignal/backend';
import type { DynamoDBWrapper } from '@worksignal/shared';

export interface OAuthSignInInput {
  profile: {
    sub?: string | null;
    email?: string | null;
    name?: string | null;
  };
  account: {
    access_token?: string | null;
    refresh_token?: string | null;
    scope?: string | null;
  };
  encryptionSecret: string;
  db: DynamoDBWrapper;
}

export interface OAuthSignInResult {
  isNewUser: boolean;
  /** When set, NextAuth should redirect here after sign-in. */
  redirectUrl: string | null;
}

export async function persistOAuthSignIn(
  input: OAuthSignInInput,
): Promise<OAuthSignInResult> {
  const sub = input.profile.sub?.trim();
  if (!sub) {
    throw new Error('OAuth profile is missing a subject identifier.');
  }

  const existing = await input.db.get<AuthUserRecord>(USERS_TABLE, {
    user_id: sub,
  });

  const scope = input.account.scope ?? '';
  const gmailScopeGranted = scope.includes(GMAIL_READONLY_SCOPE);

  const authService = createAuthService({
    db: input.db,
    encryptionSecret: input.encryptionSecret,
  });

  await authService.onCallback(
    {
      sub,
      email: input.profile.email?.trim() ?? '',
      name: input.profile.name ?? '',
    },
    {
      accessToken: input.account.access_token ?? '',
      refreshToken: input.account.refresh_token ?? undefined,
      gmailScopeGranted,
    },
  );

  const isNewUser = existing === undefined;

  return {
    isNewUser,
    redirectUrl: isNewUser ? '/onboarding' : null,
  };
}
