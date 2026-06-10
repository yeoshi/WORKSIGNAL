import { describe, it, expect } from 'vitest';
import { PRIORITY_FACTORS } from '@worksignal/shared';
import { canAccessProfileSettings, isOnboardingComplete } from './onboardingStatus';

const completeRecord = {
  career_stage: 'early_career' as const,
  residency_status: 'citizen' as const,
  profile: {
    current_role: 'Analyst',
    target_roles: ['PM'],
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

describe('canAccessProfileSettings', () => {
  it('returns true for completed onboarding', () => {
    expect(isOnboardingComplete(completeRecord)).toBe(true);
    expect(canAccessProfileSettings(completeRecord)).toBe(true);
  });

  it('returns true when only a resume is saved', () => {
    expect(
      canAccessProfileSettings({
        resume_s3_key: 'local/resumes/user/CV.pdf',
      }),
    ).toBe(true);
  });

  it('returns false for empty records', () => {
    expect(canAccessProfileSettings(null)).toBe(false);
    expect(canAccessProfileSettings({})).toBe(false);
  });
});
