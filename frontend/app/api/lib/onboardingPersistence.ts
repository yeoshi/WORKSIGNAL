/**
 * Unified onboarding persistence — DynamoDB in production, in-memory when
 * LOCAL_DEV=true (or DEMO_MODE).
 */

import { PRIORITY_FACTORS } from '@/app/types/shared';
import { DynamoDBWrapper } from '@worksignal/shared';
import {
  getLocalUser,
  isLocalOnboardingEnabled,
  putLocalUser,
} from './localOnboardingStore';

const USERS_TABLE = 'Users';

async function loadDynamoUser(
  db: DynamoDBWrapper,
  userId: string,
): Promise<Record<string, unknown>> {
  const existing = await db.get<Record<string, unknown>>(USERS_TABLE, {
    user_id: userId,
  });
  return existing ?? { user_id: userId };
}

async function saveDynamoUser(
  db: DynamoDBWrapper,
  record: Record<string, unknown>,
): Promise<void> {
  const now = new Date().toISOString();
  await db.put(USERS_TABLE, {
    ...record,
    updated_at: now,
    created_at: record.created_at ?? now,
  });
}

export async function loadOnboardingUser(
  userId: string,
): Promise<Record<string, unknown> | null> {
  if (isLocalOnboardingEnabled()) {
    return getLocalUser(userId);
  }

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

  return createDynamoOnboardingService(new DynamoDBWrapper());
}

function createDynamoOnboardingService(db: DynamoDBWrapper) {
  return {
    async setCareerProfile(
      userId: string,
      stage: string,
      residency: string,
      switchContext?: { from: string; to: string },
    ) {
      const record = await loadDynamoUser(db, userId);
      record.career_stage = stage;
      record.residency_status = residency;
      if (switchContext) {
        record.career_switch_context = switchContext;
      }
      await saveDynamoUser(db, record);
    },
    async confirmResumeProfile(
      userId: string,
      profile: Record<string, unknown>,
      resumeS3Key?: string,
    ) {
      const record = await loadDynamoUser(db, userId);
      const existingProfile = (record.profile ?? {}) as Record<string, unknown>;
      record.profile = {
        ...profile,
        target_roles: existingProfile.target_roles ?? [],
        target_industries: existingProfile.target_industries ?? [],
        dream_companies: existingProfile.dream_companies ?? [],
        priority_ranking:
          existingProfile.priority_ranking ?? [...PRIORITY_FACTORS],
      };
      if (resumeS3Key) {
        record.resume_s3_key = resumeS3Key;
      }
      await saveDynamoUser(db, record);
    },
    async setCoverLetterSample(userId: string, s3Key: string, sampleText: string) {
      const record = await loadDynamoUser(db, userId);
      record.cover_letter_sample_s3_key = s3Key;
      record.cover_letter_sample_text = sampleText;
      await saveDynamoUser(db, record);
    },
    async setTargets(
      userId: string,
      roles: string[],
      industries: string[],
      dreamCompanies: string[],
    ) {
      const record = await loadDynamoUser(db, userId);
      const existingProfile = (record.profile ?? {}) as Record<string, unknown>;
      record.profile = {
        ...existingProfile,
        target_roles: roles,
        target_industries: industries,
        dream_companies: dreamCompanies,
      };
      await saveDynamoUser(db, record);
    },
    async setPriorityRanking(userId: string, ranking: string[]) {
      const record = await loadDynamoUser(db, userId);
      const existingProfile = (record.profile ?? {}) as Record<string, unknown>;
      record.profile = {
        ...existingProfile,
        priority_ranking: ranking,
      };
      await saveDynamoUser(db, record);
      return undefined;
    },
    async setNonNegotiables(userId: string, nn: Record<string, unknown>) {
      const record = await loadDynamoUser(db, userId);
      record.non_negotiables = nn;
      await saveDynamoUser(db, record);
      return undefined;
    },
    async editOnboarding(userId: string, patch: Record<string, unknown>) {
      const record = await loadDynamoUser(db, userId);
      const existingProfile = (record.profile ?? {}) as Record<string, unknown>;
      const profile = {
        ...existingProfile,
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
      record.profile = profile;
      if (patch.non_negotiables) {
        record.non_negotiables = patch.non_negotiables;
      }
      await saveDynamoUser(db, record);
      return {
        ...patch,
        non_negotiables: patch.non_negotiables ?? record.non_negotiables,
      };
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
