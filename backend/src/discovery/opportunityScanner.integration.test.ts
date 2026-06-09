/**
 * Integration tests for the Opportunity_Scanner (Task 12.3).
 *
 * Exercises the scanner end-to-end against an in-memory fake DynamoDB and
 * injected MCF / Exa seams (no network, no AWS), covering:
 *
 *   (1) 3-hour gate (Req 7.1) — the scan is a no-op when fewer than three hours
 *       have elapsed since `last_scan_at`, and runs when ≥3h have elapsed or the
 *       user has never been scanned.
 *   (2) MCF success path (Req 7.1/7.2/7.3) — mocked `mcfSearch` results are
 *       mapped and persisted to the Jobs table with company / role / salary /
 *       jd / posted_at / source_url / employer_email plus the Pre_Filter fields,
 *       and `last_scan_at` is stamped on completion.
 *   (3) MCF error → Exa fallback (Req 7.4/8.3) — when `mcfSearch` throws, the
 *       injected `createExaFallback` (built on a fake Exa client) supplies jobs
 *       that get persisted, and every query reaching Exa is Singapore-scoped.
 *
 * The fake DynamoDBWrapper below supports get / put / update / query in-memory
 * so the scanner's real persistence calls run unchanged.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DynamoDBWrapper,
  type DynamoItem,
  type UserConfig,
} from '@worksignal/shared';
import {
  createOpportunityScanner,
  SCAN_INTERVAL_MS,
  type McfSearchFn,
  type RawMcfJob,
} from './opportunityScanner.js';
import {
  createExaFallback,
  type ExaSearchFn,
  type ExaSearchParams,
  type RawExaResult,
} from './exaFallback.js';
import { SINGAPORE_SCOPE_TERM } from './exaQuery.js';

/* ------------------------------------------------------------------ *
 * In-memory fake DynamoDBWrapper
 * ------------------------------------------------------------------ */

/**
 * In-memory {@link DynamoDBWrapper} supporting get/put/update/query.
 *
 * Storage is `table -> (primaryKeyString -> item)`. The primary-key attribute
 * names per table are supplied at construction so `put` can derive the key from
 * a full item. A minimal `SET`-expression evaluator backs `update`, and `query`
 * filters a table by a `attr = :value` `KeyConditionExpression`.
 *
 * Extends the real wrapper (so it is type-compatible) but overrides every
 * method; the injected dummy client is never used.
 */
class FakeDynamoDBWrapper extends DynamoDBWrapper {
  private readonly store = new Map<string, Map<string, DynamoItem>>();
  private readonly keyAttrs: Record<string, string[]>;

  /** Number of `put` calls per table — handy for persistence assertions. */
  readonly putCounts: Record<string, number> = {};

  constructor(keyAttrs: Record<string, string[]>) {
    // Inject a dummy document client; it is never exercised because every
    // public method below is overridden.
    super({ client: { send: async () => ({}) } });
    this.keyAttrs = keyAttrs;
  }

  private tableMap(table: string): Map<string, DynamoItem> {
    let m = this.store.get(table);
    if (!m) {
      m = new Map<string, DynamoItem>();
      this.store.set(table, m);
    }
    return m;
  }

  private keyFromAttrs(table: string, source: DynamoItem): string {
    const attrs = this.keyAttrs[table];
    if (!attrs) {
      throw new Error(`FakeDynamoDBWrapper: no key schema for table ${table}`);
    }
    return attrs.map((a) => String(source[a])).join('::');
  }

  /** Seed an item directly without counting it as a `put`. */
  seed(table: string, item: DynamoItem): void {
    this.tableMap(table).set(this.keyFromAttrs(table, item), { ...item });
  }

  /** All items currently stored in a table. */
  all<T extends DynamoItem = DynamoItem>(table: string): T[] {
    return [...this.tableMap(table).values()] as T[];
  }

  override async get<T extends DynamoItem = DynamoItem>(
    table: string,
    key: DynamoItem,
  ): Promise<T | undefined> {
    const item = this.tableMap(table).get(this.keyFromAttrs(table, key));
    return item ? ({ ...item } as T) : undefined;
  }

  override async put<T extends DynamoItem = DynamoItem>(
    table: string,
    item: T,
  ): Promise<void> {
    this.tableMap(table).set(this.keyFromAttrs(table, item), { ...item });
    this.putCounts[table] = (this.putCounts[table] ?? 0) + 1;
  }

  override async delete(table: string, key: DynamoItem): Promise<void> {
    this.tableMap(table).delete(this.keyFromAttrs(table, key));
  }

  override async update<T extends DynamoItem = DynamoItem>(
    table: string,
    key: DynamoItem,
    params: {
      UpdateExpression?: string;
      ExpressionAttributeValues?: Record<string, unknown>;
      ExpressionAttributeNames?: Record<string, string>;
      [k: string]: unknown;
    },
  ): Promise<T | undefined> {
    const map = this.tableMap(table);
    const keyStr = this.keyFromAttrs(table, key);
    const current = map.get(keyStr) ?? { ...key };
    const updated = applySetExpression(
      { ...current },
      params.UpdateExpression ?? '',
      params.ExpressionAttributeValues ?? {},
      params.ExpressionAttributeNames ?? {},
    );
    map.set(keyStr, updated);
    return { ...updated } as T;
  }

  override async query<T extends DynamoItem = DynamoItem>(
    table: string,
    params: {
      KeyConditionExpression?: string;
      ExpressionAttributeValues?: Record<string, unknown>;
      ExpressionAttributeNames?: Record<string, string>;
      [k: string]: unknown;
    },
  ): Promise<T[]> {
    const items = this.all(table);
    const expr = params.KeyConditionExpression;
    if (!expr) return items as T[];
    // Support a single `attr = :value` condition.
    const match = expr.match(/^\s*(#?\w+)\s*=\s*(:\w+)\s*$/);
    if (!match) return items as T[];
    const [, rawAttr, valueRef] = match;
    const attr = rawAttr!.startsWith('#')
      ? (params.ExpressionAttributeNames ?? {})[rawAttr!] ?? rawAttr!
      : rawAttr!;
    const value = (params.ExpressionAttributeValues ?? {})[valueRef!];
    return items.filter((i) => i[attr] === value) as T[];
  }
}

/** Apply a minimal `SET a = :v, #b = :w` update expression to an item. */
function applySetExpression(
  item: DynamoItem,
  expression: string,
  values: Record<string, unknown>,
  names: Record<string, string>,
): DynamoItem {
  const set = expression.replace(/^\s*SET\s+/i, '');
  if (set === expression) return item; // no SET clause
  for (const clause of set.split(',')) {
    const [lhsRaw, rhsRaw] = clause.split('=').map((s) => s.trim());
    if (!lhsRaw || !rhsRaw) continue;
    const attr = lhsRaw.startsWith('#') ? names[lhsRaw] ?? lhsRaw : lhsRaw;
    const value = rhsRaw.startsWith(':') ? values[rhsRaw] : rhsRaw;
    item[attr] = value;
  }
  return item;
}

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const USERS_TABLE = 'Users';
const JOBS_TABLE = 'Jobs';
const USER_ID = 'google-sub-123';

/** A fixed clock for deterministic elapsed-time assertions. */
const FIXED_NOW = new Date('2024-06-01T12:00:00.000Z');
const fixedClock = () => FIXED_NOW;

function makeUser(overrides: Partial<UserConfig> = {}): UserConfig {
  return {
    user_id: USER_ID,
    email: 'jobseeker@example.com',
    name: 'Job Seeker',
    career_stage: 'fresh_grad',
    residency_status: 'citizen',
    profile: {
      current_role: 'Intern',
      years_experience: 0,
      skills: ['TypeScript'],
      education: 'BSc Computer Science',
      university: 'NUS',
      target_roles: ['Software Engineer'],
      target_industries: ['Fintech'],
      dream_companies: ['Acme'],
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
      min_salary: 5000,
      employment_type: ['full_time'],
      work_arrangement: 'any',
      custom: [],
      ep_sponsorship_required: false,
    },
    agent_weights: {
      ambition_threshold: 70,
      realism_threshold: 70,
      risk_max_acceptable: 70,
      opportunity_urgency_boost: true,
    },
    inbox_monitoring_available: true,
    onboarding_version: 1,
    updated_at: '2024-05-01T00:00:00.000Z',
    created_at: '2024-05-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeFakeDb(): FakeDynamoDBWrapper {
  return new FakeDynamoDBWrapper({
    [USERS_TABLE]: ['user_id'],
    [JOBS_TABLE]: ['job_id'],
  });
}

/** A representative MCF listing covering every persisted field. */
function sampleMcfJob(): RawMcfJob {
  return {
    uuid: 'mcf-job-1',
    title: 'Software Engineer',
    description: 'Build payment systems. Visa sponsorship available.',
    postedCompany: { name: 'Acme Pte Ltd' },
    salary: { minimum: 6000, maximum: 9000 },
    employmentTypes: [{ employmentType: 'Full Time' }],
    categories: [{ category: 'Information Technology' }],
    address: { country: { description: 'Singapore' } },
    metadata: {
      originalPostingDate: '2024-05-20',
      jobDetailsUrl: 'https://www.mycareersfuture.gov.sg/job/mcf-job-1',
    },
    applicationEmail: 'hiring@acme.sg',
  };
}

/* ------------------------------------------------------------------ *
 * (1) 3-hour gate (Req 7.1)
 * ------------------------------------------------------------------ */

describe('Opportunity_Scanner integration — 3-hour gate (Req 7.1)', () => {
  let db: FakeDynamoDBWrapper;
  let mcfCalls: number;
  const mcfSearch: McfSearchFn = async () => {
    mcfCalls += 1;
    return [sampleMcfJob()];
  };

  beforeEach(() => {
    db = makeFakeDb();
    mcfCalls = 0;
  });

  it('no-ops when fewer than three hours have elapsed since last_scan_at', async () => {
    const twoHoursAgo = new Date(FIXED_NOW.getTime() - 2 * 60 * 60 * 1000);
    db.seed(USERS_TABLE, makeUser({ last_scan_at: twoHoursAgo.toISOString() }) as unknown as DynamoItem);

    const scanner = createOpportunityScanner({
      db,
      mcfSearch,
      now: fixedClock,
      usersTable: USERS_TABLE,
      jobsTable: JOBS_TABLE,
    });

    const jobs = await scanner.scan(USER_ID);

    expect(jobs).toEqual([]);
    expect(mcfCalls).toBe(0);
    expect(db.all(JOBS_TABLE)).toHaveLength(0);
    // last_scan_at must be left untouched.
    const user = await db.get<UserConfig & DynamoItem>(USERS_TABLE, { user_id: USER_ID });
    expect(user?.last_scan_at).toBe(twoHoursAgo.toISOString());
  });

  it('runs when exactly three hours have elapsed since last_scan_at', async () => {
    const threeHoursAgo = new Date(FIXED_NOW.getTime() - SCAN_INTERVAL_MS);
    db.seed(USERS_TABLE, makeUser({ last_scan_at: threeHoursAgo.toISOString() }) as unknown as DynamoItem);

    const scanner = createOpportunityScanner({
      db,
      mcfSearch,
      now: fixedClock,
      usersTable: USERS_TABLE,
      jobsTable: JOBS_TABLE,
    });

    const jobs = await scanner.scan(USER_ID);

    expect(mcfCalls).toBeGreaterThan(0);
    expect(jobs).toHaveLength(1);
    expect(db.all(JOBS_TABLE)).toHaveLength(1);
  });

  it('runs when the user has never been scanned (no last_scan_at)', async () => {
    db.seed(USERS_TABLE, makeUser({ last_scan_at: undefined }) as unknown as DynamoItem);

    const scanner = createOpportunityScanner({
      db,
      mcfSearch,
      now: fixedClock,
      usersTable: USERS_TABLE,
      jobsTable: JOBS_TABLE,
    });

    const jobs = await scanner.scan(USER_ID);

    expect(mcfCalls).toBeGreaterThan(0);
    expect(jobs).toHaveLength(1);
    expect(db.all(JOBS_TABLE)).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ *
 * (2) MCF success path (Req 7.1 / 7.2 / 7.3)
 * ------------------------------------------------------------------ */

describe('Opportunity_Scanner integration — MCF success path (Req 7.1/7.2/7.3)', () => {
  it('maps and persists MCF jobs with all required fields and stamps last_scan_at', async () => {
    const db = makeFakeDb();
    db.seed(USERS_TABLE, makeUser({ last_scan_at: undefined }) as unknown as DynamoItem);

    const searchTerms: string[] = [];
    const mcfSearch: McfSearchFn = async ({ search }) => {
      searchTerms.push(search);
      // Only return the listing for the role term so the assertion is on one job.
      return search === 'Software Engineer' ? [sampleMcfJob()] : [];
    };

    const scanner = createOpportunityScanner({
      db,
      mcfSearch,
      now: fixedClock,
      usersTable: USERS_TABLE,
      jobsTable: JOBS_TABLE,
    });

    const jobs = await scanner.scan(USER_ID);

    // MCF was queried by the user's target roles and industries (Req 7.1).
    expect(searchTerms).toEqual(
      expect.arrayContaining(['Software Engineer', 'Fintech']),
    );

    // Exactly one job persisted, carrying every Req 7.2 field.
    expect(jobs).toHaveLength(1);
    const stored = db.all(JOBS_TABLE);
    expect(stored).toHaveLength(1);
    const job = stored[0]!;

    expect(job).toMatchObject({
      job_id: 'mcf-job-1',
      user_id: USER_ID,
      company: 'Acme Pte Ltd',
      role_title: 'Software Engineer',
      salary_min: 6000,
      salary_max: 9000,
      jd_text: 'Build payment systems. Visa sponsorship available.',
      source_url: 'https://www.mycareersfuture.gov.sg/job/mcf-job-1',
      employer_email: 'hiring@acme.sg',
      // Pre_Filter / filtering fields (design Jobs schema).
      employment_type: 'full_time',
      work_arrangement: 'any',
      location: 'Singapore',
      ep_sponsorship_signal: true,
    });

    // posted_at resolved from the MCF posting date (Req 7.2).
    expect(job.posted_at).toBe(new Date('2024-05-20').toISOString());
    // scanned_at stamped with the fixed clock.
    expect(job.scanned_at).toBe(FIXED_NOW.toISOString());
    expect(typeof job.mcf_listing_days).toBe('number');

    // last_scan_at updated on completion (Req 7.3).
    const user = await db.get<UserConfig & DynamoItem>(USERS_TABLE, { user_id: USER_ID });
    expect(user?.last_scan_at).toBe(FIXED_NOW.toISOString());
  });
});

/* ------------------------------------------------------------------ *
 * (3) MCF error → Exa fallback (Req 7.4 / 8.3)
 * ------------------------------------------------------------------ */

describe('Opportunity_Scanner integration — MCF error → Exa fallback (Req 7.4/8.3)', () => {
  it('falls back to Exa, persists Exa jobs, and Singapore-scopes every query', async () => {
    const db = makeFakeDb();
    db.seed(USERS_TABLE, makeUser({ last_scan_at: undefined }) as unknown as DynamoItem);

    // MCF fails for this scan (Req 7.4 trigger).
    const mcfSearch: McfSearchFn = async () => {
      throw new Error('MCF API error: HTTP 503');
    };

    // Fake Exa client records every query and returns one result per query.
    const exaQueries: string[] = [];
    const exaSearch: ExaSearchFn = async ({ query }: ExaSearchParams) => {
      exaQueries.push(query);
      const result: RawExaResult = {
        id: `exa-${exaQueries.length}`,
        url: `https://careers.example.com/job/${exaQueries.length}`,
        title: 'Backend Engineer',
        text: 'Join our Singapore team building APIs.',
        publishedDate: '2024-05-25',
        author: 'Example Pte Ltd',
      };
      return [result];
    };

    const scanner = createOpportunityScanner({
      db,
      mcfSearch,
      exaFallback: createExaFallback({ exaSearch }),
      now: fixedClock,
      usersTable: USERS_TABLE,
      jobsTable: JOBS_TABLE,
    });

    const jobs = await scanner.scan(USER_ID);

    // Exa supplied the jobs and they were persisted (Req 7.4).
    expect(exaQueries.length).toBeGreaterThan(0);
    expect(jobs.length).toBeGreaterThan(0);
    expect(db.all(JOBS_TABLE).length).toBe(jobs.length);

    const stored = db.all(JOBS_TABLE);
    expect(stored[0]).toMatchObject({
      user_id: USER_ID,
      company: 'Example Pte Ltd',
      role_title: 'Backend Engineer',
      location: 'Singapore',
      source_url: expect.stringContaining('careers.example.com'),
      scanned_at: FIXED_NOW.toISOString(),
    });

    // Every query reaching Exa is Singapore-scoped (Req 8.3).
    expect(exaQueries.length).toBeGreaterThanOrEqual(1);
    for (const q of exaQueries) {
      expect(q).toContain(SINGAPORE_SCOPE_TERM);
    }

    // last_scan_at is still stamped on completion via the fallback path.
    const user = await db.get<UserConfig & DynamoItem>(USERS_TABLE, { user_id: USER_ID });
    expect(user?.last_scan_at).toBe(FIXED_NOW.toISOString());
  });
});
