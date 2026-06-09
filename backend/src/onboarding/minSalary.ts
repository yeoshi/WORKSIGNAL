/**
 * Minimum monthly salary validation (Onboarding_Service).
 *
 * Pure validation logic for Requirement 5.3 ("WHEN the User sets a minimum
 * monthly salary, THE Onboarding_Service SHALL require the value to be a
 * positive number") and the storage side of Requirement 5.1.
 *
 * Design reference: design.md — Onboarding_Service, "Min-salary validation
 * (5.3): must be a positive number." The persistence wiring lives in task
 * 11.6; this module provides only the pure, directly-testable validator.
 *
 * Correctness property (Property 3): *For any* submitted minimum monthly
 * salary, the value is accepted (and thus persistable) if and only if it is a
 * positive number; non-positive values are rejected.
 */
import { ValidationError } from '@worksignal/shared';

/**
 * Predicate: is the given value a valid minimum monthly salary?
 *
 * A value is valid if and only if it is a strictly positive, finite number.
 * This rejects:
 *  - zero and negative numbers (not positive),
 *  - `NaN` (not a meaningful number),
 *  - `Infinity` / `-Infinity` (not finite),
 *  - any non-`number` runtime value (untrusted input is never trusted).
 *
 * @param value - The candidate minimum salary (accepts `unknown` so callers at
 *   trust boundaries can validate raw input safely).
 * @returns `true` iff `value` is a strictly positive finite number.
 */
export function isValidMinSalary(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Validate a minimum monthly salary, returning it when valid.
 *
 * A valid value is a strictly positive, finite number. Non-positive values
 * (zero, negatives), `NaN`, non-finite values, and non-numbers are rejected by
 * throwing the canonical {@link ValidationError} (Requirement 5.3).
 *
 * @param value - The candidate minimum salary.
 * @returns The validated, strictly positive salary (unchanged).
 * @throws {ValidationError} When `value` is not a strictly positive finite number.
 */
export function validateMinSalary(value: unknown): number {
  if (!isValidMinSalary(value)) {
    throw new ValidationError(
      'Minimum monthly salary must be a positive number.',
      { field: 'min_salary', value },
    );
  }
  return value;
}
