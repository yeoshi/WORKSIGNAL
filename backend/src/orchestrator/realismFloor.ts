/**
 * Master_Orchestrator — Realism floor confirmation rule (Requirement 12.6,
 * task 5.6).
 *
 * After the deterministic decision class is resolved by {@link resolveDecision}
 * (decisionTree.ts), one further gate applies: the **Realism floor**. When the
 * Realism_Agent's `match_score` is *below 50* (the boundary value `50` does NOT
 * trigger — exactly 50 is acceptable) and the resolved decision is
 * apply-equivalent (`apply_consensus` or `apply_with_caveat`), the orchestrator
 * must require explicit user confirmation before any application proceeds. This
 * is recorded by setting `user_action_required = true` on the
 * {@link MasterDecision} (design §Realism floor 12.6).
 *
 * This is intentionally a small, pure post-processing step layered on top of the
 * deterministic decision tree so it stays independently testable (Property 11)
 * and does not perturb the decision-class computation itself. It is a no-op for
 * non-apply-equivalent decisions (`deadlock_escalate`, `skip_consensus`,
 * `veto_skip`) and for Realism scores at or above the floor.
 */

import type { Decision, MasterDecision, RealismVerdict } from '@worksignal/shared';

/**
 * The Realism `match_score` floor (Req 12.6). Scores **strictly below** this
 * value trigger the user-confirmation requirement on apply-equivalent
 * decisions; a score of exactly {@link REALISM_FLOOR} does NOT trigger it.
 */
export const REALISM_FLOOR = 50;

/**
 * The decision classes that count as apply-equivalent for the Realism floor
 * (design §Realism floor 12.6): a positive consensus or a caveated apply.
 */
const APPLY_EQUIVALENT_DECISIONS: readonly Decision[] = [
  'apply_consensus',
  'apply_with_caveat',
] as const;

/** Is the given decision class apply-equivalent (apply_consensus/apply_with_caveat)? */
export function isApplyEquivalentDecision(decision: Decision): boolean {
  return APPLY_EQUIVALENT_DECISIONS.includes(decision);
}

/**
 * Apply the Realism floor confirmation rule (Req 12.6) to an already-resolved
 * {@link MasterDecision}.
 *
 * When the Realism verdict is present with `match_score < 50` ({@link
 * REALISM_FLOOR}) AND `decision.decision` is apply-equivalent
 * (`apply_consensus` or `apply_with_caveat`), the returned decision has
 * `user_action_required = true`. In every other case the decision's existing
 * `user_action_required` value is preserved unchanged.
 *
 * Boundary: a `match_score` of exactly `50` does NOT trigger the floor
 * (Property 11 boundary), only scores strictly below 50.
 *
 * Pure and non-mutating: returns a new object, never modifies its inputs.
 *
 * @param decision - The deterministically resolved master decision.
 * @param realism  - The Realism_Agent verdict, if present. When absent the
 *                   floor cannot apply (no score to evaluate) and the decision
 *                   is returned unchanged.
 * @returns The decision, with `user_action_required` forced `true` when the
 *          Realism floor is breached on an apply-equivalent decision.
 */
export function applyRealismFloor(
  decision: MasterDecision,
  realism: RealismVerdict | undefined,
): MasterDecision {
  if (
    realism !== undefined &&
    realism.match_score < REALISM_FLOOR &&
    isApplyEquivalentDecision(decision.decision)
  ) {
    return { ...decision, user_action_required: true };
  }
  return decision;
}
