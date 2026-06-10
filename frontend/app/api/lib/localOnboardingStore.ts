/**
 * In-memory onboarding store for local development without AWS.
 *
 * Enable with LOCAL_DEV=true in .env.local when DynamoDB/S3 credentials
 * are unavailable or expired.
 */

import type { ParsedProfile } from '@/app/types/shared';

export type LocalUserRecord = Record<string, unknown> & {
  user_id: string;
  email?: string;
  name?: string;
  resume_s3_key?: string;
  cover_letter_sample_s3_key?: string;
  cover_letter_sample_text?: string;
  profile?: Partial<ParsedProfile> & Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

const store = new Map<string, LocalUserRecord>();

export function isLocalOnboardingEnabled(): boolean {
  return process.env.LOCAL_DEV === 'true' || process.env.DEMO_MODE === 'true';
}

export function getLocalUser(userId: string): LocalUserRecord | null {
  return store.get(userId) ?? null;
}

export function putLocalUser(
  userId: string,
  patch: Record<string, unknown>,
): LocalUserRecord {
  const existing = store.get(userId);
  const now = new Date().toISOString();
  const next: LocalUserRecord = {
    ...(existing ?? {}),
    ...patch,
    user_id: userId,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  store.set(userId, next);
  return next;
}

export function ensureLocalAuthUser(input: {
  userId: string;
  email: string;
  name: string;
}): LocalUserRecord {
  const existing = getLocalUser(input.userId);
  if (existing) {
    return putLocalUser(input.userId, {
      email: input.email,
      name: input.name,
      inbox_monitoring_available: true,
    });
  }

  return putLocalUser(input.userId, {
    email: input.email,
    name: input.name,
    inbox_monitoring_available: true,
  });
}

export function clearLocalUserFields(
  userId: string,
  fields: Array<keyof LocalUserRecord>,
): LocalUserRecord | null {
  const existing = getLocalUser(userId);
  if (!existing) return null;

  const next: LocalUserRecord = { ...existing };
  for (const field of fields) {
    delete next[field];
  }
  next.updated_at = new Date().toISOString();
  store.set(userId, next);
  return next;
}

/** @internal Test helper */
export function clearLocalOnboardingStore(): void {
  store.clear();
}
