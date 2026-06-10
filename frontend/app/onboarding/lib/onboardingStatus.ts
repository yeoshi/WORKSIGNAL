/**
 * Onboarding completion and resume-step helpers.
 */

import {
  PRIORITY_FACTORS,
  type CareerStage,
  type NonNegotiables,
  type ParsedProfile,
  type PriorityFactor,
  type ResidencyStatus,
} from '@worksignal/shared';
import { hasConfirmedResumeProfile } from './parsedProfileDefaults';

export type OnboardingRecord = {
  resume_s3_key?: string;
  cover_letter_sample_s3_key?: string;
  career_stage?: CareerStage;
  residency_status?: ResidencyStatus;
  career_switch_context?: { from: string; to: string };
  profile?: Partial<ParsedProfile> & {
    target_roles?: string[];
    target_industries?: string[];
    dream_companies?: string[];
    priority_ranking?: PriorityFactor[];
  };
  target_roles?: string[];
  target_industries?: string[];
  dream_companies?: string[];
  priority_ranking?: PriorityFactor[];
  non_negotiables?: NonNegotiables;
  updated_at?: string;
};

export function isOnboardingComplete(
  record: OnboardingRecord | null | undefined,
): boolean {
  if (!record) return false;

  if (!record.career_stage || !record.residency_status) {
    return false;
  }

  const roles = record.profile?.target_roles ?? record.target_roles;
  if (!roles || roles.length === 0) {
    return false;
  }

  const ranking = record.profile?.priority_ranking ?? record.priority_ranking;
  if (!ranking || ranking.length !== PRIORITY_FACTORS.length) {
    return false;
  }

  const minSalary = record.non_negotiables?.min_salary;
  if (typeof minSalary !== 'number' || minSalary <= 0) {
    return false;
  }

  return true;
}

/** Whether the user has enough saved data to open profile settings. */
export function canAccessProfileSettings(
  record: OnboardingRecord | null | undefined,
): boolean {
  if (!record) return false;
  return (
    isOnboardingComplete(record) ||
    hasConfirmedResumeProfile(record.profile) ||
    Boolean(record.resume_s3_key) ||
    Boolean(record.career_stage)
  );
}

/**
 * Returns the step index to resume:
 * 0 = resume, 1 = confirm, 2 = about you, 3 = targets, -1 = complete.
 */
export function getOnboardingResumeStep(
  record: OnboardingRecord | null | undefined,
): number {
  if (isOnboardingComplete(record)) {
    return -1;
  }

  if (!record?.career_stage || !record?.residency_status) {
    if (hasConfirmedResumeProfile(record?.profile)) {
      return 2;
    }
    if (record?.resume_s3_key) {
      return 1;
    }
    return 0;
  }

  return 3;
}
