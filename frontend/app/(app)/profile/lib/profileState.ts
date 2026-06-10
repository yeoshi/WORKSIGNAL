import type { ParsedProfile } from '@worksignal/shared';
import type { TargetsPayload } from '../../../onboarding/api';
import { deriveFileNameFromS3Key } from '../../../onboarding/lib/deriveFileNameFromS3Key';
import type { OnboardingRecord } from '../../../onboarding/lib/onboardingStatus';
import { emptyParsedProfile } from '../../../onboarding/lib/parsedProfileDefaults';
import type { AboutYouValue } from '../../../onboarding/steps/AboutYouStep';
import type { ResumeStepResult } from '../../../onboarding/steps/ResumeUploadStep';

export function buildResumeDraft(record: OnboardingRecord): ResumeStepResult {
  const empty = emptyParsedProfile();
  return {
    manualEntry: false,
    fileName: deriveFileNameFromS3Key(record.resume_s3_key),
    s3Key: record.resume_s3_key,
    coverLetterFileName: deriveFileNameFromS3Key(record.cover_letter_sample_s3_key),
    coverLetterS3Key: record.cover_letter_sample_s3_key,
    profile: record.profile
      ? ({
          ...empty,
          ...record.profile,
          basic_info: { ...empty.basic_info!, ...record.profile.basic_info },
        } as ParsedProfile)
      : null,
  };
}

export function buildAboutYou(record: OnboardingRecord): AboutYouValue | null {
  if (!record.career_stage || !record.residency_status) {
    return null;
  }

  return {
    career_stage: record.career_stage,
    residency_status: record.residency_status,
    career_switch_context: record.career_switch_context,
  };
}

export function buildTargetsInitial(record: OnboardingRecord): Partial<TargetsPayload> {
  const nn = record.non_negotiables;
  return {
    target_roles: record.profile?.target_roles ?? record.target_roles ?? [],
    target_industries:
      record.profile?.target_industries ?? record.target_industries ?? [],
    dream_companies:
      record.profile?.dream_companies ?? record.dream_companies ?? [],
    priority_ranking:
      record.profile?.priority_ranking ?? record.priority_ranking,
    non_negotiables: nn,
  };
}
