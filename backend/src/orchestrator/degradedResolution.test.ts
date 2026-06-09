/**
 * Property 22 (SAFETY-CRITICAL): Degraded resolution with partial verdicts.
 *
 * Feature: worksignal, Property 22
 * Validates: Requirements 22.4, 22.5
 *
 * Requirement 22.4: "WHEN one or more debate agents fail to produce a valid
 * Verdict, THE Master_Orchestrator SHALL resolve a Decision from any non-empty
 * subset of valid Verdicts and SHALL record the unavailable agents in
 * `agent_failures`." The Risk-`avoid` veto MUST be preserved in degraded mode.
 *
 * Requirement 22.5: "WHEN no valid Verdict exists for a job, THE
 * Master_Orchestrator SHALL produce no Decision and SHALL log the failure."
 *
 * Three properties exercised here:
 *  (a) For any NON-EMPTY subset of valid verdicts, `resolveDegraded` produces a
 *      decision and `agent_failures` equals exactly the set of missing agents.
 *  (b) The Risk-`avoid` veto is preserved in degraded mode: if a Risk verdict of
 *      `avoid` is present, the decision is `veto_skip` regardless of which other
 *      agents are present.
 *  (c) For the EMPTY set, `resolved` is false, `decision` is null, and all four
 *      agents are listed as failures (no Decision is produced; Req 22.5).
 *
 * Generators include empty sets and subsets containing Risk `avoid`.
 * fast-check, minimum 100 iterations.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type {
  AgentName,
  AmbitionVerdict,
  OpportunityVerdict,
  RealismVerdict,
  RiskVerdict,
  VerdictSet,
} from '@worksignal/shared';
import { Logger, type LogEntry } from '@worksignal/shared';
import {
  resolveDegraded,
  NO_VALID_VERDICT_MESSAGE,
} from './degradedResolution.js';

// --- Generators -------------------------------------------------------------

/** Canonical agent order, mirrored independently of the implementation. */
const AGENT_ORDER: readonly AgentName[] = [
  'ambition',
  'realism',
  'risk',
  'opportunity',
] as const;

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

/**
 * Risk verdict across ALL verdict values, so generated subsets naturally
 * include ones containing Risk `avoid` as well as `safe` / `caution`.
 */
const riskArb: fc.Arbitrary<RiskVerdict> = fc.record({
  verdict: fc.constantFrom<RiskVerdict['verdict']>('safe', 'caution', 'avoid'),
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

/** Risk verdict pinned to `avoid` — the veto condition under test. */
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
 * An arbitrary (possibly partial, possibly empty) {@link VerdictSet}: each
 * agent's verdict is independently present or absent. This covers the full
 * power set of the four agents — including the empty set and every non-empty
 * subset — and naturally includes subsets that contain Risk `avoid`.
 */
const verdictSetArb: fc.Arbitrary<VerdictSet> = fc
  .record({
    ambition: fc.option(ambitionArb, { nil: undefined }),
    realism: fc.option(realismArb, { nil: undefined }),
    risk: fc.option(riskArb, { nil: undefined }),
    opportunity: fc.option(opportunityArb, { nil: undefined }),
  })
  .map((set) => {
    // Strip undefined keys so the object mirrors a real partial subset.
    const out: VerdictSet = {};
    if (set.ambition) out.ambition = set.ambition;
    if (set.realism) out.realism = set.realism;
    if (set.risk) out.risk = set.risk;
    if (set.opportunity) out.opportunity = set.opportunity;
    return out;
  });

/** A NON-EMPTY arbitrary {@link VerdictSet} (filters out the empty case). */
const nonEmptyVerdictSetArb: fc.Arbitrary<VerdictSet> = verdictSetArb.filter(
  (set) => AGENT_ORDER.some((a) => set[a] !== undefined),
);

/**
 * Independently compute the agents missing from a set — the expected
 * `agent_failures`, derived without calling the code under test.
 */
function expectedMissing(set: VerdictSet): AgentName[] {
  return AGENT_ORDER.filter((a) => set[a] === undefined);
}

// --- Property 22 ------------------------------------------------------------

describe('Feature: worksignal, Property 22: Degraded resolution with partial verdicts', () => {
  // (a) Non-empty subset → a decision plus exact missing-agent failures.
  it('resolves a decision from any non-empty subset and records exactly the missing agents (Req 22.4)', () => {
    fc.assert(
      fc.property(nonEmptyVerdictSetArb, (verdicts) => {
        const result = resolveDegraded(verdicts);

        // A decision IS produced for any non-empty subset.
        expect(result.resolved).toBe(true);
        if (!result.resolved) return; // narrow for the type checker
        expect(result.decision).not.toBeNull();

        const missing = expectedMissing(verdicts);
        // agent_failures equals EXACTLY the set of missing agents, in order.
        expect(result.agent_failures).toEqual(missing);
        // The decision mirrors the failures only when degraded (>=1 missing).
        if (missing.length > 0) {
          expect(result.decision.agent_failures).toEqual(missing);
        }
        // No present agent is ever listed as a failure, and vice versa.
        for (const agent of AGENT_ORDER) {
          const present = verdicts[agent] !== undefined;
          expect(result.agent_failures.includes(agent)).toBe(!present);
        }
      }),
      { numRuns: 200 },
    );
  });

  // (b) Risk `avoid` veto preserved in degraded mode for any other-agent subset.
  it('preserves the Risk "avoid" veto in degraded mode regardless of which other agents are present (Req 22.4)', () => {
    fc.assert(
      fc.property(
        riskAvoidArb,
        fc.option(ambitionArb, { nil: undefined }),
        fc.option(realismArb, { nil: undefined }),
        fc.option(opportunityArb, { nil: undefined }),
        (risk, ambition, realism, opportunity) => {
          const verdicts: VerdictSet = { risk };
          if (ambition) verdicts.ambition = ambition;
          if (realism) verdicts.realism = realism;
          if (opportunity) verdicts.opportunity = opportunity;

          const result = resolveDegraded(verdicts);
          expect(result.resolved).toBe(true);
          if (!result.resolved) return;
          // The veto is absolute even when other agents are unavailable.
          expect(result.decision.decision).toBe('veto_skip');
          // Risk produced a verdict, so it is never among the failures.
          expect(result.agent_failures).not.toContain('risk');
        },
      ),
      { numRuns: 200 },
    );
  });

  // (c) Empty set → no Decision; all four agents are failures (Req 22.5).
  it('produces no Decision and lists all four agents as failures for the empty set (Req 22.5)', () => {
    const entries: LogEntry[] = [];
    const logger = new Logger({ sink: (e) => entries.push(e) });

    const result = resolveDegraded({}, logger);

    expect(result.resolved).toBe(false);
    if (result.resolved) return;
    expect(result.decision).toBeNull();
    expect(result.agent_failures).toEqual(['ambition', 'realism', 'risk', 'opportunity']);
    expect(result.reason).toBe(NO_VALID_VERDICT_MESSAGE);
    // The failure is logged (Req 22.5).
    expect(entries).toHaveLength(1);
    expect(entries[0]?.level).toBe('error');
    expect(entries[0]?.message).toBe(NO_VALID_VERDICT_MESSAGE);
  });
});
