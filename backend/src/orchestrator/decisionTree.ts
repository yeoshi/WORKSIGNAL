/**
 * Master_Orchestrator — apply-equivalent mapping and deterministic decision
 * tree (Requirement 12).
 *
 * The Master Orchestrator is **Bedrock-assisted but deterministically gated**:
 * the *decision class* is computed here by pure code from the agent verdicts so
 * it is fully testable and reproducible. Bedrock is used only later to author
 * the human-readable `summary`, `resume_instructions`, and `cover_letter_angle`
 * (layered in subsequent tasks 5.6 / 5.8); those prose fields are intentionally
 * left unset / empty by this module.
 *
 * This file owns two things:
 *
 *  1. The **single source of truth** for the apply-equivalent mapping
 *     ({@link APPLY_EQUIVALENT_VERDICTS}), reused by orchestrator code and by
 *     the property tests (tasks 5.4 / 5.5). The mapping is, per the design:
 *       - Ambition    → `apply`
 *       - Realism     → `apply`  (`caution`/`skip` are NOT apply-equivalent;
 *                                 `caution` counts as a dissent)
 *       - Risk        → `safe`
 *       - Opportunity → `act_now` or `monitor` (`no_advantage` is NOT
 *                                 apply-equivalent)
 *
 *  2. The **total, deterministic decision tree** ({@link resolveDecisionClass} /
 *     {@link resolveDecision}), evaluated in this order:
 *       1. Risk verdict = `avoid` → `veto_skip` — an absolute veto that no
 *          other verdict can override (Req 12.1).
 *       2. Otherwise let `n` = number of apply-equivalent verdicts:
 *            - `n == 4` → `apply_consensus`     (Req 12.2)
 *            - `n == 3` → `apply_with_caveat`   (Req 12.3, records the dissenter)
 *            - `n == 2` → `deadlock_escalate`   (Req 12.4)
 *            - `n <= 1` → `skip_consensus`      (Req 12.5)
 *
 * Safety-critical (Properties 9 & 10): the Risk-`avoid` veto is absolute, and
 * the decision is a *total, deterministic* function of the apply-equivalent
 * count. The same `(verdicts) -> decision` inputs always yield the same output,
 * with no I/O, randomness, or hidden state.
 *
 * Note on partial verdict sets: {@link VerdictSet} fields are optional to allow
 * degraded resolution (task 5.10). This module treats a *missing* agent as
 * simply not apply-equivalent and not counted; the dedicated degraded-mode
 * handling (recording `agent_failures`, the no-valid-verdict case) is layered
 * in task 5.10 and does not change the rules encoded here.
 */

import type {
  AgentName,
  AmbitionVerdict,
  Decision,
  MasterDecision,
  OpportunityVerdict,
  RealismVerdict,
  RiskVerdict,
  VerdictSet,
} from '@worksignal/shared';

/**
 * The **single source of truth** for the apply-equivalent mapping (design
 * §Apply-equivalent mapping). For each agent, lists the verdict values that
 * count as apply-equivalent. Defined once and reused by orchestrator code and
 * the property tests so the mapping can never drift between them.
 */
export const APPLY_EQUIVALENT_VERDICTS: {
  readonly ambition: readonly AmbitionVerdict['verdict'][];
  readonly realism: readonly RealismVerdict['verdict'][];
  readonly risk: readonly RiskVerdict['verdict'][];
  readonly opportunity: readonly OpportunityVerdict['verdict'][];
} = {
  ambition: ['apply'],
  realism: ['apply'],
  risk: ['safe'],
  opportunity: ['act_now', 'monitor'],
} as const;

/** The Risk verdict value that triggers the absolute veto (Req 12.1). */
export const RISK_VETO_VERDICT: RiskVerdict['verdict'] = 'avoid';

/** Is the Ambition verdict apply-equivalent? */
export function isAmbitionApplyEquivalent(verdict: AmbitionVerdict): boolean {
  return APPLY_EQUIVALENT_VERDICTS.ambition.includes(verdict.verdict);
}

/** Is the Realism verdict apply-equivalent? (`caution`/`skip` are not.) */
export function isRealismApplyEquivalent(verdict: RealismVerdict): boolean {
  return APPLY_EQUIVALENT_VERDICTS.realism.includes(verdict.verdict);
}

/** Is the Risk verdict apply-equivalent? (Only `safe`.) */
export function isRiskApplyEquivalent(verdict: RiskVerdict): boolean {
  return APPLY_EQUIVALENT_VERDICTS.risk.includes(verdict.verdict);
}

/** Is the Opportunity verdict apply-equivalent? (`no_advantage` is not.) */
export function isOpportunityApplyEquivalent(verdict: OpportunityVerdict): boolean {
  return APPLY_EQUIVALENT_VERDICTS.opportunity.includes(verdict.verdict);
}

/**
 * The agents present in a {@link VerdictSet}, in canonical order. A "present"
 * agent is one whose verdict was supplied (used to compute supporting/opposing
 * agent lists for Req 12.8).
 */
function presentAgents(verdicts: VerdictSet): AgentName[] {
  const present: AgentName[] = [];
  if (verdicts.ambition) present.push('ambition');
  if (verdicts.realism) present.push('realism');
  if (verdicts.risk) present.push('risk');
  if (verdicts.opportunity) present.push('opportunity');
  return present;
}

/**
 * The apply-equivalent agents in a {@link VerdictSet}, in canonical order.
 * This is the shared computation that drives the decision count; tests reuse it
 * alongside {@link APPLY_EQUIVALENT_VERDICTS}.
 */
export function applyEquivalentAgents(verdicts: VerdictSet): AgentName[] {
  const agents: AgentName[] = [];
  if (verdicts.ambition && isAmbitionApplyEquivalent(verdicts.ambition)) {
    agents.push('ambition');
  }
  if (verdicts.realism && isRealismApplyEquivalent(verdicts.realism)) {
    agents.push('realism');
  }
  if (verdicts.risk && isRiskApplyEquivalent(verdicts.risk)) {
    agents.push('risk');
  }
  if (verdicts.opportunity && isOpportunityApplyEquivalent(verdicts.opportunity)) {
    agents.push('opportunity');
  }
  return agents;
}

/**
 * The number of apply-equivalent verdicts in a {@link VerdictSet} — the `n`
 * that drives the decision tree (Req 12.2-12.5).
 */
export function applyEquivalentCount(verdicts: VerdictSet): number {
  return applyEquivalentAgents(verdicts).length;
}

/**
 * Does the Risk_Agent verdict trigger the absolute veto (Req 12.1)? True only
 * when a Risk verdict is present and its value is `avoid`.
 */
export function isVetoed(verdicts: VerdictSet): boolean {
  return verdicts.risk !== undefined && verdicts.risk.verdict === RISK_VETO_VERDICT;
}

/**
 * The **deterministic decision-class** computation — the heart of the decision
 * tree (Req 12.1-12.5). A pure, total function of the verdicts: the Risk-`avoid`
 * veto takes absolute precedence, otherwise the apply-equivalent count maps to a
 * decision class.
 *
 * @param verdicts - The (possibly partial) set of agent verdicts.
 * @returns The resolved {@link Decision} class.
 */
export function resolveDecisionClass(verdicts: VerdictSet): Decision {
  // 1. Absolute veto (Req 12.1): Risk `avoid` overrides everything else.
  if (isVetoed(verdicts)) {
    return 'veto_skip';
  }

  // 2. Otherwise map the apply-equivalent count (Req 12.2-12.5).
  const n = applyEquivalentCount(verdicts);
  if (n === 4) {
    return 'apply_consensus';
  }
  if (n === 3) {
    return 'apply_with_caveat';
  }
  if (n === 2) {
    return 'deadlock_escalate';
  }
  // n <= 1
  return 'skip_consensus';
}

/** The `key_argument` of a present agent's verdict, used for dissent notes. */
function keyArgumentFor(agent: AgentName, verdicts: VerdictSet): string | undefined {
  switch (agent) {
    case 'ambition':
      return verdicts.ambition?.key_argument;
    case 'realism':
      return verdicts.realism?.key_argument;
    case 'risk':
      return verdicts.risk?.key_argument;
    case 'opportunity':
      return verdicts.opportunity?.key_argument;
    default:
      return undefined;
  }
}

/**
 * Build the dissent note recorded for an `apply_with_caveat` decision (Req
 * 12.3): the dissenting (non-apply-equivalent) agent's flagged concern. With
 * three apply-equivalent agents there is exactly one present dissenter; its
 * `key_argument` is recorded, prefixed with the agent name for auditability.
 *
 * Returns `undefined` when there is no single dissenter to record.
 */
function buildDissentNote(
  verdicts: VerdictSet,
  agentsAgainst: AgentName[],
): string | undefined {
  if (agentsAgainst.length !== 1) {
    return undefined;
  }
  const dissenter = agentsAgainst[0] as AgentName;
  const concern = keyArgumentFor(dissenter, verdicts);
  if (concern && concern.trim().length > 0) {
    return `${dissenter}: ${concern}`;
  }
  return dissenter;
}

/**
 * Resolve a set of agent verdicts into the deterministic portion of a
 * {@link MasterDecision} (Req 12.1-12.5, 12.8).
 *
 * This sets the fields the deterministic gate owns:
 *  - `decision` — the resolved decision class.
 *  - `agents_for` — the apply-equivalent (supporting) agents.
 *  - `agents_against` — the present, non-apply-equivalent (opposing) agents.
 *  - `dissent_note` — for `apply_with_caveat`, the dissenting agent's concern.
 *
 * The Bedrock-authored prose (`summary`, `resume_instructions`,
 * `cover_letter_angle`) and the Realism-floor `user_action_required` flag (Req
 * 12.6, task 5.6) are layered later; `summary` is initialised empty and
 * `user_action_required` defaults to `false` here so the returned value is a
 * valid {@link MasterDecision}. Persisting the decision, summary, supporting /
 * opposing agents, and dissent note (Req 12.8) is performed by the caller using
 * these fields.
 *
 * @param verdicts - The (possibly partial) set of agent verdicts.
 * @returns The {@link MasterDecision} with its deterministic fields populated.
 */
export function resolveDecision(verdicts: VerdictSet): MasterDecision {
  const decision = resolveDecisionClass(verdicts);
  const forAgents = applyEquivalentAgents(verdicts);
  const forSet = new Set<AgentName>(forAgents);
  const againstAgents = presentAgents(verdicts).filter((agent) => !forSet.has(agent));

  const result: MasterDecision = {
    decision,
    // Bedrock authors the human-readable summary later (tasks 5.6 / 5.8).
    summary: '',
    agents_for: forAgents,
    agents_against: againstAgents,
    // deadlock_escalate always requires the user to break the tie.
    // Realism-floor confirmation (Req 12.6) may set this to true for apply decisions too.
    user_action_required: decision === 'deadlock_escalate',
  };

  // Record the dissenting agent's concern only for apply_with_caveat (Req 12.3).
  if (decision === 'apply_with_caveat') {
    const dissentNote = buildDissentNote(verdicts, againstAgents);
    if (dissentNote !== undefined) {
      result.dissent_note = dissentNote;
    }
  }

  return result;
}
