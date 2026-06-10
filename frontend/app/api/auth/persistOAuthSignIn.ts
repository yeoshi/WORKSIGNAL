/**
 * Persists a successful Google OAuth sign-in and decides whether the user
 * should be sent to onboarding (first sign-in only).
 */

import type { DynamoDBWrapper } from '@/app/api/lib/dynamodb';
import { getApiBaseUrl } from '../lib/apiGateway';
import {
  ensureLocalAuthUser,
  getLocalUser,
  isLocalOnboardingEnabled,
} from '../lib/localOnboardingStore';

export interface AuthUserRecord {
  user_id: string;
  email?: string;
  name?: string;
}

export const USERS_TABLE = 'Users';
export const GMAIL_READONLY_SCOPE =
  'https://www.googleapis.com/auth/gmail.readonly';

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
  redirectUrl: string | null;
}

export async function persistOAuthSignIn(
  input: OAuthSignInInput,
): Promise<OAuthSignInResult> {
  const sub = input.profile.sub?.trim();
  if (!sub) {
    throw new Error('OAuth profile is missing a subject identifier.');
  }

  const email = input.profile.email?.trim() ?? '';
  const name = input.profile.name ?? '';

  if (isLocalOnboardingEnabled()) {
    const existing = getLocalUser(sub);
    ensureLocalAuthUser({ userId: sub, email, name });
    const isNewUser = existing === null;
    return {
      isNewUser,
      redirectUrl: isNewUser ? '/onboarding' : null,
    };
  }

  const existing = await input.db.get<AuthUserRecord>(USERS_TABLE, {
    user_id: sub,
  });

  const res = await fetch(`${getApiBaseUrl()}/auth/persist-oauth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profile: input.profile,
      account: input.account,
      encryptionSecret: input.encryptionSecret,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || 'OAuth persistence failed');
  }

  const isNewUser = existing === undefined;

  return {
    isNewUser,
    redirectUrl: isNewUser ? '/onboarding' : null,
  };
}
