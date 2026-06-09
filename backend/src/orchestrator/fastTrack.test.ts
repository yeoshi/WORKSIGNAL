/**
 * Property test for Debate_Engine **fast-track ordering** (Req 13.5).
 *
 * Feature: worksignal, Property 12: Fast-track ordering for act_now.
 *
 * Validates: Requirements 13.5.
 *
 * For any resolved debate in which the Opportunity_Agent verdict is `act_now`
 * AND at least two of the *other three* agents (Ambition / Realism / Risk) are
 * apply-equivalent, the queued application is fast-tracked and ordered at the
 * **top** of the user's review queue. Two facets are exercised:
 *
 *   (a) Predicate — `isFastTracked` is true *iff* Opportunity === `act_now` and
 *       at least two of the other three agents are apply-equivalent. Equivalent
 *       to: `queuePlacementFor` returns `'top'` under exactly the same
 *       condition.
 *   (b) Ordering  — `orderReviewQueue` hoists every fast-tracked item ahead of
 *       every non-fast-tracked item, and is **stable**: within each group the
 *       original relative order is preserved.
 *
 * Generators toggle each agent's apply-equivalence independently and vary the
 * Opportunity verdict across all three values, deliberately exercising the
 * boundary of *exactly two* other apply-equivalent agents (the minimum that
 * qualifies). The single-source-of-truth apply-equivalent mapping is reused
 * from {@link ./decisionTree.ts} so the test cannot drift from production.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type {
  AmbitionVerdict,
  OpportunityVerdict,
  RealismVerdict,
  RiskVerdict,
  VerdictSet,
} from '@worksignal/shared';
import {
  isAmbitionApplyEquivalent,
  isRealismApplyEquivalent,
  isRiskApplyEquivalent,
} from './decisionTree.js';
import {
  FAST_TRACK_MIN_OTHER_APPLY_EQUIVALENT,
  FAST_TRACK_OPPORTUNITY_VERDICT,
  isFastTracked,
  orderReviewQueue,
  otherApplyEquivalentCount,
  queuePlacementFor,
  type ReviewQueueItem,
} from './fastTrack.js';

const NUM_RUNS = 300;

/* --- Building-block arbitraries ------------------------------------------ */

const score = fc.integer({ min: 0, max: 100 });
const text = fc.string();
const textArray = fc.array(fc.string(), { maxLength: 4 });

const redFlag = fc.record({
  flag: fc.string(),
  source: fc.string(),
  severity: fc.constantFrom('high', 'medium', 'low') as fc.Arbitrary<
    'high' | 'medium' | 'low'
  >,
});

function ambitionArb(verdict: AmbitionVerdict['verdict']): fc.Arbitrary<AmbitionVerdict> {
  return fc.record({
    verdict: fc.constant(verdict),
    ambition_score: score,
    reasoning: text,
    key_argument: text,
  });
}

function realismArb(verdict: RealismVerdict['verdict']): fc.Arbitrary<RealismVerdict> {
  return fc.record({
    verdict: fc.constant(verdict),
    match_score: score,
    key_gaps: textArray,
    work_life_flags: textArray,
    reasoning: text,
    key_argument: text,
  });
}

function riskArb(verdict: RiskVerdict['verdict']): fc.Arbitrary<RiskVerdict> {
  return fc.record({
    verdict: fc.constant(verdict),
    risk_score: score,
    red_flags: fc.array(redFlag, { maxLength: 3 }),
    glassdoor_score: fc.option(score, { nil: null }),
    reasoning: text,
    key_argument: text,
  });
}

function opportunityArb(
  verdict: OpportunityVerdict['verdict'],
): fc.Arbitrary<OpportunityVerdict> {
  return fc.record({
    verdict: fc.constant(verdict),
    urgency_score: score,
    timing_factors: textArray,
    reasoning: text,
    key_argument: text,
  });
}

/* --- Apply-equivalence-controlled per-agent arbitraries ------------------ */
//
// Apply-equivalent mapping (design §Apply-equivalent mapping), reused via the
// decisionTree helpers below so the test stays in lock-step with production:
//   Ambition    apply-eq: 'apply'                 | not: 'skip'
//   Realism     apply-eq: 'apply'                 | not: 'skip' | 'caution'
//   Risk        apply-eq: 'safe'                  | not: 'caution' | 'avoid'
//   Opportunity verdict varies across act_now | monitor | no_advantage

const ambitionApply = ambitionArb('apply');
const ambitionNot = ambitionArb('skip');

const realismApply = realismArb('apply');
const realismNot = fc.oneof(realismArb('skip'), realismArb('caution'));

const riskApply = riskArb('safe');
const riskNot = fc.oneof(riskArb('caution'), riskArb('avoid'));

const anyOpportunity = fc
  .constantFrom<OpportunityVerdict['verdict']>('act_now', 'monitor', 'no_advantage')
  .chain(opportunityArb);

/**
 * Build a full verdict set with each of the other-three agents' apply-equivalence
 * fixed by flags, and an explicit Opportunity verdict. Also returns the intended
 * other-apply-equivalent count for assertions.
 */
function controlledSet(flags: {
  ambition: boolean;
  realism: boolean;
  risk: boolean;
  opportunity: OpportunityVerdict['verdict'];
}): fc.Arbitrary<{ verdicts: VerdictSet; otherCount: number }> {
  return fc
    .record({
      ambition: flags.ambition ? ambitionApply : ambitionNot,
      realism: flags.realism ? realismApply : realismNot,
      risk: flags.risk ? riskApply : riskNot,
      opportunity: opportunityArb(flags.opportunity),
    })
    .map((verdicts) => ({
      verdicts,
      otherCount: [flags.ambition, flags.realism, flags.risk].filter(Boolean).length,
    }));
}

/** A controlled case: toggle each other agent + vary Opportunity, with its count. */
const controlledCase = fc
  .record({
    a: fc.boolean(),
    r: fc.boolean(),
    k: fc.boolean(),
    o: fc.constantFrom<OpportunityVerdict['verdict']>(
      'act_now',
      'monitor',
      'no_advantage',
    ),
  })
  .chain(({ a, r, k, o }) =>
    controlledSet({ ambition: a, realism: r, risk: k, opportunity: o }),
  );

/** A fully arbitrary verdict set (any value, each agent independently optional). */
const anyVerdictSet: fc.Arbitrary<VerdictSet> = fc.record({
  ambition: fc.option(fc.oneof(ambitionApply, ambitionNot), { nil: undefined }),
  realism: fc.option(fc.oneof(realismApply, realismNot), { nil: undefined }),
  risk: fc.option(fc.oneof(riskApply, riskNot), { nil: undefined }),
  opportunity: fc.option(anyOpportunity, { nil: undefined }),
});

/** Independent reference oracle for the fast-track condition. */
function expectedFastTracked(verdicts: VerdictSet): boolean {
  if (verdicts.opportunity?.verdict !== 'act_now') {
    return false;
  }
  let others = 0;
  if (verdicts.ambition && isAmbitionApplyEquivalent(verdicts.ambition)) others += 1;
  if (verdicts.realism && isRealismApplyEquivalent(verdicts.realism)) others += 1;
  if (verdicts.risk && isRiskApplyEquivalent(verdicts.risk)) others += 1;
  return others >= FAST_TRACK_MIN_OTHER_APPLY_EQUIVALENT;
}

describe('Feature: worksignal, Property 12: Fast-track ordering for act_now', () => {
  // (a) Predicate — isFastTracked is true iff act_now AND >= 2 others apply-equiv.
  it('is fast-tracked iff Opportunity is act_now and >=2 other agents are apply-equivalent', () => {
    const boundaryCounts = new Set<number>();
    fc.assert(
      fc.property(controlledCase, ({ verdicts, otherCount }) => {
        // The constructed set realises the intended other-apply-equivalent count.
        expect(otherApplyEquivalentCount(verdicts)).toBe(otherCount);

        const isActNow = verdicts.opportunity?.verdict === FAST_TRACK_OPPORTUNITY_VERDICT;
        const expected = isActNow && otherCount >= FAST_TRACK_MIN_OTHER_APPLY_EQUIVALENT;

        expect(isFastTracked(verdicts)).toBe(expected);
        // queuePlacementFor agrees with the predicate.
        expect(queuePlacementFor(verdicts)).toBe(expected ? 'top' : 'normal');

        if (isActNow) {
          boundaryCounts.add(otherCount);
        }
      }),
      { numRuns: NUM_RUNS },
    );

    // Generators must exercise the boundary: act_now cases at every other-count
    // 0..3, including exactly 2 (the minimum that qualifies) and 1 (just below).
    expect([...boundaryCounts].sort((x, y) => x - y)).toEqual([0, 1, 2, 3]);
  });

  // (a') Cross-check against an independent oracle over fully arbitrary sets.
  it('matches an independent oracle for arbitrary verdict sets', () => {
    fc.assert(
      fc.property(anyVerdictSet, (verdicts) => {
        expect(isFastTracked(verdicts)).toBe(expectedFastTracked(verdicts));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // (b) Ordering — fast-tracked items are hoisted to the top, stably.
  it('orders all fast-tracked items at the top while preserving relative order', () => {
    const itemArb: fc.Arbitrary<ReviewQueueItem<number>> = fc
      .tuple(fc.integer(), anyVerdictSet)
      .map(([item, verdicts]) => ({ item, verdicts }));

    fc.assert(
      fc.property(fc.array(itemArb, { maxLength: 12 }), (items) => {
        // Tag each entry with a unique id so we can track relative order even
        // when payload values collide.
        const tagged = items.map((entry, index) => ({
          item: index,
          verdicts: entry.verdicts,
        }));

        const ordered = orderReviewQueue(tagged);

        // Same multiset of items (a pure permutation).
        expect([...ordered].sort((x, y) => x - y)).toEqual(
          tagged.map((t) => t.item).sort((x, y) => x - y),
        );

        const fastIds = tagged.filter((t) => isFastTracked(t.verdicts)).map((t) => t.item);
        const normalIds = tagged
          .filter((t) => !isFastTracked(t.verdicts))
          .map((t) => t.item);

        // All fast-tracked items come first, then all normal items.
        expect(ordered).toEqual([...fastIds, ...normalIds]);

        // Partition boundary: every prefix item is fast-tracked, every suffix
        // item is not.
        for (let i = 0; i < ordered.length; i += 1) {
          const verdicts = tagged[ordered[i] as number]!.verdicts;
          if (i < fastIds.length) {
            expect(isFastTracked(verdicts)).toBe(true);
          } else {
            expect(isFastTracked(verdicts)).toBe(false);
          }
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
