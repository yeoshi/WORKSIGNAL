/**
 * Property test for the Master Orchestrator decision tree's **totality and
 * determinism** (safety-critical).
 *
 * Feature: worksignal, Property 10: Decision is a total, deterministic function
 * of the apply-equivalent count.
 *
 * Validates: Requirements 12.2, 12.3, 12.4, 12.5.
 *
 * Three properties are exercised:
 *   (a) Determinism  — the same verdicts always resolve to the same decision
 *       (resolving twice yields deep-equal results), with no hidden state.
 *   (b) Totality     — every generated verdict set resolves to exactly one
 *       valid Decision value.
 *   (c) Count mapping — when Risk is NOT `avoid`, the decision matches the
 *       apply-equivalent count `n`:
 *           n == 4 → apply_consensus
 *           n == 3 → apply_with_caveat
 *           n == 2 → deadlock_escalate
 *           n <= 1 → skip_consensus
 *
 * Generators exercise apply-equivalent counts at every value 0,1,2,3,4.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type {
  AmbitionVerdict,
  Decision,
  OpportunityVerdict,
  RealismVerdict,
  RiskVerdict,
  VerdictSet,
} from '@worksignal/shared';
import {
  applyEquivalentCount,
  isVetoed,
  resolveDecision,
  resolveDecisionClass,
} from './decisionTree.js';

const NUM_RUNS = 200;

/** The complete, closed set of valid Decision values (Req 12.1-12.5). */
const ALL_DECISIONS: readonly Decision[] = [
  'apply_consensus',
  'apply_with_caveat',
  'skip_consensus',
  'deadlock_escalate',
  'veto_skip',
] as const;

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

/* --- Apply-equivalent-controlled arbitraries ----------------------------- */
//
// Per the single-source-of-truth mapping (design §Apply-equivalent mapping):
//   Ambition    apply-eq: 'apply'                 | not: 'skip'
//   Realism     apply-eq: 'apply'                 | not: 'skip' | 'caution'
//   Risk        apply-eq: 'safe'                  | not (non-veto): 'caution'
//   Opportunity apply-eq: 'act_now' | 'monitor'   | not: 'no_advantage'

const ambitionApply = ambitionArb('apply');
const ambitionNot = ambitionArb('skip');

const realismApply = realismArb('apply');
const realismNot = fc.oneof(realismArb('skip'), realismArb('caution'));

/** Risk apply-equivalent (`safe`). */
const riskApply = riskArb('safe');
/** Risk NOT apply-equivalent but NOT the veto (`caution`). */
const riskNotNonVeto = riskArb('caution');

const opportunityApply = fc.oneof(opportunityArb('act_now'), opportunityArb('monitor'));
const opportunityNot = opportunityArb('no_advantage');

/** Build a full, non-vetoed verdict set where each agent's apply-equivalence is fixed. */
function controlledNonVetoSet(flags: {
  ambition: boolean;
  realism: boolean;
  risk: boolean;
  opportunity: boolean;
}): fc.Arbitrary<VerdictSet> {
  return fc.record({
    ambition: flags.ambition ? ambitionApply : ambitionNot,
    realism: flags.realism ? realismApply : realismNot,
    risk: flags.risk ? riskApply : riskNotNonVeto,
    opportunity: flags.opportunity ? opportunityApply : opportunityNot,
  });
}

/* --- Fully arbitrary verdict arbitraries (any value, possibly missing) --- */

const anyAmbition = fc.constantFrom<AmbitionVerdict['verdict']>('apply', 'skip').chain(
  ambitionArb,
);
const anyRealism = fc
  .constantFrom<RealismVerdict['verdict']>('apply', 'skip', 'caution')
  .chain(realismArb);
const anyRisk = fc
  .constantFrom<RiskVerdict['verdict']>('safe', 'caution', 'avoid')
  .chain(riskArb);
const anyOpportunity = fc
  .constantFrom<OpportunityVerdict['verdict']>('act_now', 'monitor', 'no_advantage')
  .chain(opportunityArb);

/** Any verdict set: each agent independently present-or-absent with any value. */
const anyVerdictSet: fc.Arbitrary<VerdictSet> = fc.record({
  ambition: fc.option(anyAmbition, { nil: undefined }),
  realism: fc.option(anyRealism, { nil: undefined }),
  risk: fc.option(anyRisk, { nil: undefined }),
  opportunity: fc.option(anyOpportunity, { nil: undefined }),
});

/** The expected decision class from a non-vetoed apply-equivalent count. */
function expectedFromCount(n: number): Decision {
  if (n === 4) return 'apply_consensus';
  if (n === 3) return 'apply_with_caveat';
  if (n === 2) return 'deadlock_escalate';
  return 'skip_consensus';
}

describe('Feature: worksignal, Property 10: decision-tree totality and determinism', () => {
  // (a) Determinism — same verdicts always produce the same decision.
  it('is deterministic: resolving the same verdicts twice yields identical results', () => {
    fc.assert(
      fc.property(anyVerdictSet, (verdicts) => {
        const first = resolveDecision(verdicts);
        const second = resolveDecision(verdicts);
        expect(second).toEqual(first);

        // The decision class alone is likewise stable.
        expect(resolveDecisionClass(verdicts)).toBe(resolveDecisionClass(verdicts));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // (b) Totality — every verdict set resolves to exactly one valid Decision.
  it('is total: every verdict set yields exactly one valid Decision', () => {
    fc.assert(
      fc.property(anyVerdictSet, (verdicts) => {
        const decision = resolveDecisionClass(verdicts);
        // Exactly one valid value: a single membership in the closed set.
        const matches = ALL_DECISIONS.filter((d) => d === decision);
        expect(matches).toHaveLength(1);
        // The full MasterDecision also carries that same single decision.
        expect(resolveDecision(verdicts).decision).toBe(decision);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // (c) Count mapping — when Risk is NOT avoid, the decision matches the
  // apply-equivalent count. Generators here exercise counts 0-4 by toggling
  // each agent's apply-equivalence independently.
  it('maps the apply-equivalent count to the decision when Risk is not avoid', () => {
    // Each case carries a controlled verdict set plus its intended count.
    const countMappingCase = fc
      .record({
        a: fc.boolean(),
        r: fc.boolean(),
        k: fc.boolean(),
        o: fc.boolean(),
      })
      .chain(({ a, r, k, o }) =>
        controlledNonVetoSet({
          ambition: a,
          realism: r,
          risk: k,
          opportunity: o,
        }).map((verdicts) => ({
          verdicts,
          expectedCount: [a, r, k, o].filter(Boolean).length,
        })),
      );

    const countsSeen = new Set<number>();
    fc.assert(
      fc.property(countMappingCase, ({ verdicts, expectedCount }) => {
        // The constructed set is genuinely non-vetoed (Risk never `avoid`).
        expect(isVetoed(verdicts)).toBe(false);
        // The set realises the intended apply-equivalent count.
        expect(applyEquivalentCount(verdicts)).toBe(expectedCount);
        // The decision matches the count mapping (Req 12.2-12.5).
        expect(resolveDecisionClass(verdicts)).toBe(expectedFromCount(expectedCount));
        countsSeen.add(expectedCount);
      }),
      { numRuns: NUM_RUNS },
    );

    // Generators must exercise apply-equivalent counts at every value 0-4.
    expect([...countsSeen].sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4]);
  });
});
