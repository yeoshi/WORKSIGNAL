/**
 * Property-based and unit tests for the Growth roadmap structure
 * builder/validator (task 8.4, Req 19.3).
 *
 * Feature: worksignal, Property 17: Growth roadmap structure is well-formed
 *
 * Validates: Requirements 19.3
 *
 * Requirement 19.3: "WHEN the Growth_Agent completes research for a skill gap,
 * THE Growth_Agent SHALL produce a four-week roadmap in which each week
 * specifies an action, a resource URL, a cost, a time estimate, and a resource
 * type."
 *
 * Property 17 (from the design's Correctness Properties): *for any* roadmap the
 * Growth_Agent produces, it contains exactly four weekly entries and each entry
 * specifies an action, a resource URL, a cost, a time estimate, and a resource
 * type.
 *
 * The property is exercised from both directions:
 *  (a) `buildRoadmap` with arbitrary VALID week inputs always produces a
 *      well-formed roadmap (exactly four weeks numbered 1–4, each with all
 *      required fields and a valid resource type), and `isWellFormedRoadmap`
 *      accepts it.
 *  (b) `isWellFormedRoadmap` correctly REJECTS malformed roadmaps — wrong week
 *      count, missing/empty fields, non-positive time estimates, bad resource
 *      types, and week numbers that do not cover 1–4.
 *
 * All property tests run a minimum of 100 iterations.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { RoadmapResourceType, RoadmapWeek, SkillGapRoadmap } from '@worksignal/shared';
import {
  ROADMAP_RESOURCE_TYPES,
  ROADMAP_WEEK_COUNT,
  ROADMAP_WEEK_NUMBERS,
  buildRoadmap,
  isWellFormedRoadmap,
  type RoadmapWeekInput,
} from './roadmap.js';

const NUM_RUNS = 100;

/* --- Generators ----------------------------------------------------------- */

/** A non-empty (after trimming) string, for action/resource_url/cost fields. */
const nonEmptyStringArb = fc
  .string({ minLength: 1, maxLength: 60 })
  .filter((s) => s.trim().length > 0);

/** A finite, strictly-positive time estimate (in hours). */
const positiveHoursArb = fc
  .double({ min: 0, max: 200, noNaN: true })
  .filter((n) => Number.isFinite(n) && n > 0);

/** A valid resource type drawn from the allowed set. */
const resourceTypeArb: fc.Arbitrary<RoadmapResourceType> = fc.constantFrom(
  ...ROADMAP_RESOURCE_TYPES,
);

/** A single valid week input (the builder assigns the `week` number). */
const weekInputArb: fc.Arbitrary<RoadmapWeekInput> = fc.record({
  action: nonEmptyStringArb,
  resource_url: nonEmptyStringArb,
  cost: nonEmptyStringArb,
  time_hours: positiveHoursArb,
  type: resourceTypeArb,
});

/** Exactly four valid week inputs. */
const fourWeekInputsArb = fc.array(weekInputArb, {
  minLength: ROADMAP_WEEK_COUNT,
  maxLength: ROADMAP_WEEK_COUNT,
});

/** A complete, valid build input. */
const buildInputArb = fc.record({
  weeks: fourWeekInputsArb,
  projected_match_improvement: nonEmptyStringArb,
});

/** A standalone well-formed week with an explicit week number. */
function wellFormedWeek(week: number): RoadmapWeek {
  return {
    week,
    action: 'Complete an intro course',
    resource_url: 'https://example.com/course',
    cost: 'Free',
    time_hours: 5,
    type: 'course',
  };
}

/** A baseline well-formed roadmap, used as the basis for mutation. */
function wellFormedRoadmap(): SkillGapRoadmap {
  return {
    weeks: ROADMAP_WEEK_NUMBERS.map((n) => wellFormedWeek(n)),
    projected_match_improvement: '74% -> 89%',
    networking_opportunities: [],
  };
}

/* --- Property 17 ---------------------------------------------------------- */

describe('Feature: worksignal, Property 17: Growth roadmap structure is well-formed', () => {
  // (a) buildRoadmap with valid inputs ALWAYS produces a well-formed roadmap.
  it('buildRoadmap with valid inputs always produces a well-formed four-week roadmap [Validates: Requirements 19.3]', () => {
    fc.assert(
      fc.property(buildInputArb, (input) => {
        const roadmap = buildRoadmap(input);

        // Exactly four weeks.
        expect(roadmap.weeks).toHaveLength(ROADMAP_WEEK_COUNT);

        // Week numbers are exactly {1, 2, 3, 4}.
        expect(roadmap.weeks.map((w) => w.week)).toEqual([...ROADMAP_WEEK_NUMBERS]);

        // Each week specifies every required field with valid values.
        for (const w of roadmap.weeks) {
          expect(typeof w.action).toBe('string');
          expect(w.action.trim().length).toBeGreaterThan(0);
          expect(w.resource_url.trim().length).toBeGreaterThan(0);
          expect(w.cost.trim().length).toBeGreaterThan(0);
          expect(Number.isFinite(w.time_hours)).toBe(true);
          expect(w.time_hours).toBeGreaterThan(0);
          expect(ROADMAP_RESOURCE_TYPES).toContain(w.type);
        }

        // The well-formedness type guard agrees.
        expect(isWellFormedRoadmap(roadmap)).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // (b) isWellFormedRoadmap REJECTS roadmaps with the wrong week count.
  it('rejects roadmaps that do not have exactly four weeks [Validates: Requirements 19.3]', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 8 }).filter((n) => n !== ROADMAP_WEEK_COUNT),
        (count) => {
          const roadmap: SkillGapRoadmap = {
            ...wellFormedRoadmap(),
            weeks: Array.from({ length: count }, (_, i) => wellFormedWeek(i + 1)),
          };
          expect(isWellFormedRoadmap(roadmap)).toBe(false);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // (b) isWellFormedRoadmap REJECTS roadmaps with a missing/invalid field.
  it('rejects roadmaps where a week is missing a required field or has a bad type [Validates: Requirements 19.3]', () => {
    type Mutation = (week: Record<string, unknown>) => void;
    const mutationArb: fc.Arbitrary<Mutation> = fc.constantFrom<Mutation[]>(
      (w) => delete w.action,
      (w) => delete w.resource_url,
      (w) => delete w.cost,
      (w) => delete w.time_hours,
      (w) => delete w.type,
      (w) => {
        w.action = '';
      },
      (w) => {
        w.resource_url = '   ';
      },
      (w) => {
        w.cost = '';
      },
      (w) => {
        w.time_hours = 0;
      },
      (w) => {
        w.time_hours = -3;
      },
      (w) => {
        w.time_hours = Number.NaN;
      },
      (w) => {
        w.time_hours = Number.POSITIVE_INFINITY;
      },
      (w) => {
        w.type = 'not-a-real-type';
      },
      (w) => {
        w.action = 42;
      },
    );

    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: ROADMAP_WEEK_COUNT - 1 }),
        mutationArb,
        (index, mutate) => {
          const base = wellFormedRoadmap();
          const weeks = base.weeks.map((w) => ({ ...w })) as Record<string, unknown>[];
          mutate(weeks[index]!);
          const roadmap = { ...base, weeks } as unknown;
          expect(isWellFormedRoadmap(roadmap)).toBe(false);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // (b) isWellFormedRoadmap REJECTS week numbers that do not cover 1–4.
  it('rejects four-week roadmaps whose week numbers do not cover exactly {1,2,3,4} [Validates: Requirements 19.3]', () => {
    fc.assert(
      fc.property(
        // Four week numbers that are NOT a permutation of 1..4.
        fc
          .array(fc.integer({ min: 0, max: 6 }), {
            minLength: ROADMAP_WEEK_COUNT,
            maxLength: ROADMAP_WEEK_COUNT,
          })
          .filter((nums) => {
            const set = new Set(nums);
            return !(set.size === ROADMAP_WEEK_COUNT && ROADMAP_WEEK_NUMBERS.every((n) => set.has(n)));
          }),
        (weekNumbers) => {
          const roadmap: SkillGapRoadmap = {
            ...wellFormedRoadmap(),
            weeks: weekNumbers.map((n) => wellFormedWeek(n)),
          };
          expect(isWellFormedRoadmap(roadmap)).toBe(false);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

/* --- Unit tests (specific examples / edge cases) -------------------------- */

describe('isWellFormedRoadmap — unit examples', () => {
  it('accepts a canonical well-formed roadmap', () => {
    expect(isWellFormedRoadmap(wellFormedRoadmap())).toBe(true);
  });

  it('rejects non-object / null / array inputs', () => {
    expect(isWellFormedRoadmap(null)).toBe(false);
    expect(isWellFormedRoadmap(undefined)).toBe(false);
    expect(isWellFormedRoadmap('roadmap')).toBe(false);
    expect(isWellFormedRoadmap(42)).toBe(false);
    expect(isWellFormedRoadmap([])).toBe(false);
  });

  it('rejects a roadmap whose weeks field is not an array', () => {
    expect(isWellFormedRoadmap({ weeks: 'nope', projected_match_improvement: 'x' })).toBe(false);
  });

  it('rejects duplicate week numbers (e.g. 1,1,2,3)', () => {
    const roadmap: SkillGapRoadmap = {
      ...wellFormedRoadmap(),
      weeks: [wellFormedWeek(1), wellFormedWeek(1), wellFormedWeek(2), wellFormedWeek(3)],
    };
    expect(isWellFormedRoadmap(roadmap)).toBe(false);
  });
});

describe('buildRoadmap — unit examples', () => {
  const validWeekInputs: RoadmapWeekInput[] = [
    { action: 'A1', resource_url: 'https://x/1', cost: 'Free', time_hours: 3, type: 'course' },
    { action: 'A2', resource_url: 'https://x/2', cost: 'S$49', time_hours: 4, type: 'project' },
    { action: 'A3', resource_url: 'https://x/3', cost: 'Free', time_hours: 2, type: 'event' },
    {
      action: 'A4',
      resource_url: 'https://x/4',
      cost: 'S$199',
      time_hours: 6,
      type: 'certification',
    },
  ];

  it('assigns sequential week numbers 1–4 in order', () => {
    const roadmap = buildRoadmap({
      weeks: validWeekInputs,
      projected_match_improvement: '74% -> 89%',
    });
    expect(roadmap.weeks.map((w) => w.week)).toEqual([1, 2, 3, 4]);
    expect(isWellFormedRoadmap(roadmap)).toBe(true);
  });

  it('throws when not given exactly four weeks', () => {
    expect(() =>
      buildRoadmap({
        weeks: validWeekInputs.slice(0, 3),
        projected_match_improvement: 'x',
      }),
    ).toThrow();
  });

  it('throws when a week input is missing a required field', () => {
    const broken = validWeekInputs.map((w) => ({ ...w }));
    // @ts-expect-error intentionally corrupt the input for the test
    broken[2].time_hours = -1;
    expect(() =>
      buildRoadmap({ weeks: broken, projected_match_improvement: 'x' }),
    ).toThrow();
  });
});
