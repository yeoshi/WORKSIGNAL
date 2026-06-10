import type { OnboardingRecord } from '../../onboarding/lib/onboardingStatus';
import { DEMO_PARSED_PROFILE } from './demoParsedProfile';
import { putLocalUser } from './localOnboardingStore';

export function buildDemoOnboardingRecord(userId: string): OnboardingRecord {
  return {
    career_stage: 'early_career',
    residency_status: 'citizen',
    resume_s3_key: 'demo/randall-koh-resume.pdf',
    profile: {
      ...DEMO_PARSED_PROFILE,
      target_roles: ['Software Engineer', 'Product Analyst', 'ML Engineer'],
      target_industries: ['Technology', 'Fintech'],
      dream_companies: ['Grab', 'Open Government Products', 'Shopee'],
      priority_ranking: ['growth', 'purpose', 'salary', 'brand', 'balance', 'stability'],
    },
    target_roles: ['Software Engineer', 'Product Analyst', 'ML Engineer'],
    target_industries: ['Technology', 'Fintech'],
    dream_companies: ['Grab', 'Open Government Products', 'Shopee'],
    priority_ranking: ['growth', 'purpose', 'salary', 'brand', 'balance', 'stability'],
    non_negotiables: {
      min_salary: 4000,
      employment_type: ['full_time'],
      work_arrangement: 'hybrid_remote',
      ep_sponsorship_required: false,
      custom: [],
    },
  };
}

export function seedDemoOnboardingUser(userId: string): OnboardingRecord {
  const record = buildDemoOnboardingRecord(userId);
  putLocalUser(userId, record as Record<string, unknown>);
  return record;
}
