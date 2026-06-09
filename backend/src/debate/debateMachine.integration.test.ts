/**
 * Integration test for the in-process debate machine (Task 14.4,
 * Requirements 10.1, 13.1, 13.5).
 *
 * Exercises {@link runDebateMachine} end-to-end — scan → Pre_Filter → parallel
 * four-agent debate → Master resolution → routing → material generation →
 * review-queue ordering — with every external dependency faked so the run is
 * deterministic and performs no real AWS / MCF / Exa calls:
 *
 *   - an injected `scan` returning candidate {@link DiscoveredJob}s, some of
 *     which pass the Pre_Filter and some of which are discarded;
 *   - a fake Bedrock for the four agents that dispatches by the agent's fixed
 *     system prompt AND by the job's company (so each job gets its own verdict
 *     mix), plus a fake Bedrock for material generation returning resume /
 *     cover-letter text;
 *   - a fake Exa research client used by the Risk_Agent;
 *   - an in-memory fake {@link DynamoDBWrapper} (a real wrapper backed by an
 *     in-memory document client) for AgentVerdicts persistence; and
 *   - a real {@link createGenerateMaterials} hook wired to the fake Bedrock + a
 *     fake S3 store.
 *
 * Coverage:
 *   1. A job whose four agents are all apply-equivalent with Opportunity
 *      `act_now` resolves to `apply_consensus`, routes to `generate_materials`,
 *      produces materials (Req 13.1), and is placed at the TOP of the review
 *      queue (fast-track, Req 13.5).
 *   2. A second apply-equivalent job WITHOUT `act_now` also generates materials
 *      but ranks BELOW the fast-tracked job in the review queue (Req 13.5).
 *   3. A Risk `avoid` job resolves to `veto_skip`, routes to `veto_log`, and is
 *      never queued (Req 13.4 routing input to 13.x).
 *   4. An all-filtered scan yields a relaxation suggestion and runs no debate
 *      (Req 9.5/9.6) — the agents are never invoked.
 *   And the four agents are all invoked for every surviving job (parallel
 *   fan-out, Req 10.1).
 */

import { describe, it, expect } from 'vitest';
import {
  DynamoDBWrapper,
  type DiscoveredJob,
  type DocumentClientLike,
  type DynamoItem,
  type Job,
  type MasterDecision,
  type Materials,
  type UserConfig,
} from '@worksignal/shared';
import type {
  BedrockInvoke,
  BedrockRequest,
  ExaClient,
  ExaResult,
} from './agents/index.js';
import { createGenerateMaterials } from './materialGeneration.js';
import {
  runDebateMachine,
  type GenerateMaterialsHook,
  type JobDebateOutcome,
} from './debateMachine.js';
import {
  DEFAULT_AGENT_VERDICTS_TABLE,
  type AgentVerdictsRecord,
} from './verdictPersistence.js';

/* ------------------------------------------------------------------ *
 * In-memory fake DynamoDBWrapper (put/get)
 * ------------------------------------------------------------------ */

interface InMemoryStore {
  /** Items per table, in insertion order. */
  tables: Record<string, DynamoItem[]>;
}

/**
 * A fake document client that stores items in memory and answers `put`/`get`
 * (the two operations the verdict-persistence path uses). `put` appends a deep
 * copy; `get` matches an item whose key attributes all equal the stored value.
 */
function createInMemoryDocClient(): DocumentClientLike & { store: InMemoryStore } {
  const store: InMemoryStore = { tables: {} };
  return {
    store,
    async send(command: unknown): Promise<unknown> {
      const cmd = command as {
        constructor: { name: string };
        input: Record<string, unknown>;
      };
      const name = cmd.constructor.name;
      const tableName = cmd.input.TableName as string;
      store.tables[tableName] ??= [];
      const table = store.tables[tableName] as DynamoItem[];

      if (name === 'PutCommand') {
        const item = cmd.input.Item as DynamoItem;
        table.push(structuredClone(item));
        return {};
      }
      if (name === 'GetCommand') {
        const key = cmd.input.Key as DynamoItem;
        const found = table.find((item) =>
          Object.keys(key).every((k) => item[k] === key[k]),
        );
        return found ? { Item: structuredClone(found) } : {};
      }
      throw new Error(`InMemoryDocClient: unsupported command ${name}`);
    },
  };
}

/** A real DynamoDBWrapper backed by the in-memory client, plus its store. */
function createInMemoryDb(): { db: DynamoDBWrapper; store: InMemoryStore } {
  const client = createInMemoryDocClient();
  return { db: new DynamoDBWrapper({ client }), store: client.store };
}

/** Read the persisted AgentVerdicts records from the in-memory store. */
function storedRecords(store: InMemoryStore): AgentVerdictsRecord[] {
  const rows = store.tables[DEFAULT_AGENT_VERDICTS_TABLE] ?? [];
  return rows as unknown as AgentVerdictsRecord[];
}

/* ------------------------------------------------------------------ *
 * Fake Bedrock (agents) + Exa
 * ------------------------------------------------------------------ */

type AgentKind = 'ambition' | 'realism' | 'risk' | 'opportunity';

/** The test companies, each driving a distinct verdict mix. */
const FAST_TRACK_COMPANY = 'FastTrack Corp';
const STEADY_COMPANY = 'SteadyState Ltd';
const RISKY_COMPANY = 'RiskyBiz Inc';

const COMPANIES = [FAST_TRACK_COMPANY, STEADY_COMPANY, RISKY_COMPANY] as const;

/** Identify which agent a request belongs to from its fixed system prompt. */
function agentOf(request: BedrockRequest): AgentKind {
  const s = request.system;
  if (s.includes('Ambition Agent')) return 'ambition';
  if (s.includes('Realism Agent')) return 'realism';
  if (s.includes('Risk Agent')) return 'risk';
  if (s.includes('Opportunity Agent')) return 'opportunity';
  throw new Error('Unrecognised agent system prompt');
}

/** Identify which job a request is about from the company in its user prompt. */
function companyOf(request: BedrockRequest): (typeof COMPANIES)[number] {
  const matches = COMPANIES.filter((c) => request.user.includes(c));
  const company = matches[0];
  if (company === undefined || matches.length !== 1) {
    throw new Error(`Could not resolve a single company from prompt (found ${matches.length})`);
  }
  return company;
}

/** Build a schema-conformant Ambition verdict JSON string. */
function ambitionApply(): string {
  return JSON.stringify({
    verdict: 'apply',
    ambition_score: 84,
    reasoning: 'Clear seniority step-up and salary improvement.',
    key_argument: 'Raises the career ceiling.',
  });
}

/** Build a schema-conformant Realism `apply` verdict JSON string. */
function realismApply(): string {
  return JSON.stringify({
    verdict: 'apply',
    match_score: 76,
    key_gaps: ['Kubernetes'],
    work_life_flags: [],
    reasoning: 'Most hard requirements met; one addressable gap.',
    key_argument: 'Strong, realistic match.',
  });
}

/** Build a schema-conformant Risk `safe` verdict JSON string. */
function riskSafe(): string {
  return JSON.stringify({
    verdict: 'safe',
    risk_score: 20,
    red_flags: [],
    glassdoor_score: 4,
    reasoning: 'Financially stable; no significant red flags.',
    key_argument: 'Low-risk employer.',
  });
}

/** Build a schema-conformant Risk `avoid` verdict JSON string (triggers veto). */
function riskAvoid(): string {
  return JSON.stringify({
    verdict: 'avoid',
    risk_score: 88,
    red_flags: [
      { flag: 'Mass layoffs in 2025', source: 'https://exa.example/news', severity: 'high' },
    ],
    glassdoor_score: 2,
    reasoning: 'Recent mass layoffs and litigation; high risk.',
    key_argument: 'Avoid — serious red flags.',
  });
}

/** Build a schema-conformant Opportunity verdict JSON string. */
function opportunity(verdict: 'act_now' | 'monitor'): string {
  return JSON.stringify({
    verdict,
    urgency_score: verdict === 'act_now' ? 90 : 45,
    timing_factors: verdict === 'act_now' ? ['Posted 2 hours ago'] : ['No urgency signals'],
    reasoning: verdict === 'act_now' ? 'Fresh posting with first-mover advantage.' : 'No timing edge.',
    key_argument: verdict === 'act_now' ? 'Move fast.' : 'No rush.',
  });
}

/**
 * Per-company verdict map. Each company resolves to a distinct decision:
 *  - FastTrack Corp → all four apply-equivalent + act_now → apply_consensus, fast-track.
 *  - SteadyState Ltd → all four apply-equivalent but Opportunity `monitor` → apply_consensus, normal.
 *  - RiskyBiz Inc → Risk `avoid` → veto_skip.
 */
const VERDICTS: Record<(typeof COMPANIES)[number], Record<AgentKind, string>> = {
  [FAST_TRACK_COMPANY]: {
    ambition: ambitionApply(),
    realism: realismApply(),
    risk: riskSafe(),
    opportunity: opportunity('act_now'),
  },
  [STEADY_COMPANY]: {
    ambition: ambitionApply(),
    realism: realismApply(),
    risk: riskSafe(),
    opportunity: opportunity('monitor'),
  },
  [RISKY_COMPANY]: {
    ambition: ambitionApply(),
    realism: realismApply(),
    risk: riskAvoid(),
    opportunity: opportunity('act_now'),
  },
};

/** A record of a single agent Bedrock call. */
interface AgentCall {
  company: (typeof COMPANIES)[number];
  agent: AgentKind;
}

/** A fake agent Bedrock that records calls and returns per-company JSON. */
function createAgentBedrock(): BedrockInvoke & { calls: AgentCall[] } {
  const calls: AgentCall[] = [];
  const fn = (async (request: BedrockRequest): Promise<string> => {
    const agent = agentOf(request);
    const company = companyOf(request);
    calls.push({ company, agent });
    return VERDICTS[company][agent];
  }) as BedrockInvoke & { calls: AgentCall[] };
  fn.calls = calls;
  return fn;
}

/** An Exa fake that records queries and returns one non-empty result. */
function createExa(): ExaClient & { queries: string[] } {
  const queries: string[] = [];
  const fn = (async (query: string): Promise<ExaResult[]> => {
    queries.push(query);
    return [{ title: 'Company news', url: 'https://exa.example/news', text: 'Some research.' }];
  }) as ExaClient & { queries: string[] };
  fn.queries = queries;
  return fn;
}

/* ------------------------------------------------------------------ *
 * Fake material Bedrock + fake S3 + the real createGenerateMaterials hook
 * ------------------------------------------------------------------ */

const RESUME_TEXT = 'CUSTOMISED RESUME — tailored to the platform-scaling angle.';
const COVER_LETTER_TEXT = 'CUSTOMISED COVER LETTER — leads with platform-reliability impact.';

/** A fake material-generation Bedrock dispatching on the prompt's role marker. */
function createMaterialBedrock(): ((prompt: string) => Promise<string>) & { prompts: string[] } {
  const prompts: string[] = [];
  const fn = (async (prompt: string): Promise<string> => {
    prompts.push(prompt);
    if (prompt.includes('expert resume writer')) return RESUME_TEXT;
    if (prompt.includes('expert cover-letter writer')) return COVER_LETTER_TEXT;
    throw new Error('Unrecognised material prompt');
  }) as ((prompt: string) => Promise<string>) & { prompts: string[] };
  fn.prompts = prompts;
  return fn;
}

/** A stored S3 object. */
interface StoredObject {
  body: string | Uint8Array | Buffer;
  contentType?: string;
}

/** A fake S3 store satisfying the MaterialStore surface. */
function createS3(): {
  putObject(
    key: string,
    body: string | Uint8Array | Buffer,
    options?: { contentType?: string },
  ): Promise<void>;
  store: Map<string, StoredObject>;
} {
  const store = new Map<string, StoredObject>();
  return {
    store,
    async putObject(key, body, options) {
      store.set(key, { body, contentType: options?.contentType });
    },
  };
}

/**
 * Build the material-generation hook used by the driver. It wraps the real
 * {@link createGenerateMaterials} (wired to the fake Bedrock + S3) and supplies
 * the Master's apply outputs (`resume_instructions` / `cover_letter_angle`,
 * Req 12.7) that the deterministic decision tree intentionally leaves blank —
 * the prose that a later Bedrock summary step authors. With those present, the
 * real hook exercises the customised-resume Bedrock + S3 storage path (Req 14).
 */
function buildGenerateMaterialsHook(
  materialBedrock: (prompt: string) => Promise<string>,
  s3: ReturnType<typeof createS3>,
): GenerateMaterialsHook {
  const realHook = createGenerateMaterials({ bedrock: materialBedrock, s3 });
  return (job: Job, decision: MasterDecision, user: UserConfig): Promise<Materials> => {
    const enriched: MasterDecision = {
      ...decision,
      resume_instructions: 'Emphasise platform scaling and technical leadership.',
      cover_letter_angle: 'Lead with measurable impact on platform reliability.',
    };
    return realHook(job, enriched, user);
  };
}

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

function makeUser(overrides: Partial<UserConfig> = {}): UserConfig {
  return {
    user_id: 'user-1',
    email: 'user@example.com',
    name: 'Test User',
    career_stage: 'mid_career',
    residency_status: 'citizen',
    resume_s3_key: 'resumes/user-1/base.pdf',
    profile: {
      current_role: 'Software Engineer',
      years_experience: 5,
      skills: ['TypeScript', 'AWS'],
      education: 'BSc Computer Science',
      university: 'NUS',
      target_roles: ['Senior Software Engineer'],
      target_industries: ['Technology'],
      dream_companies: [],
      priority_ranking: ['growth', 'salary', 'balance', 'brand', 'purpose', 'stability'],
    },
    non_negotiables: {
      min_salary: 7000,
      employment_type: ['full_time'],
      work_arrangement: 'any',
      custom: [],
      ep_sponsorship_required: false,
    },
    agent_weights: {
      ambition_threshold: 70,
      realism_threshold: 80,
      risk_max_acceptable: 70,
      opportunity_urgency_boost: true,
    },
    inbox_monitoring_available: true,
    onboarding_version: 1,
    updated_at: '2024-06-01T00:00:00.000Z',
    created_at: '2024-05-01T00:00:00.000Z',
    ...overrides,
  } as UserConfig;
}

function makeJob(company: string, overrides: Partial<DiscoveredJob> = {}): DiscoveredJob {
  const seed: DiscoveredJob = {
    job_id: `job-${company.replace(/\s+/g, '-').toLowerCase()}`,
    user_id: 'user-1',
    company,
    role_title: 'Senior Software Engineer',
    salary_min: 8000,
    salary_max: 12000,
    jd_text: `Build and scale the platform at ${company}.`,
    posted_at: '2024-06-01T00:00:00.000Z',
    source_url: `https://mcf.example/jobs/${company.replace(/\s+/g, '')}`,
    employer_email: 'hiring@example.com',
    employment_type: 'Full Time',
    work_arrangement: 'Hybrid',
    location: 'Singapore',
    ep_sponsorship_signal: false,
    mcf_listing_days: 3,
    scanned_at: '2024-06-02T00:00:00.000Z',
    ...overrides,
  };
  return seed;
}

/** A monotonic verdict-id generator for deterministic persistence keys. */
function makeIdGen(): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `verdict-${n}`;
  };
}

/** Find the single outcome for a company, guarding against a missing match. */
function outcomeFor(
  outcomes: readonly JobDebateOutcome[],
  company: string,
): JobDebateOutcome {
  const match = outcomes.find((o) => o.job.company === company);
  if (match === undefined) {
    throw new Error(`No outcome found for company ${company}`);
  }
  return match;
}

/* ------------------------------------------------------------------ *
 * Tests
 * ------------------------------------------------------------------ */

describe('runDebateMachine — end-to-end integration (Task 14.4)', () => {
  it('runs scan → filter → debate → route → materials, fast-tracking act_now to the top of the queue (Req 10.1, 13.1, 13.5)', async () => {
    const { db, store } = createInMemoryDb();
    const agentBedrock = createAgentBedrock();
    const exa = createExa();
    const materialBedrock = createMaterialBedrock();
    const s3 = createS3();
    const user = makeUser();

    // Two jobs that survive the Pre_Filter and one that is discarded (salary
    // below the user's floor) — so the scan mixes survivors and discards.
    const fastTrackJob = makeJob(FAST_TRACK_COMPANY);
    const steadyJob = makeJob(STEADY_COMPANY);
    const riskyJob = makeJob(RISKY_COMPANY);
    const discardedJob = makeJob('LowBall Pte Ltd', {
      job_id: 'job-discarded',
      salary_max: 4000, // below min_salary 7000 → discarded by Pre_Filter
    });
    const jobs: DiscoveredJob[] = [fastTrackJob, steadyJob, riskyJob, discardedJob];

    const result = await runDebateMachine(user, {
      bedrock: agentBedrock,
      exa,
      generateMaterials: buildGenerateMaterialsHook(materialBedrock, s3),
      scan: async () => jobs,
      verdictPersistence: {
        db,
        generateVerdictId: makeIdGen(),
        now: () => new Date('2024-06-02T12:00:00.000Z'),
      },
      agentOptions: { sleep: async () => {} },
    });

    // --- Scan + Pre_Filter: four scanned, three survivors, not all-filtered ---
    expect(result.scanned).toBe(4);
    expect(result.survivors).toHaveLength(3);
    expect(result.all_filtered).toBe(false);
    expect(result.relaxation_suggestion).toBeNull();
    expect(result.survivors.map((j) => j.company)).not.toContain('LowBall Pte Ltd');
    expect(result.outcomes).toHaveLength(3);

    // --- Parallel fan-out (Req 10.1): all four agents invoked for every survivor ---
    for (const company of COMPANIES) {
      const agentsForCompany = agentBedrock.calls
        .filter((c) => c.company === company)
        .map((c) => c.agent)
        .sort();
      expect(agentsForCompany).toEqual(['ambition', 'opportunity', 'realism', 'risk']);
    }
    // The discarded job never reached the debate.
    expect(agentBedrock.calls.some((c) => (c.company as string) === 'LowBall Pte Ltd')).toBe(false);
    // The Risk_Agent researched each company via Exa.
    expect(exa.queries.length).toBeGreaterThan(0);

    // --- Verdict persistence: one AgentVerdicts record per survivor ---
    expect(storedRecords(store)).toHaveLength(3);

    // --- (1) Fast-tracked apply_consensus job: materials + top of queue ---
    const fast = outcomeFor(result.outcomes, FAST_TRACK_COMPANY);
    expect(fast.decision?.decision).toBe('apply_consensus');
    expect(fast.route).toBe('generate_materials');
    expect(fast.queue_placement).toBe('top');
    expect(fast.materials).toBeDefined();
    // Materials were produced via the real generator (Req 13.1, 14).
    expect(fast.materials?.customisation_applied).toBe(true);
    expect(fast.materials?.cover_letter_text).toContain(COVER_LETTER_TEXT);
    // The customised resume was stored in S3 under the materials' key.
    expect(fast.materials?.resume_s3_key).toBeTruthy();
    expect(s3.store.has(fast.materials!.resume_s3_key)).toBe(true);
    expect(s3.store.get(fast.materials!.resume_s3_key)?.body).toBe(RESUME_TEXT);

    // --- (2) Apply-equivalent without act_now: materials, but normal placement ---
    const steady = outcomeFor(result.outcomes, STEADY_COMPANY);
    expect(steady.decision?.decision).toBe('apply_consensus');
    expect(steady.route).toBe('generate_materials');
    expect(steady.queue_placement).toBe('normal');
    expect(steady.materials).toBeDefined();

    // --- (3) Risk avoid: veto_skip → veto_log, never queued ---
    const risky = outcomeFor(result.outcomes, RISKY_COMPANY);
    expect(risky.decision?.decision).toBe('veto_skip');
    expect(risky.route).toBe('veto_log');
    expect(risky.materials).toBeUndefined();

    // --- Review queue (Req 13.5): fast-tracked first, steady below, no veto ---
    expect(result.review_queue.map((o) => o.job.company)).toEqual([
      FAST_TRACK_COMPANY,
      STEADY_COMPANY,
    ]);
    expect(result.review_queue.some((o) => o.job.company === RISKY_COMPANY)).toBe(false);
  });

  it('derives a relaxation suggestion and runs no debate when every scanned job is discarded (Req 9.5, 9.6)', async () => {
    const { db, store } = createInMemoryDb();
    const agentBedrock = createAgentBedrock();
    const exa = createExa();
    const materialBedrock = createMaterialBedrock();
    const s3 = createS3();
    const user = makeUser();

    // Every scanned job is blocked solely by the minimum-salary non-negotiable.
    const jobs: DiscoveredJob[] = [
      makeJob('Underpay A Pte Ltd', { job_id: 'job-a', salary_max: 5000 }),
      makeJob('Underpay B Pte Ltd', { job_id: 'job-b', salary_max: 5500 }),
      makeJob('Underpay C Pte Ltd', { job_id: 'job-c', salary_max: 6000 }),
    ];

    const result = await runDebateMachine(user, {
      bedrock: agentBedrock,
      exa,
      generateMaterials: buildGenerateMaterialsHook(materialBedrock, s3),
      scan: async () => jobs,
      verdictPersistence: {
        db,
        generateVerdictId: makeIdGen(),
        now: () => new Date('2024-06-02T12:00:00.000Z'),
      },
      generateSuggestionId: () => 'suggestion-1',
      now: () => new Date('2024-06-02T12:00:00.000Z'),
    });

    // All filtered → early return with a relaxation suggestion, no debate.
    expect(result.all_filtered).toBe(true);
    expect(result.survivors).toHaveLength(0);
    expect(result.outcomes).toHaveLength(0);
    expect(result.review_queue).toHaveLength(0);
    expect(result.relaxation_suggestion).not.toBeNull();
    expect(result.relaxation_suggestion?.target_non_negotiable).toBe('min_salary');
    expect(result.relaxation_suggestion?.approval_state).toBe('pending');

    // No agents were invoked and nothing was persisted — no compute spent.
    expect(agentBedrock.calls).toHaveLength(0);
    expect(materialBedrock.prompts).toHaveLength(0);
    expect(storedRecords(store)).toHaveLength(0);
  });
});
