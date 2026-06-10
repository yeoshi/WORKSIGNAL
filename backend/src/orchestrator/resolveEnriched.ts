/**
 * Orchestrator Agent — enriched resolution entry point.
 *
 * Wraps the existing deterministic decision tree (resolveDecision /
 * applyRealismFloor) and layers the new Orchestrator Agent reasoning pass on
 * top to produce an {@link EnrichedMasterDecision}.
 *
 * The reasoning pass fires **only** when a human judgment call is genuinely
 * needed:
 *   - `deadlock_escalate` (2 agents for, 2 against) — the primary target.
 *   - `apply_with_caveat` + `user_action_required=true` (Realism floor
 *     breached) — borderline apply where confirmation was required.
 *
 * For clear-cut outcomes (`apply_consensus`, `skip_consensus`, `veto_skip`,
 * and `apply_with_caveat` without a floor breach) the deterministic result
 * stands and the reasoning pass is skipped entirely for speed and cost.
 *
 * Architecture:
 *   1. resolveDecision()        → MasterDecision (deterministic tree)
 *   2. applyRealismFloor()      → MasterDecision (post-processing gate)
 *   3. shouldRunReasoningPass() → boolean
 *   4. computeHeuristicAction() → HeuristicResult (pure scoring, always runs)
 *   5. generateOrchestratorProse() → holistic_summary (Bedrock, with fallback)
 *   6. Build EnrichedMasterDecision
 */

import type {
  EnrichedMasterDecision,
  Job,
  MasterDecision,
  OrchestratorAction,
  OrchestratorVerdict,
  SkillGapSummary,
  UserConfig,
  VerdictSet,
} from '@worksignal/shared';
import type { AgentInvocationOptions, BedrockInvoke } from '../debate/agents/shared.js';
import { resolveDecision } from './decisionTree.js';
import { applyRealismFloor } from './realismFloor.js';
import { computeHeuristicAction } from './scoreHeuristic.js';
import { generateOrchestratorProse } from './orchestratorAgent.js';

export interface ResolveEnrichedInput {
  verdicts: VerdictSet;
  user: UserConfig;
  job: Job;
  /** Recurring skill-gap history from the SkillGaps table (optional). */
  skillGapHistory?: SkillGapSummary[];
  /** Injectable Bedrock invocation for prose generation. Required in production. */
  bedrock?: BedrockInvoke;
  /** Retry / logger options forwarded to the Bedrock prose call. */
  bedrockOptions?: AgentInvocationOptions;
}

/**
 * Should the Orchestrator Agent reasoning pass fire for this decision?
 * True only for cases that cannot be resolved deterministically.
 */
export function shouldRunReasoningPass(
  decision: EnrichedMasterDecision | import('@worksignal/shared').MasterDecision,
): boolean {
  if (decision.decision === 'deadlock_escalate') {
    return true;
  }
  if (decision.decision === 'apply_with_caveat' && decision.user_action_required) {
    return true;
  }
  return false;
}

/**
 * When the Orchestrator reasoning pass fires, it becomes the final authority.
 * Deadlocks and borderline applies are remapped so the user never sees a raw
 * `deadlock_escalate` after orchestration — apply resolves to
 * `apply_with_caveat`; other actions map to skip.
 */
function applyOrchestratorDecisionOverride(
  base: MasterDecision,
  orchestrator_verdict: OrchestratorVerdict,
): MasterDecision {
  const next: MasterDecision = {
    ...base,
    user_action_required: false,
    summary: orchestrator_verdict.holistic_summary || base.summary,
  };

  if (orchestrator_verdict.action === 'apply') {
    return { ...next, decision: 'apply_with_caveat' };
  }

  return { ...next, decision: 'skip_consensus' };
}

/**
 * Map a clear-cut deterministic decision class to its `resolved_action`.
 * Only called when the reasoning pass is skipped.
 */
function deterministicResolvedAction(
  decision: import('@worksignal/shared').MasterDecision,
): OrchestratorAction {
  switch (decision.decision) {
    case 'apply_consensus':
    case 'apply_with_caveat':
      return 'apply';
    case 'deadlock_escalate':
      // Fallback only — normally the reasoning pass handles this.
      return 'hold';
    case 'skip_consensus':
    case 'veto_skip':
    default:
      return 'hold';
  }
}

/**
 * Resolve a set of agent verdicts into a fully-enriched {@link EnrichedMasterDecision}.
 *
 * Runs the deterministic decision tree, then — for deadlock and borderline
 * apply cases — runs the heuristic scoring pass and Bedrock prose generation
 * to produce an {@link OrchestratorVerdict} that resolves the deadlock.
 *
 * @param input - The verdict set, user config, job, optional skill-gap history,
 *                and injectable Bedrock invocation.
 * @returns The enriched decision, always a valid `EnrichedMasterDecision`.
 */
export async function resolveEnriched(
  input: ResolveEnrichedInput,
): Promise<EnrichedMasterDecision> {
  const { verdicts, user, job, skillGapHistory = [], bedrock, bedrockOptions } = input;

  // Step 1–2: deterministic tree + Realism floor.
  const base = resolveDecision(verdicts);
  const floored = applyRealismFloor(base, verdicts.realism);

  const scoresSummary = {
    ambition:    verdicts.ambition    ? `${verdicts.ambition.verdict}/${verdicts.ambition.ambition_score}`       : 'missing',
    realism:     verdicts.realism     ? `${verdicts.realism.verdict}/${verdicts.realism.match_score}`            : 'missing',
    risk:        verdicts.risk        ? `${verdicts.risk.verdict}/${verdicts.risk.risk_score}`                   : 'missing',
    opportunity: verdicts.opportunity ? `${verdicts.opportunity.verdict}/${verdicts.opportunity.urgency_score}`  : 'missing',
  };

  console.log(`[Orchestrator] ── Resolving: "${job.role_title}" @ ${job.company}`);
  console.log(`[Orchestrator] Scores  ambition=${scoresSummary.ambition}  realism=${scoresSummary.realism}  risk=${scoresSummary.risk}  opportunity=${scoresSummary.opportunity}`);
  console.log(`[Orchestrator] Deterministic decision: ${floored.decision} (agents_for=[${floored.agents_for.join(', ')}]  agents_against=[${floored.agents_against.join(', ')}])`);

  // Step 3: decide whether a reasoning pass is needed.
  if (!shouldRunReasoningPass(floored)) {
    const resolved_action = deterministicResolvedAction(floored);
    console.log(`[Orchestrator] ✓ No reasoning pass needed → resolved_action=${resolved_action}`);
    return { ...floored, resolved_action };
  }

  console.log(`[Orchestrator] ⚡ Reasoning pass triggered (${floored.decision}) — running heuristic scoring…`);

  // Step 4: heuristic scoring (always deterministic, never throws).
  const heuristic = computeHeuristicAction({ verdicts, skillGapHistory });

  console.log(`[Orchestrator] Heuristic → action=${heuristic.action}  confidence=${heuristic.confidence}`);
  console.log(`[Orchestrator] Deciding factor: ${heuristic.deciding_factor}`);
  if (heuristic.upskill_targets?.length) {
    console.log(`[Orchestrator] Upskill targets: [${heuristic.upskill_targets.join(', ')}]`);
  }
  if (heuristic.apply_angle) {
    console.log(`[Orchestrator] Apply angle: ${heuristic.apply_angle}`);
  }

  // Step 5: Bedrock prose (with fallback — never throws).
  let holistic_summary: string;
  if (bedrock) {
    console.log(`[Orchestrator] Calling Bedrock for holistic_summary prose…`);
    holistic_summary = await generateOrchestratorProse(
      heuristic.action,
      heuristic.deciding_factor,
      heuristic,
      verdicts,
      user,
      job,
      bedrock,
      skillGapHistory,
      bedrockOptions,
    );
    console.log(`[Orchestrator] Bedrock prose received (${holistic_summary.length} chars)`);
  } else {
    holistic_summary = heuristic.deciding_factor;
    console.log(`[Orchestrator] No Bedrock injected — using deciding_factor as prose fallback`);
  }

  console.log(`[Orchestrator] ✅ Final verdict: ${heuristic.action.toUpperCase()} (${heuristic.confidence}% confidence) — "${job.role_title}" @ ${job.company}`);

  // Step 6: assemble OrchestratorVerdict.
  const orchestrator_verdict: OrchestratorVerdict = {
    action: heuristic.action,
    confidence: heuristic.confidence,
    holistic_summary,
    deciding_factor: heuristic.deciding_factor,
    ...(heuristic.apply_angle !== undefined && { apply_angle: heuristic.apply_angle }),
    ...(heuristic.upskill_targets !== undefined && { upskill_targets: heuristic.upskill_targets }),
  };

  const finalized = applyOrchestratorDecisionOverride(floored, orchestrator_verdict);

  return {
    ...finalized,
    resolved_action: heuristic.action,
    orchestrator_verdict,
  };
}
