/**
 * Property-based and unit tests for onboarding versioning source-of-truth.
 *
 * Feature: worksignal, Property 4: Onboarding edits are the source of truth
 * Validates: Requirements 5.4, 5.5
 *
 * Property 4 states that the most recently saved onboarding version is the
 * source of truth for all subsequent agent evaluations and Pre_Filter
 * filtering. Concretely: given an arbitrary sequence of saves — each stamped
 * with a strictly increasing `onboarding_version` via `stampOnSave` —
 * `selectSourceOfTruth` always returns the most recently saved version
 * (highest `onboarding_version`, ties broken by latest `updated_at`) and never
 * an earlier one, regardless of the order the saved versions are presented in.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type {
  CareerStage,
  EmploymentType,
  OnboardingState,
  PriorityFactor,
  ResidencyStatus,
  WorkArrangement,
} from '@worksignal/shared';
import { PRIORITY_FACTORS } from '@worksignal/shared';
import {
  compareByRecency,
  selectSourceOfTruth,
  stampOnSave,
  type OnboardingContent,
} from './versioning.js';

/** Minimum fast-check iterations required by the spec for property tests. */
const NUM_RUNS = 200;

const careerStageArb = fc.constantFrom<CareerStage>(
  'fresh_grad',
  'early_career',
  'mid_career',
  'senior',
  'career_switcher',
);

const residencyArb = fc.constantFrom<ResidencyStatus>(
  'citizen',
  'pr',
  'ep_holder',
  'need_sponsorship',
);

const workArrangementArb = fc.constantFrom<WorkArrangement>(
  'any',
  'hybrid_remote',
  'fully_remote',
);

const employmentTypesArb = fc.uniqueArray(
  fc.constantFrom<EmploymentType>('full_time', 'contract', 'part_time'),
  { minLength: 1, maxLength: 3 },
);

/** A valid permutation of the six canonical priority factors. */
const priorityRankingArb: fc.Arbitrary<PriorityFactor[]> = fc.constant(
  [...PRIORITY_FACTORS] as PriorityFactor[],
).chain((factors) =>
  fc.shuffledSubarray(factors, {
    minLength: factors.length,
    maxLength: factors.length,
  }),
);

/**
 * Generates arbitrary editable onboarding content (everything a user submits
 * on save, before version/timestamp stamping). The exact field values are
 * irrelevant to source-of-truth selection — only the stamped recency metadata
 * matters — but varying them ensures distinct content per save.
 */
const onboardingContentArb: fc.Arbitrary<OnboardingContent> = fc.record({
  career_stage: careerStageArb,
  residency_status: residencyArb,
  target_roles: fc.array(fc.string(), { maxLength: 4 }),
  target_industries: fc.array(fc.string(), { maxLength: 4 }),
  dream_companies: fc.array(fc.string(), { maxLength: 4 }),
  priority_ranking: priorityRankingArb,
  non_negotiables: fc.record({
    min_salary: fc.integer({ min: 1, max: 30000 }),
    employment_type: employmentTypesArb,
    work_arrangement: workArrangementArb,
    custom: fc.array(fc.string(), { maxLength: 3 }),
    ep_sponsorship_required: fc.boolean(),
  }),
});

describe('selectSourceOfTruth — onboarding source of truth', () => {
  it('Feature: worksignal, Property 4: Onboarding edits are the source of truth [Validates: Requirements 5.4, 5.5]', () => {
    fc.assert(
      fc.property(
        // A non-empty sequence of saves, each with its own content and a
        // monotonically advancing timestamp (millisecond gaps).
        fc.array(
          fc.record({
            content: onboardingContentArb,
            gapMs: fc.integer({ min: 1, max: 86_400_000 }),
          }),
          { minLength: 1, maxLength: 25 },
        ),
        // A base epoch for the first save's timestamp.
        fc.integer({ min: 0, max: 1_000_000_000_000 }),
        // An arbitrary permutation used to shuffle the saved set before reading.
        fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { maxLength: 25 }),
        (saves, baseEpoch, shuffleKeys) => {
          // Simulate the save sequence exactly as the Onboarding_Service would:
          // each save stamps an incremented version off the previous one.
          const saved: OnboardingState[] = [];
          let previousVersion: number | undefined;
          let clock = baseEpoch;
          for (const save of saves) {
            const stamped = stampOnSave(save.content, previousVersion, {
              now: new Date(clock).toISOString(),
            });
            saved.push(stamped);
            previousVersion = stamped.onboarding_version;
            clock += save.gapMs;
          }

          // The most recently saved version is, by construction, the last one
          // pushed (it carries the highest version stamp).
          const mostRecentlySaved = saved[saved.length - 1];

          // Reading the source of truth must be independent of presentation
          // order, so shuffle the set deterministically before selecting.
          const shuffled = saved
            .map((version, index) => ({
              version,
              key: shuffleKeys[index] ?? index,
            }))
            .sort((a, b) => a.key - b.key)
            .map((entry) => entry.version);

          const selected = selectSourceOfTruth(shuffled);

          // It returns the most recently saved version...
          expect(selected).toEqual(mostRecentlySaved);
          // ...which has the highest version of all saved states...
          const maxVersion = Math.max(
            ...saved.map((v) => v.onboarding_version),
          );
          expect(selected?.onboarding_version).toBe(maxVersion);
          // ...and is never strictly earlier than any saved version.
          for (const version of saved) {
            expect(compareByRecency(selected!, version)).toBeGreaterThanOrEqual(
              0,
            );
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('Feature: worksignal, Property 4: ties on version are broken by the latest updated_at', () => {
    fc.assert(
      fc.property(
        onboardingContentArb,
        fc.integer({ min: 1, max: 100 }),
        // Distinct timestamps (ms offsets) sharing the same version stamp.
        fc.uniqueArray(fc.integer({ min: 0, max: 10_000_000 }), {
          minLength: 2,
          maxLength: 10,
        }),
        (content, version, offsets) => {
          const versions: OnboardingState[] = offsets.map((offset) => ({
            ...content,
            onboarding_version: version,
            updated_at: new Date(offset).toISOString(),
          }));
          const latestOffset = Math.max(...offsets);
          const selected = selectSourceOfTruth(versions);
          expect(selected?.updated_at).toBe(new Date(latestOffset).toISOString());
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // --- Unit tests: concrete examples and edge cases ---

  it('returns undefined for an empty set of saved versions', () => {
    expect(selectSourceOfTruth([])).toBeUndefined();
  });

  it('returns the only version when a single save exists', () => {
    const only = stampOnSave(
      {
        career_stage: 'fresh_grad',
        residency_status: 'citizen',
        target_roles: ['engineer'],
        target_industries: ['tech'],
        dream_companies: ['acme'],
        priority_ranking: [...PRIORITY_FACTORS],
        non_negotiables: {
          min_salary: 5000,
          employment_type: ['full_time'],
          work_arrangement: 'any',
          custom: [],
          ep_sponsorship_required: false,
        },
      },
      undefined,
      { now: '2024-01-01T00:00:00.000Z' },
    );
    expect(selectSourceOfTruth([only])).toEqual(only);
  });

  it('picks the highest-version save regardless of input order', () => {
    const base: OnboardingContent = {
      career_stage: 'early_career',
      residency_status: 'pr',
      target_roles: [],
      target_industries: [],
      dream_companies: [],
      priority_ranking: [...PRIORITY_FACTORS],
      non_negotiables: {
        min_salary: 6000,
        employment_type: ['full_time'],
        work_arrangement: 'hybrid_remote',
        custom: [],
        ep_sponsorship_required: false,
      },
    };
    const v1 = stampOnSave(base, undefined, { now: '2024-01-01T00:00:00.000Z' });
    const v2 = stampOnSave(base, v1.onboarding_version, {
      now: '2024-01-02T00:00:00.000Z',
    });
    const v3 = stampOnSave(base, v2.onboarding_version, {
      now: '2024-01-03T00:00:00.000Z',
    });
    expect(selectSourceOfTruth([v2, v3, v1])).toEqual(v3);
    expect(selectSourceOfTruth([v3, v1, v2])).toEqual(v3);
  });
});
