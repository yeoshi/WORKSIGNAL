/**
 * Unified onboarding persistence — DynamoDB in production, in-memory when
 * LOCAL_DEV=true (or DEMO_MODE).
 */

import { getApiBaseUrl } from './apiGateway';
import {
  getLocalUser,
  isLocalOnboardingEnabled,
  putLocalUser,
} from './localOnboardingStore';

export async function loadOnboardingUser(
  userId: string,
): Promise<Record<string, unknown> | null> {
  if (isLocalOnboardingEnabled()) {
    return getLocalUser(userId);
  }

  const { DynamoDBWrapper } = await import('@/app/api/lib/aws');
  const db = new DynamoDBWrapper();
  const record = await db.get('Users', { user_id: userId });
  return record ?? null;
}

export async function userExistsBeforeAuth(userId: string): Promise<boolean> {
  const record = await loadOnboardingUser(userId);
  return record != null;
}

export async function createOnboardingServiceForRequest() {
  if (isLocalOnboardingEnabled()) {
    return createLocalOnboardingService();
  }

  return createRemoteOnboardingService();
}

function createRemoteOnboardingService() {
  const base = getApiBaseUrl();

  async function postJson(path: string, body: unknown) {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text || `Onboarding request failed: ${path}`);
    }
    return res.json().catch(() => ({}));
  }

  return {
    async setCareerProfile(
      userId: string,
      stage: string,
      residency: string,
      switchContext?: { from: string; to: string },
    ) {
      await postJson('/onboarding/profile', {
        userId,
        stage,
        residency,
        switchContext,
      });
    },
    async confirmResumeProfile(
      userId: string,
      profile: Record<string, unknown>,
      resumeS3Key?: string,
    ) {
      await postJson('/onboarding/resume-details', { userId, profile, resumeS3Key });
    },
    async setCoverLetterSample(userId: string, s3Key: string, sampleText: string) {
      await postJson('/onboarding/cover-letter', { userId, s3Key, sampleText });
    },
    async setTargets(
      userId: string,
      roles: string[],
      industries: string[],
      dreamCompanies: string[],
    ) {
      await postJson('/onboarding/targets', { userId, roles, industries, dreamCompanies });
    },
    async setPriorityRanking(userId: string, ranking: string[]) {
      await postJson('/onboarding/targets', { userId, priority_ranking: ranking });
      return undefined;
    },
    async setNonNegotiables(userId: string, nn: Record<string, unknown>) {
      await postJson('/onboarding/targets', { userId, non_negotiables: nn });
      return undefined;
    },
    async editOnboarding(userId: string, patch: Record<string, unknown>) {
      return postJson('/onboarding', { userId, patch });
    },
  };
}

function createLocalOnboardingService() {
  return {
    async setCareerProfile(
      userId: string,
      stage: string,
      residency: string,
      switchContext?: { from: string; to: string },
    ) {
      putLocalUser(userId, {
        career_stage: stage,
        residency_status: residency,
        career_switch_context: switchContext,
      });
    },
    async confirmResumeProfile(
      userId: string,
      profile: Record<string, unknown>,
      resumeS3Key?: string,
    ) {
      const existing = getLocalUser(userId);
      putLocalUser(userId, {
        profile: {
          ...(existing?.profile ?? {}),
          ...profile,
        },
        ...(resumeS3Key ? { resume_s3_key: resumeS3Key } : {}),
      });
    },
    async setCoverLetterSample(
      userId: string,
      s3Key: string,
      sampleText: string,
    ) {
      putLocalUser(userId, {
        cover_letter_sample_s3_key: s3Key,
        cover_letter_sample_text: sampleText,
      });
    },
    async setTargets(
      userId: string,
      roles: string[],
      industries: string[],
      dreamCompanies: string[],
    ) {
      const existing = getLocalUser(userId);
      putLocalUser(userId, {
        profile: {
          ...(existing?.profile ?? {}),
          target_roles: roles,
          target_industries: industries,
          dream_companies: dreamCompanies,
        },
      });
    },
    async setPriorityRanking(userId: string, ranking: string[]) {
      const existing = getLocalUser(userId);
      putLocalUser(userId, {
        profile: {
          ...(existing?.profile ?? {}),
          priority_ranking: ranking,
        },
      });
      return undefined;
    },
    async setNonNegotiables(userId: string, nn: Record<string, unknown>) {
      putLocalUser(userId, { non_negotiables: nn });
      return undefined;
    },
    async editOnboarding(userId: string, patch: Record<string, unknown>) {
      const existing = getLocalUser(userId);
      const profile = {
        ...(existing?.profile ?? {}),
        ...(Array.isArray(patch.target_roles)
          ? { target_roles: patch.target_roles }
          : {}),
        ...(Array.isArray(patch.target_industries)
          ? { target_industries: patch.target_industries }
          : {}),
        ...(Array.isArray(patch.dream_companies)
          ? { dream_companies: patch.dream_companies }
          : {}),
        ...(Array.isArray(patch.priority_ranking)
          ? { priority_ranking: patch.priority_ranking }
          : {}),
      };
      putLocalUser(userId, {
        profile,
        ...(patch.non_negotiables
          ? { non_negotiables: patch.non_negotiables }
          : {}),
      });
      return {
        ...patch,
        non_negotiables: patch.non_negotiables ?? existing?.non_negotiables,
      };
    },
  };
}
