/**
 * Recalibration_Engine — per-agent accuracy and threshold computation
 * (Requirements 21.2, 21.3).
 *
 * Pure, deterministic logic — no I/O, no randomness, no hidden state. The
 * weekly Recalibration_Engine flow (task 18.3) fetches the previous seven days'
 * applications and their current statuses, pairs each application with the
 * agent verdicts that produced it, and feeds those pairs here. This module
 * owns two responsibilities:
 *
 *  1. **Per-agent accuracy (Req 21.2):** compare each agent's verdict against
 *     the *resulting* application status and tally how often the agent's stance
 *     was vindicated by the outcome. See {@link computeAgentPerformance}.
 *
 *  2. **Warranted threshold adjustments (Req 21.3):** when an agent's accuracy
 *     is poor over a large-enough sample, propose a concrete change to that
 *     agent's calibration weight, recording the agent, parameter, prior value,
 *     new value, and a human-readable reason. See
 *     {@link computeThresholdAdjustments} and {@link applyAdjustments}.
 *
 * Design reference: design.md — Recalibration_Engine: "computes per-agent
 * accuracy by comparing each agent's verdict to the resulting status (21.2),
 * updates warranted thresholds in `agent_weights` recording prior value/new
 * value/reason (21.3)". The single source of truth for which verdict values
 * are *apply-equivalent* lives in the Master_Orchestrator decision tree and is
 * reused here so the two can never drift apart.
 *
 * ### What "correct" means
 *
 * Every tracked application reached its current status *after* WORKSIGNAL acted
 * on the debate. An individual agent is judged against the realised outcome:
 *
 *  - A **positive outcome** (`callback`) vindicates agents that were
 *    apply-equivalent and counts against agents that were not.
 *  - A **negative outcome** (`rejected`, `ghosted`) vindicates agents that were
 *    *not* apply-equivalent and counts against agents that were.
 *  - All other statuses (`sent`, `opened`, `needs_review`,
 *    `redirected_external`, `delivery_failed`) are **unresolved** — they carry
 *    no learning signal yet and are excluded from the tally entirely.
 *
 * An agent with no verdict on a given application (degraded resolution, Req
 * 22.4) simply contributes nothing for that application.
 */

import type {
  AgentName,
  AgentAccuracy,
  AgentWeights,
  ApplicationStatus,
  RecalibrationAdjustment,
  VerdictSet,
} from '@worksignal/shared';
import { AGENT_NAMES } from '@worksignal/shared';
import {
  isAmbitionApplyEquivalent,
  isRealismApplyEquivalent,
  isRiskApplyEquivalent,
  isOpportunityApplyEquivalent,
} from '../orchestrator/decisionTree.js';

/* ------------------------------------------------------------------ *
 * Tunable policy constants
 * ------------------------------------------------------------------ */

/**
 * Minimum number of *resolved* outcomes an agent must have before a threshold
 * adjustment is considered (Req 21.3). Below this we treat the sample as too
 * small to learn from and make no change.
 */
export const MIN_SAMPLE_SIZE_FOR_ADJUSTMENT = 5 as const;

/**
 * Accuracy rate (correct / resolved) at or above which an agent is considered
 * to be performing acceptably. An adjustment is only warranted when an agent's
 * accuracy falls *strictly below* this rate.
 */
export const ACCURACY_WARRANT_THRESHOLD = 0.5 as const;

/** Step size, in points, by which a numeric threshold is nudged per run. */
export const THRESHOLD_ADJUSTMENT_STEP = 5 as const;

/** Inclusive lower bound for every numeric calibration threshold. */
export const THRESHOLD_MIN = 0 as const;

/** Inclusive upper bound for every numeric calibration threshold. */
export const THRESHOLD_MAX = 100 as const;

/* ------------------------------------------------------------------ *
 * Inputs
 * ------------------------------------------------------------------ */

/**
 * One application's outcome paired with the verdict set that produced it — the
 * minimal pure input this module needs. The Recalibration_Engine assembles
 * these by joining the Applications and AgentVerdicts tables; property/unit
 * tests can construct them directly.
 */
export interface ApplicationOutcome {
  /** The (possibly partial) agent verdicts recorded for this application. */
  verdicts: VerdictSet;
  /** The application's current status (Req 21.1). */
  status: ApplicationStatus;
}

/** The realised polarity of an application outcome, or `null` if unresolved. */
export type OutcomePolarity = 'positive' | 'negative';

/**
 * A richer per-agent tally than {@link AgentAccuracy}. Beyond correct /
 * incorrect it tracks the *kind* of error so the adjustment policy can choose a
 * direction:
 *  - `false_positives`: agent was apply-equivalent but the outcome was negative
 *    (the agent was too lenient / optimistic).
 *  - `false_negatives`: agent was not apply-equivalent but the outcome was
 *    positive (the agent was too strict / pessimistic).
 */
export interface AgentTally extends AgentAccuracy {
  correct: number;
  incorrect: number;
  false_positives: number;
  false_negatives: number;
  /** Resolved outcomes the agent had a verdict for (`correct + incorrect`). */
  sample_size: number;
}

/* ------------------------------------------------------------------ *
 * Outcome classification
 * ------------------------------------------------------------------ */

/** Statuses that represent a favourable outcome for an application. */
const POSITIVE_STATUSES: readonly ApplicationStatus[] = ['callback'] as const;

/** Statuses that represent an unfavourable outcome for an application. */
const NEGATIVE_STATUSES: readonly ApplicationStatus[] = [
  'rejected',
  'ghosted',
] as const;

/**
 * Classify an application status into a learning signal. Returns `'positive'`
 * for a callback, `'negative'` for a rejection/ghosting, and `null` for any
 * status that has not yet resolved into an outcome we can learn from.
 *
 * Pure and total over every {@link ApplicationStatus}.
 */
export function outcomePolarity(status: ApplicationStatus): OutcomePolarity | null {
  if (POSITIVE_STATUSES.includes(status)) {
    return 'positive';
  }
  if (NEGATIVE_STATUSES.includes(status)) {
    return 'negative';
  }
  return null;
}

/**
 * Whether a given agent's verdict within a set is apply-equivalent. Returns
 * `undefined` when the agent has no verdict in the set (degraded resolution),
 * so callers can distinguish "absent" from "present but not apply-equivalent".
 *
 * Delegates to the Master_Orchestrator's single-source-of-truth mapping.
 */
export function agentApplyEquivalent(
  agent: AgentName,
  verdicts: VerdictSet,
): boolean | undefined {
  switch (agent) {
    case 'ambition':
      return verdicts.ambition && isAmbitionApplyEquivalent(verdicts.ambition);
    case 'realism':
      return verdicts.realism && isRealismApplyEquivalent(verdicts.realism);
    case 'risk':
      return verdicts.risk && isRiskApplyEquivalent(verdicts.risk);
    case 'opportunity':
      return (
        verdicts.opportunity && isOpportunityApplyEquivalent(verdicts.opportunity)
      );
    default:
      return undefined;
  }
}

/* ------------------------------------------------------------------ *
 * Per-agent accuracy (Req 21.2)
 * ------------------------------------------------------------------ */

/**
 * Tally one agent's accuracy across the supplied outcomes (Req 21.2).
 *
 * For each application with a *resolved* outcome and a *present* verdict for the
 * agent, the agent is scored:
 *  - apply-equivalent + positive outcome → correct
 *  - apply-equivalent + negative outcome → incorrect (false positive)
 *  - not apply-equivalent + negative outcome → correct
 *  - not apply-equivalent + positive outcome → incorrect (false negative)
 *
 * Unresolved statuses and applications where the agent had no verdict are
 * skipped. Pure and total; an empty input yields an all-zero tally.
 */
export function tallyAgent(
  outcomes: readonly ApplicationOutcome[],
  agent: AgentName,
): AgentTally {
  let correct = 0;
  let falsePositives = 0;
  let falseNegatives = 0;

  for (const outcome of outcomes) {
    const polarity = outcomePolarity(outcome.status);
    if (polarity === null) {
      continue; // unresolved — no learning signal
    }
    const applyEquivalent = agentApplyEquivalent(agent, outcome.verdicts);
    if (applyEquivalent === undefined) {
      continue; // agent had no verdict for this application
    }

    if (applyEquivalent && polarity === 'positive') {
      correct += 1;
    } else if (applyEquivalent && polarity === 'negative') {
      falsePositives += 1;
    } else if (!applyEquivalent && polarity === 'negative') {
      correct += 1;
    } else {
      // !applyEquivalent && polarity === 'positive'
      falseNegatives += 1;
    }
  }

  const incorrect = falsePositives + falseNegatives;
  return {
    correct,
    incorrect,
    false_positives: falsePositives,
    false_negatives: falseNegatives,
    sample_size: correct + incorrect,
  };
}

/**
 * Compute per-agent accuracy for all four agents (Req 21.2), keyed by agent
 * name in the {@link AgentAccuracy} shape persisted to the RecalibrationLog
 * (`agent_performance`). Always returns an entry for every agent, even those
 * with no resolved outcomes (all-zero tally).
 */
export function computeAgentPerformance(
  outcomes: readonly ApplicationOutcome[],
): Record<AgentName, AgentAccuracy> {
  const performance = {} as Record<AgentName, AgentAccuracy>;
  for (const agent of AGENT_NAMES) {
    const tally = tallyAgent(outcomes, agent);
    performance[agent] = { correct: tally.correct, incorrect: tally.incorrect };
  }
  return performance;
}

/**
 * The accuracy rate of a tally: `correct / sample_size`, or `1` (perfect) when
 * there are no resolved outcomes so an empty sample never looks "inaccurate".
 */
export function accuracyRate(tally: Pick<AgentTally, 'correct' | 'sample_size'>): number {
  if (tally.sample_size === 0) {
    return 1;
  }
  return tally.correct / tally.sample_size;
}

/* ------------------------------------------------------------------ *
 * Warranted threshold adjustments (Req 21.3)
 * ------------------------------------------------------------------ */

/**
 * The numeric calibration weight each agent's accuracy adjusts, plus the sign
 * that makes the agent *more selective* (fewer apply-equivalent verdicts):
 *  - `ambition_threshold`: `ambition_score >= threshold` ⇒ apply. Raising it
 *    (`+1`) makes the agent more selective.
 *  - `realism_threshold`: `match_score >= threshold` ⇒ apply. Raising it (`+1`)
 *    makes the agent more selective.
 *  - `risk_max_acceptable`: a *ceiling* — `risk_score <= max` ⇒ acceptable.
 *    Lowering it (`-1`) makes the agent more selective (rejects more).
 *
 * Opportunity is calibrated by the boolean `opportunity_urgency_boost` and is
 * handled separately in {@link computeThresholdAdjustments}.
 */
const NUMERIC_THRESHOLD: Record<
  'ambition' | 'realism' | 'risk',
  { parameter: keyof AgentWeights; moreSelectiveSign: 1 | -1 }
> = {
  ambition: { parameter: 'ambition_threshold', moreSelectiveSign: 1 },
  realism: { parameter: 'realism_threshold', moreSelectiveSign: 1 },
  risk: { parameter: 'risk_max_acceptable', moreSelectiveSign: -1 },
} as const;

/** Clamp a numeric threshold into the inclusive [{@link THRESHOLD_MIN}, {@link THRESHOLD_MAX}] range. */
function clampThreshold(value: number): number {
  return Math.max(THRESHOLD_MIN, Math.min(THRESHOLD_MAX, value));
}

/**
 * Is an adjustment warranted for this tally, and if so in which direction?
 * Returns `null` when no change is warranted. `'tighten'` means the agent was
 * too lenient (false positives dominate); `'loosen'` means too strict (false
 * negatives dominate). A tie between the two error kinds gives no clear
 * direction, so no adjustment is made.
 */
function adjustmentDirection(tally: AgentTally): 'tighten' | 'loosen' | null {
  if (tally.sample_size < MIN_SAMPLE_SIZE_FOR_ADJUSTMENT) {
    return null;
  }
  if (accuracyRate(tally) >= ACCURACY_WARRANT_THRESHOLD) {
    return null;
  }
  if (tally.false_positives > tally.false_negatives) {
    return 'tighten';
  }
  if (tally.false_negatives > tally.false_positives) {
    return 'loosen';
  }
  return null; // tied — ambiguous direction
}

/** Format an accuracy rate as a whole-number percentage for reason strings. */
function formatRate(tally: AgentTally): string {
  return `${Math.round(accuracyRate(tally) * 100)}%`;
}

/**
 * Build the warranted threshold adjustment for one agent, or `null` if none is
 * warranted (insufficient sample, acceptable accuracy, ambiguous direction, or
 * the proposed value would not actually change). Each returned adjustment
 * records the agent, parameter, prior value, new value, and reason (Req 21.3).
 */
function adjustmentForAgent(
  agent: AgentName,
  tally: AgentTally,
  weights: AgentWeights,
): RecalibrationAdjustment | null {
  const direction = adjustmentDirection(tally);
  if (direction === null) {
    return null;
  }

  const tooLenient = direction === 'tighten';
  const errorKind = tooLenient
    ? `${tally.false_positives} false positive(s) (too lenient)`
    : `${tally.false_negatives} false negative(s) (too strict)`;

  // Opportunity is calibrated by a boolean urgency boost, not a numeric weight.
  if (agent === 'opportunity') {
    const oldBoost = weights.opportunity_urgency_boost;
    // Too lenient ⇒ disable the boost; too strict ⇒ enable it.
    const newBoost = !tooLenient;
    if (oldBoost === newBoost) {
      return null; // already in the target state — nothing to change
    }
    return {
      agent,
      parameter: 'opportunity_urgency_boost',
      old_value: String(oldBoost),
      new_value: String(newBoost),
      reason:
        `opportunity accuracy ${formatRate(tally)} over ${tally.sample_size} ` +
        `resolved outcome(s) with ${errorKind}; ` +
        `${newBoost ? 'enabling' : 'disabling'} urgency boost`,
    };
  }

  const { parameter, moreSelectiveSign } = NUMERIC_THRESHOLD[agent];
  const oldValue = weights[parameter] as number;
  const delta =
    THRESHOLD_ADJUSTMENT_STEP * moreSelectiveSign * (tooLenient ? 1 : -1);
  const newValue = clampThreshold(oldValue + delta);
  if (newValue === oldValue) {
    return null; // clamped at a bound — no effective change
  }

  return {
    agent,
    parameter,
    old_value: oldValue,
    new_value: newValue,
    reason:
      `${agent} accuracy ${formatRate(tally)} over ${tally.sample_size} ` +
      `resolved outcome(s) with ${errorKind}; ` +
      `${newValue > oldValue ? 'raising' : 'lowering'} ${parameter} ` +
      `from ${oldValue} to ${newValue}`,
  };
}

/**
 * Compute every warranted threshold adjustment for the supplied outcomes
 * against the user's current calibration weights (Req 21.3).
 *
 * Agents are evaluated in canonical order ({@link AGENT_NAMES}) so the result
 * is deterministic. An agent yields an adjustment only when its accuracy is
 * strictly below {@link ACCURACY_WARRANT_THRESHOLD} over at least
 * {@link MIN_SAMPLE_SIZE_FOR_ADJUSTMENT} resolved outcomes, the error direction
 * is unambiguous, and the proposed value actually differs from the current one.
 * Each adjustment records its prior value, new value, and reason.
 */
export function computeThresholdAdjustments(
  outcomes: readonly ApplicationOutcome[],
  weights: AgentWeights,
): RecalibrationAdjustment[] {
  const adjustments: RecalibrationAdjustment[] = [];
  for (const agent of AGENT_NAMES) {
    const tally = tallyAgent(outcomes, agent);
    const adjustment = adjustmentForAgent(agent, tally, weights);
    if (adjustment !== null) {
      adjustments.push(adjustment);
    }
  }
  return adjustments;
}

/**
 * Apply a list of adjustments to a copy of the supplied weights, returning the
 * updated {@link AgentWeights} (Req 21.3). Pure: the input `weights` is never
 * mutated. Numeric `new_value`s are written as-is; the
 * `opportunity_urgency_boost` boolean is parsed back from its string form.
 * Adjustments for unknown parameters are ignored defensively.
 */
export function applyAdjustments(
  weights: AgentWeights,
  adjustments: readonly RecalibrationAdjustment[],
): AgentWeights {
  const updated: AgentWeights = { ...weights };
  for (const adjustment of adjustments) {
    if (adjustment.parameter === 'opportunity_urgency_boost') {
      updated.opportunity_urgency_boost = String(adjustment.new_value) === 'true';
    } else if (
      adjustment.parameter === 'ambition_threshold' ||
      adjustment.parameter === 'realism_threshold' ||
      adjustment.parameter === 'risk_max_acceptable'
    ) {
      updated[adjustment.parameter] = Number(adjustment.new_value);
    }
  }
  return updated;
}

/** The combined result of a recalibration accuracy pass. */
export interface AgentRecalibrationResult {
  /** Per-agent accuracy for the RecalibrationLog `agent_performance` (Req 21.2). */
  agent_performance: Record<AgentName, AgentAccuracy>;
  /** The warranted threshold adjustments made (Req 21.3). */
  adjustments: RecalibrationAdjustment[];
  /** The user's calibration weights after applying the adjustments (Req 21.3). */
  updated_weights: AgentWeights;
}

/**
 * Run the full per-agent accuracy and threshold-adjustment pass for a weekly
 * recalibration (Req 21.2, 21.3) in one call: compute per-agent accuracy,
 * derive warranted adjustments from the current weights, and produce the
 * updated weights. Pure and deterministic — the weekly flow (task 18.3) wires
 * the returned values into the RecalibrationLog and the user's `agent_weights`.
 */
export function recalibrateAgents(
  outcomes: readonly ApplicationOutcome[],
  weights: AgentWeights,
): AgentRecalibrationResult {
  const agentPerformance = computeAgentPerformance(outcomes);
  const adjustments = computeThresholdAdjustments(outcomes, weights);
  const updatedWeights = applyAdjustments(weights, adjustments);
  return {
    agent_performance: agentPerformance,
    adjustments,
    updated_weights: updatedWeights,
  };
}
