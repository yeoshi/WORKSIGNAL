/**
 * Property-based and unit tests for calibration derivation.
 *
 * Feature: worksignal, Property 2: Calibration derivation is correct
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4
 *
 * Property 2 states that `deriveCalibration` correctly derives, for every
 * combination of career stage, residency status, target industries, and
 * user-entered minimum salary:
 *
 *  - `realism_threshold` — 70 for `fresh_grad`, 85 for `senior`, otherwise the
 *    default 80 (Req 6.1, 6.2).
 *  - `ep_salary_floor` — `null` unless the user requires sponsorship, in which
 *    case 6200 SGD when target industries include financial services and 5600
 *    SGD otherwise (Req 6.3, 6.4).
 *  - `effective_min_salary` — the higher of the user-entered minimum and the
 *    applicable EP floor (design §Onboarding_Service; the EP floor is a
 *    minimum, never a cap).
 *  - `career_switcher` — true exactly when the career stage is
 *    `career_switcher` (Req 6.5).
 *
 * Generators span all five career stages, all four residency statuses,
 * financial-services and non-financial-services industries, and a wide range
 * of minimum salaries (including values above, equal to, and below the EP
 * floors). Each property is checked against an independent reference oracle.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { CareerStage, ResidencyStatus } from '@worksignal/shared';
import {
  deriveCalibration,
  deriveRealismThreshold,
  deriveEpSalaryFloor,
  deriveEffectiveMinSalary,
  isCareerSwitcher,
  targetsFinancialServices,
  REALISM_THRESHOLD_DEFAULT,
  REALISM_THRESHOLD_FRESH_GRAD,
  REALISM_THRESHOLD_SENIOR,
  EP_SALARY_FLOOR_GENERAL,
  EP_SALARY_FLOOR_FINANCIAL_SERVICES,
  type CalibrationInput,
} from './calibration.js';

/** Minimum fast-check iterations required by the spec for property tests. */
const NUM_RUNS = 200;

/** All career stages, enumerated for generators (no shared constant exists). */
const CAREER_STAGES: readonly CareerStage[] = [
  'fresh_grad',
  'early_career',
  'mid_career',
  'senior',
  'career_switcher',
] as const;

/** All residency statuses, enumerated for generators. */
const RESIDENCY_STATUSES: readonly ResidencyStatus[] = [
  'citizen',
  'pr',
  'ep_holder',
  'need_sponsorship',
] as const;

/**
 * Industry tokens that should each be detected as financial services by the
 * normalisation logic (case-insensitive, separator-insensitive).
 */
const FINANCIAL_SERVICES_TOKENS = [
  'financial services',
  'Financial Services',
  'financial-services',
  'FinancialServices',
  'FINANCIAL SERVICES',
  'Financial Services & Insurance',
];

/** Plain industry tokens that are never financial services. */
const NON_FINANCIAL_TOKENS = [
  'technology',
  'healthcare',
  'education',
  'manufacturing',
  'retail',
  'logistics',
];

// --- Reference oracles (independent of the implementation) ---

function expectedRealismThreshold(stage: CareerStage): number {
  if (stage === 'fresh_grad') return REALISM_THRESHOLD_FRESH_GRAD;
  if (stage === 'senior') return REALISM_THRESHOLD_SENIOR;
  return REALISM_THRESHOLD_DEFAULT;
}

function expectedEpFloor(
  residency: ResidencyStatus,
  _industries: readonly string[],
  hasFinancialServices: boolean,
): number | null {
  if (residency !== 'need_sponsorship') return null;
  return hasFinancialServices
    ? EP_SALARY_FLOOR_FINANCIAL_SERVICES
    : EP_SALARY_FLOOR_GENERAL;
}

// --- Generators ---

const careerStageArb = fc.constantFrom<CareerStage>(...CAREER_STAGES);
const residencyArb = fc.constantFrom<ResidencyStatus>(...RESIDENCY_STATUSES);

const financialTokenArb = fc.constantFrom(...FINANCIAL_SERVICES_TOKENS);
const nonFinancialTokenArb = fc.constantFrom(...NON_FINANCIAL_TOKENS);

/**
 * An industry list that may or may not contain financial services, paired with
 * a flag indicating whether it does. Built so the property test always knows
 * the ground truth independently of the implementation under test.
 */
const industriesArb: fc.Arbitrary<{
  industries: string[];
  hasFinancialServices: boolean;
}> = fc
  .record({
    nonFinancial: fc.array(nonFinancialTokenArb, { minLength: 0, maxLength: 4 }),
    includeFinancial: fc.boolean(),
    financial: financialTokenArb,
  })
  .map(({ nonFinancial, includeFinancial, financial }) => {
    const industries = includeFinancial
      ? [...nonFinancial, financial]
      : [...nonFinancial];
    return { industries, hasFinancialServices: includeFinancial };
  });

/**
 * Minimum salaries spanning below, exactly at, and above both EP floors so the
 * `max(user_min, floor)` boundary is exercised on both sides.
 */
const minSalaryArb = fc.oneof(
  fc.integer({ min: 0, max: 4000 }), // well below either floor
  fc.constantFrom(
    EP_SALARY_FLOOR_GENERAL,
    EP_SALARY_FLOOR_GENERAL - 1,
    EP_SALARY_FLOOR_GENERAL + 1,
    EP_SALARY_FLOOR_FINANCIAL_SERVICES,
    EP_SALARY_FLOOR_FINANCIAL_SERVICES - 1,
    EP_SALARY_FLOOR_FINANCIAL_SERVICES + 1,
  ),
  fc.integer({ min: 6500, max: 20000 }), // above both floors
);

const calibrationInputArb: fc.Arbitrary<{
  input: CalibrationInput;
  hasFinancialServices: boolean;
}> = fc
  .record({
    career_stage: careerStageArb,
    residency_status: residencyArb,
    industriesPair: industriesArb,
    min_salary: minSalaryArb,
  })
  .map(({ career_stage, residency_status, industriesPair, min_salary }) => ({
    input: {
      career_stage,
      residency_status,
      target_industries: industriesPair.industries,
      min_salary,
    },
    hasFinancialServices: industriesPair.hasFinancialServices,
  }));

describe('deriveCalibration', () => {
  it('Feature: worksignal, Property 2: Calibration derivation is correct [Validates: Requirements 6.1, 6.2, 6.3, 6.4]', () => {
    fc.assert(
      fc.property(calibrationInputArb, ({ input, hasFinancialServices }) => {
        const result = deriveCalibration(input);

        // Req 6.1, 6.2: realism threshold from career stage.
        expect(result.realism_threshold).toBe(
          expectedRealismThreshold(input.career_stage),
        );

        // Req 6.3, 6.4: EP salary floor from residency + industries.
        const expectedFloor = expectedEpFloor(
          input.residency_status,
          input.target_industries,
          hasFinancialServices,
        );
        expect(result.ep_salary_floor).toBe(expectedFloor);

        // Effective min salary = max(user min, EP floor) (null floor = user min).
        const expectedEffective =
          expectedFloor === null
            ? input.min_salary
            : Math.max(input.min_salary, expectedFloor);
        expect(result.effective_min_salary).toBe(expectedEffective);

        // The effective minimum never drops below the user's entered minimum.
        expect(result.effective_min_salary).toBeGreaterThanOrEqual(
          input.min_salary,
        );

        // Req 6.5: career_switcher flag.
        expect(result.career_switcher).toBe(
          input.career_stage === 'career_switcher',
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('Feature: worksignal, Property 2: realism threshold is exactly one of 70/80/85 for every career stage', () => {
    fc.assert(
      fc.property(careerStageArb, (stage) => {
        const threshold = deriveRealismThreshold(stage);
        expect([
          REALISM_THRESHOLD_FRESH_GRAD,
          REALISM_THRESHOLD_DEFAULT,
          REALISM_THRESHOLD_SENIOR,
        ]).toContain(threshold);
        expect(threshold).toBe(expectedRealismThreshold(stage));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('Feature: worksignal, Property 2: EP floor applies only to need_sponsorship users', () => {
    fc.assert(
      fc.property(
        residencyArb,
        industriesArb,
        (residency, { industries, hasFinancialServices }) => {
          const floor = deriveEpSalaryFloor(residency, industries);
          if (residency !== 'need_sponsorship') {
            expect(floor).toBeNull();
          } else {
            expect(floor).toBe(
              hasFinancialServices
                ? EP_SALARY_FLOOR_FINANCIAL_SERVICES
                : EP_SALARY_FLOOR_GENERAL,
            );
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('Feature: worksignal, Property 2: effective min salary keeps the higher of user min and EP floor', () => {
    fc.assert(
      fc.property(
        minSalaryArb,
        fc.option(
          fc.constantFrom(
            EP_SALARY_FLOOR_GENERAL,
            EP_SALARY_FLOOR_FINANCIAL_SERVICES,
          ),
          { nil: null },
        ),
        (userMin, floor) => {
          const effective = deriveEffectiveMinSalary(userMin, floor);
          const expected = floor === null ? userMin : Math.max(userMin, floor);
          expect(effective).toBe(expected);
          expect(effective).toBeGreaterThanOrEqual(userMin);
          if (floor !== null) {
            expect(effective).toBeGreaterThanOrEqual(floor);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // --- Unit tests: concrete examples and edge cases ---

  it('derives 70 for fresh_grad, 85 for senior, 80 otherwise', () => {
    expect(deriveRealismThreshold('fresh_grad')).toBe(70);
    expect(deriveRealismThreshold('senior')).toBe(85);
    expect(deriveRealismThreshold('early_career')).toBe(80);
    expect(deriveRealismThreshold('mid_career')).toBe(80);
    expect(deriveRealismThreshold('career_switcher')).toBe(80);
  });

  it('returns null EP floor for non-sponsorship residency statuses', () => {
    for (const residency of ['citizen', 'pr', 'ep_holder'] as const) {
      expect(deriveEpSalaryFloor(residency, ['financial services'])).toBeNull();
    }
  });

  it('uses the 6200 financial-services EP floor when financial services is targeted', () => {
    const result = deriveCalibration({
      career_stage: 'early_career',
      residency_status: 'need_sponsorship',
      target_industries: ['technology', 'Financial Services'],
      min_salary: 4000,
    });
    expect(result.ep_salary_floor).toBe(6200);
    expect(result.effective_min_salary).toBe(6200);
  });

  it('uses the 5600 general EP floor when financial services is not targeted', () => {
    const result = deriveCalibration({
      career_stage: 'early_career',
      residency_status: 'need_sponsorship',
      target_industries: ['technology'],
      min_salary: 4000,
    });
    expect(result.ep_salary_floor).toBe(5600);
    expect(result.effective_min_salary).toBe(5600);
  });

  it('keeps the user minimum when it exceeds the EP floor', () => {
    const result = deriveCalibration({
      career_stage: 'senior',
      residency_status: 'need_sponsorship',
      target_industries: ['technology'],
      min_salary: 9000,
    });
    expect(result.ep_salary_floor).toBe(5600);
    expect(result.effective_min_salary).toBe(9000);
    expect(result.realism_threshold).toBe(85);
  });

  it('detects financial services regardless of case and separators', () => {
    for (const token of FINANCIAL_SERVICES_TOKENS) {
      expect(targetsFinancialServices([token])).toBe(true);
    }
    expect(targetsFinancialServices(['technology', 'retail'])).toBe(false);
    expect(targetsFinancialServices([])).toBe(false);
  });

  it('records the career_switcher flag only for career_switcher stage', () => {
    expect(isCareerSwitcher('career_switcher')).toBe(true);
    expect(isCareerSwitcher('fresh_grad')).toBe(false);
  });
});
