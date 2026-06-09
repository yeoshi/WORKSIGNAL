/**
 * Unit tests for the Recalibration_Engine per-agent accuracy and threshold
 * computation (Requirements 21.2, 21.3).
 */

import { describe, it, expect } from 'vitest';
import type {
  AgentWeights,
  AmbitionVerdict,
  OpportunityVerdict,
  RealismVerdict,
  RiskVerdict,
  VerdictSet,
} from '@worksignal/shared';
import {
  ACCURACY_WARRANT_THRESHOLD,
  MIN_SAMPLE_SIZE_FOR_ADJUSTMENT,
  THRESHOLD_ADJUSTMENT_STEP,
  THRESHOLD_MAX,
  THRESHOLD_MIN,
  type ApplicationOutcome,
  accuracyRate,
  agentApplyEquivalent,
  applyAdjustments,
  computeAgentPerformance,
  computeThresholdAdjustments,
  outcomePolarity,
  recalibrateAgents,
  tallyAgent,
} from './accuracy.js';

/* --- Verdict builders ---------------------------------------------------- */

function ambition(verdict: AmbitionVerdict['verdict']): AmbitionVerdict {
  return { verdict, ambition_score: 50, reasoning: 'r', key_argument: 'k' };
}
function realism(verdict: RealismVerdict['verdict']): RealismVerdict {
  return {
    verdict,
    match_score: 50,
    key_gaps: [],
    work_life_flags: [],
    reasoning: 'r',
    key_argument: 'k',
  };
}
function risk(verdict: RiskVerdict['verdict']): RiskVerdict {
  return {
    verdict,
    risk_score: 50,
    red_flags: [],
    glassdoor_score: null,
    reasoning: 'r',
    key_argument: 'k',
  };
}
function opportunity(verdict: OpportunityVerdict['verdict']): OpportunityVerdict {
  return { verdict, urgency_score: 50, timing_factors: [], reasoning: 'r', key_argument: 'k' };
}

const fullApply: VerdictSet = {
  ambition: ambition('apply'),
  realism: realism('apply'),
  risk: risk('safe'),
  opportunity: opportunity('act_now'),
};

const baseWeights: AgentWeights = {
  ambition_threshold: 70,
  realism_threshold: 80,
  risk_max_acceptable: 70,
  opportunity_urgency_boost: true,
};

/** Repeat an outcome `n` times. */
function repeat(outcome: ApplicationOutcome, n: number): ApplicationOutcome[] {
  return Array.from({ length: n }, () => outcome);
}

/* --- outcomePolarity ----------------------------------------------------- */

describe('outcomePolarity', () => {
  it('maps callback to positive', () => {
    expect(outcomePolarity('callback')).toBe('positive');
  });

  it('maps rejected and ghosted to negative', () => {
    expect(outcomePolarity('rejected')).toBe('negative');
    expect(outcomePolarity('ghosted')).toBe('negative');
  });

  it('treats unresolved statuses as no signal (null)', () => {
    for (const status of [
      'sent',
      'opened',
      'needs_review',
      'redirected_external',
      'delivery_failed',
    ] as const) {
      expect(outcomePolarity(status)).toBeNull();
    }
  });
});

/* --- agentApplyEquivalent ------------------------------------------------ */

describe('agentApplyEquivalent', () => {
  it('returns undefined when the agent has no verdict', () => {
    expect(agentApplyEquivalent('ambition', {})).toBeUndefined();
  });

  it('reflects the single-source-of-truth apply-equivalent mapping', () => {
    expect(agentApplyEquivalent('ambition', { ambition: ambition('apply') })).toBe(true);
    expect(agentApplyEquivalent('ambition', { ambition: ambition('skip') })).toBe(false);
    expect(agentApplyEquivalent('realism', { realism: realism('caution') })).toBe(false);
    expect(agentApplyEquivalent('risk', { risk: risk('safe') })).toBe(true);
    expect(agentApplyEquivalent('risk', { risk: risk('avoid') })).toBe(false);
    expect(agentApplyEquivalent('opportunity', { opportunity: opportunity('monitor') })).toBe(
      true,
    );
    expect(
      agentApplyEquivalent('opportunity', { opportunity: opportunity('no_advantage') }),
    ).toBe(false);
  });
});

/* --- tallyAgent / computeAgentPerformance (Req 21.2) --------------------- */

describe('per-agent accuracy (Req 21.2)', () => {
  it('counts apply-equivalent + callback as correct', () => {
    const outcomes = repeat({ verdicts: fullApply, status: 'callback' }, 3);
    const tally = tallyAgent(outcomes, 'ambition');
    expect(tally).toMatchObject({ correct: 3, incorrect: 0, false_positives: 0, sample_size: 3 });
  });

  it('counts apply-equivalent + negative as a false positive (incorrect)', () => {
    const outcomes = repeat({ verdicts: fullApply, status: 'rejected' }, 4);
    const tally = tallyAgent(outcomes, 'realism');
    expect(tally).toMatchObject({ correct: 0, incorrect: 4, false_positives: 4, false_negatives: 0 });
  });

  it('counts not-apply-equivalent + negative as correct', () => {
    const verdicts: VerdictSet = { ambition: ambition('skip') };
    const outcomes = repeat({ verdicts, status: 'ghosted' }, 2);
    expect(tallyAgent(outcomes, 'ambition')).toMatchObject({ correct: 2, incorrect: 0 });
  });

  it('counts not-apply-equivalent + positive as a false negative (incorrect)', () => {
    const verdicts: VerdictSet = { realism: realism('skip') };
    const outcomes = repeat({ verdicts, status: 'callback' }, 2);
    expect(tallyAgent(outcomes, 'realism')).toMatchObject({
      correct: 0,
      incorrect: 2,
      false_negatives: 2,
    });
  });

  it('skips unresolved statuses and absent verdicts', () => {
    const outcomes: ApplicationOutcome[] = [
      { verdicts: fullApply, status: 'sent' },
      { verdicts: fullApply, status: 'opened' },
      { verdicts: {}, status: 'callback' },
    ];
    expect(tallyAgent(outcomes, 'ambition')).toMatchObject({ sample_size: 0 });
  });

  it('produces an entry for every agent', () => {
    const perf = computeAgentPerformance([{ verdicts: fullApply, status: 'callback' }]);
    expect(Object.keys(perf).sort()).toEqual(
      ['ambition', 'opportunity', 'realism', 'risk'].sort(),
    );
    expect(perf.ambition).toEqual({ correct: 1, incorrect: 0 });
  });

  it('accuracyRate returns 1 for an empty sample', () => {
    expect(accuracyRate({ correct: 0, sample_size: 0 })).toBe(1);
    expect(accuracyRate({ correct: 3, sample_size: 6 })).toBe(0.5);
  });
});

/* --- computeThresholdAdjustments (Req 21.3) ------------------------------ */

describe('warranted threshold adjustments (Req 21.3)', () => {
  it('makes no adjustment below the minimum sample size', () => {
    const outcomes = repeat({ verdicts: fullApply, status: 'rejected' }, MIN_SAMPLE_SIZE_FOR_ADJUSTMENT - 1);
    expect(computeThresholdAdjustments(outcomes, baseWeights)).toEqual([]);
  });

  it('makes no adjustment when accuracy is acceptable', () => {
    // All correct: apply-equivalent + callback.
    const outcomes = repeat({ verdicts: fullApply, status: 'callback' }, 6);
    expect(computeThresholdAdjustments(outcomes, baseWeights)).toEqual([]);
  });

  it('tightens a too-lenient numeric threshold (raises ambition, raises realism, lowers risk)', () => {
    // Every agent was apply-equivalent but the outcomes were all negative.
    const outcomes = repeat({ verdicts: fullApply, status: 'rejected' }, 6);
    const adjustments = computeThresholdAdjustments(outcomes, baseWeights);

    const byAgent = Object.fromEntries(adjustments.map((a) => [a.agent, a]));
    expect(byAgent.ambition).toMatchObject({
      parameter: 'ambition_threshold',
      old_value: 70,
      new_value: 70 + THRESHOLD_ADJUSTMENT_STEP,
    });
    expect(byAgent.realism).toMatchObject({
      parameter: 'realism_threshold',
      old_value: 80,
      new_value: 80 + THRESHOLD_ADJUSTMENT_STEP,
    });
    expect(byAgent.risk).toMatchObject({
      parameter: 'risk_max_acceptable',
      old_value: 70,
      new_value: 70 - THRESHOLD_ADJUSTMENT_STEP,
    });
    // Every adjustment records a non-empty reason (Req 21.3).
    for (const a of adjustments) {
      expect(a.reason.length).toBeGreaterThan(0);
    }
  });

  it('disables the urgency boost when opportunity is too lenient', () => {
    const outcomes = repeat({ verdicts: fullApply, status: 'rejected' }, 6);
    const adjustments = computeThresholdAdjustments(outcomes, baseWeights);
    const opp = adjustments.find((a) => a.agent === 'opportunity');
    expect(opp).toMatchObject({
      parameter: 'opportunity_urgency_boost',
      old_value: 'true',
      new_value: 'false',
    });
  });

  it('loosens a too-strict numeric threshold (false negatives dominate)', () => {
    // Agent said skip/no-advantage but every outcome was a callback.
    const verdicts: VerdictSet = {
      ambition: ambition('skip'),
      realism: realism('skip'),
      risk: risk('caution'), // not apply-equivalent → too strict on callbacks
      opportunity: opportunity('no_advantage'),
    };
    const outcomes = repeat({ verdicts, status: 'callback' }, 6);
    const adjustments = computeThresholdAdjustments(outcomes, baseWeights);
    const byAgent = Object.fromEntries(adjustments.map((a) => [a.agent, a]));
    expect(byAgent.ambition?.new_value).toBe(70 - THRESHOLD_ADJUSTMENT_STEP);
    expect(byAgent.risk?.new_value).toBe(70 + THRESHOLD_ADJUSTMENT_STEP);
    // boost already true and "loosen" wants true → unchanged, so opportunity
    // should NOT be present.
    expect(byAgent.opportunity).toBeUndefined();
  });

  it('does not record an adjustment that would clamp to the same value', () => {
    const maxedWeights: AgentWeights = { ...baseWeights, ambition_threshold: THRESHOLD_MAX };
    // Ambition too lenient → would raise above the cap → no change.
    const outcomes = repeat(
      { verdicts: { ambition: ambition('apply') }, status: 'rejected' },
      6,
    );
    const adjustments = computeThresholdAdjustments(outcomes, maxedWeights);
    expect(adjustments.find((a) => a.agent === 'ambition')).toBeUndefined();
  });

  it('makes no adjustment when error kinds are tied (ambiguous direction)', () => {
    // 3 false positives (apply + rejected) and 3 false negatives (skip + callback).
    const fp = repeat({ verdicts: { ambition: ambition('apply') }, status: 'rejected' as const }, 3);
    const fn = repeat({ verdicts: { ambition: ambition('skip') }, status: 'callback' as const }, 3);
    const adjustments = computeThresholdAdjustments([...fp, ...fn], baseWeights);
    expect(adjustments.find((a) => a.agent === 'ambition')).toBeUndefined();
  });
});

/* --- applyAdjustments / recalibrateAgents -------------------------------- */

describe('applyAdjustments and recalibrateAgents', () => {
  it('applies numeric and boolean adjustments without mutating the input', () => {
    const adjustments = [
      { agent: 'ambition' as const, parameter: 'ambition_threshold', old_value: 70, new_value: 75, reason: 'r' },
      {
        agent: 'opportunity' as const,
        parameter: 'opportunity_urgency_boost',
        old_value: 'true',
        new_value: 'false',
        reason: 'r',
      },
    ];
    const updated = applyAdjustments(baseWeights, adjustments);
    expect(updated.ambition_threshold).toBe(75);
    expect(updated.opportunity_urgency_boost).toBe(false);
    // Input untouched.
    expect(baseWeights.ambition_threshold).toBe(70);
    expect(baseWeights.opportunity_urgency_boost).toBe(true);
  });

  it('recalibrateAgents combines performance, adjustments, and updated weights', () => {
    const outcomes = repeat({ verdicts: fullApply, status: 'rejected' }, 6);
    const result = recalibrateAgents(outcomes, baseWeights);
    expect(result.agent_performance.ambition).toEqual({ correct: 0, incorrect: 6 });
    expect(result.adjustments.length).toBeGreaterThan(0);
    expect(result.updated_weights.ambition_threshold).toBe(70 + THRESHOLD_ADJUSTMENT_STEP);
    expect(result.updated_weights.opportunity_urgency_boost).toBe(false);
  });

  it('returns weights unchanged when there is nothing to learn from', () => {
    const result = recalibrateAgents([], baseWeights);
    expect(result.adjustments).toEqual([]);
    expect(result.updated_weights).toEqual(baseWeights);
  });

  it('honours the warrant threshold constant boundary', () => {
    // accuracy exactly at the threshold (0.5) is acceptable → no adjustment.
    const correct = repeat({ verdicts: { ambition: ambition('apply') }, status: 'callback' as const }, 3);
    const wrong = repeat({ verdicts: { ambition: ambition('apply') }, status: 'rejected' as const }, 3);
    const tally = tallyAgent([...correct, ...wrong], 'ambition');
    expect(accuracyRate(tally)).toBe(ACCURACY_WARRANT_THRESHOLD);
    expect(computeThresholdAdjustments([...correct, ...wrong], baseWeights)).toEqual([]);
  });
});

/* reference THRESHOLD_MIN so it is covered by an explicit assertion */
describe('threshold bounds', () => {
  it('exposes inclusive [0, 100] bounds', () => {
    expect(THRESHOLD_MIN).toBe(0);
    expect(THRESHOLD_MAX).toBe(100);
  });
});
