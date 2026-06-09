/**
 * Integration tests for the Recalibration_Engine weekly flow
 * (Task 18.4, Requirements 21.1, 21.2, 21.3, 21.4).
 *
 * These exercise {@link RecalibrationEngineImpl.runWeekly} end-to-end against an
 * in-memory fake {@link DynamoDBWrapper} and a fixed clock, with no real AWS
 * calls. The fake stores items per table and answers `get` / `put` / `update` /
 * `query` (including the simple `KeyConditionExpression` equality, the
 * `ScanIndexForward` ordering, and the `Limit` the engine relies on), so the
 * full fetch → compute → persist path can be asserted on real data.
 *
 * Coverage:
 *   1. (Req 21.1) The previous seven days' applications and their statuses are
 *      fetched; applications sent outside the seven-day window are excluded from
 *      the weekly metrics (and from the per-agent accuracy tally).
 *   2. (Req 21.2) Per-agent accuracy is computed by comparing each agent's
 *      verdict against the resulting Application status — `agent_performance`
 *      reflects apply-equivalent verdicts vs realised outcomes.
 *   3. (Req 21.3) A warranted threshold adjustment updates the user's
 *      `agent_weights` and records each adjustment's prior value, new value, and
 *      reason; the Users record is rewritten with the new weights.
 *   4. (Req 21.4) The {@link RecalibrationLogEntry} (metrics, agent_performance,
 *      adjustments, and the generated brief_text) is stored in the
 *      RecalibrationLog table and mirrors the returned entry.
 */

import { describe, it, expect } from 'vitest';
import {
  createLogger,
  type AgentName,
  type AgentWeights,
  type AmbitionVerdict,
  type Application,
  type ApplicationStatus,
  type DynamoDBWrapper,
  type DynamoItem,
  type OpportunityVerdict,
  type RealismVerdict,
  type RecalibrationLogEntry,
  type RiskVerdict,
  type UserConfig,
  type VerdictSet,
} from '@worksignal/shared';
import {
  RecalibrationEngineImpl,
  DEFAULT_RECALIBRATION_LOG_TABLE,
} from './recalibrationEngine.js';

/* ------------------------------------------------------------------ *
 * In-memory fake DynamoDBWrapper (get/put/update/query)
 * ------------------------------------------------------------------ */

/** Loosely-typed params bag — the engine passes typed objects; the fake reads
 * only the few fields it understands. */
type Params = Record<string, unknown>;

/**
 * A minimal in-memory stand-in for {@link DynamoDBWrapper}. It stores items per
 * table (deep-copied in and out so callers cannot mutate the store by
 * reference) and implements just enough of `get` / `put` / `update` / `query`
 * for the Recalibration_Engine:
 *   - `get` matches an item where every supplied key attribute is equal;
 *   - `put` appends a copy;
 *   - `update` applies a `SET a = :x, b = :y` expression to the matched item;
 *   - `query` filters by the `<attr> = :v` equality clauses in the
 *     `KeyConditionExpression`, then applies `ScanIndexForward` (reverse on
 *     `false`) and `Limit`.
 */
class FakeDynamoDB {
  readonly tables: Record<string, DynamoItem[]> = {};

  /** Seed a table with domain objects (deep-copied). */
  seed(tableName: string, items: readonly DynamoItem[]): void {
    const table = this.table(tableName);
    for (const item of items) {
      table.push(structuredClone(item));
    }
  }

  private table(name: string): DynamoItem[] {
    this.tables[name] ??= [];
    return this.tables[name]!;
  }

  private static matchesKey(item: DynamoItem, key: DynamoItem): boolean {
    return Object.keys(key).every((k) => item[k] === key[k]);
  }

  async get<T extends DynamoItem = DynamoItem>(
    tableName: string,
    key: DynamoItem,
  ): Promise<T | undefined> {
    const found = this.table(tableName).find((item) =>
      FakeDynamoDB.matchesKey(item, key),
    );
    return found ? (structuredClone(found) as T) : undefined;
  }

  async put<T extends DynamoItem = DynamoItem>(
    tableName: string,
    item: T,
  ): Promise<void> {
    this.table(tableName).push(structuredClone(item));
  }

  async update<T extends DynamoItem = DynamoItem>(
    tableName: string,
    key: DynamoItem,
    params: Params,
  ): Promise<T | undefined> {
    const item = this.table(tableName).find((candidate) =>
      FakeDynamoDB.matchesKey(candidate, key),
    );
    if (!item) {
      return undefined;
    }
    const expr = (params.UpdateExpression as string | undefined) ?? '';
    const values =
      (params.ExpressionAttributeValues as Record<string, unknown> | undefined) ??
      {};
    const names =
      (params.ExpressionAttributeNames as Record<string, string> | undefined) ??
      {};
    const body = expr.replace(/^\s*SET\s+/i, '');
    for (const assignment of body.split(',')) {
      const parts = assignment.split('=');
      if (parts.length < 2) {
        continue;
      }
      let attr = parts[0]!.trim();
      if (attr.startsWith('#')) {
        attr = names[attr] ?? attr;
      }
      const placeholder = parts[1]!.trim();
      item[attr] = values[placeholder];
    }
    return structuredClone(item) as T;
  }

  async query<T extends DynamoItem = DynamoItem>(
    tableName: string,
    params: Params,
  ): Promise<T[]> {
    let items = this.table(tableName).slice();
    const expr = params.KeyConditionExpression as string | undefined;
    const values =
      (params.ExpressionAttributeValues as Record<string, unknown> | undefined) ??
      {};
    const names =
      (params.ExpressionAttributeNames as Record<string, string> | undefined) ??
      {};
    if (expr) {
      const clauses = [...expr.matchAll(/(#?\w+)\s*=\s*(:\w+)/g)];
      for (const clause of clauses) {
        let attr = clause[1]!;
        if (attr.startsWith('#')) {
          attr = names[attr] ?? attr;
        }
        const expected = values[clause[2]!];
        items = items.filter((item) => item[attr] === expected);
      }
    }
    if (params.ScanIndexForward === false) {
      items.reverse();
    }
    if (typeof params.Limit === 'number') {
      items = items.slice(0, params.Limit);
    }
    return items.map((item) => structuredClone(item) as T);
  }
}

/** Build the engine wired to a fresh fake DB, a fixed clock, and a silent logger. */
function createEngine(db: FakeDynamoDB, now: Date) {
  return new RecalibrationEngineImpl({
    db: db as unknown as DynamoDBWrapper,
    now: () => now,
    generateRecalibrationId: () => 'recal-1',
    logger: createLogger({ sink: () => {} }),
  });
}

/* ------------------------------------------------------------------ *
 * Table names + fixed clock
 * ------------------------------------------------------------------ */

const USERS_TABLE = 'Users';
const APPLICATIONS_TABLE = 'Applications';
const AGENT_VERDICTS_TABLE = 'AgentVerdicts';

const USER_ID = 'user-1';
/** Fixed "now" for the run; the look-back window is [NOW - 7d, NOW]. */
const NOW = new Date('2024-06-08T09:00:00.000Z');
/** Exactly the window start (NOW - 7 days); apps at this instant are included. */
const WINDOW_START = '2024-06-01T09:00:00.000Z';
const EXPECTED_WEEK_OF = '2024-06-01';

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const DEFAULT_WEIGHTS: AgentWeights = {
  ambition_threshold: 70,
  realism_threshold: 80,
  risk_max_acceptable: 70,
  opportunity_urgency_boost: true,
};

function makeUser(weights: AgentWeights = DEFAULT_WEIGHTS): UserConfig {
  return {
    user_id: USER_ID,
    email: 'user@example.com',
    name: 'Test User',
    career_stage: 'mid_career',
    residency_status: 'citizen',
    profile: {
      current_role: 'Software Engineer',
      years_experience: 5,
      skills: ['TypeScript', 'AWS'],
      education: 'BSc Computer Science',
      university: 'NUS',
      target_roles: ['Senior Software Engineer'],
      target_industries: ['Technology'],
      dream_companies: ['Acme Pte Ltd'],
      priority_ranking: [
        'growth',
        'salary',
        'balance',
        'brand',
        'purpose',
        'stability',
      ],
    },
    non_negotiables: {
      min_salary: 7000,
      employment_type: ['full_time'],
      work_arrangement: 'any',
      custom: [],
      ep_sponsorship_required: false,
    },
    agent_weights: weights,
    inbox_monitoring_available: true,
    onboarding_version: 1,
    updated_at: '2024-06-01T00:00:00.000Z',
    created_at: '2024-05-01T00:00:00.000Z',
  };
}

let appCounter = 0;

function makeApplication(overrides: Partial<Application> = {}): Application {
  appCounter += 1;
  const id = `app-${appCounter}`;
  return {
    application_id: id,
    user_id: USER_ID,
    job_id: `job-${appCounter}`,
    verdict_id: `verdict-${appCounter}`,
    company: 'Acme Pte Ltd',
    role_title: 'Senior Software Engineer',
    customised_resume_s3_key: `resumes/${id}.pdf`,
    customisation_applied: true,
    cover_letter_text: 'Dear hiring manager',
    sent_at: '2024-06-05T00:00:00.000Z',
    recipient_email: 'hiring@acme.example',
    email_thread_id: `thread-${appCounter}`,
    status: 'sent',
    redirect_source_url: null,
    redirected_at: null,
    status_updated_at: '2024-06-05T00:00:00.000Z',
    classification_confidence: 0,
    ...overrides,
  };
}

function ambition(verdict: AmbitionVerdict['verdict']): AmbitionVerdict {
  return {
    verdict,
    ambition_score: verdict === 'apply' ? 80 : 40,
    reasoning: 'r',
    key_argument: 'k',
  };
}

function realism(verdict: RealismVerdict['verdict']): RealismVerdict {
  return {
    verdict,
    match_score: verdict === 'apply' ? 80 : 40,
    key_gaps: [],
    work_life_flags: [],
    reasoning: 'r',
    key_argument: 'k',
  };
}

function risk(verdict: RiskVerdict['verdict']): RiskVerdict {
  return {
    verdict,
    risk_score: verdict === 'safe' ? 20 : 80,
    red_flags: [],
    glassdoor_score: 4,
    reasoning: 'r',
    key_argument: 'k',
  };
}

function opportunity(
  verdict: OpportunityVerdict['verdict'],
): OpportunityVerdict {
  return {
    verdict,
    urgency_score: verdict === 'act_now' ? 90 : 30,
    timing_factors: [],
    reasoning: 'r',
    key_argument: 'k',
  };
}

/** Build an AgentVerdicts item in the shape `verdictSetFromItem` reads. */
function makeVerdictItem(verdictId: string, verdicts: VerdictSet): DynamoItem {
  return {
    verdict_id: verdictId,
    user_id: USER_ID,
    ...verdicts,
  } as unknown as DynamoItem;
}

/**
 * Seed the user, a list of applications, and a verdict item per application.
 * `verdictsByVerdictId` maps each application's `verdict_id` to its verdict set.
 */
function seedScenario(
  db: FakeDynamoDB,
  applications: readonly Application[],
  verdictsByVerdictId: Record<string, VerdictSet>,
  weights: AgentWeights = DEFAULT_WEIGHTS,
): void {
  db.seed(USERS_TABLE, [makeUser(weights) as unknown as DynamoItem]);
  db.seed(
    APPLICATIONS_TABLE,
    applications.map((a) => a as unknown as DynamoItem),
  );
  const verdictItems = Object.entries(verdictsByVerdictId).map(([vid, set]) =>
    makeVerdictItem(vid, set),
  );
  db.seed(AGENT_VERDICTS_TABLE, verdictItems);
}

/* ------------------------------------------------------------------ *
 * Tests
 * ------------------------------------------------------------------ */

describe('RecalibrationEngineImpl.runWeekly — weekly flow (Task 18.4)', () => {
  it('fetches the previous 7 days applications and excludes those outside the window (Req 21.1)', async () => {
    const db = new FakeDynamoDB();

    // Three apply-equivalent verdict sets so each application carries a verdict.
    const allApply: VerdictSet = {
      ambition: ambition('apply'),
      realism: realism('apply'),
      risk: risk('safe'),
      opportunity: opportunity('act_now'),
    };

    const inWindow = makeApplication({
      verdict_id: 'v-in',
      sent_at: '2024-06-05T00:00:00.000Z',
      status: 'callback',
    });
    const atBoundary = makeApplication({
      verdict_id: 'v-boundary',
      sent_at: WINDOW_START, // exactly NOW - 7d, inclusive
      status: 'rejected',
    });
    const outsideWindow = makeApplication({
      verdict_id: 'v-out',
      sent_at: '2024-05-30T00:00:00.000Z', // before the window
      status: 'callback', // would inflate callbacks if wrongly included
    });

    seedScenario(db, [inWindow, atBoundary, outsideWindow], {
      'v-in': allApply,
      'v-boundary': allApply,
      'v-out': allApply,
    });

    const engine = createEngine(db, NOW);
    const entry = await engine.runWeekly(USER_ID);

    // Only the two in-window applications are counted; the out-of-window
    // callback is excluded.
    expect(entry.week_of).toBe(EXPECTED_WEEK_OF);
    expect(entry.metrics.applications_sent).toBe(2);
    expect(entry.metrics.callbacks).toBe(1); // only the in-window callback
    expect(entry.metrics.rejections).toBe(1); // the boundary rejection
    expect(entry.metrics.ghosted).toBe(0);
    expect(entry.metrics.callback_rate).toBeCloseTo(0.5, 10);
  });

  it('computes per-agent accuracy from verdicts vs resulting statuses (Req 21.2)', async () => {
    const db = new FakeDynamoDB();

    const applyAll: VerdictSet = {
      ambition: ambition('apply'),
      realism: realism('apply'),
      risk: risk('safe'),
      opportunity: opportunity('act_now'),
    };
    const skipAll: VerdictSet = {
      ambition: ambition('skip'),
      realism: realism('skip'),
      risk: risk('avoid'),
      opportunity: opportunity('no_advantage'),
    };

    // A: apply-equivalent + callback  -> every agent correct
    // B: apply-equivalent + rejected  -> every agent incorrect (false positive)
    // C: not apply-equivalent + rejected -> every agent correct
    const appA = makeApplication({ verdict_id: 'v-a', status: 'callback' });
    const appB = makeApplication({ verdict_id: 'v-b', status: 'rejected' });
    const appC = makeApplication({ verdict_id: 'v-c', status: 'rejected' });

    seedScenario(db, [appA, appB, appC], {
      'v-a': applyAll,
      'v-b': applyAll,
      'v-c': skipAll,
    });

    const engine = createEngine(db, NOW);
    const entry = await engine.runWeekly(USER_ID);

    // Each agent: 2 correct (A, C) and 1 incorrect (B).
    const agents: AgentName[] = ['ambition', 'realism', 'risk', 'opportunity'];
    for (const agent of agents) {
      expect(entry.agent_performance[agent]).toEqual({
        correct: 2,
        incorrect: 1,
      });
    }

    // Accuracy is acceptable (2/3) over a small sample, so no adjustment is made
    // and the user's weights are left untouched.
    expect(entry.adjustments_made).toEqual([]);
    const user = await db.get<UserConfig & DynamoItem>(USERS_TABLE, {
      user_id: USER_ID,
    });
    expect(user?.agent_weights).toEqual(DEFAULT_WEIGHTS);
  });

  it('applies a warranted threshold adjustment and records prior/new/reason in agent_weights (Req 21.3)', async () => {
    const db = new FakeDynamoDB();

    // Five applications where Realism said "apply" but the outcome was a
    // rejection: Realism is consistently too lenient (5 false positives, 0
    // correct) -> warranted "tighten" adjustment raising realism_threshold.
    // Every other agent is non-apply-equivalent on a negative outcome, so they
    // are all correct and warrant no change.
    const tooLenientRealism: VerdictSet = {
      ambition: ambition('skip'),
      realism: realism('apply'),
      risk: risk('avoid'),
      opportunity: opportunity('no_advantage'),
    };

    const applications: Application[] = [];
    const verdictMap: Record<string, VerdictSet> = {};
    const status: ApplicationStatus = 'rejected';
    for (let i = 0; i < 5; i += 1) {
      const vid = `v-lenient-${i}`;
      applications.push(makeApplication({ verdict_id: vid, status }));
      verdictMap[vid] = tooLenientRealism;
    }

    seedScenario(db, applications, verdictMap);

    const engine = createEngine(db, NOW);
    const entry = await engine.runWeekly(USER_ID);

    // Exactly one adjustment, for the Realism agent's numeric threshold.
    expect(entry.adjustments_made).toHaveLength(1);
    const adjustment = entry.adjustments_made[0]!;
    expect(adjustment.agent).toBe('realism');
    expect(adjustment.parameter).toBe('realism_threshold');
    expect(adjustment.old_value).toBe(80); // prior value recorded
    expect(adjustment.new_value).toBe(85); // raised to be more selective
    expect(adjustment.reason).toContain('realism_threshold');
    expect(adjustment.reason.length).toBeGreaterThan(0);

    // The user's agent_weights are rewritten with the new threshold; all other
    // weights are unchanged.
    const user = await db.get<UserConfig & DynamoItem>(USERS_TABLE, {
      user_id: USER_ID,
    });
    expect(user?.agent_weights).toEqual({
      ...DEFAULT_WEIGHTS,
      realism_threshold: 85,
    });
  });

  it('stores the RecalibrationLogEntry (metrics, performance, adjustments, brief) in RecalibrationLog (Req 21.4)', async () => {
    const db = new FakeDynamoDB();

    // Reuse the "too lenient Realism" scenario so the stored entry carries a
    // non-empty adjustment set as well as metrics and per-agent performance.
    const tooLenientRealism: VerdictSet = {
      ambition: ambition('skip'),
      realism: realism('apply'),
      risk: risk('avoid'),
      opportunity: opportunity('no_advantage'),
    };
    const applications: Application[] = [];
    const verdictMap: Record<string, VerdictSet> = {};
    for (let i = 0; i < 5; i += 1) {
      const vid = `v-log-${i}`;
      applications.push(makeApplication({ verdict_id: vid, status: 'rejected' }));
      verdictMap[vid] = tooLenientRealism;
    }
    seedScenario(db, applications, verdictMap);

    const engine = createEngine(db, NOW);
    const returned = await engine.runWeekly(USER_ID);

    // Exactly one log entry is persisted to the RecalibrationLog table.
    const stored = (db.tables[DEFAULT_RECALIBRATION_LOG_TABLE] ??
      []) as unknown as RecalibrationLogEntry[];
    expect(stored).toHaveLength(1);
    const entry = stored[0]!;

    // The persisted entry mirrors the returned entry exactly.
    expect(entry).toEqual(returned);

    // It carries the full set of weekly artefacts (Req 21.4).
    expect(entry.recalibration_id).toBe('recal-1');
    expect(entry.user_id).toBe(USER_ID);
    expect(entry.week_of).toBe(EXPECTED_WEEK_OF);
    expect(entry.metrics.applications_sent).toBe(5);
    expect(entry.metrics.rejections).toBe(5);
    expect(entry.metrics.callbacks).toBe(0);
    expect(Object.keys(entry.agent_performance).sort()).toEqual([
      'ambition',
      'opportunity',
      'realism',
      'risk',
    ]);
    expect(entry.adjustments_made).toHaveLength(1);
    expect(entry.adjustments_made[0]!.agent).toBe('realism');

    // A brief is always present (deterministic template fallback here).
    expect(typeof entry.brief_text).toBe('string');
    expect(entry.brief_text.length).toBeGreaterThan(0);
    expect(entry.brief_text).toContain(EXPECTED_WEEK_OF);
    expect(entry.created_at).toBe(NOW.toISOString());
  });
});
