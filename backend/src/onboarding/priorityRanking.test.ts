/**
 * Property-based and unit tests for the priority-ranking validator.
 *
 * Feature: worksignal, Property 1: Priority ranking accepted iff exact permutation
 * Validates: Requirements 4.3, 4.4
 *
 * Property 1 states that `validatePriorityRanking` accepts a submitted list if
 * and only if it is an exact permutation of the six canonical priority factors
 * `{salary, growth, balance, brand, purpose, stability}` — each present exactly
 * once with no omissions, duplicates, or unrecognised entries. Any other input
 * must be rejected by throwing a `RankingError`, and nothing is persisted on
 * rejection (the validator is pure and performs no I/O).
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { PRIORITY_FACTORS, RankingError, type PriorityFactor } from '@worksignal/shared';
import { validatePriorityRanking } from './priorityRanking.js';

/** Minimum fast-check iterations required by the spec for property tests. */
const NUM_RUNS = 200;

/**
 * Reference oracle: independently decide whether `submitted` is an exact
 * permutation of the six canonical factors. Kept deliberately simple and
 * separate from the implementation so it can serve as a trusted check.
 */
function isExactPermutation(submitted: readonly unknown[]): boolean {
  if (submitted.length !== PRIORITY_FACTORS.length) return false;
  const remaining = new Set<string>(PRIORITY_FACTORS);
  for (const entry of submitted) {
    if (typeof entry !== 'string' || !remaining.has(entry)) return false;
    remaining.delete(entry);
  }
  return remaining.size === 0;
}

/** Run the validator and report whether it accepted (no throw) the input. */
function accepts(submitted: readonly unknown[]): boolean {
  try {
    validatePriorityRanking(submitted);
    return true;
  } catch {
    return false;
  }
}

/** A generator producing a valid permutation of the six canonical factors. */
const validPermutationArb: fc.Arbitrary<PriorityFactor[]> = fc.constant(
  [...PRIORITY_FACTORS] as PriorityFactor[],
).chain((factors) => fc.shuffledSubarray(factors, { minLength: factors.length, maxLength: factors.length }));

/**
 * A generator producing arbitrary lists drawn mostly from the canonical
 * factors (plus occasional foreign tokens), so the input space is heavily
 * weighted toward near-misses: omissions and duplicates. Lengths range from 0
 * to well above six to exercise both short and over-long submissions.
 */
const factorToken = fc.oneof(
  { weight: 9, arbitrary: fc.constantFrom<PriorityFactor>(...PRIORITY_FACTORS) },
  { weight: 1, arbitrary: fc.string() },
);
const arbitraryListArb: fc.Arbitrary<unknown[]> = fc.array(factorToken, {
  minLength: 0,
  maxLength: 12,
});

describe('validatePriorityRanking', () => {
  it('Feature: worksignal, Property 1: Priority ranking accepted iff exact permutation [Validates: Requirements 4.3, 4.4]', () => {
    fc.assert(
      fc.property(arbitraryListArb, (submitted) => {
        const expected = isExactPermutation(submitted);
        const actual = accepts(submitted);
        // The biconditional: accepted exactly when an exact permutation.
        expect(actual).toBe(expected);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('Feature: worksignal, Property 1: valid permutations are always accepted and returned unchanged', () => {
    fc.assert(
      fc.property(validPermutationArb, (perm) => {
        const result = validatePriorityRanking(perm);
        expect(result).toEqual(perm);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('Feature: worksignal, Property 1: omissions are rejected with a RankingError naming the missing factor', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<PriorityFactor>(...PRIORITY_FACTORS),
        (dropped) => {
          const withOmission = PRIORITY_FACTORS.filter((f) => f !== dropped);
          let thrown: unknown;
          try {
            validatePriorityRanking(withOmission);
          } catch (err) {
            thrown = err;
          }
          expect(thrown).toBeInstanceOf(RankingError);
          const details = (thrown as RankingError).details as
            | { missing: PriorityFactor[] }
            | undefined;
          expect(details?.missing).toContain(dropped);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('Feature: worksignal, Property 1: duplicates are rejected with a RankingError naming the duplicated factor', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<PriorityFactor>(...PRIORITY_FACTORS),
        fc.constantFrom<PriorityFactor>(...PRIORITY_FACTORS),
        (dup, dropped) => {
          // Build a 6-length list that duplicates `dup` and omits `dropped`,
          // guaranteeing it is not an exact permutation.
          fc.pre(dup !== dropped);
          const withDuplicate = PRIORITY_FACTORS.map((f) =>
            f === dropped ? dup : f,
          );
          let thrown: unknown;
          try {
            validatePriorityRanking(withDuplicate);
          } catch (err) {
            thrown = err;
          }
          expect(thrown).toBeInstanceOf(RankingError);
          const details = (thrown as RankingError).details as
            | { duplicated: PriorityFactor[] }
            | undefined;
          expect(details?.duplicated).toContain(dup);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // --- Unit tests: concrete examples and edge cases ---

  it('accepts the canonical ordering', () => {
    expect(validatePriorityRanking([...PRIORITY_FACTORS])).toEqual([
      ...PRIORITY_FACTORS,
    ]);
  });

  it('rejects an empty list', () => {
    expect(() => validatePriorityRanking([])).toThrow(RankingError);
  });

  it('rejects unrecognised entries', () => {
    expect(() =>
      validatePriorityRanking([
        'salary',
        'growth',
        'balance',
        'brand',
        'purpose',
        'money', // not a canonical factor
      ]),
    ).toThrow(RankingError);
  });

  it('rejects a list with a duplicate and a missing factor', () => {
    expect(() =>
      validatePriorityRanking([
        'salary',
        'salary',
        'growth',
        'balance',
        'brand',
        'purpose',
      ]),
    ).toThrow(RankingError);
  });
});
