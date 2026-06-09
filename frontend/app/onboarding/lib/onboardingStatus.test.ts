import { describe, it, expect } from 'vitest';
import { PRIORITY_FACTORS } from '@worksignal/shared';
import {
  getOnboardingResumeStep,
  isOnboardingComplete,
} from './onboardingStatus';

const completeRecord = {
  career_stage: 'early_career' as const,
  residency_status: 'citizen' as const,
  profile: {
    target_roles: ['Product Manager'],
    priority_ranking: [...PRIORITY_FACTORS],
  },
  non_negotiables: {
    min_salary: 5000,
    employment_type: ['full_time' as const],
    work_arrangement: 'any' as const,
    custom: [],
    ep_sponsorship_required: false,
  },
};

describe('isOnboardingComplete', () => {
  it('returns false for null or empty records', () => {
    expect(isOnboardingComplete(null)).toBe(false);
    expect(isOnboardingComplete({})).toBe(false);
  });

  it('returns true when required fields are present', () => {
    expect(isOnboardingComplete(completeRecord)).toBe(true);
  });

  it('returns false when targets are missing', () => {
    expect(
      isOnboardingComplete({
        career_stage: 'early_career',
        residency_status: 'citizen',
        non_negotiables: completeRecord.non_negotiables,
      }),
    ).toBe(false);
  });
});

describe('getOnboardingResumeStep', () => {
  it('returns -1 when onboarding is complete', () => {
    expect(getOnboardingResumeStep(completeRecord)).toBe(-1);
  });

  it('returns 0 for a fresh user without resume or profile', () => {
    expect(getOnboardingResumeStep(null)).toBe(0);
    expect(getOnboardingResumeStep({})).toBe(0);
  });

  it('returns 1 when resume is uploaded but profile is missing', () => {
    expect(getOnboardingResumeStep({ resume_s3_key: 'resumes/demo.pdf' })).toBe(1);
  });

  it('returns 2 when profile is saved but targets are incomplete', () => {
    expect(
      getOnboardingResumeStep({
        career_stage: 'early_career',
        residency_status: 'citizen',
      }),
    ).toBe(2);
  });
});
