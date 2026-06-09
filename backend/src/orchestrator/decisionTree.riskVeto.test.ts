/**
 * Property 9 (SAFETY-CRITICAL): Risk "avoid" is an absolute veto.
 *
 * Feature: worksignal, Property 9
 * Validates: Requirements 12.1
 *
 * Requirement 12.1: "IF the Risk_Agent Verdict value is avoid, THEN THE
 * Master_Orchestrator SHALL produce the Decision veto_skip and SHALL NOT permit
 * any override of that Decision."
 *
 * This test asserts the veto is *absolute*: across ALL combinations of the
 * other three agents' verdicts (Ambition / Realism / Opportunity) and all of
 * their score values, whenever the Risk verdict is `avoid`, both
 * `resolveDecisionClass` and `resolveDecision` resolve to `veto_skip` — no
 * combination of the other verdicts can override it (not even an otherwise
 * unanimous apply).
 *
 * fast-check, minimum 100 iterations.
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
import { resolveDecision, resolveDecisionClass } from './decisionTree.js';

// --- Generators -------------------------------------------------------------

/** Score in the valid 0-100 inclusive range. */
const scoreArb = fc.integer({ min: 0, max: 100 });

/** Arbitrary short text for prose fields (reasoning / key_argument). */
const textArb = fc.string();

/** Ambition verdict across both verdict values and all scores. */
const ambitionArb: fc.Arbitrary<AmbitionVerdict> = fc.record({
  verdict: fc.constantFrom<AmbitionVerdict['verdict']>('apply', 'skip'),
  ambition_score: scoreArb,
  reasoning: textArb,
  key_argument: textArb,
});

/** Realism verdict across all verdict values (including the dissenting `caution`). */
const realismArb: fc.Arbitrary<RealismVerdict> = fc.record({
  verdict: fc.constantFrom<RealismVerdict['verdict']>('apply', 'skip', 'caution'),
  match_score: scoreArb,
  key_gaps: fc.array(textArb),
  work_life_flags: fc.array(textArb),
  reasoning: textArb,
  key_argument: textArb,
});

/** Opportunity verdict across all verdict values. */
const opportunityArb: fc.Arbitrary<OpportunityVerdict> = fc.record({
  verdict: fc.constantFrom<OpportunityVerdict['verdict']>(
    'act_now',
    'monitor',
    'no_advantage',
  ),
  urgency_score: scoreArb,
  timing_factors: fc.array(textArb),
  reasoning: textArb,
  key_argument: textArb,
});

/**
 * Risk verdict pinned to `avoid` — the veto condition under test — with an
 * arbitrary score, red flags, and Glassdoor value so nothing else about the
 * Risk verdict is special-cased.
 */
const riskAvoidArb: fc.Arbitrary<RiskVerdict> = fc.record({
  verdict: fc.constant<RiskVerdict['verdict']>('avoid'),
  risk_score: scoreArb,
  red_flags: fc.array(
    fc.record({
      flag: textArb,
      source: textArb,
      severity: fc.constantFrom('high', 'medium', 'low'),
    }),
  ),
  glassdoor_score: fc.option(scoreArb, { nil: null }),
  reasoning: textArb,
  key_argument: textArb,
});

// --- Property 9 -------------------------------------------------------------

describe('Feature: worksignal, Property 9: Risk "avoid" is an absolute veto', () => {
  it('resolveDecisionClass yields veto_skip for ANY other-verdict combination when Risk is avoid', () => {
    fc.assert(
      fc.property(
        ambitionArb,
        realismArb,
        opportunityArb,
        riskAvoidArb,
        (ambition, realism, opportunity, risk) => {
          const verdicts: VerdictSet = { ambition, realism, risk, opportunity };
          expect(resolveDecisionClass(verdicts)).toBe('veto_skip');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('resolveDecision yields veto_skip for ANY other-verdict combination when Risk is avoid', () => {
    fc.assert(
      fc.property(
        ambitionArb,
        realismArb,
        opportunityArb,
        riskAvoidArb,
        (ambition, realism, opportunity, risk) => {
          const verdicts: VerdictSet = { ambition, realism, risk, opportunity };
          const decision = resolveDecision(verdicts);
          // The veto is absolute: even an otherwise-unanimous apply is overridden.
          expect(decision.decision).toBe('veto_skip');
          // A vetoed Risk agent can never be counted among supporting agents.
          expect(decision.agents_for).not.toContain('risk');
        },
      ),
      { numRuns: 100 },
    );
  });
});
