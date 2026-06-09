/**
 * Property-based and unit tests for the Growth_Agent distinct-job trigger
 * (Task 8.2).
 *
 * Feature: worksignal, Property 16: Growth_Agent triggers on three distinct jobs
 *
 * Validates: Requirements 19.1
 *
 * Requirement 19.1: "WHEN the Realism_Agent flags the same skill gap for a User
 * across three or more distinct jobs, THE Growth_Agent SHALL be triggered for
 * that skill gap."
 *
 * Property 16: for ANY sequence of skill-gap flags — including sequences that
 * repeatedly flag the SAME job id — the Growth_Agent is triggered iff the
 * number of DISTINCT flagged job ids is at least the threshold (3). Repeated
 * flags of the same job collapse to a single distinct job, so flagging one job
 * any number of times never on its own triggers the agent.
 *
 * The generators deliberately include arrays with repeated job ids: one
 * generator draws ids from a small alphabet (forcing frequent collisions) and
 * another explicitly duplicates a drawn list. The test runs a minimum of 100
 * iterations.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  GROWTH_TRIGGER_DISTINCT_JOB_THRESHOLD,
  countDistinctFlaggedJobs,
  shouldTriggerGrowthAgent,
} from './trigger.js';

/**
 * Job ids drawn from a small alphabet so that arrays frequently contain
 * duplicate ids (repeated flags of the same job).
 */
const smallAlphabetIdArb = fc.constantFrom('j1', 'j2', 'j3', 'j4', 'j5');

/**
 * Arbitrary list of flagged job ids that frequently contains duplicates,
 * because ids are drawn from a small pool.
 */
const collisionProneListArb = fc.array(smallAlphabetIdArb, { maxLength: 20 });

/**
 * A list built by duplicating each id from a base list, guaranteeing repeated
 * flags of the same job ids while keeping the distinct-count equal to the
 * base list's distinct count.
 */
const duplicatedListArb = fc
  .array(smallAlphabetIdArb, { maxLength: 10 })
  .map((ids) => ids.flatMap((id) => [id, id, id]));

/** A general list over arbitrary strings (broad coverage of the input space). */
const generalListArb = fc.array(fc.string(), { maxLength: 20 });

const anyListArb = fc.oneof(
  collisionProneListArb,
  duplicatedListArb,
  generalListArb,
);

describe('Feature: worksignal, Property 16: Growth_Agent triggers on three distinct jobs', () => {
  it('triggers iff the number of DISTINCT flagged job ids is >= the threshold [Validates: Requirements 19.1]', () => {
    fc.assert(
      fc.property(anyListArb, (flaggedJobIds) => {
        const distinct = new Set(flaggedJobIds).size;
        const expected = distinct >= GROWTH_TRIGGER_DISTINCT_JOB_THRESHOLD;
        expect(shouldTriggerGrowthAgent(flaggedJobIds)).toBe(expected);
      }),
      { numRuns: 200 },
    );
  });

  it('repeated flags of the same job count exactly once (duplicates never inflate the trigger) [Validates: Requirements 19.1]', () => {
    fc.assert(
      fc.property(
        fc.array(smallAlphabetIdArb, { maxLength: 10 }),
        fc.integer({ min: 1, max: 8 }),
        (baseIds, repeats) => {
          // Repeat the whole list `repeats` times: distinct count is unchanged.
          const repeated: string[] = [];
          for (let i = 0; i < repeats; i += 1) repeated.push(...baseIds);

          expect(countDistinctFlaggedJobs(repeated)).toBe(
            new Set(baseIds).size,
          );
          expect(shouldTriggerGrowthAgent(repeated)).toBe(
            shouldTriggerGrowthAgent(baseIds),
          );
        },
      ),
      { numRuns: 200 },
    );
  });

  it('a single job flagged many times never triggers the agent [Validates: Requirements 19.1]', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.integer({ min: 1, max: 100 }),
        (jobId, times) => {
          const flags = Array.from({ length: times }, () => jobId);
          expect(shouldTriggerGrowthAgent(flags)).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// --- Unit tests (boundary / examples) ---------------------------------------

describe('shouldTriggerGrowthAgent — boundary examples', () => {
  it('does not trigger on an empty flag list', () => {
    expect(shouldTriggerGrowthAgent([])).toBe(false);
  });

  it('does not trigger on two distinct jobs', () => {
    expect(shouldTriggerGrowthAgent(['a', 'b'])).toBe(false);
  });

  it('does not trigger on two distinct jobs even with duplicates', () => {
    expect(shouldTriggerGrowthAgent(['a', 'a', 'b', 'b', 'a'])).toBe(false);
  });

  it('triggers on exactly three distinct jobs (boundary)', () => {
    expect(shouldTriggerGrowthAgent(['a', 'b', 'c'])).toBe(true);
  });

  it('triggers on three distinct jobs amid many duplicates', () => {
    expect(
      shouldTriggerGrowthAgent(['a', 'a', 'b', 'c', 'c', 'c', 'b']),
    ).toBe(true);
  });

  it('triggers on more than three distinct jobs', () => {
    expect(shouldTriggerGrowthAgent(['a', 'b', 'c', 'd', 'e'])).toBe(true);
  });
});

describe('countDistinctFlaggedJobs', () => {
  it('returns 0 for an empty iterable', () => {
    expect(countDistinctFlaggedJobs([])).toBe(0);
  });

  it('counts distinct ids, collapsing duplicates', () => {
    expect(countDistinctFlaggedJobs(['a', 'a', 'b', 'a', 'b'])).toBe(2);
  });
});
