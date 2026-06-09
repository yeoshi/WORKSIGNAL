/**
 * Master_Orchestrator — degraded resolution with partial verdicts
 * (Requirements 22.4, 22.5).
 *
 * When one or more debate agents fail to produce a valid {@link Verdict} after
 * retries, the Debate_Engine still hands the Master_Orchestrator whatever
 * *valid* verdicts it collected. This module owns the degraded-mode resolution
 * path layered on top of the deterministic decision tree in
 * {@link ./decisionTree.ts}:
 *
 *  - **Partial resolution (Req 22.4).** Given any *non-empty* subset of valid
 *    verdicts, resolve a decision from the available verdicts and record the
 *    unavailable agents in `agent_failures` on the returned
 *    {@link MasterDecision}. The Risk-`avoid` **veto is preserved** in degraded
 *    mode: if the available subset includes a Risk verdict of `avoid`, the
 *    decision is still `veto_skip`. (This falls out for free because
 *    {@link resolveDecision} consults {@link isVetoed}, which only depends on a
 *    *present* Risk verdict.)
 *
 *  - **No valid verdict (Req 22.5).** Given an *empty* set of valid verdicts,
 *    abort resolution for that job: produce **no Decision** and log the failure
 *    via the optional structured {@link Logger}.
 *
 * Consistency with the decision tree: the deterministic apply-equivalent count
 * is computed over the *present* verdicts only — {@link resolveDecision} already
 * treats a missing agent as neither apply-equivalent nor counted — so degraded
 * resolution introduces no new counting rules. It only (a) decides whether a
 * decision can be produced at all and (b) annotates the result with the agents
 * that were unavailable.
 *
 * Pure and deterministic aside from the optional logging side effect: the same
 * verdict set always yields the same {@link DegradedResolutionResult}.
 */

import type { AgentName, MasterDecision, VerdictSet } from '@worksignal/shared';
import { type Logger } from '@worksignal/shared';

import { resolveDecision } from './decisionTree.js';

/**
 * The four debate agents in canonical order. Used to compute which agents are
 * unavailable (the complement of those present in a {@link VerdictSet}).
 */
export const ALL_AGENTS: readonly AgentName[] = [
  'ambition',
  'realism',
  'risk',
  'opportunity',
] as const;

/** Is an individual agent's verdict present in the set? */
function isPresent(verdicts: VerdictSet, agent: AgentName): boolean {
  switch (agent) {
    case 'ambition':
      return verdicts.ambition !== undefined;
    case 'realism':
      return verdicts.realism !== undefined;
    case 'risk':
      return verdicts.risk !== undefined;
    case 'opportunity':
      return verdicts.opportunity !== undefined;
    default:
      return false;
  }
}

/**
 * The agents whose valid verdict is **present** in the set, in canonical order.
 * A "valid" verdict is one supplied to this module — the verdict-schema
 * validator (task 5.1) is responsible for ensuring only schema-conformant
 * verdicts are placed in the {@link VerdictSet} before it reaches here.
 */
export function presentAgents(verdicts: VerdictSet): AgentName[] {
  return ALL_AGENTS.filter((agent) => isPresent(verdicts, agent));
}

/**
 * The agents whose verdict is **unavailable** (missing/failed), in canonical
 * order — the complement of {@link presentAgents}. These are recorded in
 * `agent_failures` on the resolved decision (Req 22.4).
 */
export function failedAgents(verdicts: VerdictSet): AgentName[] {
  return ALL_AGENTS.filter((agent) => !isPresent(verdicts, agent));
}

/** Does the set contain at least one valid verdict (Req 22.4 vs 22.5)? */
export function hasAnyValidVerdict(verdicts: VerdictSet): boolean {
  return presentAgents(verdicts).length > 0;
}

/**
 * A successful degraded resolution (Req 22.4): a decision was produced from the
 * non-empty subset of available verdicts, with the unavailable agents recorded.
 */
export interface DegradedResolutionSuccess {
  /** Discriminant: a decision was produced. */
  resolved: true;
  /**
   * The resolved decision. Its `agent_failures` lists the unavailable agents
   * (empty/omitted only when the full set of four verdicts was present).
   */
  decision: MasterDecision;
  /** The agents whose verdicts were unavailable in this resolution. */
  agent_failures: AgentName[];
}

/**
 * A failed degraded resolution (Req 22.5): no valid verdict existed, so no
 * Decision is produced and the failure is logged.
 */
export interface DegradedResolutionFailure {
  /** Discriminant: no decision could be produced. */
  resolved: false;
  /** Always `null` — Req 22.5 mandates no Decision is produced. */
  decision: null;
  /** All four agents, since none produced a valid verdict. */
  agent_failures: AgentName[];
  /** Human-readable reason for the abort, also emitted to the logger. */
  reason: string;
}

/**
 * The outcome of degraded resolution: either a decision resolved from a
 * non-empty subset (Req 22.4) or an aborted resolution when no valid verdict
 * exists (Req 22.5).
 */
export type DegradedResolutionResult =
  | DegradedResolutionSuccess
  | DegradedResolutionFailure;

/** Message logged when resolution is aborted for want of any valid verdict. */
export const NO_VALID_VERDICT_MESSAGE =
  'Degraded resolution aborted: no valid agent verdict available; no Decision produced';

/**
 * Resolve a (possibly partial) {@link VerdictSet} in degraded mode
 * (Req 22.4, 22.5).
 *
 * - If **at least one** valid verdict is present, resolve the decision from the
 *   available verdicts via {@link resolveDecision} and attach the unavailable
 *   agents to `agent_failures` (Req 22.4). The Risk-`avoid` veto is preserved
 *   whenever a Risk `avoid` verdict is among the available subset. The
 *   `agent_failures` field is populated only when at least one agent is
 *   unavailable; a complete four-verdict set resolves without it.
 * - If **no** valid verdict is present, produce no Decision and log the failure
 *   via the optional `logger` (Req 22.5).
 *
 * @param verdicts - The subset of valid agent verdicts (any may be missing).
 * @param logger   - Optional structured logger; the no-valid-verdict failure is
 *                   logged at `error` level with the failed agents attached.
 * @returns A {@link DegradedResolutionResult} describing the outcome.
 */
export function resolveDegraded(
  verdicts: VerdictSet,
  logger?: Logger,
): DegradedResolutionResult {
  const failures = failedAgents(verdicts);

  // Req 22.5: no valid verdict at all → abort, log, produce no Decision.
  if (!hasAnyValidVerdict(verdicts)) {
    logger?.error(NO_VALID_VERDICT_MESSAGE, { agent_failures: failures });
    return {
      resolved: false,
      decision: null,
      agent_failures: failures,
      reason: NO_VALID_VERDICT_MESSAGE,
    };
  }

  // Req 22.4: resolve from the available subset (veto preserved by
  // resolveDecision, which only vetoes on a *present* Risk `avoid` verdict).
  const decision = resolveDecision(verdicts);

  // Record the unavailable agents only when degraded (at least one missing).
  if (failures.length > 0) {
    decision.agent_failures = failures;
  }

  return { resolved: true, decision, agent_failures: failures };
}
