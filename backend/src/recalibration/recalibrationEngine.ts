/**
 * Recalibration_Engine — weekly recalibration flow (Requirement 21).
 *
 * Implements the `RecalibrationEngine` contract from the design document
 * (design.md → Recalibration_Engine) and Requirements:
 *
 *   21.1  When the weekly schedule fires, fetch all applications sent in the
 *         previous seven days and their current statuses.
 *   21.2  Compute per-agent accuracy by comparing each agent's verdict against
 *         the resulting Application status.
 *   21.3  When an adjustment is warranted, update the affected thresholds in the
 *         user's `agent_weights`, recording each adjustment's prior value, new
 *         value, and reason.
 *   21.4  On completing a run, store the metrics, agent performance, and
 *         adjustments in the RecalibrationLog, and store the generated brief
 *         when brief generation succeeds.
 *   21.6  If the user has zero callbacks across the three most recent weekly
 *         recalibrations, perform an emergency recalibration and alert the user.
 *
 * Design notes:
 *  - **All pure recalibration logic is imported, not re-implemented.** The
 *    per-agent accuracy and threshold-adjustment maths live in `./accuracy.js`
 *    (`recalibrateAgents` / `computeAgentPerformance` /
 *    `computeThresholdAdjustments` / `applyAdjustments`); the zero-callback
 *    emergency detection lives in `./emergency.js`
 *    (`shouldTriggerEmergencyRecalibration`). Those modules are owned by other
 *    tasks — this file only orchestrates them around I/O.
 *  - This module is the **integration** layer: it joins the Applications and
 *    AgentVerdicts tables, feeds the resulting outcome pairs to the pure logic,
 *    writes the updated weights back to the Users record, and appends the
 *    weekly {@link RecalibrationLogEntry} to the RecalibrationLog table.
 *  - DynamoDB, the brief-generating Bedrock call, the emergency alert sink, the
 *    id generator, and the clock are all **injectable** so the flow is
 *    unit/integration-testable (task 18.4) without touching AWS or wall-clock
 *    time. Brief generation falls back to a deterministic template when no
 *    Bedrock generator is supplied or the generator fails, so a brief is always
 *    present and a Bedrock outage never fails the run (Req 21.4).
 */

import { randomUUID } from 'node:crypto';
import {
  DynamoDBWrapper,
  ValidationError,
  createLogger,
  type AgentAccuracy,
  type AgentName,
  type AgentWeights,
  type AmbitionVerdict,
  type Application,
  type ApplicationStatus,
  type DynamoItem,
  type Logger,
  type OpportunityVerdict,
  type RealismVerdict,
  type RecalibrationAdjustment,
  type RecalibrationEngine,
  type RecalibrationLogEntry,
  type RecalibrationMetrics,
  type RiskVerdict,
  type UserConfig,
  type VerdictSet,
} from '@worksignal/shared';

import {
  recalibrateAgents,
  type ApplicationOutcome,
} from './accuracy.js';
import {
  shouldTriggerEmergencyRecalibration,
  EMERGENCY_RECALIBRATION_WINDOW,
  type RecalibrationCallbackRef,
} from './emergency.js';

/* ------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------ */

/**
 * Default DynamoDB table names (design Data Models). These mirror the constants
 * owned by the Application_Tracker / Opportunity_Scanner / verdict-persistence
 * modules; they are kept module-local here (not re-exported) so the backend
 * barrel never has ambiguous `export *` names.
 */
const DEFAULT_USERS_TABLE = 'Users';
const DEFAULT_APPLICATIONS_TABLE = 'Applications';
const DEFAULT_AGENT_VERDICTS_TABLE = 'AgentVerdicts';

/** Default DynamoDB table name for the RecalibrationLog (design Data Models). */
export const DEFAULT_RECALIBRATION_LOG_TABLE = 'RecalibrationLog';

/** GSI on `(user_id, company)` used to list a user's applications (infra). */
const APPLICATIONS_USER_INDEX = 'user_id-company-index';

/** GSI on `(user_id, week_of)` used to read a user's recalibration history. */
export const RECALIBRATION_LOG_USER_INDEX = 'user_id-week_of-index';

/** The recalibration look-back window (Req 21.1): the previous seven days. */
export const RECALIBRATION_LOOKBACK_DAYS = 7 as const;

/** Milliseconds in one day, for the look-back window computation. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ *
 * Dependencies
 * ------------------------------------------------------------------ */

/**
 * The context handed to a {@link BriefGenerator}: everything a human-readable
 * weekly brief needs to summarise the run.
 */
export interface RecalibrationBriefContext {
  userId: string;
  weekOf: string;
  metrics: RecalibrationMetrics;
  agentPerformance: Record<AgentName, AgentAccuracy>;
  adjustments: RecalibrationAdjustment[];
  emergency: boolean;
}

/**
 * Injectable Bedrock-backed brief generator (Req 21.4). Returns the brief text
 * for the week. If omitted — or if it throws — the engine falls back to a
 * deterministic template so a brief is always stored.
 */
export type BriefGenerator = (
  context: RecalibrationBriefContext,
) => Promise<string>;

/**
 * Injectable sink for the emergency-recalibration alert (Req 21.6). Invoked
 * once, after the log entry is persisted, when an emergency is detected. Any
 * error it throws is logged and swallowed so alerting can never fail the run.
 */
export type EmergencyAlert = (
  userId: string,
  entry: RecalibrationLogEntry,
) => void | Promise<void>;

export interface RecalibrationEngineDeps {
  /** DynamoDB wrapper (injectable; defaults to a real client). */
  db?: DynamoDBWrapper;
  /** Clock injection for deterministic tests. Defaults to `() => new Date()`. */
  now?: () => Date;
  /** Bedrock-backed brief generator; defaults to a deterministic template. */
  generateBrief?: BriefGenerator;
  /** Emergency-alert sink (Req 21.6); defaults to a no-op. */
  alert?: EmergencyAlert;
  /** Recalibration-id generator. Defaults to `randomUUID`. */
  generateRecalibrationId?: () => string;
  logger?: Logger;
  usersTable?: string;
  applicationsTable?: string;
  agentVerdictsTable?: string;
  recalibrationLogTable?: string;
  applicationsUserIndex?: string;
  recalibrationLogUserIndex?: string;
  /** Override the look-back window in days (Req 21.1; defaults to 7). */
  lookbackDays?: number;
}

/* ------------------------------------------------------------------ *
 * Pure helpers (exported for unit tests)
 * ------------------------------------------------------------------ */

/**
 * Reconstruct a {@link VerdictSet} from a persisted AgentVerdicts item. Only
 * agents that are present are included, so a degraded debate (Req 22.4)
 * round-trips faithfully and contributes nothing for absent agents.
 */
export function verdictSetFromItem(item: DynamoItem): VerdictSet {
  const verdicts: VerdictSet = {};
  if (item.ambition) verdicts.ambition = item.ambition as AmbitionVerdict;
  if (item.realism) verdicts.realism = item.realism as RealismVerdict;
  if (item.risk) verdicts.risk = item.risk as RiskVerdict;
  if (item.opportunity)
    verdicts.opportunity = item.opportunity as OpportunityVerdict;
  return verdicts;
}

/**
 * Compute the weekly outcome metrics (Req 21.1, displayed by the brief view per
 * 21.5) from the window's applications. `callback_rate` is `callbacks /
 * applications_sent`, or `0` when no applications were sent (avoiding a
 * divide-by-zero). Pure and total.
 */
export function computeWeeklyMetrics(
  applications: readonly Pick<Application, 'status'>[],
): RecalibrationMetrics {
  const count = (status: ApplicationStatus): number =>
    applications.filter((a) => a.status === status).length;

  const applicationsSent = applications.length;
  const callbacks = count('callback');
  const rejections = count('rejected');
  const ghosted = count('ghosted');
  const callbackRate = applicationsSent > 0 ? callbacks / applicationsSent : 0;

  return {
    applications_sent: applicationsSent,
    callbacks,
    rejections,
    ghosted,
    callback_rate: callbackRate,
  };
}

/**
 * Whether an application falls inside the look-back window — i.e. it was sent
 * on or after `windowStart`. Applications with an unparseable `sent_at` are
 * excluded. Pure and total.
 */
export function isWithinWindow(
  app: Pick<Application, 'sent_at'>,
  windowStart: Date,
): boolean {
  const sentAt = new Date(app.sent_at).getTime();
  if (Number.isNaN(sentAt)) return false;
  return sentAt >= windowStart.getTime();
}

/**
 * Deterministic fallback brief used when no Bedrock generator is supplied or it
 * fails (Req 21.4). Summarises the week's headline metrics, the per-agent
 * accuracy, and the adjustments made.
 */
export function defaultBriefTemplate(context: RecalibrationBriefContext): string {
  const { metrics, agentPerformance, adjustments, emergency } = context;
  const ratePct = Math.round(metrics.callback_rate * 100);

  const lines: string[] = [];
  lines.push(`Weekly brief — week of ${context.weekOf}`);
  if (emergency) {
    lines.push(
      'EMERGENCY RECALIBRATION: no callbacks across the three most recent weeks.',
    );
  }
  lines.push(
    `Applications sent: ${metrics.applications_sent}; callbacks: ${metrics.callbacks} ` +
      `(${ratePct}% callback rate); rejections: ${metrics.rejections}; ` +
      `ghosted: ${metrics.ghosted}.`,
  );

  const performanceLine = (Object.keys(agentPerformance) as AgentName[])
    .map((agent) => {
      const { correct, incorrect } = agentPerformance[agent];
      return `${agent} ${correct}/${correct + incorrect}`;
    })
    .join(', ');
  lines.push(`Agent accuracy (correct/resolved): ${performanceLine}.`);

  if (adjustments.length === 0) {
    lines.push('No threshold adjustments were warranted this week.');
  } else {
    lines.push('Threshold adjustments:');
    for (const adj of adjustments) {
      lines.push(`- ${adj.reason}`);
    }
  }

  return lines.join('\n');
}

/* ------------------------------------------------------------------ *
 * Engine implementation
 * ------------------------------------------------------------------ */

export class RecalibrationEngineImpl implements RecalibrationEngine {
  private readonly db: DynamoDBWrapper;
  private readonly now: () => Date;
  private readonly generateBrief?: BriefGenerator;
  private readonly alert: EmergencyAlert;
  private readonly generateRecalibrationId: () => string;
  private readonly logger: Logger;
  private readonly usersTable: string;
  private readonly applicationsTable: string;
  private readonly agentVerdictsTable: string;
  private readonly recalibrationLogTable: string;
  private readonly applicationsUserIndex: string;
  private readonly recalibrationLogUserIndex: string;
  private readonly lookbackDays: number;

  constructor(deps: RecalibrationEngineDeps = {}) {
    this.db = deps.db ?? new DynamoDBWrapper();
    this.now = deps.now ?? (() => new Date());
    this.generateBrief = deps.generateBrief;
    this.alert = deps.alert ?? (() => {});
    this.generateRecalibrationId =
      deps.generateRecalibrationId ?? (() => randomUUID());
    this.logger =
      deps.logger ??
      createLogger({ context: { component: 'Recalibration_Engine' } });
    this.usersTable = deps.usersTable ?? DEFAULT_USERS_TABLE;
    this.applicationsTable =
      deps.applicationsTable ?? DEFAULT_APPLICATIONS_TABLE;
    this.agentVerdictsTable =
      deps.agentVerdictsTable ?? DEFAULT_AGENT_VERDICTS_TABLE;
    this.recalibrationLogTable =
      deps.recalibrationLogTable ?? DEFAULT_RECALIBRATION_LOG_TABLE;
    this.applicationsUserIndex =
      deps.applicationsUserIndex ?? APPLICATIONS_USER_INDEX;
    this.recalibrationLogUserIndex =
      deps.recalibrationLogUserIndex ?? RECALIBRATION_LOG_USER_INDEX;
    this.lookbackDays = deps.lookbackDays ?? RECALIBRATION_LOOKBACK_DAYS;
  }

  /**
   * Run the weekly recalibration for a single user (Req 21.1–21.4, 21.6).
   *
   * Steps:
   *  1. Load the user record (for the current `agent_weights`).
   *  2. Fetch the applications sent in the previous seven days and pair each
   *     with the verdict set that produced it (join Applications ⨝
   *     AgentVerdicts). (21.1)
   *  3. Feed the outcome pairs to the pure {@link recalibrateAgents} pass to get
   *     per-agent accuracy, warranted adjustments, and updated weights. (21.2,
   *     21.3)
   *  4. Persist the updated weights back to the Users record. (21.3)
   *  5. Compute the week's metrics, decide the emergency flag over the three
   *     most recent recalibrations (this run included), and generate the brief.
   *     (21.4, 21.6)
   *  6. Append the {@link RecalibrationLogEntry} to the RecalibrationLog and, on
   *     an emergency, alert the user. (21.4, 21.6)
   */
  async runWeekly(userId: string): Promise<RecalibrationLogEntry> {
    const log = this.logger.child({ user_id: userId });
    const now = this.now();
    const windowStart = new Date(now.getTime() - this.lookbackDays * MS_PER_DAY);

    const user = await this.loadUser(userId);

    // (21.1) Previous 7 days' applications + their current statuses.
    const applications = await this.fetchRecentApplications(userId, windowStart);

    // (21.1) Join each application to the verdict set that produced it.
    const outcomes = await this.buildOutcomes(applications);

    // (21.2, 21.3) Pure per-agent accuracy + warranted threshold adjustments.
    const { agent_performance, adjustments, updated_weights } = recalibrateAgents(
      outcomes,
      user.agent_weights,
    );

    // (21.3) Persist the updated weights back to the user's record.
    await this.persistWeights(userId, updated_weights, adjustments.length);

    // (21.1, 21.5) Weekly outcome metrics.
    const metrics = computeWeeklyMetrics(applications);
    const weekOf = windowStart.toISOString().slice(0, 10);

    // (21.6) Emergency iff the three most recent recalibrations — this run
    // being the newest — each recorded zero callbacks.
    const emergency = await this.detectEmergency(userId, metrics.callbacks);

    // (21.4) Generate the brief (Bedrock when available; template otherwise).
    const briefContext: RecalibrationBriefContext = {
      userId,
      weekOf,
      metrics,
      agentPerformance: agent_performance,
      adjustments,
      emergency,
    };
    const briefText = await this.buildBrief(briefContext, log);

    // (21.4) Assemble and persist the log entry.
    const entry: RecalibrationLogEntry = {
      recalibration_id: this.generateRecalibrationId(),
      user_id: userId,
      week_of: weekOf,
      metrics,
      agent_performance,
      adjustments_made: adjustments,
      emergency,
      brief_text: briefText,
      created_at: now.toISOString(),
    };
    await this.db.put(
      this.recalibrationLogTable,
      entry as unknown as DynamoItem,
    );

    log.info('Weekly recalibration completed', {
      week_of: weekOf,
      applications_sent: metrics.applications_sent,
      callbacks: metrics.callbacks,
      adjustments: adjustments.length,
      emergency,
    });

    // (21.6) On an emergency, alert the user. Alerting never fails the run.
    if (emergency) {
      await this.fireEmergencyAlert(userId, entry, log);
    }

    return entry;
  }

  /* ---------------------------------------------------------------- *
   * Internals
   * ---------------------------------------------------------------- */

  /** Load the user record or throw a {@link ValidationError}. */
  private async loadUser(userId: string): Promise<UserConfig> {
    const item = await this.db.get(this.usersTable, { user_id: userId });
    if (!item) {
      throw new ValidationError(
        `Recalibration_Engine: user not found: ${userId}`,
        { userId },
      );
    }
    return item as unknown as UserConfig;
  }

  /**
   * Fetch the user's applications sent within the look-back window (Req 21.1).
   * Queries the `(user_id, company)` GSI for all of the user's applications,
   * then filters to those whose `sent_at` falls inside the window.
   */
  private async fetchRecentApplications(
    userId: string,
    windowStart: Date,
  ): Promise<Application[]> {
    const items = await this.db.query(this.applicationsTable, {
      IndexName: this.applicationsUserIndex,
      KeyConditionExpression: 'user_id = :u',
      ExpressionAttributeValues: { ':u': userId },
    });
    const applications = items as unknown as Application[];
    return applications.filter((app) => isWithinWindow(app, windowStart));
  }

  /**
   * Join each application to the verdict set that produced it (Req 21.1, 21.2).
   * An application whose verdicts cannot be loaded contributes an empty verdict
   * set — degraded resolution (Req 22.4) means absent agents simply score
   * nothing, so the recalibration maths stays well-defined.
   */
  private async buildOutcomes(
    applications: readonly Application[],
  ): Promise<ApplicationOutcome[]> {
    return Promise.all(
      applications.map(async (app) => ({
        verdicts: await this.loadVerdicts(app.verdict_id),
        status: app.status,
      })),
    );
  }

  /** Load and reconstruct a verdict set by id; an empty set when absent. */
  private async loadVerdicts(verdictId: string): Promise<VerdictSet> {
    if (!verdictId) return {};
    const item = await this.db.get(this.agentVerdictsTable, {
      verdict_id: verdictId,
    });
    return item ? verdictSetFromItem(item) : {};
  }

  /** Persist the recalibrated weights back to the Users record (Req 21.3). */
  private async persistWeights(
    userId: string,
    weights: AgentWeights,
    adjustmentCount: number,
  ): Promise<void> {
    if (adjustmentCount === 0) {
      // No warranted change this week — leave the record untouched.
      return;
    }
    await this.db.update(
      this.usersTable,
      { user_id: userId },
      {
        UpdateExpression: 'SET agent_weights = :w, updated_at = :t',
        ExpressionAttributeValues: {
          ':w': weights,
          ':t': this.now().toISOString(),
        },
      },
    );
  }

  /**
   * Decide the emergency flag for this run (Req 21.6, Property 20). Reads the
   * user's recalibration history (oldest → newest), appends this run's callback
   * count as the newest entry, and delegates to the pure
   * {@link shouldTriggerEmergencyRecalibration} over the resulting history.
   */
  private async detectEmergency(
    userId: string,
    currentCallbacks: number,
  ): Promise<boolean> {
    const history = await this.fetchCallbackHistory(userId);
    history.push({ metrics: { callbacks: currentCallbacks } });
    return shouldTriggerEmergencyRecalibration(history);
  }

  /**
   * Read the user's recalibration history as callback references, ordered
   * oldest → newest. Only the most recent window matters, so the query is
   * limited accordingly; a query failure degrades to an empty history (no
   * emergency) rather than failing the run.
   */
  private async fetchCallbackHistory(
    userId: string,
  ): Promise<RecalibrationCallbackRef[]> {
    try {
      const items = await this.db.query(this.recalibrationLogTable, {
        IndexName: this.recalibrationLogUserIndex,
        KeyConditionExpression: 'user_id = :u',
        ExpressionAttributeValues: { ':u': userId },
        // Newest first, capped to the window we need (excluding this run).
        ScanIndexForward: false,
        Limit: EMERGENCY_RECALIBRATION_WINDOW - 1,
      });
      const entries = items as unknown as RecalibrationLogEntry[];
      // Restore oldest → newest ordering for the emergency predicate.
      return entries
        .slice()
        .reverse()
        .map((e) => ({ metrics: { callbacks: e.metrics.callbacks } }));
    } catch (error) {
      this.logger.warn(
        'Recalibration history load failed; treating as no emergency',
        { user_id: userId, error: String(error) },
      );
      return [];
    }
  }

  /**
   * Build the brief text (Req 21.4). Uses the injected Bedrock generator when
   * present; on any failure — or when none is supplied — falls back to the
   * deterministic template so a brief is always stored.
   */
  private async buildBrief(
    context: RecalibrationBriefContext,
    log: Logger,
  ): Promise<string> {
    if (!this.generateBrief) {
      return defaultBriefTemplate(context);
    }
    try {
      return await this.generateBrief(context);
    } catch (error) {
      log.warn('Brief generation failed; using template fallback', {
        error: String(error),
      });
      return defaultBriefTemplate(context);
    }
  }

  /** Invoke the emergency alert sink, swallowing any error (Req 21.6). */
  private async fireEmergencyAlert(
    userId: string,
    entry: RecalibrationLogEntry,
    log: Logger,
  ): Promise<void> {
    try {
      await this.alert(userId, entry);
      log.info('Emergency recalibration alert sent', {
        recalibration_id: entry.recalibration_id,
      });
    } catch (error) {
      log.warn('Emergency alert failed', { error: String(error) });
    }
  }
}

/** Convenience factory mirroring the {@link RecalibrationEngineImpl} constructor. */
export function createRecalibrationEngine(
  deps?: RecalibrationEngineDeps,
): RecalibrationEngineImpl {
  return new RecalibrationEngineImpl(deps);
}
