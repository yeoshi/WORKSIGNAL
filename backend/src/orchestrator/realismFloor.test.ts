/**
 * Property test for the Master Orchestrator's **Realism floor** confirmation
 * rule (task 5.7, Req 12.6).
 *
 * Feature: worksignal, Property 11: Low realism forces user confirmation on
 * apply decisions.
 *
 * **Validates: Requirements 12.6**
 *
 * Property statement (design §Property 11): *for any* verdict set that resolves
 * to an apply-equivalent decision (`apply_consensus` or `apply_with_caveat`),
 * if the Realism_Agent `match_score` is **below 50** then the resulting decision
 * has `user_action_required = true`; otherwise the Realism floor does NOT force
 * `user_action_required` to `true`.
 *
 * Four facets are exercised:
 *   (a) Floor forces confirmation — apply-equivalent decision + `match_score < 50`
 *       ⇒ `user_action_required === true`.
 *   (b) At/above the floor (incl. the boundary 50) — apply-equivalent decision +
 *       `match_score >= 50` ⇒ the floor does NOT force confirmation; the value
 *       is preserved from the resolved decision. The boundary value `50` does
 *       NOT trigger the floor.
 *   (c) Non-apply-equivalent decisions — the floor never forces confirmation
 *       regardless of `match_score` (even when `< 50`).
 *   (d) Boundary coverage — generators explicitly produce `match_score === 50`.
 *
 * Generators run a minimum of 100 iterations (numRuns below) and explicitly
 * include `match_score` exactly 50.
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
import { resolveDecision } from './decisionTree.js';
import { applyRealismFloor, isApplyEquivalentDecision, REALISM_FLOOR } from './realismFloor.js';

const NUM_RUNS = 200;

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

/** Realism `match_score` strictly below the floor (triggers confirmation). */
const scoreBelowFloor = fc.integer({ min: 0, max: REALISM_FLOOR - 1 });
/**
 * Realism `match_score` at or above the floor. The minimum is exactly
 * {@link REALISM_FLOOR} (50) so the boundary — which must NOT trigger — is
 * always reachable; see the dedicated boundary test for guaranteed coverage.
 */
const scoreAtOrAboveFloor = fc.integer({ min: REALISM_FLOOR, max: 100 });

function ambitionArb(verdict: AmbitionVerdict['verdict']): fc.Arbitrary<AmbitionVerdict> {
  return fc.record({
    verdict: fc.constant(verdict),
    ambition_score: score,
    reasoning: text,
    key_argument: text,
  });
}

/** Realism verdict with controllable apply-equivalence and `match_score`. */
function realismArb(
  applyEquivalent: boolean,
  matchScore: fc.Arbitrary<number>,
): fc.Arbitrary<RealismVerdict> {
  return fc.record({
    verdict: applyEquivalent
      ? fc.constant('apply')
      : (fc.constantFrom('skip', 'caution') as fc.Arbitrary<'skip' | 'caution'>),
    match_score: matchScore,
    key_gaps: textArray,
    work_life_flags: textArray,
    reasoning: text,
    key_argument: text,
  });
}

/**
 * Risk verdict with controllable apply-equivalence. When not apply-equivalent
 * it is `caution` (NOT the `avoid` veto) so the decision class is driven purely
 * by the apply-equivalent count rather than the veto.
 */
function riskNonVetoArb(applyEquivalent: boolean): fc.Arbitrary<RiskVerdict> {
  return fc.record({
    verdict: applyEquivalent ? fc.constant('safe') : fc.constant('caution'),
    risk_score: score,
    red_flags: fc.array(redFlag, { maxLength: 3 }),
    glassdoor_score: fc.option(score, { nil: null }),
    reasoning: text,
    key_argument: text,
  });
}

/** Risk verdict that triggers the absolute veto. */
const riskVetoArb: fc.Arbitrary<RiskVerdict> = fc.record({
  verdict: fc.constant('avoid') as fc.Arbitrary<'avoid'>,
  risk_score: score,
  red_flags: fc.array(redFlag, { maxLength: 3 }),
  glassdoor_score: fc.option(score, { nil: null }),
  reasoning: text,
  key_argument: text,
});

function opportunityArb(
  applyEquivalent: boolean,
): fc.Arbitrary<OpportunityVerdict> {
  return fc.record({
    verdict: applyEquivalent
      ? (fc.constantFrom('act_now', 'monitor') as fc.Arbitrary<'act_now' | 'monitor'>)
      : fc.constant('no_advantage'),
    urgency_score: score,
    timing_factors: textArray,
    reasoning: text,
    key_argument: text,
  });
}

/* --- Composite arbitraries ----------------------------------------------- */

/**
 * A full, non-vetoed verdict set that resolves to an **apply-equivalent**
 * decision (`apply_consensus` when there is no dissenter, `apply_with_caveat`
 * when exactly one agent dissents), parameterised by the Realism `match_score`.
 *
 * A single optional `dissenter` keeps the apply-equivalent count at 4 (none) or
 * 3 (one), and Risk is never `avoid`, so the resolved class is always
 * apply-equivalent. The dissenter may be Realism itself — the floor depends on
 * `match_score`, not on whether Realism is apply-equivalent.
 */
function applyEquivalentSet(matchScore: fc.Arbitrary<number>): fc.Arbitrary<VerdictSet> {
  const dissenter = fc.constantFrom('none', 'ambition', 'realism', 'risk', 'opportunity');
  return dissenter.chain((d) =>
    fc.record({
      ambition: ambitionArb(d === 'ambition' ? 'skip' : 'apply'),
      realism: realismArb(d !== 'realism', matchScore),
      risk: riskNonVetoArb(d !== 'risk'),
      opportunity: opportunityArb(d !== 'opportunity'),
    }),
  );
}

/**
 * A full verdict set that resolves to a **non-apply-equivalent** decision:
 * either a Risk `avoid` veto (`veto_skip`) or an apply-equivalent count of
 * 0, 1, or 2 (`skip_consensus` / `deadlock_escalate`). Realism `match_score`
 * is parameterised so we can drive it below the floor and confirm the floor
 * still does nothing for these decisions.
 */
function nonApplyEquivalentSet(
  matchScore: fc.Arbitrary<number>,
): fc.Arbitrary<VerdictSet> {
  // Low-count branch: toggle each agent's apply-equivalence, keep count <= 2.
  const lowCount = fc
    .record({
      a: fc.boolean(),
      r: fc.boolean(),
      k: fc.boolean(),
      o: fc.boolean(),
    })
    .filter(({ a, r, k, o }) => [a, r, k, o].filter(Boolean).length <= 2)
    .chain(({ a, r, k, o }) =>
      fc.record({
        ambition: ambitionArb(a ? 'apply' : 'skip'),
        realism: realismArb(r, matchScore),
        risk: riskNonVetoArb(k),
        opportunity: opportunityArb(o),
      }),
    );

  // Veto branch: Risk `avoid` overrides everything regardless of other agents.
  const veto = fc.record({
    ambition: fc.boolean().chain((apply) => ambitionArb(apply ? 'apply' : 'skip')),
    realism: realismArb(true, matchScore),
    risk: riskVetoArb,
    opportunity: opportunityArb(true),
  });

  return fc.oneof(lowCount, veto);
}

/* --- Properties ----------------------------------------------------------- */

describe('Feature: worksignal, Property 11: low realism forces user confirmation on apply decisions', () => {
  // (a) Below the floor on an apply-equivalent decision forces confirmation.
  it('forces user_action_required = true when match_score < 50 on an apply-equivalent decision', () => {
    fc.assert(
      fc.property(applyEquivalentSet(scoreBelowFloor), (verdicts) => {
        const resolved = resolveDecision(verdicts);
        // Precondition: the set really does resolve apply-equivalent.
        expect(isApplyEquivalentDecision(resolved.decision)).toBe(true);
        expect(verdicts.realism!.match_score).toBeLessThan(REALISM_FLOOR);

        const gated = applyRealismFloor(resolved, verdicts.realism);
        expect(gated.user_action_required).toBe(true);
        // The decision class itself is untouched by the floor.
        expect(gated.decision).toBe(resolved.decision);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // (b) At/above the floor (including exactly 50) does NOT force confirmation.
  it('does not force confirmation when match_score >= 50 on an apply-equivalent decision', () => {
    fc.assert(
      fc.property(applyEquivalentSet(scoreAtOrAboveFloor), (verdicts) => {
        const resolved = resolveDecision(verdicts);
        expect(isApplyEquivalentDecision(resolved.decision)).toBe(true);
        expect(verdicts.realism!.match_score).toBeGreaterThanOrEqual(REALISM_FLOOR);

        const gated = applyRealismFloor(resolved, verdicts.realism);
        // The floor is a no-op here: the value is preserved from resolution.
        expect(gated.user_action_required).toBe(resolved.user_action_required);
        expect(gated.user_action_required).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // (c) Non-apply-equivalent decisions are never forced, even below the floor.
  it('never forces confirmation for non-apply-equivalent decisions, even when match_score < 50', () => {
    fc.assert(
      fc.property(nonApplyEquivalentSet(score), (verdicts) => {
        const resolved = resolveDecision(verdicts);
        // Precondition: NOT apply-equivalent.
        expect(isApplyEquivalentDecision(resolved.decision)).toBe(false);

        const gated = applyRealismFloor(resolved, verdicts.realism);
        // Floor leaves user_action_required exactly as resolved (false).
        expect(gated.user_action_required).toBe(resolved.user_action_required);
        expect(gated.user_action_required).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // (d) Boundary: match_score exactly 50 must NOT trigger the floor.
  it('treats match_score of exactly 50 as NOT triggering the floor (boundary)', () => {
    fc.assert(
      fc.property(applyEquivalentSet(fc.constant(REALISM_FLOOR)), (verdicts) => {
        expect(verdicts.realism!.match_score).toBe(50);
        const resolved = resolveDecision(verdicts);
        expect(isApplyEquivalentDecision(resolved.decision)).toBe(true);

        const gated = applyRealismFloor(resolved, verdicts.realism);
        expect(gated.user_action_required).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
