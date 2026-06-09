/**
 * Calibration derivation (Onboarding_Service, Requirement 6).
 *
 * Pure logic — no I/O. Given a user's career stage, residency status, target
 * industries, and user-entered minimum salary, this module derives the
 * edge-case auto-adjustments described in the design document:
 *
 *  - Realism_Agent match threshold: 70 for `fresh_grad`, 85 for `senior`,
 *    otherwise the default 80 (Req 6.1, 6.2).
 *  - Employment Pass (EP) minimum monthly salary floor for `need_sponsorship`
 *    users: 5600 SGD for general roles, 6200 SGD when target industries include
 *    financial services (Req 6.3, 6.4).
 *  - The EP floor is a *minimum*: the higher of the user-entered minimum salary
 *    and the applicable EP floor is kept (design §Onboarding_Service; the floor
 *    is additionally enforced by the Pre_Filter, Req 9.3).
 *  - Whether the user is a `career_switcher`, recorded so the Master_Orchestrator
 *    can weight transferable skills more heavily (Req 6.5).
 *
 * Granular derivation helpers are exported alongside the aggregate
 * {@link deriveCalibration} so each Requirement-6 clause is independently
 * testable.
 */

import type {
  AgentWeights,
  CareerStage,
  NonNegotiables,
  ResidencyStatus,
} from '@worksignal/shared';

// --- Calibration constants (design §Onboarding_Service, Req 6) ---

/** Default Realism_Agent match threshold for unspecified career stages. */
export const REALISM_THRESHOLD_DEFAULT = 80;
/** Realism_Agent match threshold for `fresh_grad` users (Req 6.1). */
export const REALISM_THRESHOLD_FRESH_GRAD = 70;
/** Realism_Agent match threshold for `senior` users (Req 6.2). */
export const REALISM_THRESHOLD_SENIOR = 85;

/** EP minimum monthly salary floor for general roles, in SGD (Req 6.3). */
export const EP_SALARY_FLOOR_GENERAL = 5600;
/** EP minimum monthly salary floor for financial-services roles, in SGD (Req 6.4). */
export const EP_SALARY_FLOOR_FINANCIAL_SERVICES = 6200;

/**
 * Default per-user agent weights before stage-specific calibration is applied.
 * Mirrors the Users table defaults in the design document.
 */
export const DEFAULT_AGENT_WEIGHTS: AgentWeights = {
  ambition_threshold: 70,
  realism_threshold: REALISM_THRESHOLD_DEFAULT,
  risk_max_acceptable: 70,
  opportunity_urgency_boost: true,
};

// --- Inputs and outputs ---

/** The subset of onboarding fields that drive calibration derivation. */
export interface CalibrationInput {
  career_stage: CareerStage;
  residency_status: ResidencyStatus;
  /** The user's target industries (Req 4.1) — used to detect financial services. */
  target_industries: string[];
  /** The user-entered minimum monthly salary non-negotiable, in SGD (Req 5.1). */
  min_salary: number;
}

/** The derived calibration values produced from a {@link CalibrationInput}. */
export interface CalibrationResult {
  /** Derived Realism_Agent match threshold (70 / 80 / 85). */
  realism_threshold: number;
  /**
   * The applicable EP salary floor in SGD, or `null` when the user does not
   * require sponsorship (so no floor applies).
   */
  ep_salary_floor: number | null;
  /**
   * The effective minimum salary to enforce — the higher of the user-entered
   * minimum and the applicable EP floor.
   */
  effective_min_salary: number;
  /** True when the user's career stage is `career_switcher` (Req 6.5). */
  career_switcher: boolean;
}

// --- Granular derivation helpers ---

/**
 * Returns true when any of the supplied target industries denotes financial
 * services. Matching is tolerant of case and common separators: an industry is
 * treated as financial services when its alphanumeric-normalised form contains
 * `financialservices` (e.g. "Financial Services", "financial-services",
 * "FinancialServices", "Financial Services & Insurance").
 */
export function targetsFinancialServices(industries: readonly string[]): boolean {
  return industries.some((industry) => {
    const normalised = industry.toLowerCase().replace(/[^a-z0-9]/g, '');
    return normalised.includes('financialservices');
  });
}

/**
 * Derives the Realism_Agent match threshold from the user's career stage
 * (Req 6.1, 6.2): 70 for `fresh_grad`, 85 for `senior`, otherwise 80.
 */
export function deriveRealismThreshold(careerStage: CareerStage): number {
  switch (careerStage) {
    case 'fresh_grad':
      return REALISM_THRESHOLD_FRESH_GRAD;
    case 'senior':
      return REALISM_THRESHOLD_SENIOR;
    default:
      return REALISM_THRESHOLD_DEFAULT;
  }
}

/**
 * Derives the applicable EP salary floor (Req 6.3, 6.4). Returns `null` when the
 * user does not require sponsorship — no EP floor applies in that case. For
 * `need_sponsorship` users the floor is 6200 SGD when target industries include
 * financial services, and 5600 SGD otherwise.
 */
export function deriveEpSalaryFloor(
  residencyStatus: ResidencyStatus,
  targetIndustries: readonly string[],
): number | null {
  if (residencyStatus !== 'need_sponsorship') {
    return null;
  }
  return targetsFinancialServices(targetIndustries)
    ? EP_SALARY_FLOOR_FINANCIAL_SERVICES
    : EP_SALARY_FLOOR_GENERAL;
}

/**
 * Keeps the higher of the user-entered minimum salary and the applicable EP
 * floor. When no EP floor applies (`null`), the user's minimum is returned
 * unchanged. The EP floor is therefore a minimum, never a cap.
 */
export function deriveEffectiveMinSalary(
  userMinSalary: number,
  epSalaryFloor: number | null,
): number {
  if (epSalaryFloor === null) {
    return userMinSalary;
  }
  return Math.max(userMinSalary, epSalaryFloor);
}

/** True when the user's career stage is `career_switcher` (Req 6.5). */
export function isCareerSwitcher(careerStage: CareerStage): boolean {
  return careerStage === 'career_switcher';
}

// --- Aggregate derivation ---

/**
 * Derives the full set of calibration values for a user (Req 6.1-6.5).
 *
 * Pure and total: every {@link CalibrationInput} maps to a single
 * {@link CalibrationResult}.
 */
export function deriveCalibration(input: CalibrationInput): CalibrationResult {
  const realism_threshold = deriveRealismThreshold(input.career_stage);
  const ep_salary_floor = deriveEpSalaryFloor(
    input.residency_status,
    input.target_industries,
  );
  const effective_min_salary = deriveEffectiveMinSalary(
    input.min_salary,
    ep_salary_floor,
  );

  return {
    realism_threshold,
    ep_salary_floor,
    effective_min_salary,
    career_switcher: isCareerSwitcher(input.career_stage),
  };
}

/**
 * Produces calibrated agent weights by applying the derived Realism threshold
 * over a base set of weights (defaulting to {@link DEFAULT_AGENT_WEIGHTS}).
 * Other weights are preserved from the base.
 */
export function deriveAgentWeights(
  careerStage: CareerStage,
  base: AgentWeights = DEFAULT_AGENT_WEIGHTS,
): AgentWeights {
  return {
    ...base,
    realism_threshold: deriveRealismThreshold(careerStage),
  };
}

/**
 * Returns the user's non-negotiables with `min_salary` raised to the applicable
 * EP floor when required (keeping the higher value). All other fields are
 * preserved. Convenience wrapper over {@link deriveEffectiveMinSalary} for
 * callers that hold a {@link NonNegotiables} object.
 */
export function applyEpSalaryFloor(
  nonNegotiables: NonNegotiables,
  residencyStatus: ResidencyStatus,
  targetIndustries: readonly string[],
): NonNegotiables {
  const epSalaryFloor = deriveEpSalaryFloor(residencyStatus, targetIndustries);
  return {
    ...nonNegotiables,
    min_salary: deriveEffectiveMinSalary(nonNegotiables.min_salary, epSalaryFloor),
  };
}
