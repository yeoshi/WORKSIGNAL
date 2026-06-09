/**
 * Integration tests for parallel fan-out and AgentVerdicts persistence
 * (Task 13.3, Requirements 10.1, 10.6).
 *
 * These exercise {@link runAndPersistAgentVerdicts} end-to-end against:
 *   - an in-memory fake DynamoDBWrapper (a real {@link DynamoDBWrapper} backed
 *     by an in-memory document client supporting put/get), so the persisted
 *     record shape is asserted without any real AWS calls;
 *   - an injected fake Bedrock invocation that returns valid per-agent JSON,
 *     dispatched by the agent's fixed system prompt; and
 *   - an injected fake Exa client used by the Risk_Agent.
 *
 * Coverage:
 *   1. all four agents are invoked (the Bedrock fake is called for each, and
 *      the Exa fake for the Risk_Agent) and a single AgentVerdicts record is
 *      persisted, keyed by (job_id, user_id), with the four sub-objects in the
 *      design's persisted shape — score field renamed, Realism gaps/wlb_flags
 *      (Req 10.1, 10.6);
 *   2. parallel fan-out — the four agents run concurrently (asserted via a
 *      concurrency counter showing all four Bedrock calls are in-flight at once)
 *      (Req 10.1);
 *   3. an invalid agent output is recorded in agent_failures and its sub-object
 *      stored as null while the surviving verdicts persist (Req 10.6, 11.3).
 */

import { describe, it, expect } from 'vitest';
import {
  DynamoDBWrapper,
  type DocumentClientLike,
  type DynamoItem,
  type Job,
  type UserConfig,
} from '@worksignal/shared';
import type {
  BedrockInvoke,
  BedrockRequest,
  ExaClient,
  ExaResult,
} from './agents/index.js';
import {
  runAndPersistAgentVerdicts,
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
 * (the two operations this module uses). `get` matches an item where every key
 * attribute equals the stored value; `put` appends a deep copy.
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
      const table = store.tables[tableName];

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

/* ------------------------------------------------------------------ *
 * Fake Bedrock + Exa
 * ------------------------------------------------------------------ */

type AgentKind = 'ambition' | 'realism' | 'risk' | 'opportunity';

/** Identify which agent a request belongs to from its fixed system prompt. */
function agentOf(request: BedrockRequest): AgentKind {
  const s = request.system;
  if (s.includes('Ambition Agent')) return 'ambition';
  if (s.includes('Realism Agent')) return 'realism';
  if (s.includes('Risk Agent')) return 'risk';
  if (s.includes('Opportunity Agent')) return 'opportunity';
  throw new Error('Unrecognised agent system prompt');
}

/** Valid per-agent JSON completions (one per agent, schema-conformant). */
const VALID_OUTPUTS: Record<AgentKind, string> = {
  ambition: JSON.stringify({
    verdict: 'apply',
    ambition_score: 82,
    reasoning: 'Clear seniority step-up and salary improvement.',
    key_argument: 'Raises the career ceiling.',
  }),
  realism: JSON.stringify({
    verdict: 'apply',
    match_score: 76,
    key_gaps: ['Kubernetes', 'Team leadership'],
    work_life_flags: ['fast-paced'],
    reasoning: 'Most hard requirements met; two addressable gaps.',
    key_argument: 'Strong, realistic match.',
  }),
  risk: JSON.stringify({
    verdict: 'safe',
    risk_score: 22,
    red_flags: [
      { flag: 'Minor recent reorg', source: 'https://exa.example/news', severity: 'low' },
    ],
    glassdoor_score: 4,
    reasoning: 'Financially stable; no significant red flags.',
    key_argument: 'Low-risk employer.',
  }),
  opportunity: JSON.stringify({
    verdict: 'act_now',
    urgency_score: 88,
    timing_factors: ['Posted 2 hours ago', 'Active hiring push'],
    reasoning: 'Fresh posting with first-mover advantage.',
    key_argument: 'Move fast.',
  }),
};

/** A Bedrock fake that records per-agent calls and returns valid JSON. */
function createValidBedrock(): BedrockInvoke & { calls: AgentKind[] } {
  const calls: AgentKind[] = [];
  const fn = (async (request: BedrockRequest) => {
    const kind = agentOf(request);
    calls.push(kind);
    return VALID_OUTPUTS[kind];
  }) as BedrockInvoke & { calls: AgentKind[] };
  fn.calls = calls;
  return fn;
}

/** An Exa fake that records every query and returns one non-empty result. */
function createExa(): ExaClient & { queries: string[] } {
  const queries: string[] = [];
  const fn = (async (query: string): Promise<ExaResult[]> => {
    queries.push(query);
    return [{ title: 'Company news', url: 'https://exa.example/news', text: 'Stable.' }];
  }) as ExaClient & { queries: string[] };
  fn.queries = queries;
  return fn;
}

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    job_id: 'job-1',
    user_id: 'user-1',
    company: 'Acme Pte Ltd',
    role_title: 'Senior Software Engineer',
    salary_min: 8000,
    salary_max: 11000,
    jd_text: 'Build and scale our platform.',
    posted_at: '2024-06-01T00:00:00.000Z',
    source_url: 'https://mcf.example/jobs/1',
    employer_email: 'hiring@acme.example',
    employment_type: 'Full Time',
    work_arrangement: 'Hybrid',
    location: 'Singapore',
    ep_sponsorship_signal: false,
    mcf_listing_days: 7,
    scanned_at: '2024-06-02T00:00:00.000Z',
    ...overrides,
  };
}

function makeUser(overrides: Partial<UserConfig> = {}): UserConfig {
  return {
    user_id: 'user-1',
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
  };
}

/** Read the single persisted AgentVerdicts record from the store. */
function storedRecords(store: InMemoryStore): AgentVerdictsRecord[] {
  return (store.tables[DEFAULT_AGENT_VERDICTS_TABLE] ?? []) as unknown as AgentVerdictsRecord[];
}

/* ------------------------------------------------------------------ *
 * Tests
 * ------------------------------------------------------------------ */

describe('runAndPersistAgentVerdicts — fan-out and persistence (Task 13.3)', () => {
  it('invokes all four agents and persists one record keyed by (job_id,user_id) in the persisted shape (Req 10.1, 10.6)', async () => {
    const { db, store } = createInMemoryDb();
    const bedrock = createValidBedrock();
    const exa = createExa();
    const job = makeJob();
    const user = makeUser();

    const result = await runAndPersistAgentVerdicts(
      { job, user, bedrock, exa },
      { db, generateVerdictId: () => 'verdict-1', now: () => new Date('2024-06-02T12:00:00.000Z') },
    );

    // (a) Each of the four agents was invoked via the Bedrock fake.
    expect([...bedrock.calls].sort()).toEqual(['ambition', 'opportunity', 'realism', 'risk']);
    // The Risk_Agent researched the company via the Exa fake.
    expect(exa.queries.length).toBeGreaterThan(0);
    expect(exa.queries.every((q) => q.includes('Acme Pte Ltd'))).toBe(true);

    // (b) Exactly one AgentVerdicts record persisted, keyed by (job_id,user_id).
    const records = storedRecords(store);
    expect(records).toHaveLength(1);
    const record = records[0]!;
    expect(record.verdict_id).toBe('verdict-1');
    expect(record.job_id).toBe('job-1');
    expect(record.user_id).toBe('user-1');
    expect(record.agent_failures).toEqual([]);
    expect(record.created_at).toBe('2024-06-02T12:00:00.000Z');

    // The record is retrievable by its primary key via the wrapper's get.
    const fetched = await db.get<AgentVerdictsRecord & DynamoItem>(DEFAULT_AGENT_VERDICTS_TABLE, {
      verdict_id: 'verdict-1',
    });
    expect(fetched).toEqual(record);

    // (c) Four sub-objects present in the design's persisted shape.
    expect(record.ambition).toEqual({
      verdict: 'apply',
      score: 82,
      reasoning: 'Clear seniority step-up and salary improvement.',
      key_argument: 'Raises the career ceiling.',
    });
    // Realism: match_score -> score, key_gaps -> gaps, work_life_flags -> wlb_flags.
    expect(record.realism).toEqual({
      verdict: 'apply',
      score: 76,
      reasoning: 'Most hard requirements met; two addressable gaps.',
      key_argument: 'Strong, realistic match.',
      gaps: ['Kubernetes', 'Team leadership'],
      wlb_flags: ['fast-paced'],
    });
    expect(record.risk).toEqual({
      verdict: 'safe',
      score: 22,
      reasoning: 'Financially stable; no significant red flags.',
      key_argument: 'Low-risk employer.',
      red_flags: [
        { flag: 'Minor recent reorg', source: 'https://exa.example/news', severity: 'low' },
      ],
      glassdoor_score: 4,
    });
    expect(record.opportunity).toEqual({
      verdict: 'act_now',
      score: 88,
      reasoning: 'Fresh posting with first-mover advantage.',
      key_argument: 'Move fast.',
      timing_factors: ['Posted 2 hours ago', 'Active hiring push'],
    });

    // The returned result mirrors the persisted record.
    expect(result.record).toEqual(record);
    expect(result.agent_failures).toEqual([]);
  });

  it('fans the four agents out concurrently — all four Bedrock calls are in-flight at once (Req 10.1)', async () => {
    const { db } = createInMemoryDb();
    const exa = createExa();
    const job = makeJob();
    const user = makeUser();

    const EXPECTED = 4;
    let active = 0;
    let maxConcurrent = 0;
    let releaseGate: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });

    // Each Bedrock call announces it is in-flight, then waits on a shared gate
    // that opens only once all four agents have entered concurrently. A timeout
    // backstop prevents a hang if fewer than four ever arrive (the assertion on
    // maxConcurrent would then fail rather than deadlock).
    const bedrock: BedrockInvoke = async (request) => {
      const kind = agentOf(request);
      active += 1;
      maxConcurrent = Math.max(maxConcurrent, active);
      if (active >= EXPECTED) {
        releaseGate();
      }
      await Promise.race([
        gate,
        new Promise<void>((resolve) => setTimeout(resolve, 1000)),
      ]);
      active -= 1;
      return VALID_OUTPUTS[kind];
    };

    const result = await runAndPersistAgentVerdicts(
      { job, user, bedrock, exa },
      { db, generateVerdictId: () => 'verdict-2', now: () => new Date('2024-06-02T12:00:00.000Z') },
    );

    expect(maxConcurrent).toBe(EXPECTED);
    expect(result.agent_failures).toEqual([]);
    expect(result.record.ambition).not.toBeNull();
    expect(result.record.realism).not.toBeNull();
    expect(result.record.risk).not.toBeNull();
    expect(result.record.opportunity).not.toBeNull();
  });

  it('records an invalid agent output in agent_failures and stores its sub-object as null while the others persist (Req 10.6, 11.3)', async () => {
    const { db, store } = createInMemoryDb();
    const exa = createExa();
    const job = makeJob();
    const user = makeUser();

    // Realism returns a malformed output (match_score out of range); every other
    // agent returns valid JSON.
    const bedrock: BedrockInvoke = async (request) => {
      const kind = agentOf(request);
      if (kind === 'realism') {
        return JSON.stringify({
          verdict: 'apply',
          match_score: 150, // out of 0-100 range -> invalid
          key_gaps: [],
          work_life_flags: [],
          reasoning: 'bad',
          key_argument: 'bad',
        });
      }
      return VALID_OUTPUTS[kind];
    };

    const result = await runAndPersistAgentVerdicts(
      { job, user, bedrock, exa },
      { db, generateVerdictId: () => 'verdict-3', now: () => new Date('2024-06-02T12:00:00.000Z') },
    );

    const records = storedRecords(store);
    expect(records).toHaveLength(1);
    const record = records[0]!;

    // The failing agent is recorded and its sub-object stored as null.
    expect(record.agent_failures).toEqual(['realism']);
    expect(record.realism).toBeNull();

    // The surviving three verdicts still persist.
    expect(record.ambition).not.toBeNull();
    expect(record.risk).not.toBeNull();
    expect(record.opportunity).not.toBeNull();
    expect(record.ambition?.score).toBe(82);
    expect(record.opportunity?.score).toBe(88);

    // The result surfaces the same failure set and the valid verdicts only.
    expect(result.agent_failures).toEqual(['realism']);
    expect(result.verdicts.realism).toBeUndefined();
    expect(result.verdicts.ambition).toBeDefined();
  });
});
