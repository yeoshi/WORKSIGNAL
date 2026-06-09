/**
 * Property-based and unit tests for minimum monthly salary validation.
 *
 * Feature: worksignal, Property 3: Minimum salary must be positive
 * Validates: Requirements 5.3
 *
 * Property 3 states that, for any submitted minimum monthly salary,
 * `validateMinSalary` accepts the value (returning it unchanged) if and only
 * if it is a strictly positive, finite number. Every other value — zero,
 * negatives, `NaN`, `Infinity`/`-Infinity`, and non-numbers — is rejected by
 * throwing a `ValidationError`. The validator is pure and performs no I/O, so
 * nothing is persisted on rejection.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { ValidationError } from '@worksignal/shared';
import { validateMinSalary, isValidMinSalary } from './minSalary.js';

/** Minimum fast-check iterations required by the spec for property tests. */
const NUM_RUNS = 200;

/**
 * Reference oracle: independently decide whether `value` is a strictly
 * positive, finite number. Kept deliberately separate from the implementation
 * so it can serve as a trusted check.
 */
function isStrictlyPositiveFinite(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** Run the validator and report whether it accepted (no throw) the input. */
function accepts(value: unknown): boolean {
  try {
    validateMinSalary(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * A generator spanning the salary input space, deliberately weighted toward
 * boundary and invalid cases:
 *  - strictly positive integers and fractions (should be accepted),
 *  - zero and negatives (rejected),
 *  - NaN / +Infinity / -Infinity (rejected),
 *  - non-number runtime values from untrusted input (rejected).
 */
const salaryCandidateArb: fc.Arbitrary<unknown> = fc.oneof(
  // Positive fractional values (e.g. 1234.56) — must be accepted.
  { weight: 4, arbitrary: fc.double({ min: Number.MIN_VALUE, max: 1e7, noNaN: true }) },
  // Positive integers — must be accepted.
  { weight: 3, arbitrary: fc.integer({ min: 1, max: 1_000_000 }) },
  // Zero — boundary, must be rejected.
  { weight: 2, arbitrary: fc.constant(0) },
  // Negative numbers (integers and fractions) — must be rejected.
  { weight: 3, arbitrary: fc.double({ min: -1e7, max: -Number.MIN_VALUE, noNaN: true }) },
  // Non-finite numbers — must be rejected.
  { weight: 2, arbitrary: fc.constantFrom(NaN, Infinity, -Infinity) },
  // Non-number runtime values — must be rejected.
  {
    weight: 2,
    arbitrary: fc.oneof(
      fc.string(),
      fc.boolean(),
      fc.constant(null),
      fc.constant(undefined),
      fc.array(fc.integer()),
      fc.record({ amount: fc.integer() }),
    ),
  },
);

describe('validateMinSalary', () => {
  it('Feature: worksignal, Property 3: Minimum salary accepted iff strictly positive finite number [Validates: Requirements 5.3]', () => {
    fc.assert(
      fc.property(salaryCandidateArb, (value) => {
        const expected = isStrictlyPositiveFinite(value);
        const actual = accepts(value);
        // The biconditional: accepted exactly when strictly positive & finite.
        expect(actual).toBe(expected);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('Feature: worksignal, Property 3: strictly positive values (including fractions) are returned unchanged', () => {
    fc.assert(
      fc.property(
        fc.double({ min: Number.MIN_VALUE, max: 1e7, noNaN: true }),
        (value) => {
          expect(validateMinSalary(value)).toBe(value);
          expect(isValidMinSalary(value)).toBe(true);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('Feature: worksignal, Property 3: zero and negative values are rejected with a ValidationError', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(0),
          fc.double({ min: -1e7, max: -Number.MIN_VALUE, noNaN: true }),
          fc.integer({ min: -1_000_000, max: 0 }),
        ),
        (value) => {
          expect(() => validateMinSalary(value)).toThrow(ValidationError);
          expect(isValidMinSalary(value)).toBe(false);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // --- Unit tests: concrete examples and edge cases ---

  it('accepts a typical positive monthly salary', () => {
    expect(validateMinSalary(5600)).toBe(5600);
  });

  it('accepts a positive fractional salary', () => {
    expect(validateMinSalary(4999.99)).toBe(4999.99);
  });

  it('accepts the smallest representable positive number', () => {
    expect(validateMinSalary(Number.MIN_VALUE)).toBe(Number.MIN_VALUE);
  });

  it('rejects zero', () => {
    expect(() => validateMinSalary(0)).toThrow(ValidationError);
  });

  it('rejects a negative salary', () => {
    expect(() => validateMinSalary(-1)).toThrow(ValidationError);
  });

  it('rejects NaN', () => {
    expect(() => validateMinSalary(NaN)).toThrow(ValidationError);
  });

  it('rejects Infinity and -Infinity', () => {
    expect(() => validateMinSalary(Infinity)).toThrow(ValidationError);
    expect(() => validateMinSalary(-Infinity)).toThrow(ValidationError);
  });

  it('rejects non-number inputs', () => {
    expect(() => validateMinSalary('5600')).toThrow(ValidationError);
    expect(() => validateMinSalary(null)).toThrow(ValidationError);
    expect(() => validateMinSalary(undefined)).toThrow(ValidationError);
  });

  it('attaches structured details to the ValidationError', () => {
    try {
      validateMinSalary(-100);
      expect.unreachable('expected validateMinSalary to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      const details = (err as ValidationError).details as
        | { field: string; value: unknown }
        | undefined;
      expect(details?.field).toBe('min_salary');
      expect(details?.value).toBe(-100);
    }
  });
});
