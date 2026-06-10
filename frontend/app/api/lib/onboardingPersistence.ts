/**
 * Unified onboarding persistence — DynamoDB in production, in-memory when
 * LOCAL_DEV=true (or DEMO_MODE).
 */

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

  const { DynamoDBWrapper } = await import('@worksignal/shared');
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

  const { createOnboardingService } = await import('@worksignal/backend');
  const { DynamoDBWrapper } = await import('@worksignal/shared');
  return createOnboardingService({ db: new DynamoDBWrapper() });
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
