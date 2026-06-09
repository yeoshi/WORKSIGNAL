/**
 * Onboarding completion and resume-step helpers.
 */

import {
  PRIORITY_FACTORS,
  type CareerStage,
  type NonNegotiables,
  type PriorityFactor,
  type ResidencyStatus,
} from '@worksignal/shared';

export type OnboardingRecord = {
  resume_s3_key?: string;
  career_stage?: CareerStage;
  residency_status?: ResidencyStatus;
  career_switch_context?: { from: string; to: string };
  profile?: {
    target_roles?: string[];
    priority_ranking?: PriorityFactor[];
  };
  target_roles?: string[];
  priority_ranking?: PriorityFactor[];
  non_negotiables?: NonNegotiables;
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

/**
 * Returns the step index to resume (0 = resume, 1 = about, 2 = targets),
 * or -1 when onboarding is complete.
 */
export function getOnboardingResumeStep(
  record: OnboardingRecord | null | undefined,
): number {
  if (isOnboardingComplete(record)) {
    return -1;
  }

  if (!record?.career_stage || !record?.residency_status) {
    return record?.resume_s3_key ? 1 : 0;
  }

  return 2;
}
