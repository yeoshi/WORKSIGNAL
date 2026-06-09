/**
 * Master_Orchestrator — apply-output generation gating (Req 12.7) and
 * Debate_Engine fast-track ordering (Req 13.5).
 *
 * Two pure, deterministic concerns are owned here, layered on top of the
 * deterministic decision tree in {@link ./decisionTree.ts}:
 *
 *  1. **Apply-output gating (Req 12.7).** For any *apply-equivalent* decision
 *     (`apply_consensus` or `apply_with_caveat`) the Master must emit resume
 *     instructions + a cover-letter angle. The actual prose is authored by
 *     Bedrock in a later task; this module models the *requirement* — it reports
 *     whether apply outputs are required for a decision and, when generated text
 *     is supplied, attaches it to the {@link MasterDecision} and reports whether
 *     the requirement is satisfied (both fields present and non-empty).
 *
 *  2. **Fast-track ordering (Req 13.5).** When the Opportunity_Agent verdict is
 *     `act_now` AND at least two of the *other three* agents (Ambition / Realism
 *     / Risk) are apply-equivalent, the queued application is placed at the
 *     **top** of the user's review queue. This module provides the predicate and
 *     a stable queue-ordering helper that hoists fast-tracked items to the front
 *     while preserving the relative order of everything else.
 *
 * The fast-track count deliberately considers only the *other three* agents, not
 * Opportunity itself: `act_now` is the gating condition, and "≥2 other agents
 * apply-equivalent" is measured over Ambition / Realism / Risk. The single
 * source of truth for whether a given agent verdict is apply-equivalent is
 * reused from {@link ./decisionTree.ts} so the mapping can never drift.
 */

import type {
  AgentName,
  Decision,
  MasterDecision,
  OpportunityVerdict,
  VerdictSet,
} from '@worksignal/shared';

import {
  isAmbitionApplyEquivalent,
  isRealismApplyEquivalent,
  isRiskApplyEquivalent,
} from './decisionTree.js';

/* ------------------------------------------------------------------ *
 * (a) Apply-output gating (Req 12.7)
 * ------------------------------------------------------------------ */

/**
 * The decision classes that are **apply-equivalent** outcomes and therefore
 * require apply outputs (resume instructions + cover-letter angle) per Req 12.7.
 */
export const APPLY_EQUIVALENT_DECISIONS: readonly Decision[] = [
  'apply_consensus',
  'apply_with_caveat',
] as const;

/**
 * Is the given decision class an apply-equivalent outcome (`apply_consensus` or
 * `apply_with_caveat`)? These are the decisions that lead to an application
 * being generated and queued, and thus require apply outputs (Req 12.7).
 */
export function isApplyEquivalentDecision(decision: Decision): boolean {
  return APPLY_EQUIVALENT_DECISIONS.includes(decision);
}

/**
 * The Bedrock-authored apply outputs that an apply-equivalent decision must emit
 * (Req 12.7). Modelled as plain text fields so this pure module can be exercised
 * without invoking Bedrock; the real generation is layered in later.
 */
export interface ApplyOutputText {
  /** What to emphasise in the customised resume (Req 12.7, 14.1). */
  resume_instructions: string;
  /** The specific angle for the cover letter (Req 12.7, 14.2). */
  cover_letter_angle: string;
}

/** The outcome of gating apply-output generation for a decision (Req 12.7). */
export interface ApplyOutputGateResult {
  /**
   * True iff the decision is apply-equivalent and therefore *must* emit apply
   * outputs (Req 12.7).
   */
  applyOutputRequired: boolean;
  /**
   * The decision, with `resume_instructions` / `cover_letter_angle` attached
   * when apply output is required and generated text was supplied. For
   * non-apply-equivalent decisions the decision is returned unchanged.
   */
  decision: MasterDecision;
  /**
   * True when the apply-output requirement is met: either it was not required,
   * or it was required and both fields are now present and non-empty.
   */
  satisfied: boolean;
}

/** Does this decision require apply outputs to be emitted (Req 12.7)? */
export function requiresApplyOutput(decision: MasterDecision): boolean {
  return isApplyEquivalentDecision(decision.decision);
}

/** Is the given value a present, non-empty (non-whitespace) string? */
function isNonEmpty(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Gate apply-output generation for a resolved {@link MasterDecision} (Req 12.7).
 *
 * For an apply-equivalent decision this reports that apply outputs are required.
 * When `generated` text is supplied it is attached to the returned decision; the
 * result is `satisfied` only when both `resume_instructions` and
 * `cover_letter_angle` are present and non-empty (either freshly supplied or
 * already on the decision). For a non-apply-equivalent decision no apply output
 * is required, the decision is returned unchanged, and the result is vacuously
 * satisfied.
 *
 * Pure and total: no I/O, randomness, or hidden state.
 *
 * @param decision  - The resolved decision to gate.
 * @param generated - Optional Bedrock-authored apply-output text to attach.
 * @returns The gate result describing whether apply output is required, the
 *          (possibly enriched) decision, and whether the requirement is met.
 */
export function gateApplyOutput(
  decision: MasterDecision,
  generated?: Partial<ApplyOutputText>,
): ApplyOutputGateResult {
  if (!isApplyEquivalentDecision(decision.decision)) {
    return { applyOutputRequired: false, decision, satisfied: true };
  }

  const resumeInstructions = isNonEmpty(generated?.resume_instructions)
    ? generated!.resume_instructions
    : decision.resume_instructions;
  const coverLetterAngle = isNonEmpty(generated?.cover_letter_angle)
    ? generated!.cover_letter_angle
    : decision.cover_letter_angle;

  const enriched: MasterDecision = {
    ...decision,
    resume_instructions: resumeInstructions,
    cover_letter_angle: coverLetterAngle,
  };

  const satisfied = isNonEmpty(resumeInstructions) && isNonEmpty(coverLetterAngle);

  return { applyOutputRequired: true, decision: enriched, satisfied };
}

/* ------------------------------------------------------------------ *
 * (b) Fast-track ordering (Req 13.5)
 * ------------------------------------------------------------------ */

/** The Opportunity verdict value that gates fast-tracking (Req 13.5). */
export const FAST_TRACK_OPPORTUNITY_VERDICT: OpportunityVerdict['verdict'] = 'act_now';

/**
 * The minimum number of *other* agents (Ambition / Realism / Risk) that must be
 * apply-equivalent — in addition to Opportunity = `act_now` — for an application
 * to be fast-tracked (Req 13.5).
 */
export const FAST_TRACK_MIN_OTHER_APPLY_EQUIVALENT = 2;

/**
 * The "other three" agents considered by the fast-track rule — every agent
 * except Opportunity, whose `act_now` verdict is the gating condition (Req 13.5).
 */
export const FAST_TRACK_OTHER_AGENTS: readonly AgentName[] = [
  'ambition',
  'realism',
  'risk',
] as const;

/**
 * Count how many of the *other three* agents (Ambition / Realism / Risk) are
 * apply-equivalent in the given verdict set. Opportunity is deliberately
 * excluded — it is the gating condition, not part of the "≥2 others" count.
 */
export function otherApplyEquivalentCount(verdicts: VerdictSet): number {
  let count = 0;
  if (verdicts.ambition && isAmbitionApplyEquivalent(verdicts.ambition)) {
    count += 1;
  }
  if (verdicts.realism && isRealismApplyEquivalent(verdicts.realism)) {
    count += 1;
  }
  if (verdicts.risk && isRiskApplyEquivalent(verdicts.risk)) {
    count += 1;
  }
  return count;
}

/**
 * Does this debate qualify for fast-track top-of-queue placement (Req 13.5)?
 *
 * True iff the Opportunity_Agent verdict is present and equals `act_now` AND at
 * least {@link FAST_TRACK_MIN_OTHER_APPLY_EQUIVALENT} of the other three agents
 * (Ambition / Realism / Risk) are apply-equivalent.
 *
 * Pure and total: a deterministic function of the verdict set.
 */
export function isFastTracked(verdicts: VerdictSet): boolean {
  if (verdicts.opportunity?.verdict !== FAST_TRACK_OPPORTUNITY_VERDICT) {
    return false;
  }
  return otherApplyEquivalentCount(verdicts) >= FAST_TRACK_MIN_OTHER_APPLY_EQUIVALENT;
}

/** Where a queued application sits in the user's review queue (Req 13.5). */
export type QueuePlacement = 'top' | 'normal';

/**
 * The queue placement for a debate's queued application (Req 13.5): `'top'` when
 * the fast-track condition holds, otherwise `'normal'`.
 */
export function queuePlacementFor(verdicts: VerdictSet): QueuePlacement {
  return isFastTracked(verdicts) ? 'top' : 'normal';
}

/** A queued review item paired with the verdict set that resolved it. */
export interface ReviewQueueItem<T> {
  /** The queued payload (e.g. an {@link Application} or its id). */
  item: T;
  /** The verdict set produced by the debate for this item. */
  verdicts: VerdictSet;
}

/**
 * Order a user's review queue so that every fast-tracked application (Req 13.5)
 * appears at the **top**, ahead of every non-fast-tracked application.
 *
 * The ordering is **stable**: within the fast-tracked group and within the
 * non-fast-tracked group the original relative order is preserved. This makes
 * the result a deterministic function of the input order and the per-item
 * fast-track predicate.
 *
 * @param items - The queued items, each paired with its resolving verdict set.
 * @returns The payloads reordered with fast-tracked items first.
 */
export function orderReviewQueue<T>(items: readonly ReviewQueueItem<T>[]): T[] {
  const fastTracked: T[] = [];
  const normal: T[] = [];
  for (const entry of items) {
    if (isFastTracked(entry.verdicts)) {
      fastTracked.push(entry.item);
    } else {
      normal.push(entry.item);
    }
  }
  return [...fastTracked, ...normal];
}
