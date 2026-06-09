/**
 * WorkSignal-Debate-Machine — in-process orchestration driver (Task 14.1).
 *
 * The companion to the infra ASL definition (`infra/src/debateMachine.ts`):
 * where that file declares the Step Functions workflow for deployment, this
 * module wires the existing pure/integration pieces into a **runnable
 * in-process equivalent** for local development and tests. It follows the same
 * flow as the design's "Debate State Machine Flow":
 *
 *   scan → pre-filter (collect survivors) → all-filtered? (relaxation suggestion)
 *        → per surviving job: debate → degraded resolution + Realism floor
 *        → route per decision → order the review queue (act_now fast-track on top)
 *
 * It imports — and does **not** modify — the following pieces:
 *  - Opportunity_Scanner   (`createOpportunityScanner`)        — scan (Req 7).
 *  - `preFilter`           (`../preFilter/preFilter.js`)        — non-negotiables (Req 8, 9).
 *  - relaxation detection  (`../preFilter/relaxation.js`)       — all-filtered → suggestion (Req 9.5, 9.6).
 *  - `runAndPersistAgentVerdicts` (`./verdictPersistence.js`)   — parallel debate + persistence (Req 10.1, 10.6, 11).
 *  - `resolveDegraded`     (`../orchestrator/degradedResolution.js`) — Master decision tree, degraded (Req 12, 22.4, 22.5).
 *  - `applyRealismFloor`   (`../orchestrator/realismFloor.js`)  — Realism floor confirmation (Req 12.6).
 *  - fast-track ordering   (`../orchestrator/fastTrack.js`)     — top-of-queue placement (Req 13.5).
 *
 * Material generation internals are **not** implemented here (task 14.2 owns
 * `generateMaterials`); the driver calls an **injectable** `generateMaterials`
 * hook for apply-equivalent decisions. Every external dependency (scan, the
 * verdict runner, material generation, routing sinks, clock, id generator) is
 * injectable so the driver runs deterministically with no real AWS calls.
 *
 * Routing (Req 13.1-13.4):
 *  - apply_consensus / apply_with_caveat → generate materials + queue for review (13.1).
 *  - deadlock_escalate                   → escalate: save + notify (13.2).
 *  - skip_consensus                      → log-only (13.3).
 *  - veto_skip                           → log + hide (never surface) (13.4).
 *  - no valid verdict (degraded abort)   → no Decision, log the failure (22.5).
 */

import { randomUUID } from 'node:crypto';
import type {
  AgentName,
  Decision,
  DiscoveredJob,
  Filter_Relaxation_Suggestion,
  Job,
  Logger,
  Materials,
  MasterDecision,
  UserConfig,
  VerdictSet,
} from '@worksignal/shared';

import { createOpportunityScanner } from '../discovery/opportunityScanner.js';
import { preFilter } from '../preFilter/preFilter.js';
import {
  allJobsDiscarded,
  deriveRelaxationSuggestion,
  type RelaxationContext,
  type ScannedJobEvaluation,
} from '../preFilter/relaxation.js';
import {
  runAndPersistAgentVerdicts,
  type VerdictPersistenceDeps,
  type VerdictPersistenceResult,
} from './verdictPersistence.js';
import { resolveDegraded } from '../orchestrator/degradedResolution.js';
import { applyRealismFloor } from '../orchestrator/realismFloor.js';
import {
  orderReviewQueue,
  queuePlacementFor,
  type QueuePlacement,
  type ReviewQueueItem,
} from '../orchestrator/fastTrack.js';
import type {
  AgentInvocationOptions,
  BedrockInvoke,
  ExaClient,
} from './agents/index.js';

/* ------------------------------------------------------------------ *
 * Routing
 * ------------------------------------------------------------------ */

/** The four routing outcomes the Choice maps decisions to (Req 13.1-13.4). */
export type RouteAction =
  | 'generate_materials'
  | 'escalate'
  | 'log_only'
  | 'veto_log';

/**
 * Map a resolved {@link Decision} to its {@link RouteAction} (Req 13.1-13.4),
 * the single source of truth for routing shared with the ASL `RouteChoice`:
 *  - `apply_consensus` / `apply_with_caveat` → `generate_materials` (13.1).
 *  - `deadlock_escalate`                     → `escalate` (13.2).
 *  - `skip_consensus`                        → `log_only` (13.3).
 *  - `veto_skip`                             → `veto_log` (13.4).
 *
 * Total over every `Decision` value.
 */
export function routeActionFor(decision: Decision): RouteAction {
  switch (decision) {
    case 'apply_consensus':
    case 'apply_with_caveat':
      return 'generate_materials';
    case 'deadlock_escalate':
      return 'escalate';
    case 'skip_consensus':
      return 'log_only';
    case 'veto_skip':
      return 'veto_log';
  }
}

/* ------------------------------------------------------------------ *
 * Injectable dependencies
 * ------------------------------------------------------------------ */

/**
 * Injectable material-generation hook (task 14.2 owns the internals). Invoked
 * for apply-equivalent decisions to produce the resume + cover letter
 * {@link Materials} (Req 14). Kept abstract here so the driver stays free of
 * S3/Bedrock material-generation concerns.
 */
export type GenerateMaterialsHook = (
  job: Job,
  decision: MasterDecision,
  user: UserConfig,
) => Promise<Materials>;

/** Injectable scan step (Req 7). Defaults to the Opportunity_Scanner. */
export type ScanFn = (user: UserConfig) => Promise<DiscoveredJob[]>;

/**
 * Injectable verdict runner (Req 10.1, 10.6, 11): runs the four agents in
 * parallel and persists their verdicts. Defaults to
 * {@link runAndPersistAgentVerdicts}.
 */
export type RunVerdictsFn = (
  job: Job,
  user: UserConfig,
) => Promise<VerdictPersistenceResult>;

/** Context passed to every routing sink. */
export interface RouteContext {
  job: Job;
  user: UserConfig;
  verdict_id: string;
  verdicts: VerdictSet;
  decision: MasterDecision;
  /** Materials generated for an apply-equivalent decision (Req 13.1). */
  materials?: Materials;
  /** Queue placement for an apply-equivalent decision (Req 13.5). */
  queue_placement?: QueuePlacement;
}

/**
 * Optional routing side-effect sinks (persistence / notification / hiding). The
 * driver computes the route and outcome regardless; these hooks let callers
 * perform the I/O for each branch (Req 13.1-13.4). All are optional and
 * injectable so the driver runs purely in tests.
 */
export interface RouteSinks {
  /** apply_consensus / apply_with_caveat: queue for review (Req 13.1). */
  onGenerateMaterials?(ctx: RouteContext): void | Promise<void>;
  /** deadlock_escalate: save + notify the user (Req 13.2). */
  onEscalate?(ctx: RouteContext): void | Promise<void>;
  /** skip_consensus: log-only (Req 13.3). */
  onLogOnly?(ctx: RouteContext): void | Promise<void>;
  /** veto_skip: log + never surface (Req 13.4). */
  onVetoLog?(ctx: RouteContext): void | Promise<void>;
  /** No valid verdict: no Decision produced, log the failure (Req 22.5). */
  onNoDecision?(ctx: { job: Job; user: UserConfig; agent_failures: AgentName[] }): void | Promise<void>;
}

/** Injectable dependencies for {@link runDebateMachine}. */
export interface DebateMachineDeps {
  /** Injectable Bedrock invocation for the four agents (required). */
  bedrock: BedrockInvoke;
  /** Injectable Exa research client for the Risk_Agent (required). */
  exa: ExaClient;
  /** Injectable material-generation hook (task 14.2) (required). */
  generateMaterials: GenerateMaterialsHook;
  /** Override the scan step. Defaults to the Opportunity_Scanner. */
  scan?: ScanFn;
  /** Override the verdict runner. Defaults to runAndPersistAgentVerdicts. */
  runVerdicts?: RunVerdictsFn;
  /** Persistence deps forwarded to the default verdict runner (db, clock, ids). */
  verdictPersistence?: VerdictPersistenceDeps;
  /** Bounded-retry knobs + logger forwarded to the agents (Req 22.1). */
  agentOptions?: AgentInvocationOptions;
  /** Optional routing side-effect sinks (Req 13.1-13.4). */
  sinks?: RouteSinks;
  /** Structured logger. */
  logger?: Logger;
  /** Clock injection for deterministic relaxation `created_at`. */
  now?: () => Date;
  /** Id generator for the relaxation suggestion. Defaults to randomUUID. */
  generateSuggestionId?: () => string;
  /** Stable scan-run id (e.g. an execution id). Defaults to a generated id. */
  scanRunId?: string;
}

/* ------------------------------------------------------------------ *
 * Result shapes
 * ------------------------------------------------------------------ */

/** The outcome of debating a single surviving job. */
export interface JobDebateOutcome {
  job: Job;
  verdict_id: string;
  verdicts: VerdictSet;
  /** The resolved decision, or `null` when no valid verdict existed (Req 22.5). */
  decision: MasterDecision | null;
  /** Agents whose verdicts were unavailable (Req 22.4). */
  agent_failures: AgentName[];
  /** The routing action taken, or `no_decision` for the degraded abort. */
  route: RouteAction | 'no_decision';
  /** Materials produced for an apply-equivalent decision (Req 13.1). */
  materials?: Materials;
  /** Queue placement for an apply-equivalent decision (Req 13.5). */
  queue_placement?: QueuePlacement;
}

/** The full result of one debate-machine run for a user. */
export interface DebateMachineRunResult {
  user_id: string;
  /** Number of jobs discovered by the scan. */
  scanned: number;
  /** The jobs that survived the Pre_Filter (Req 8, 9). */
  survivors: Job[];
  /** True when every scanned job was discarded (Req 9.5). */
  all_filtered: boolean;
  /**
   * The derived relaxation suggestion when all jobs were filtered (Req 9.6), or
   * `null` (no jobs scanned, or no safe single-blocker adjustment exists).
   */
  relaxation_suggestion: Filter_Relaxation_Suggestion | null;
  /** Per-survivor debate outcomes, in survivor order. */
  outcomes: JobDebateOutcome[];
  /**
   * The review queue: every apply-equivalent (queued) application, ordered with
   * `act_now` fast-track applications at the top (Req 13.5).
   */
  review_queue: JobDebateOutcome[];
}

/* ------------------------------------------------------------------ *
 * The orchestration driver
 * ------------------------------------------------------------------ */

/**
 * Run the in-process debate machine for a single user (Task 14.1).
 *
 * Steps, mirroring the ASL definition:
 *  1. **Scan** for jobs via the (injectable) Opportunity_Scanner (Req 7).
 *  2. **Pre-filter** each job, collecting survivors; the discarded jobs leave no
 *     user-visible record (Req 8, 9, 9.2).
 *  3. **All-filtered branch:** if every scanned job was discarded, derive a
 *     {@link Filter_Relaxation_Suggestion} and return early — no debate runs
 *     and no non-negotiable is mutated (Req 9.5, 9.6).
 *  4. **Debate** each survivor: run the four agents in parallel and persist
 *     their verdicts (Req 10.1, 10.6, 11).
 *  5. **Resolve** via degraded resolution (preserving the Risk veto and
 *     recording `agent_failures`) then apply the Realism floor (Req 12, 12.6,
 *     22.4, 22.5). A job with no valid verdict yields no Decision (Req 22.5).
 *  6. **Route** each decision to materials / escalate / log / veto-log
 *     (Req 13.1-13.4), generating materials for apply-equivalent decisions via
 *     the injected hook.
 *  7. **Order** the review queue so `act_now` fast-track applications sit at the
 *     top (Req 13.5).
 *
 * @param user - The user whose pipeline is being run (latest onboarding config).
 * @param deps - Injectable dependencies; `bedrock`, `exa`, and
 *   `generateMaterials` are required, everything else has a default.
 * @returns A {@link DebateMachineRunResult} describing the run.
 */
export async function runDebateMachine(
  user: UserConfig,
  deps: DebateMachineDeps,
): Promise<DebateMachineRunResult> {
  const logger = deps.logger;
  const now = deps.now ?? (() => new Date());
  const scanRunId = deps.scanRunId ?? randomUUID();

  const scan: ScanFn =
    deps.scan ?? ((u) => createOpportunityScanner().scan(u.user_id));

  const runVerdicts: RunVerdictsFn =
    deps.runVerdicts ??
    ((job, u) =>
      runAndPersistAgentVerdicts(
        {
          job,
          user: u,
          bedrock: deps.bedrock,
          exa: deps.exa,
          agentOptions: deps.agentOptions,
        },
        { logger, ...deps.verdictPersistence },
      ));

  // 1. Scan (Req 7).
  const jobs = await scan(user);
  logger?.info('debate_machine.scanned', { user_id: user.user_id, scanned: jobs.length });

  // 2. Pre-filter, collecting survivors (Req 8, 9). Discarded jobs leave no
  //    user-visible record; the optional logger does internal analytics (Req 9.2).
  const evaluations: ScannedJobEvaluation[] = jobs.map((job) => ({
    job,
    result: preFilter(job, user, { logger }),
  }));
  const survivors: Job[] = evaluations
    .filter((e) => e.result.pass)
    .map((e) => e.job);

  // 3. All-filtered branch (Req 9.5, 9.6): notify + derive a suggestion; the
  //    suggestion never mutates the user's non-negotiables (await approval).
  const all_filtered = allJobsDiscarded(evaluations);
  if (all_filtered) {
    const context: RelaxationContext = {
      suggestion_id: (deps.generateSuggestionId ?? (() => randomUUID()))(),
      user_id: user.user_id,
      scan_run_id: scanRunId,
      created_at: now().toISOString(),
    };
    const relaxation_suggestion = deriveRelaxationSuggestion(
      evaluations,
      context,
      user.non_negotiables,
      { logger },
    );
    logger?.info('debate_machine.all_filtered', {
      user_id: user.user_id,
      scanned: jobs.length,
      suggestion: relaxation_suggestion?.target_non_negotiable ?? null,
    });
    return {
      user_id: user.user_id,
      scanned: jobs.length,
      survivors: [],
      all_filtered: true,
      relaxation_suggestion,
      outcomes: [],
      review_queue: [],
    };
  }

  // 4-6. Debate, resolve, and route each surviving job.
  const outcomes: JobDebateOutcome[] = [];
  for (const job of survivors) {
    const outcome = await debateAndRoute(job, user, {
      runVerdicts,
      generateMaterials: deps.generateMaterials,
      sinks: deps.sinks,
      logger,
    });
    outcomes.push(outcome);
  }

  // 7. Order the review queue: queued (apply-equivalent) applications with
  //    act_now fast-track on top (Req 13.5).
  const queued: ReviewQueueItem<JobDebateOutcome>[] = outcomes
    .filter((o) => o.route === 'generate_materials')
    .map((o) => ({ item: o, verdicts: o.verdicts }));
  const review_queue = orderReviewQueue(queued);

  return {
    user_id: user.user_id,
    scanned: jobs.length,
    survivors,
    all_filtered: false,
    relaxation_suggestion: null,
    outcomes,
    review_queue,
  };
}

/** Internal deps for {@link debateAndRoute}. */
interface DebateAndRouteDeps {
  runVerdicts: RunVerdictsFn;
  generateMaterials: GenerateMaterialsHook;
  sinks?: RouteSinks;
  logger?: Logger;
}

/**
 * Debate a single job, resolve its decision in degraded mode + Realism floor,
 * and route the outcome (Req 10-13, 22.4, 22.5). Extracted from
 * {@link runDebateMachine} so the per-job pipeline stays cohesive and testable.
 */
async function debateAndRoute(
  job: Job,
  user: UserConfig,
  deps: DebateAndRouteDeps,
): Promise<JobDebateOutcome> {
  const { runVerdicts, generateMaterials, sinks, logger } = deps;

  // 4. Parallel four-agent debate + verdict persistence (Req 10.1, 10.6, 11).
  const { verdict_id, verdicts } = await runVerdicts(job, user);

  // 5. Degraded resolution (Req 22.4, 22.5): resolve from the available
  //    verdicts, preserving the Risk veto and recording agent_failures.
  const resolution = resolveDegraded(verdicts, logger);

  if (!resolution.resolved) {
    // No valid verdict at all → no Decision produced; log the failure (Req 22.5).
    await sinks?.onNoDecision?.({ job, user, agent_failures: resolution.agent_failures });
    logger?.warn('debate_machine.no_decision', {
      job_id: job.job_id,
      user_id: user.user_id,
      agent_failures: resolution.agent_failures,
    });
    return {
      job,
      verdict_id,
      verdicts,
      decision: null,
      agent_failures: resolution.agent_failures,
      route: 'no_decision',
    };
  }

  // Realism floor: low realism forces user confirmation on apply decisions (Req 12.6).
  const decision = applyRealismFloor(resolution.decision, verdicts.realism);
  const action = routeActionFor(decision.decision);

  const outcome: JobDebateOutcome = {
    job,
    verdict_id,
    verdicts,
    decision,
    agent_failures: resolution.agent_failures,
    route: action,
  };

  // 6. Route per decision (Req 13.1-13.4).
  switch (action) {
    case 'generate_materials': {
      // Apply-equivalent: generate materials (Req 14) + queue for review (13.1);
      // act_now + >=2 other apply-equivalent agents → top of queue (13.5).
      const materials = await generateMaterials(job, decision, user);
      const queue_placement = queuePlacementFor(verdicts);
      outcome.materials = materials;
      outcome.queue_placement = queue_placement;
      await sinks?.onGenerateMaterials?.({
        job,
        user,
        verdict_id,
        verdicts,
        decision,
        materials,
        queue_placement,
      });
      break;
    }
    case 'escalate':
      // Deadlock: save + notify the user to decide (Req 13.2).
      await sinks?.onEscalate?.({ job, user, verdict_id, verdicts, decision });
      break;
    case 'log_only':
      // Skip consensus: log-only, nothing surfaced (Req 13.3).
      await sinks?.onLogOnly?.({ job, user, verdict_id, verdicts, decision });
      break;
    case 'veto_log':
      // Risk veto: log + never surface this job (Req 13.4).
      await sinks?.onVetoLog?.({ job, user, verdict_id, verdicts, decision });
      break;
  }

  logger?.info('debate_machine.routed', {
    job_id: job.job_id,
    user_id: user.user_id,
    decision: decision.decision,
    route: action,
    agent_failures: resolution.agent_failures,
  });

  return outcome;
}
