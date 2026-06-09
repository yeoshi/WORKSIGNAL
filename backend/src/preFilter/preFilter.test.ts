/**
 * Property-based test for the Pre_Filter (SAFETY-CRITICAL).
 *
 * Feature: worksignal, Property 5: Pre_Filter never passes a non-negotiable violation
 *
 * Validates: Requirements 8.1, 8.2, 9.1, 9.2, 9.3, 9.4
 *
 * For any (job, user configuration) pair, if `preFilter` returns `pass: true`
 * then the job violates NONE of the user's non-negotiables — minimum salary,
 * employment type, work arrangement, Singapore location (including the
 * fully-remote SG-employer / SG-timezone exception), custom dealbreakers, and,
 * when residency is `need_sponsorship`, the applicable EP salary floor and
 * EP-sponsorship availability.
 *
 * Strategy: rather than re-using the implementation's helpers, this test
 * re-derives each non-negotiable check INDEPENDENTLY (an oracle written from
 * the requirements) and asserts full agreement with `preFilter`:
 *   - if `preFilter` passes, the oracle must find zero violations; and
 *   - if the oracle finds any violation, `preFilter` must NOT pass.
 * Together these guarantee a violating job can never slip through.
 *
 * Generators deliberately exercise the boundary conditions called out in the
 * design: salary exactly at the EP floor (5600 general / 6200 financial
 * services) and `need_sponsorship` users (see `EP_BOUNDARY_SALARIES` and the
 * residency generator).
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type {
  CareerStage,
  DiscoveredJob,
  EmploymentType,
  NonNegotiableKey,
  PriorityFactor,
  ResidencyStatus,
  UserConfig,
  WorkArrangement,
} from '@worksignal/shared';
import { preFilter } from './preFilter.js';

// --- Independent oracle constants (from Requirements 6.3/6.4, 9.3) ---

/** EP minimum monthly salary floor for general roles (Req 6.3, 9.3). */
const EP_FLOOR_GENERAL = 5600;
/** EP minimum monthly salary floor for financial-services roles (Req 6.4, 9.3). */
const EP_FLOOR_FINANCIAL_SERVICES = 6200;

/**
 * Salaries that straddle BOTH EP floors so generated jobs land exactly on, just
 * below, and just above each boundary (the safety-critical edge for Property 5).
 */
const EP_BOUNDARY_SALARIES = [
  0,
  5599,
  5600, // general floor — equal must pass
  5601,
  6199,
  6200, // financial-services floor — equal must pass
  6201,
  10000,
];

// --- Independent normalisation (mirrors the requirements' tolerant matching) ---

/** Lower-case and strip all non-alphanumeric characters. */
function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Independent financial-services detection (Req 6.4). */
function targetsFinancialServices(industries: readonly string[]): boolean {
  return industries.some((i) => normalise(i).includes('financialservices'));
}

// --- Labelled generator inputs so the oracle is unambiguous ---

/**
 * A work-arrangement free-text value paired with its TRUE coarse category, so
 * the oracle need not re-implement the classifier heuristic — it reads the
 * label directly. The raw strings cover the phrasings the Pre_Filter classifies.
 */
type ArrangementCategory = 'onsite' | 'hybrid' | 'fully_remote' | 'unknown';
const ARRANGEMENT_SAMPLES: { raw: string; category: ArrangementCategory }[] = [
  { raw: 'On-site', category: 'onsite' },
  { raw: 'In Office', category: 'onsite' },
  { raw: 'Onsite', category: 'onsite' },
  { raw: 'Hybrid', category: 'hybrid' },
  { raw: 'hybrid (3 days office)', category: 'hybrid' },
  { raw: 'Fully Remote', category: 'fully_remote' },
  { raw: 'Remote', category: 'fully_remote' },
  { raw: 'Work From Home', category: 'fully_remote' },
  { raw: 'Flexible arrangement', category: 'unknown' },
  { raw: '', category: 'unknown' },
];

/**
 * A location free-text value paired with whether it denotes Singapore, so the
 * oracle reads the label rather than re-deriving it. Includes a fully-remote /
 * non-SG combination to exercise the Req 8.2 exception.
 */
const LOCATION_SAMPLES: { raw: string; isSingapore: boolean }[] = [
  { raw: 'Singapore', isSingapore: true },
  { raw: 'Singapore, SG', isSingapore: true },
  { raw: 'Remote — Singapore time zone', isSingapore: true },
  { raw: 'Kuala Lumpur', isSingapore: false },
  { raw: 'Remote', isSingapore: false },
  { raw: 'London, UK', isSingapore: false },
  { raw: 'Jakarta', isSingapore: false },
  { raw: '', isSingapore: false },
];

/** Employment-type strings: canonical, formatting variants, and mismatches. */
const EMPLOYMENT_TYPE_SAMPLES = [
  'full_time',
  'Full Time',
  'FULL-TIME',
  'contract',
  'Contract',
  'part_time',
  'Part Time',
  'internship',
  'temp',
];

const CANONICAL_EMPLOYMENT_TYPES: EmploymentType[] = [
  'full_time',
  'contract',
  'part_time',
];

const WORK_ARRANGEMENT_PREFERENCES: WorkArrangement[] = [
  'any',
  'hybrid_remote',
  'fully_remote',
];

const RESIDENCY_STATUSES: ResidencyStatus[] = [
  'citizen',
  'pr',
  'ep_holder',
  'need_sponsorship',
];

const CAREER_STAGES: CareerStage[] = [
  'fresh_grad',
  'early_career',
  'mid_career',
  'senior',
  'career_switcher',
];

/** A small word pool used to build text fields and custom dealbreakers. */
const WORD_POOL = ['acme', 'globex', 'engineer', 'sales', 'crypto', 'nightshift', 'gambling'];

const PRIORITY_RANKING: PriorityFactor[] = [
  'salary',
  'growth',
  'balance',
  'brand',
  'purpose',
  'stability',
];

// --- The composed generator: a (job, user) scenario ---

interface Scenario {
  job: DiscoveredJob;
  user: UserConfig;
  /** TRUE work-arrangement category of the generated job (oracle input). */
  _arrangementCategory: ArrangementCategory;
  /** Whether the generated job location denotes Singapore (oracle input). */
  _isSingapore: boolean;
}

const scenarioArb: fc.Arbitrary<Scenario> = fc
  .record({
    // Salary
    salaryMax: fc.oneof(
      fc.constantFrom(...EP_BOUNDARY_SALARIES),
      fc.integer({ min: 0, max: 12000 }),
    ),
    minSalary: fc.oneof(
      fc.constantFrom(...EP_BOUNDARY_SALARIES),
      fc.integer({ min: 0, max: 12000 }),
    ),
    // Employment type
    jobEmploymentType: fc.constantFrom(...EMPLOYMENT_TYPE_SAMPLES),
    allowedEmploymentTypes: fc
      .uniqueArray(fc.constantFrom(...CANONICAL_EMPLOYMENT_TYPES), {
        minLength: 1,
        maxLength: 3,
      }),
    // Work arrangement
    arrangement: fc.constantFrom(...ARRANGEMENT_SAMPLES),
    arrangementPreference: fc.constantFrom(...WORK_ARRANGEMENT_PREFERENCES),
    // Location
    location: fc.constantFrom(...LOCATION_SAMPLES),
    // Text fields + custom dealbreakers
    company: fc.constantFrom(...WORD_POOL),
    roleTitle: fc.constantFrom(...WORD_POOL),
    jdWords: fc.array(fc.constantFrom(...WORD_POOL), { minLength: 0, maxLength: 4 }),
    custom: fc.array(
      fc.oneof(fc.constantFrom(...WORD_POOL), fc.constantFrom('', '   ')),
      { minLength: 0, maxLength: 3 },
    ),
    // Residency / sponsorship — weighted to hit need_sponsorship often
    residency: fc.oneof(
      { weight: 3, arbitrary: fc.constant<ResidencyStatus>('need_sponsorship') },
      { weight: 2, arbitrary: fc.constantFrom(...RESIDENCY_STATUSES) },
    ),
    epSponsorshipSignal: fc.boolean(),
    financialServices: fc.boolean(),
    extraIndustries: fc.array(fc.constantFrom('Tech', 'Healthcare', 'Retail'), {
      maxLength: 2,
    }),
    careerStage: fc.constantFrom(...CAREER_STAGES),
  })
  .map((g) => {
    const targetIndustries = [
      ...g.extraIndustries,
      ...(g.financialServices ? ['Financial Services'] : []),
    ];

    const job: DiscoveredJob = {
      job_id: 'job-1',
      user_id: 'user-1',
      company: g.company,
      role_title: g.roleTitle,
      salary_min: Math.min(g.salaryMax, 1000),
      salary_max: g.salaryMax,
      jd_text: g.jdWords.join(' '),
      posted_at: '2024-01-01T00:00:00.000Z',
      source_url: 'https://example.com/job',
      employer_email: 'hr@example.com',
      employment_type: g.jobEmploymentType,
      work_arrangement: g.arrangement.raw,
      location: g.location.raw,
      ep_sponsorship_signal: g.epSponsorshipSignal,
      mcf_listing_days: 7,
      scanned_at: '2024-01-01T00:00:00.000Z',
    };

    const user: UserConfig = {
      user_id: 'user-1',
      email: 'user@example.com',
      name: 'Test User',
      career_stage: g.careerStage,
      residency_status: g.residency,
      profile: {
        current_role: 'Engineer',
        years_experience: 3,
        skills: ['typescript'],
        education: 'BSc',
        university: 'NUS',
        target_roles: ['Engineer'],
        target_industries: targetIndustries,
        dream_companies: [],
        priority_ranking: PRIORITY_RANKING,
      },
      non_negotiables: {
        min_salary: g.minSalary,
        employment_type: g.allowedEmploymentTypes,
        work_arrangement: g.arrangementPreference,
        custom: g.custom,
        ep_sponsorship_required: g.residency === 'need_sponsorship',
      },
      agent_weights: {
        ambition_threshold: 70,
        realism_threshold: 80,
        risk_max_acceptable: 70,
        opportunity_urgency_boost: true,
      },
      inbox_monitoring_available: true,
      onboarding_version: 1,
      updated_at: '2024-01-01T00:00:00.000Z',
      created_at: '2024-01-01T00:00:00.000Z',
    };

    return {
      job,
      user,
      _arrangementCategory: g.arrangement.category,
      _isSingapore: g.location.isSingapore,
    };
  });

/**
 * Independent oracle: re-derives the set of violated non-negotiables straight
 * from the requirements, using the labelled arrangement/location categories so
 * it does not borrow the implementation's classifier.
 */
function oracleViolations(scenario: Scenario): Set<NonNegotiableKey> {
  const { job, user } = scenario;
  const nn = user.non_negotiables;
  const violated = new Set<NonNegotiableKey>();

  // 1. Minimum salary (Req 9.1).
  if (job.salary_max < nn.min_salary) {
    violated.add('min_salary');
  }

  // 2. Employment type (Req 9.1) — tolerant of case/separators.
  const allowed = new Set(nn.employment_type.map(normalise));
  if (!allowed.has(normalise(job.employment_type))) {
    violated.add('employment_type');
  }

  // 3. Work arrangement (Req 9.1) — fail-closed on unknown for restrictive prefs.
  const cat = scenario._arrangementCategory;
  let arrangementOk: boolean;
  if (nn.work_arrangement === 'any') {
    arrangementOk = true;
  } else if (nn.work_arrangement === 'fully_remote') {
    arrangementOk = cat === 'fully_remote';
  } else {
    // hybrid_remote
    arrangementOk = cat === 'hybrid' || cat === 'fully_remote';
  }
  if (!arrangementOk) {
    violated.add('work_arrangement');
  }

  // 4. Singapore location incl. fully-remote SG exception (Req 8.1, 8.2).
  if (!scenario._isSingapore) {
    violated.add('location');
  }

  // 5. Custom dealbreakers (Req 9.1) — case-insensitive substring across
  //    company / role / JD; empty/whitespace dealbreakers are ignored.
  const haystack = `${job.company}\n${job.role_title}\n${job.jd_text}`.toLowerCase();
  if (
    nn.custom.some((d) => {
      const needle = d.trim().toLowerCase();
      return needle.length > 0 && haystack.includes(needle);
    })
  ) {
    violated.add('custom');
  }

  // 6 & 7. EP guardrails for need_sponsorship users (Req 9.3, 9.4).
  if (user.residency_status === 'need_sponsorship') {
    const floor = targetsFinancialServices(user.profile.target_industries)
      ? EP_FLOOR_FINANCIAL_SERVICES
      : EP_FLOOR_GENERAL;
    if (job.salary_max < floor) {
      violated.add('ep_salary_floor');
    }
    if (!job.ep_sponsorship_signal) {
      violated.add('ep_sponsorship');
    }
  }

  return violated;
}

describe('Pre_Filter — Property 5 (safety-critical)', () => {
  // Feature: worksignal, Property 5: Pre_Filter never passes a non-negotiable violation
  it('never passes a job that violates any non-negotiable (Validates: Requirements 8.1, 8.2, 9.1, 9.2, 9.3, 9.4)', () => {
    fc.assert(
      fc.property(scenarioArb, (scenario) => {
        const result = preFilter(scenario.job, scenario.user);
        const oracle = oracleViolations(scenario);

        // SAFETY INVARIANT: a pass implies zero violations.
        if (result.pass) {
          expect(oracle.size).toBe(0);
        }

        // CONTRAPOSITIVE: any violation must prevent a pass (no violation slips
        // through). Together with the above this is full pass-correctness.
        if (oracle.size > 0) {
          expect(result.pass).toBe(false);
        }

        // Soundness of the reported violation set: it must equal the oracle's.
        if (!result.pass) {
          expect(new Set(result.violated)).toEqual(oracle);
        }
      }),
      { numRuns: 1000 },
    );
  });

  // Deterministic boundary checks called out by the task: salary exactly at the
  // EP floor must pass; one cent below must fail.
  it('treats salary exactly at the EP general floor (5600) as passing and below as failing', () => {
    const user: UserConfig = {
      user_id: 'u',
      email: 'u@e.com',
      name: 'U',
      career_stage: 'early_career',
      residency_status: 'need_sponsorship',
      profile: {
        current_role: 'Engineer',
        years_experience: 2,
        skills: [],
        education: 'BSc',
        university: 'NUS',
        target_roles: [],
        target_industries: ['Tech'],
        dream_companies: [],
        priority_ranking: PRIORITY_RANKING,
      },
      non_negotiables: {
        min_salary: 0,
        employment_type: ['full_time'],
        work_arrangement: 'any',
        custom: [],
        ep_sponsorship_required: true,
      },
      agent_weights: {
        ambition_threshold: 70,
        realism_threshold: 80,
        risk_max_acceptable: 70,
        opportunity_urgency_boost: true,
      },
      inbox_monitoring_available: true,
      onboarding_version: 1,
      updated_at: '2024-01-01T00:00:00.000Z',
      created_at: '2024-01-01T00:00:00.000Z',
    };

    const makeJob = (salaryMax: number): DiscoveredJob => ({
      job_id: 'j',
      user_id: 'u',
      company: 'Acme',
      role_title: 'Engineer',
      salary_min: 1000,
      salary_max: salaryMax,
      jd_text: '',
      posted_at: '2024-01-01T00:00:00.000Z',
      source_url: 'https://example.com',
      employer_email: 'hr@acme.com',
      employment_type: 'full_time',
      work_arrangement: 'On-site',
      location: 'Singapore',
      ep_sponsorship_signal: true,
      mcf_listing_days: 20,
      scanned_at: '2024-01-01T00:00:00.000Z',
    });

    expect(preFilter(makeJob(EP_FLOOR_GENERAL), user).pass).toBe(true);

    const below = preFilter(makeJob(EP_FLOOR_GENERAL - 1), user);
    expect(below.pass).toBe(false);
    if (!below.pass) {
      expect(below.violated).toContain('ep_salary_floor');
    }
  });

  it('treats salary exactly at the EP financial-services floor (6200) as passing and below as failing', () => {
    const user: UserConfig = {
      user_id: 'u',
      email: 'u@e.com',
      name: 'U',
      career_stage: 'early_career',
      residency_status: 'need_sponsorship',
      profile: {
        current_role: 'Analyst',
        years_experience: 2,
        skills: [],
        education: 'BSc',
        university: 'NUS',
        target_roles: [],
        target_industries: ['Financial Services'],
        dream_companies: [],
        priority_ranking: PRIORITY_RANKING,
      },
      non_negotiables: {
        min_salary: 0,
        employment_type: ['full_time'],
        work_arrangement: 'any',
        custom: [],
        ep_sponsorship_required: true,
      },
      agent_weights: {
        ambition_threshold: 70,
        realism_threshold: 80,
        risk_max_acceptable: 70,
        opportunity_urgency_boost: true,
      },
      inbox_monitoring_available: true,
      onboarding_version: 1,
      updated_at: '2024-01-01T00:00:00.000Z',
      created_at: '2024-01-01T00:00:00.000Z',
    };

    const makeJob = (salaryMax: number): DiscoveredJob => ({
      job_id: 'j',
      user_id: 'u',
      company: 'BigBank',
      role_title: 'Analyst',
      salary_min: 1000,
      salary_max: salaryMax,
      jd_text: '',
      posted_at: '2024-01-01T00:00:00.000Z',
      source_url: 'https://example.com',
      employer_email: 'hr@bigbank.com',
      employment_type: 'full_time',
      work_arrangement: 'On-site',
      location: 'Singapore',
      ep_sponsorship_signal: true,
      mcf_listing_days: 20,
      scanned_at: '2024-01-01T00:00:00.000Z',
    });

    expect(preFilter(makeJob(EP_FLOOR_FINANCIAL_SERVICES), user).pass).toBe(true);
    // 6199 is below the financial-services floor (6200) even though it clears
    // the general floor (5600) — confirms the FS floor is applied.
    const below = preFilter(makeJob(EP_FLOOR_FINANCIAL_SERVICES - 1), user);
    expect(below.pass).toBe(false);
    if (!below.pass) {
      expect(below.violated).toContain('ep_salary_floor');
    }
  });
});
