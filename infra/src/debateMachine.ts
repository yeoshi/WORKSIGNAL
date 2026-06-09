/**
 * WorkSignal-Debate-Machine — Step Functions state machine definition (Task 14.1).
 *
 * A declarative, framework-free **Amazon States Language (ASL)** object that
 * mirrors the design's "Debate State Machine Flow". It is shaped like the input
 * to `CreateStateMachine` / a CDK `StateMachine` `definitionBody`, so it can be
 * fed to the AWS SDK or a deployment harness in a later task. No solver or
 * runtime is invoked here — this is infrastructure-as-code.
 *
 * Flow (design §Debate State Machine Flow):
 *
 *   ScanJobs (Opportunity_Scanner: MCF API; Exa fallback)
 *     → PreFilterMap        (Map over discovered jobs → Pre_Filter)
 *     → CountSurvivors       (compute surviving-job count)
 *     → AllFilteredChoice    (Choice: every job discarded?)
 *         → yes → SuggestRelaxation  (build Filter_Relaxation_Suggestion + notify; await approval)
 *         → no  → DebateMap   (Map over surviving jobs)
 *                   → Parallel (Ambition | Realism | Risk | Opportunity — Bedrock tasks)
 *                   → ValidateVerdicts (JSON schema + score-range validation)
 *                   → Master   (Master_Orchestrator deterministic decision tree + degraded resolution)
 *                   → RouteChoice (Choice on decision)
 *                       → apply_consensus / apply_with_caveat → GenerateMaterials (+ queue; act_now → top of queue)
 *                       → deadlock_escalate                   → Escalate
 *                       → skip_consensus                      → LogOnly
 *                       → veto_skip                           → VetoLog
 *
 * Requirements: 9.5, 9.6 (all-filtered → relaxation suggestion), 10.1 (parallel
 * four-agent fan-out), 12.x (Master decision tree), 13.1-13.5 (routing +
 * fast-track top-of-queue), 22.1 (Bedrock bounded retry, max 3, exponential
 * backoff), 22.3 (Step Functions timeout → smaller batch via Catch), 22.4/22.5
 * (degraded resolution preserved by the Master state's Catch path).
 *
 * Each Bedrock agent task carries:
 *  - **Retry** on Bedrock throttling with exponential backoff capped at **3
 *    attempts** (Req 22.1).
 *  - **Catch** routing a persistently-failing agent to a `Mark<Agent>Failed`
 *    pass state so the branch still completes and the Master state can run the
 *    degraded-resolution path (Req 22.4, 22.5).
 */
import { AWS_REGION } from '@worksignal/shared';

/* ------------------------------------------------------------------ *
 * Minimal Amazon States Language (ASL) type surface
 * ------------------------------------------------------------------ */

/** A `Retry` rule on a Task/Parallel/Map state (ASL `Retrier`). */
export interface AslRetrier {
  /** Error names this retrier matches (e.g. Bedrock throttling). */
  ErrorEquals: string[];
  /** Seconds before the first retry. */
  IntervalSeconds?: number;
  /** Hard cap on retry attempts. For Bedrock tasks this is **3** (Req 22.1). */
  MaxAttempts?: number;
  /** Multiplier applied to the interval between retries (exponential backoff). */
  BackoffRate?: number;
}

/** A `Catch` rule routing a caught error to a recovery state (ASL `Catcher`). */
export interface AslCatcher {
  ErrorEquals: string[];
  /** State to transition to when the error is caught. */
  Next: string;
  /** Where to place the error info in the state payload. */
  ResultPath?: string;
}

/** A single branch of a Choice state. */
export interface AslChoiceRule {
  /** JSONPath reference to the value being tested. */
  Variable?: string;
  StringEquals?: string;
  NumericEquals?: number;
  NumericGreaterThan?: number;
  /** State to transition to when the rule matches. */
  Next: string;
}

/** A generic ASL state. Fields are optional per the state `Type`. */
export interface AslState {
  Type:
    | 'Task'
    | 'Map'
    | 'Parallel'
    | 'Choice'
    | 'Pass'
    | 'Wait'
    | 'Succeed'
    | 'Fail';
  Comment?: string;
  /** Task resource ARN/placeholder, or a logical resource id. */
  Resource?: string;
  Parameters?: Record<string, unknown>;
  ResultSelector?: Record<string, unknown>;
  ResultPath?: string;
  ItemsPath?: string;
  /** Map concurrency cap; reduced by the timeout Catch path (Req 22.3). */
  MaxConcurrency?: number;
  /** Map item processor (the per-item sub-workflow). */
  ItemProcessor?: AslSubDefinition;
  /** Parallel branches (each a sub-workflow). */
  Branches?: AslSubDefinition[];
  Choices?: AslChoiceRule[];
  Default?: string;
  Retry?: AslRetrier[];
  Catch?: AslCatcher[];
  Next?: string;
  End?: boolean;
  /** Overall timeout for the execution; used on the top-level proxy only. */
  TimeoutSeconds?: number;
}

/** A nested ASL definition (Map item processor / Parallel branch). */
export interface AslSubDefinition {
  StartAt: string;
  States: Record<string, AslState>;
  /** Map item-processor mode metadata (INLINE for in-account execution). */
  ProcessorConfig?: { Mode: 'INLINE' | 'DISTRIBUTED' };
}

/** A complete Amazon States Language state-machine definition. */
export interface AslStateMachineDefinition {
  Comment: string;
  StartAt: string;
  States: Record<string, AslState>;
  TimeoutSeconds?: number;
}

/* ------------------------------------------------------------------ *
 * Constants (Req 22.1, 22.3)
 * ------------------------------------------------------------------ */

/** Logical name of the deployed state machine (design + Req 7.1 schedule target). */
export const DEBATE_MACHINE_NAME = 'WorkSignal-Debate-Machine';

/** Hard cap on Bedrock task retries — three attempts (Req 22.1). */
export const BEDROCK_MAX_ATTEMPTS = 3;

/** Initial backoff before the first Bedrock retry, in seconds (Req 22.1). */
export const BEDROCK_RETRY_INTERVAL_SECONDS = 2;

/** Exponential backoff multiplier between Bedrock retries (Req 22.1). */
export const BEDROCK_BACKOFF_RATE = 2.0;

/**
 * Bedrock throttling / transient error names the agent Retry rule matches
 * (Req 22.1). `States.TaskFailed` is included so transient task failures also
 * back off within the same 3-attempt budget.
 */
export const BEDROCK_RETRYABLE_ERRORS: readonly string[] = [
  'ThrottlingException',
  'Bedrock.ThrottlingException',
  'ServiceQuotaExceededException',
  'ModelTimeoutException',
  'States.TaskFailed',
] as const;

/** Default Map concurrency; the timeout Catch re-runs with a smaller batch (Req 22.3). */
export const DEBATE_MAP_MAX_CONCURRENCY = 10;

/** Reduced Map concurrency used by the Step Functions timeout recovery (Req 22.3). */
export const DEBATE_MAP_REDUCED_CONCURRENCY = 2;

/** Overall execution timeout, after which the timeout Catch reduces the batch (Req 22.3). */
export const DEBATE_MACHINE_TIMEOUT_SECONDS = 900;

/**
 * The standard Bedrock task Retry rule: exponential backoff capped at three
 * attempts (Req 22.1). Reused by all four agent tasks and the Master task.
 */
export const bedrockRetry: AslRetrier = {
  ErrorEquals: [...BEDROCK_RETRYABLE_ERRORS],
  IntervalSeconds: BEDROCK_RETRY_INTERVAL_SECONDS,
  MaxAttempts: BEDROCK_MAX_ATTEMPTS,
  BackoffRate: BEDROCK_BACKOFF_RATE,
};

/* ------------------------------------------------------------------ *
 * Debate-agent Parallel branch builder
 * ------------------------------------------------------------------ */

/**
 * Build one Parallel branch for a debate agent: a single Bedrock task with the
 * bounded-retry rule (Req 22.1) and a Catch that routes a persistently-failing
 * agent to a `Mark<Agent>Failed` pass state (Req 22.4). The pass state records
 * the agent as unavailable so the downstream Master state runs the
 * degraded-resolution path (Req 22.4, 22.5) rather than aborting the job.
 */
function agentBranch(agent: 'Ambition' | 'Realism' | 'Risk' | 'Opportunity'): AslSubDefinition {
  const taskState = `${agent}Agent`;
  const failedState = `Mark${agent}Failed`;
  return {
    StartAt: taskState,
    States: {
      [taskState]: {
        Type: 'Task',
        Comment: `${agent}_Agent Bedrock task (Claude Sonnet), strict-JSON verdict.`,
        Resource: `arn:aws:states:::bedrock:invokeModel`,
        Retry: [bedrockRetry],
        Catch: [
          {
            // After the 3-attempt budget is exhausted, mark this agent failed
            // (Req 22.4) and let the branch complete so the Master can resolve
            // from the remaining verdicts (Req 22.5).
            ErrorEquals: ['States.ALL'],
            Next: failedState,
            ResultPath: '$.error',
          },
        ],
        End: true,
      },
      [failedState]: {
        Type: 'Pass',
        Comment: `Record ${agent} in agent_failures (degraded resolution input).`,
        Parameters: {
          'agent': agent.toLowerCase(),
          'failed': true,
        },
        End: true,
      },
    },
  };
}

/* ------------------------------------------------------------------ *
 * The DebateMap item processor (per surviving job)
 * ------------------------------------------------------------------ */

/**
 * The per-job sub-workflow run inside `DebateMap`: parallel four-agent debate
 * (Req 10.1) → verdict validation (Req 11) → Master decision tree + degraded
 * resolution (Req 12, 22.4, 22.5) → Choice routing (Req 13.1-13.5).
 */
export const debateItemProcessor: AslSubDefinition = {
  ProcessorConfig: { Mode: 'INLINE' },
  StartAt: 'Parallel',
  States: {
    Parallel: {
      Type: 'Parallel',
      Comment: 'Run the four debate agents simultaneously (Req 10.1).',
      Branches: [
        agentBranch('Ambition'),
        agentBranch('Realism'),
        agentBranch('Risk'),
        agentBranch('Opportunity'),
      ],
      ResultPath: '$.verdicts',
      Next: 'ValidateVerdicts',
    },
    ValidateVerdicts: {
      Type: 'Task',
      Comment: 'Validate JSON schema + 0-100 score ranges (Req 11.1-11.4).',
      Resource: 'arn:aws:lambda:::function:WorkSignal-ValidateVerdicts',
      ResultPath: '$.validated',
      Next: 'Master',
    },
    Master: {
      Type: 'Task',
      Comment:
        'Master_Orchestrator deterministic decision tree (Req 12); resolves ' +
        'from the available verdicts in degraded mode (Req 22.4, 22.5).',
      Resource: 'arn:aws:lambda:::function:WorkSignal-MasterOrchestrator',
      Retry: [bedrockRetry],
      Catch: [
        {
          // No valid verdict at all → no Decision produced; log + skip (Req 22.5).
          ErrorEquals: ['States.ALL'],
          Next: 'NoDecisionLog',
          ResultPath: '$.error',
        },
      ],
      ResultPath: '$.master',
      Next: 'RouteChoice',
    },
    RouteChoice: {
      Type: 'Choice',
      Comment: 'Route each Decision to its outcome (Req 13.1-13.4).',
      Choices: [
        { Variable: '$.master.decision', StringEquals: 'apply_consensus', Next: 'GenerateMaterials' },
        { Variable: '$.master.decision', StringEquals: 'apply_with_caveat', Next: 'GenerateMaterials' },
        { Variable: '$.master.decision', StringEquals: 'deadlock_escalate', Next: 'Escalate' },
        { Variable: '$.master.decision', StringEquals: 'skip_consensus', Next: 'LogOnly' },
        { Variable: '$.master.decision', StringEquals: 'veto_skip', Next: 'VetoLog' },
      ],
      // Defensive default: an unexpected/absent decision is logged, never applied.
      Default: 'LogOnly',
    },
    GenerateMaterials: {
      Type: 'Task',
      Comment:
        'Generate resume + cover letter and queue for review (Req 13.1, 14); ' +
        'act_now + >=2 other apply-equivalent agents queues at top (Req 13.5).',
      Resource: 'arn:aws:lambda:::function:WorkSignal-GenerateMaterials',
      ResultPath: '$.materials',
      End: true,
    },
    Escalate: {
      Type: 'Task',
      Comment: 'Deadlock: save + notify the user to decide (Req 13.2).',
      Resource: 'arn:aws:lambda:::function:WorkSignal-Escalate',
      End: true,
    },
    LogOnly: {
      Type: 'Task',
      Comment: 'Skip consensus: log-only, no application surfaced (Req 13.3).',
      Resource: 'arn:aws:lambda:::function:WorkSignal-LogOnly',
      End: true,
    },
    VetoLog: {
      Type: 'Task',
      Comment: 'Risk veto: log and never surface this job (Req 13.4).',
      Resource: 'arn:aws:lambda:::function:WorkSignal-VetoLog',
      End: true,
    },
    NoDecisionLog: {
      Type: 'Task',
      Comment: 'No valid verdict: produce no Decision, log the failure (Req 22.5).',
      Resource: 'arn:aws:lambda:::function:WorkSignal-LogOnly',
      End: true,
    },
  },
};

/* ------------------------------------------------------------------ *
 * The top-level state machine definition
 * ------------------------------------------------------------------ */

/**
 * The complete `WorkSignal-Debate-Machine` ASL definition (Task 14.1).
 *
 * Triggered by the 3-hourly EventBridge schedule (Req 7.1). Scans, pre-filters,
 * branches to the relaxation-suggestion flow when every job is discarded
 * (Req 9.5, 9.6), otherwise fans out the four-agent debate per surviving job
 * and routes the resolved decision (Req 13). Bedrock tasks bound retries to 3
 * with exponential backoff (Req 22.1); a Step Functions timeout re-runs the
 * Debate Map with reduced concurrency (Req 22.3).
 */
export const debateMachineDefinition: AslStateMachineDefinition = {
  Comment:
    'WorkSignal-Debate-Machine: scan -> pre-filter -> (relaxation | debate) -> ' +
    'parallel four-agent debate -> validate -> master -> route (Req 9.5/9.6, 10.1, 12, 13, 22).',
  StartAt: 'ScanJobs',
  TimeoutSeconds: DEBATE_MACHINE_TIMEOUT_SECONDS,
  States: {
    ScanJobs: {
      Type: 'Task',
      Comment: 'Opportunity_Scanner: MCF API discovery with Exa fallback (Req 7, 8.3).',
      Resource: 'arn:aws:lambda:::function:WorkSignal-OpportunityScanner',
      ResultPath: '$.scan',
      Next: 'PreFilterMap',
    },
    PreFilterMap: {
      Type: 'Map',
      Comment: 'Pre_Filter every discovered job against the non-negotiables (Req 8, 9).',
      ItemsPath: '$.scan.jobs',
      MaxConcurrency: DEBATE_MAP_MAX_CONCURRENCY,
      ItemProcessor: {
        ProcessorConfig: { Mode: 'INLINE' },
        StartAt: 'PreFilter',
        States: {
          PreFilter: {
            Type: 'Task',
            Comment:
              'Pure Pre_Filter: salary, employment type, arrangement, SG geo, ' +
              'custom dealbreakers, EP floor + sponsorship (Req 8.1/8.2, 9.1-9.4).',
            Resource: 'arn:aws:lambda:::function:WorkSignal-PreFilter',
            End: true,
          },
        },
      },
      // The processor returns only surviving jobs; discarded ones leave no
      // user-visible record (Req 9.2).
      ResultSelector: {
        'survivors.$': "$[?(@.pass == true)].job",
      },
      ResultPath: '$.filtered',
      Next: 'CountSurvivors',
    },
    CountSurvivors: {
      Type: 'Pass',
      Comment: 'Compute the surviving-job count for the all-filtered Choice.',
      Parameters: {
        'survivors.$': '$.filtered.survivors',
        'survivors_count.$': 'States.ArrayLength($.filtered.survivors)',
      },
      ResultPath: '$.filtered',
      Next: 'AllFilteredChoice',
    },
    AllFilteredChoice: {
      Type: 'Choice',
      Comment: 'Did the Pre_Filter discard every scanned job (Req 9.5)?',
      Choices: [
        {
          Variable: '$.filtered.survivors_count',
          NumericEquals: 0,
          Next: 'SuggestRelaxation',
        },
      ],
      Default: 'DebateMap',
    },
    SuggestRelaxation: {
      Type: 'Task',
      Comment:
        'All jobs filtered: build a Filter_Relaxation_Suggestion + notify the ' +
        'user; await explicit approval before any non-negotiable changes (Req 9.5-9.8).',
      Resource: 'arn:aws:lambda:::function:WorkSignal-SuggestRelaxation',
      End: true,
    },
    DebateMap: {
      Type: 'Map',
      Comment: 'Run the four-agent debate per surviving job (Req 10.1).',
      ItemsPath: '$.filtered.survivors',
      MaxConcurrency: DEBATE_MAP_MAX_CONCURRENCY,
      ItemProcessor: debateItemProcessor,
      Catch: [
        {
          // Step Functions timeout / capacity error → re-run with a smaller
          // batch (reduced Map concurrency) (Req 22.3).
          ErrorEquals: ['States.Timeout', 'States.ALL'],
          Next: 'DebateMapReducedBatch',
          ResultPath: '$.error',
        },
      ],
      End: true,
    },
    DebateMapReducedBatch: {
      Type: 'Map',
      Comment: 'Timeout recovery: re-run the debate with reduced concurrency (Req 22.3).',
      ItemsPath: '$.filtered.survivors',
      MaxConcurrency: DEBATE_MAP_REDUCED_CONCURRENCY,
      ItemProcessor: debateItemProcessor,
      End: true,
    },
  },
};

/**
 * Deployable description of the debate state machine: its logical name, region,
 * type, and ASL definition. Mirrors the shape consumed by a deployment harness
 * alongside {@link debateMachineDefinition}.
 */
export interface DebateStateMachineResource {
  readonly name: string;
  readonly region: string;
  /** STANDARD (not EXPRESS): long-running, exactly-once debate orchestration. */
  readonly type: 'STANDARD';
  readonly definition: AslStateMachineDefinition;
}

/** The `WorkSignal-Debate-Machine` resource definition (Req 7.1 schedule target). */
export const debateStateMachine: DebateStateMachineResource = {
  name: DEBATE_MACHINE_NAME,
  region: AWS_REGION,
  type: 'STANDARD',
  definition: debateMachineDefinition,
};
