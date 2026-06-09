/**
 * Application_Tracker — pipeline persistence and reply-driven status updates.
 *
 * Implements the `ApplicationTracker` contract from the design document
 * (design.md → Application_Tracker) and Requirements:
 *
 *   16.5  On a successful send, create a record with status `sent`, the
 *         recipient, the send timestamp, and the email thread id.
 *   16.7  On the no-employer-email redirect path, create a record with status
 *         `redirected_external`, the source URL, and the redirect timestamp.
 *   17.1  The pipeline view shows company, role, send date, and status.
 *   17.2  IF the pipeline fails to load, retry automatically in the background
 *         WITHOUT notifying the user.
 *   17.4  Selecting an application shows its original agent debate.
 *   18.5  A reply with Classification_Confidence >= 60 updates the status from
 *         the classification.
 *   18.6  A reply with Classification_Confidence < 60 sets `needs_review`.
 *   18.7  A later >= 60 reply overrides any earlier classification.
 *   18.9  A sent application with no reply for 14 days is set to `ghosted`.
 *
 * Design notes:
 *  - All pure status logic is *imported, not re-implemented*: the creation-path
 *    state machine (`deriveInitialStatus` / `VALID_APPLICATION_STATUSES`) lives
 *    in `./statusMachine.js` and the reply-status progression
 *    (`applyReplyClassification` / `progressReplyStatus`) lives in
 *    `./replyProgression.js`. This module is the *integration* layer that wires
 *    that pure logic to DynamoDB persistence.
 *  - The DynamoDB wrapper and the clock are **injectable** so the tracker is
 *    unit-testable (task 16.4) without touching AWS or wall-clock time. The
 *    14-day ghosting timer is evaluated against each record's `sent_at` using
 *    the injected clock, matching the design's elapsed-time scheduling
 *    semantics.
 *  - Reads (`list`) never surface a load error to the user (Req 17.2): they
 *    retry with bounded backoff inline and, if still failing, kick off a
 *    detached background retry and return an empty list. Failures are recorded
 *    only on the internal structured logger.
 */

import { randomUUID } from 'node:crypto';
import {
  DynamoDBWrapper,
  ValidationError,
  createLogger,
  type AgentName,
  type AmbitionVerdict,
  type Application,
  type ApplicationStatus,
  type ApplicationTracker,
  type Classification,
  type DebateResult,
  type DynamoItem,
  type Logger,
  type MasterDecision,
  type NewApplication,
  type OpportunityVerdict,
  type RealismVerdict,
  type RiskVerdict,
  type VerdictSet,
} from '@worksignal/shared';

import {
  VALID_APPLICATION_STATUSES,
  deriveInitialStatus,
  type ApplicationCreationPath,
} from './statusMachine.js';
import {
  applyReplyClassification,
  progressReplyStatus,
} from './replyProgression.js';
import { DEFAULT_AGENT_VERDICTS_TABLE } from '../debate/verdictPersistence.js';

/* ------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------ */

/** Default DynamoDB table names (design Data Models). */
export const DEFAULT_APPLICATIONS_TABLE = 'Applications';

/** GSI on `(user_id, company)` used to list a user's applications (infra). */
export const APPLICATIONS_USER_INDEX = 'user_id-company-index';

/** Ghosting window (Req 18.9): 14 days with no reply → `ghosted`. */
export const GHOSTING_INTERVAL_MS = 14 * 24 * 60 * 60 * 1000;

/** The status a sent application sits in while it has received no reply. */
const AWAITING_REPLY_STATUS: ApplicationStatus = 'sent';

/** Default bounded-retry budget for silent pipeline-load retries (Req 17.2). */
const DEFAULT_LIST_MAX_RETRIES = 3;

/** Default delay between silent pipeline-load retries (ms). */
const DEFAULT_LIST_RETRY_DELAY_MS = 200;

/* ------------------------------------------------------------------ *
 * Dependencies
 * ------------------------------------------------------------------ */

export interface ApplicationTrackerDeps {
  /** DynamoDB wrapper (injectable; defaults to a real client). */
  db?: DynamoDBWrapper;
  /** Clock injection for deterministic tests. Defaults to `() => new Date()`. */
  now?: () => Date;
  /** Application-id generator. Defaults to `randomUUID`. */
  generateApplicationId?: () => string;
  logger?: Logger;
  applicationsTable?: string;
  agentVerdictsTable?: string;
  /** Override the GSI used by {@link ApplicationTrackerImpl.list}. */
  applicationsUserIndex?: string;
  /** Override the 14-day ghosting window (ms). */
  ghostingIntervalMs?: number;
  /** Max silent retries when a pipeline load fails (Req 17.2). */
  listMaxRetries?: number;
  /** Delay between silent pipeline-load retries (ms). */
  listRetryDelayMs?: number;
  /** Sleep injection for deterministic retry tests. Defaults to `setTimeout`. */
  sleep?: (ms: number) => Promise<void>;
}

/* ------------------------------------------------------------------ *
 * Pure helpers (exported for unit tests)
 * ------------------------------------------------------------------ */

/**
 * Infer the creation path of a record from its shape, used only as a defensive
 * fallback when a caller supplies a status that is not a valid enum member.
 *
 * A record carrying an employer recipient came through the SES send path
 * (`sent`); otherwise it came through the no-employer-email redirect path
 * (`redirected_external`). The bounce path is never inferred here because a
 * bounce is always supplied explicitly as `delivery_failed` by the sender.
 */
export function inferCreationPath(
  record: Pick<NewApplication, 'recipient_email'>,
): ApplicationCreationPath {
  if (
    typeof record.recipient_email === 'string' &&
    record.recipient_email.length > 0
  ) {
    return { kind: 'employer_email' };
  }
  return { kind: 'no_employer_email' };
}

/**
 * True when a sent application has gone unanswered for at least the ghosting
 * window and is therefore eligible to be marked `ghosted` (Req 18.9).
 *
 * Only applications still awaiting a first reply (status `sent`) are eligible:
 * any other status means a reply was already processed (or the application was
 * redirected / failed to deliver), so it cannot be "ghosted".
 *
 * @param app - The application record.
 * @param now - The current time.
 * @param intervalMs - The ghosting window in ms (defaults to 14 days).
 */
export function isGhostingDue(
  app: Pick<Application, 'status' | 'sent_at'>,
  now: Date,
  intervalMs: number = GHOSTING_INTERVAL_MS,
): boolean {
  if (app.status !== AWAITING_REPLY_STATUS) return false;
  const sentAt = new Date(app.sent_at).getTime();
  if (Number.isNaN(sentAt)) return false;
  return now.getTime() - sentAt >= intervalMs;
}

/**
 * Reconstruct a {@link DebateResult} from a persisted AgentVerdicts item.
 *
 * The AgentVerdicts table stores each agent's verdict as a top-level attribute
 * (`ambition`/`realism`/`risk`/`opportunity`) alongside `master_decision` and
 * `agent_failures`; the `DebateResult` contract groups the agent verdicts under
 * a single `verdicts` {@link VerdictSet}. Only agents that are present are
 * included, so a degraded debate (Req 22.4) round-trips faithfully.
 */
export function debateResultFromVerdictItem(item: DynamoItem): DebateResult {
  const verdicts: VerdictSet = {};
  if (item.ambition) verdicts.ambition = item.ambition as AmbitionVerdict;
  if (item.realism) verdicts.realism = item.realism as RealismVerdict;
  if (item.risk) verdicts.risk = item.risk as RiskVerdict;
  if (item.opportunity)
    verdicts.opportunity = item.opportunity as OpportunityVerdict;

  return {
    job_id: String(item.job_id ?? ''),
    user_id: String(item.user_id ?? ''),
    verdict_id: String(item.verdict_id ?? ''),
    verdicts,
    master_decision: item.master_decision as MasterDecision,
    agent_failures: Array.isArray(item.agent_failures)
      ? (item.agent_failures as AgentName[])
      : [],
  };
}

/** Default `sleep` built on `setTimeout`. */
function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ------------------------------------------------------------------ *
 * Tracker implementation
 * ------------------------------------------------------------------ */

export class ApplicationTrackerImpl implements ApplicationTracker {
  private readonly db: DynamoDBWrapper;
  private readonly now: () => Date;
  private readonly generateApplicationId: () => string;
  private readonly logger: Logger;
  private readonly applicationsTable: string;
  private readonly agentVerdictsTable: string;
  private readonly applicationsUserIndex: string;
  private readonly ghostingIntervalMs: number;
  private readonly listMaxRetries: number;
  private readonly listRetryDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(deps: ApplicationTrackerDeps = {}) {
    this.db = deps.db ?? new DynamoDBWrapper();
    this.now = deps.now ?? (() => new Date());
    this.generateApplicationId =
      deps.generateApplicationId ?? (() => randomUUID());
    this.logger =
      deps.logger ??
      createLogger({ context: { component: 'Application_Tracker' } });
    this.applicationsTable = deps.applicationsTable ?? DEFAULT_APPLICATIONS_TABLE;
    this.agentVerdictsTable =
      deps.agentVerdictsTable ?? DEFAULT_AGENT_VERDICTS_TABLE;
    this.applicationsUserIndex =
      deps.applicationsUserIndex ?? APPLICATIONS_USER_INDEX;
    this.ghostingIntervalMs = deps.ghostingIntervalMs ?? GHOSTING_INTERVAL_MS;
    this.listMaxRetries = deps.listMaxRetries ?? DEFAULT_LIST_MAX_RETRIES;
    this.listRetryDelayMs = deps.listRetryDelayMs ?? DEFAULT_LIST_RETRY_DELAY_MS;
    this.sleep = deps.sleep ?? defaultSleep;
  }

  /**
   * Create and persist a new application record (Req 16.5 / 16.7).
   *
   * The caller (Application_Sender) supplies the path-specific fields — for a
   * sent application: `status: 'sent'`, recipient, `sent_at`, and the email
   * thread id; for a redirect: `status: 'redirected_external'`,
   * `redirect_source_url`, and `redirected_at`. The status is validated against
   * {@link VALID_APPLICATION_STATUSES}; if it is not a valid enum member the
   * canonical initial status is derived from the record's shape via
   * {@link deriveInitialStatus} so a record is never persisted with an invalid
   * status (Req 17.3 / Property 13).
   */
  async create(record: NewApplication): Promise<Application> {
    const status: ApplicationStatus = VALID_APPLICATION_STATUSES.has(
      record.status,
    )
      ? record.status
      : deriveInitialStatus(inferCreationPath(record));

    const nowIso = this.now().toISOString();
    const application: Application = {
      ...record,
      status,
      application_id: this.generateApplicationId(),
      status_updated_at: nowIso,
      classification_confidence: record.classification_confidence ?? 0,
    };

    await this.db.put(this.applicationsTable, application as unknown as DynamoItem);

    this.logger.info('Application record created', {
      application_id: application.application_id,
      user_id: application.user_id,
      status: application.status,
    });
    return application;
  }

  /**
   * List a user's applications for the pipeline view (Req 17.1).
   *
   * On a load failure the read is retried automatically with bounded backoff
   * and **no user-facing error** (Req 17.2). If every inline attempt fails, a
   * detached background retry is scheduled and an empty list is returned so the
   * caller is never blocked or notified of the failure.
   */
  async list(userId: string): Promise<Application[]> {
    const log = this.logger.child({ user_id: userId });
    const total = this.listMaxRetries + 1;

    for (let attempt = 1; attempt <= total; attempt += 1) {
      try {
        return await this.loadApplications(userId);
      } catch (error) {
        log.warn('Pipeline load failed; retrying silently', {
          attempt,
          of: total,
          error: String(error),
        });
        if (attempt < total) {
          await this.sleep(this.listRetryDelayMs);
        }
      }
    }

    // Inline retries exhausted: keep trying in the background (Req 17.2) and
    // return an empty list now without surfacing any error to the user.
    void this.backgroundRetry(userId, log);
    return [];
  }

  /**
   * Fetch the original agent debate for an application (Req 17.4).
   *
   * Resolves the application's `verdict_id`, loads the AgentVerdicts item, and
   * reconstructs the {@link DebateResult} the Job Detail view renders.
   */
  async getDebate(applicationId: string): Promise<DebateResult> {
    const app = await this.getApplication(applicationId);
    const item = await this.db.get(this.agentVerdictsTable, {
      verdict_id: app.verdict_id,
    });
    if (!item) {
      throw new ValidationError(
        `Application_Tracker: debate not found for verdict_id ${app.verdict_id}`,
        { applicationId, verdict_id: app.verdict_id },
      );
    }
    return debateResultFromVerdictItem(item);
  }

  /**
   * Apply a single inbound reply classification to an application's status
   * (Req 18.5 / 18.6 / 18.7).
   *
   * Delegates the status decision to {@link applyReplyClassification}: a
   * confidence >= 60 sets the status from the classification and overrides any
   * earlier one; a confidence < 60 sets `needs_review`. The most recent reply's
   * confidence is recorded on the record.
   */
  async applyClassification(
    applicationId: string,
    c: Classification,
  ): Promise<void> {
    const app = await this.getApplication(applicationId);
    const nextStatus = applyReplyClassification(app.status, c);
    await this.writeStatus(applicationId, nextStatus, c.confidence);
    this.logger.info('Application status updated from reply', {
      application_id: applicationId,
      status: nextStatus,
      confidence: c.confidence,
    });
  }

  /**
   * Apply an ordered batch of reply classifications in one update.
   *
   * Folds the replies onto the application's current status via
   * {@link progressReplyStatus} (oldest-first), so the resulting status is the
   * effect of the most recent reply (Req 18.5–18.7). A no-op when `replies` is
   * empty. Useful for the Gmail_Monitor when several replies are matched to one
   * application within a single poll.
   */
  async applyReplies(
    applicationId: string,
    replies: readonly Classification[],
  ): Promise<void> {
    if (replies.length === 0) return;
    const app = await this.getApplication(applicationId);
    const nextStatus = progressReplyStatus(app.status, replies);
    const latest = replies[replies.length - 1];
    await this.writeStatus(applicationId, nextStatus, latest?.confidence);
  }

  /**
   * Mark a single application `ghosted` if it has gone unanswered for the
   * 14-day window (Req 18.9). Returns the updated record, or `null` when the
   * application is not (yet) eligible.
   */
  async checkGhosting(applicationId: string): Promise<Application | null> {
    const app = await this.getApplication(applicationId);
    if (!isGhostingDue(app, this.now(), this.ghostingIntervalMs)) {
      return null;
    }
    return this.markGhosted(app);
  }

  /**
   * Sweep all of a user's applications and mark every eligible one `ghosted`
   * (Req 18.9). Intended to be driven by the scheduled timer. Returns the list
   * of applications that were transitioned to `ghosted`.
   */
  async sweepGhosting(userId: string): Promise<Application[]> {
    const apps = await this.list(userId);
    const now = this.now();
    const due = apps.filter((app) =>
      isGhostingDue(app, now, this.ghostingIntervalMs),
    );
    const ghosted = await Promise.all(due.map((app) => this.markGhosted(app)));
    if (ghosted.length > 0) {
      this.logger.info('Ghosting sweep completed', {
        user_id: userId,
        ghosted: ghosted.length,
      });
    }
    return ghosted;
  }

  /* ---------------------------------------------------------------- *
   * Internals
   * ---------------------------------------------------------------- */

  /** Load a user's applications via the `(user_id, company)` GSI (Req 17.1). */
  private async loadApplications(userId: string): Promise<Application[]> {
    const items = await this.db.query(this.applicationsTable, {
      IndexName: this.applicationsUserIndex,
      KeyConditionExpression: 'user_id = :u',
      ExpressionAttributeValues: { ':u': userId },
    });
    return items as unknown as Application[];
  }

  /** Detached, silent background retry of a failed pipeline load (Req 17.2). */
  private async backgroundRetry(userId: string, log: Logger): Promise<void> {
    try {
      await this.sleep(this.listRetryDelayMs);
      const apps = await this.loadApplications(userId);
      log.info('Pipeline background retry succeeded', { count: apps.length });
    } catch (error) {
      log.warn('Pipeline background retry failed', { error: String(error) });
    }
  }

  /** Fetch a single application by id or throw a {@link ValidationError}. */
  private async getApplication(applicationId: string): Promise<Application> {
    const item = await this.db.get(this.applicationsTable, {
      application_id: applicationId,
    });
    if (!item) {
      throw new ValidationError(
        `Application_Tracker: application not found: ${applicationId}`,
        { applicationId },
      );
    }
    return item as unknown as Application;
  }

  /** Persist a status transition, defensively validating the target status. */
  private async writeStatus(
    applicationId: string,
    status: ApplicationStatus,
    confidence?: number,
  ): Promise<void> {
    if (!VALID_APPLICATION_STATUSES.has(status)) {
      throw new ValidationError(
        `Application_Tracker: refusing to write invalid status: ${String(status)}`,
        { applicationId, status },
      );
    }

    const nowIso = this.now().toISOString();
    const names: Record<string, string> = { '#s': 'status' };
    const values: Record<string, unknown> = {
      ':s': status,
      ':t': nowIso,
    };
    let expr = 'SET #s = :s, status_updated_at = :t';
    if (typeof confidence === 'number') {
      expr += ', classification_confidence = :c';
      values[':c'] = confidence;
    }

    await this.db.update(
      this.applicationsTable,
      { application_id: applicationId },
      {
        UpdateExpression: expr,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      },
    );
  }

  /** Transition an application to `ghosted` and stamp the update time. */
  private async markGhosted(app: Application): Promise<Application> {
    await this.writeStatus(app.application_id, 'ghosted');
    this.logger.info('Application ghosted (14 days, no reply)', {
      application_id: app.application_id,
      user_id: app.user_id,
    });
    return {
      ...app,
      status: 'ghosted',
      status_updated_at: this.now().toISOString(),
    };
  }
}

/** Convenience factory mirroring the {@link ApplicationTrackerImpl} constructor. */
export function createApplicationTracker(
  deps?: ApplicationTrackerDeps,
): ApplicationTrackerImpl {
  return new ApplicationTrackerImpl(deps);
}
