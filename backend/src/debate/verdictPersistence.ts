/**
 * Verdict validation + AgentVerdicts persistence integration (Task 13.2).
 *
 * Wires the four debate agents (Task 13.1) to the verdict-schema validator
 * (Task 5.1 / `./verdictValidator`) and the `AgentVerdicts` DynamoDB table,
 * implementing:
 *
 *   10.6  WHEN all four agents produce Verdicts for a job, THE Debate_Engine
 *         SHALL store the four Verdicts in the AgentVerdicts table keyed by the
 *         job and User.
 *   11.1  Accept a Verdict only when it is valid JSON conforming to that
 *         agent's defined schema.
 *   11.2  Accept a numeric score only when within 0-100 inclusive.
 *   11.3  IF an agent produces non-conforming output, THEN treat that agent's
 *         evaluation as failed and apply agent-failure recovery — here, the
 *         failed agent is recorded in `agent_failures` and omitted from the
 *         stored verdicts (its sub-object is persisted as `null`).
 *   11.4  Invalid output is logged (via the validator's logger hook) while the
 *         surviving verdicts are still persisted.
 *
 * Design alignment (see design "Data Models → Table: AgentVerdicts"):
 *  - Partition key `verdict_id`; the record carries `(job_id, user_id)` for the
 *    GSI lookup (Req 10.6).
 *  - Each agent sub-object is stored in the design's persisted shape, which
 *    renames the typed verdict fields: the per-agent score field
 *    (`ambition_score` / `match_score` / `risk_score` / `urgency_score`) is
 *    stored as `score`, Realism's `key_gaps`/`work_life_flags` as
 *    `gaps`/`wlb_flags`.
 *  - `agent_failures` records the agents whose verdicts were invalid/unavailable
 *    (Req 11.3); `master_decision` is embedded when supplied by the caller
 *    (Master_Orchestrator output, Req 12.8).
 *
 * The DynamoDB wrapper, clock, and id generator are **injectable** so this
 * module is unit/integration testable (task 13.3) with no real AWS calls. This
 * module imports — and does not modify — the four agent runners and the verdict
 * validator.
 */

import { randomUUID } from 'node:crypto';
import {
  AGENT_NAMES,
  DynamoDBWrapper,
  type AgentName,
  type AmbitionVerdict,
  type DynamoItem,
  type Job,
  type Logger,
  type MasterDecision,
  type OpportunityVerdict,
  type RealismVerdict,
  type RedFlag,
  type RiskVerdict,
  type UserConfig,
  type VerdictSet,
} from '@worksignal/shared';
import {
  isInvalidVerdict,
  validateVerdict,
} from './verdictValidator.js';
import {
  runAmbitionAgent,
  runOpportunityAgent,
  runRealismAgent,
  runRiskAgent,
  type AgentInvocationOptions,
  type BedrockInvoke,
  type ExaClient,
} from './agents/index.js';

/* ------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------ */

/** Default DynamoDB table name for stored verdicts (design Data Models). */
export const DEFAULT_AGENT_VERDICTS_TABLE = 'AgentVerdicts';

/* ------------------------------------------------------------------ *
 * Persisted sub-object shapes (design "Table: AgentVerdicts")
 * ------------------------------------------------------------------ */

/** Stored Ambition sub-object (`ambition_score` → `score`). */
export interface StoredAmbitionVerdict {
  verdict: AmbitionVerdict['verdict'];
  score: number;
  reasoning: string;
  key_argument: string;
}

/** Stored Realism sub-object (`match_score` → `score`, gaps/flags renamed). */
export interface StoredRealismVerdict {
  verdict: RealismVerdict['verdict'];
  score: number;
  reasoning: string;
  key_argument: string;
  gaps: string[];
  wlb_flags: string[];
}

/** Stored Risk sub-object (`risk_score` → `score`). */
export interface StoredRiskVerdict {
  verdict: RiskVerdict['verdict'];
  score: number;
  reasoning: string;
  key_argument: string;
  red_flags: RedFlag[];
  glassdoor_score: number | null;
}

/** Stored Opportunity sub-object (`urgency_score` → `score`). */
export interface StoredOpportunityVerdict {
  verdict: OpportunityVerdict['verdict'];
  score: number;
  reasoning: string;
  key_argument: string;
  timing_factors: string[];
}

/**
 * The persisted `AgentVerdicts` record (design Data Models). Failed agents are
 * stored as `null` and named in `agent_failures` (Req 11.3). `master_decision`
 * is present only when the caller supplies the Master_Orchestrator output.
 */
export interface AgentVerdictsRecord {
  verdict_id: string;
  job_id: string;
  user_id: string;
  ambition: StoredAmbitionVerdict | null;
  realism: StoredRealismVerdict | null;
  risk: StoredRiskVerdict | null;
  opportunity: StoredOpportunityVerdict | null;
  master_decision?: MasterDecision;
  agent_failures: AgentName[];
  created_at: string;
}

/* ------------------------------------------------------------------ *
 * Inputs / dependencies
 * ------------------------------------------------------------------ */

/**
 * The four agents' raw outputs, keyed by agent. Each value is whatever the
 * agent produced — a JSON string, an already-parsed object, a typed verdict, or
 * an {@link InvalidVerdict}; every value is re-validated through the
 * verdict-schema validator before persistence (Req 11.1-11.3).
 */
export interface AgentRawOutputs {
  ambition: unknown;
  realism: unknown;
  risk: unknown;
  opportunity: unknown;
}

/** Injectable dependencies for persistence. */
export interface VerdictPersistenceDeps {
  /** DynamoDB wrapper (injectable; defaults to a real client). */
  db?: DynamoDBWrapper;
  /** Override the AgentVerdicts table name. */
  tableName?: string;
  /** Clock injection for deterministic `created_at`. Defaults to `new Date()`. */
  now?: () => Date;
  /** Verdict-id generator. Defaults to `randomUUID`. */
  generateVerdictId?: () => string;
  /** Optional structured logger; forwarded to the validator (Req 11.4). */
  logger?: Logger;
}

/** Result of validating the four raw agent outputs. */
export interface ValidatedVerdicts {
  /** The valid verdicts, keyed by agent (degraded subset on failures). */
  verdicts: VerdictSet;
  /** Agents whose output failed validation (Req 11.3). */
  agent_failures: AgentName[];
}

/** Result of a persistence run. */
export interface VerdictPersistenceResult {
  verdict_id: string;
  job_id: string;
  user_id: string;
  /** The valid verdicts that were stored. */
  verdicts: VerdictSet;
  /** Agents whose output failed validation and were recorded as failures. */
  agent_failures: AgentName[];
  /** The exact record written to the AgentVerdicts table. */
  record: AgentVerdictsRecord;
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

/**
 * Validate the four agents' raw outputs with the verdict-schema validator
 * (Req 11.1-11.3). Each agent is validated independently: a conforming output
 * is collected into {@link ValidatedVerdicts.verdicts}; a non-conforming one is
 * treated as a failed evaluation and the agent name is collected into
 * `agent_failures`. Invalid output is logged via the validator's logger hook
 * (Req 11.4) when a logger is supplied.
 */
export function validateAgentOutputs(
  outputs: AgentRawOutputs,
  options: { logger?: Logger } = {},
): ValidatedVerdicts {
  const { logger } = options;
  const verdicts: VerdictSet = {};
  const agent_failures: AgentName[] = [];

  const ambition = validateVerdict(outputs.ambition, 'ambition', { logger });
  if (isInvalidVerdict(ambition)) {
    agent_failures.push('ambition');
  } else {
    verdicts.ambition = ambition as AmbitionVerdict;
  }

  const realism = validateVerdict(outputs.realism, 'realism', { logger });
  if (isInvalidVerdict(realism)) {
    agent_failures.push('realism');
  } else {
    verdicts.realism = realism as RealismVerdict;
  }

  const risk = validateVerdict(outputs.risk, 'risk', { logger });
  if (isInvalidVerdict(risk)) {
    agent_failures.push('risk');
  } else {
    verdicts.risk = risk as RiskVerdict;
  }

  const opportunity = validateVerdict(outputs.opportunity, 'opportunity', { logger });
  if (isInvalidVerdict(opportunity)) {
    agent_failures.push('opportunity');
  } else {
    verdicts.opportunity = opportunity as OpportunityVerdict;
  }

  // Preserve canonical agent ordering in the failure list.
  agent_failures.sort(
    (a, b) => AGENT_NAMES.indexOf(a) - AGENT_NAMES.indexOf(b),
  );

  return { verdicts, agent_failures };
}

/* ------------------------------------------------------------------ *
 * Record shaping (typed verdict → persisted sub-object)
 * ------------------------------------------------------------------ */

function toStoredAmbition(v: AmbitionVerdict): StoredAmbitionVerdict {
  return {
    verdict: v.verdict,
    score: v.ambition_score,
    reasoning: v.reasoning,
    key_argument: v.key_argument,
  };
}

function toStoredRealism(v: RealismVerdict): StoredRealismVerdict {
  return {
    verdict: v.verdict,
    score: v.match_score,
    reasoning: v.reasoning,
    key_argument: v.key_argument,
    gaps: [...v.key_gaps],
    wlb_flags: [...v.work_life_flags],
  };
}

function toStoredRisk(v: RiskVerdict): StoredRiskVerdict {
  return {
    verdict: v.verdict,
    score: v.risk_score,
    reasoning: v.reasoning,
    key_argument: v.key_argument,
    red_flags: v.red_flags.map((rf) => ({ ...rf })),
    glassdoor_score: v.glassdoor_score,
  };
}

function toStoredOpportunity(v: OpportunityVerdict): StoredOpportunityVerdict {
  return {
    verdict: v.verdict,
    score: v.urgency_score,
    reasoning: v.reasoning,
    key_argument: v.key_argument,
    timing_factors: [...v.timing_factors],
  };
}

/** Parameters for {@link buildAgentVerdictsRecord}. */
export interface BuildAgentVerdictsRecordParams {
  verdict_id: string;
  job_id: string;
  user_id: string;
  verdicts: VerdictSet;
  agent_failures: AgentName[];
  created_at: string;
  master_decision?: MasterDecision;
}

/**
 * Build the persisted {@link AgentVerdictsRecord} from validated verdicts. All
 * four agent keys are always present; a failed/absent agent is stored as
 * `null`. Pure and side-effect free.
 */
export function buildAgentVerdictsRecord(
  params: BuildAgentVerdictsRecordParams,
): AgentVerdictsRecord {
  const { verdicts } = params;
  const record: AgentVerdictsRecord = {
    verdict_id: params.verdict_id,
    job_id: params.job_id,
    user_id: params.user_id,
    ambition: verdicts.ambition ? toStoredAmbition(verdicts.ambition) : null,
    realism: verdicts.realism ? toStoredRealism(verdicts.realism) : null,
    risk: verdicts.risk ? toStoredRisk(verdicts.risk) : null,
    opportunity: verdicts.opportunity
      ? toStoredOpportunity(verdicts.opportunity)
      : null,
    agent_failures: [...params.agent_failures],
    created_at: params.created_at,
  };
  if (params.master_decision) {
    record.master_decision = params.master_decision;
  }
  return record;
}

/* ------------------------------------------------------------------ *
 * Persistence
 * ------------------------------------------------------------------ */

/** Parameters for {@link persistAgentVerdicts}. */
export interface PersistAgentVerdictsParams {
  job_id: string;
  user_id: string;
  /** The four agents' raw outputs to validate and persist. */
  outputs: AgentRawOutputs;
  /** Optional Master_Orchestrator decision to embed in the record (Req 12.8). */
  master_decision?: MasterDecision;
}

/**
 * Validate the four agents' raw outputs and store all valid verdicts in the
 * AgentVerdicts table keyed by `(job_id, user_id)` (Req 10.6, 11.1-11.4).
 *
 * Failed agents are recorded in `agent_failures` and their sub-objects stored
 * as `null` (Req 11.3); the surviving verdicts are still persisted (Req 11.4).
 * The DynamoDB wrapper, clock, and id generator are injectable via `deps`.
 *
 * @returns The generated `verdict_id`, the validated verdicts, the
 *   `agent_failures`, and the exact record written.
 */
export async function persistAgentVerdicts(
  params: PersistAgentVerdictsParams,
  deps: VerdictPersistenceDeps = {},
): Promise<VerdictPersistenceResult> {
  const db = deps.db ?? new DynamoDBWrapper();
  const tableName = deps.tableName ?? DEFAULT_AGENT_VERDICTS_TABLE;
  const generateVerdictId = deps.generateVerdictId ?? (() => randomUUID());
  const now = deps.now ?? (() => new Date());

  const { verdicts, agent_failures } = validateAgentOutputs(params.outputs, {
    logger: deps.logger,
  });

  const verdict_id = generateVerdictId();
  const created_at = now().toISOString();

  const record = buildAgentVerdictsRecord({
    verdict_id,
    job_id: params.job_id,
    user_id: params.user_id,
    verdicts,
    agent_failures,
    created_at,
    master_decision: params.master_decision,
  });

  await db.put(tableName, record as unknown as DynamoItem);

  deps.logger?.info('debate.verdicts.persisted', {
    verdict_id,
    job_id: params.job_id,
    user_id: params.user_id,
    stored_agents: AGENT_NAMES.filter((a) => verdicts[a] !== undefined),
    agent_failures,
  });

  return { verdict_id, job_id: params.job_id, user_id: params.user_id, verdicts, agent_failures, record };
}

/* ------------------------------------------------------------------ *
 * Run-and-persist convenience
 * ------------------------------------------------------------------ */

/** Parameters for {@link runAndPersistAgentVerdicts}. */
export interface RunAndPersistAgentVerdictsParams {
  job: Job;
  user: UserConfig;
  /** Injectable Bedrock invocation passed to every agent. */
  bedrock: BedrockInvoke;
  /** Injectable Exa research client used by the Risk_Agent. */
  exa: ExaClient;
  /** Bounded-retry knobs and optional logger forwarded to the agents. */
  agentOptions?: AgentInvocationOptions;
  /** Optional Master_Orchestrator decision to embed in the record (Req 12.8). */
  master_decision?: MasterDecision;
}

/**
 * Run the four debate agents in parallel (Req 10.1 fan-out), then validate and
 * persist their verdicts to the AgentVerdicts table (Req 10.6, 11.1-11.4).
 *
 * A convenience over {@link persistAgentVerdicts} for callers that have not
 * already run the agents. Each runner already validates its own output; the
 * outputs are re-validated here through the same verdict-schema validator so a
 * runner that returned an {@link InvalidVerdict} is recorded as a failed agent.
 */
export async function runAndPersistAgentVerdicts(
  params: RunAndPersistAgentVerdictsParams,
  deps: VerdictPersistenceDeps = {},
): Promise<VerdictPersistenceResult> {
  const { job, user, bedrock, exa, agentOptions } = params;

  const [ambition, realism, risk, opportunity] = await Promise.all([
    runAmbitionAgent(job, user, bedrock, agentOptions),
    runRealismAgent(job, user, bedrock, agentOptions),
    runRiskAgent(job, user, bedrock, exa, agentOptions),
    runOpportunityAgent(job, user, bedrock, agentOptions),
  ]);

  return persistAgentVerdicts(
    {
      job_id: job.job_id,
      user_id: user.user_id,
      outputs: { ambition, realism, risk, opportunity },
      master_decision: params.master_decision,
    },
    deps,
  );
}
