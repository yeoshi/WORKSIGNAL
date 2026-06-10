/**
 * Unit tests for the Growth_Agent background flow (task 18.1, Req 19.1-19.4).
 *
 * Exercises the integration layer that wires the pure trigger/roadmap modules
 * to persistence + Exa research, using an injected in-memory `DynamoDBWrapper`
 * and a fake Exa client so the tests never touch AWS or the network.
 */

import { describe, it, expect } from 'vitest';
import {
  DynamoDBWrapper,
  type DynamoItem,
  type SkillGapRoadmap,
} from '@worksignal/shared';
import { isWellFormedRoadmap } from './roadmap.js';
import {
  GrowthAgentImpl,
  SKILL_GAPS_TABLE,
  buildGrowthQuery,
  succinctWords,
  toRoadmapWeekInput,
  type GrowthExaResult,
  type GrowthExaSearchFn,
  type SkillGapRecord,
} from './growthAgent.js';

/* ------------------------------------------------------------------ *
 * In-memory fake DynamoDBWrapper (keyed by user_id + skill)
 * ------------------------------------------------------------------ */

class InMemoryDynamoDB extends DynamoDBWrapper {
  readonly tables = new Map<string, DynamoItem[]>();

  constructor() {
    super({ client: { send: async () => ({}) } });
  }

  private table(name: string): DynamoItem[] {
    let t = this.tables.get(name);
    if (!t) {
      t = [];
      this.tables.set(name, t);
    }
    return t;
  }

  private static matchesKey(item: DynamoItem, key: DynamoItem): boolean {
    return Object.entries(key).every(([k, v]) => item[k] === v);
  }

  override async get<T extends DynamoItem = DynamoItem>(
    tableName: string,
    key: DynamoItem,
  ): Promise<T | undefined> {
    return this.table(tableName).find((i) =>
      InMemoryDynamoDB.matchesKey(i, key),
    ) as T | undefined;
  }

  override async put<T extends DynamoItem = DynamoItem>(
    tableName: string,
    item: T,
  ): Promise<void> {
    const t = this.table(tableName);
    const idx = t.findIndex(
      (i) => i.user_id === item.user_id && i.skill === item.skill,
    );
    const stored = { ...item };
    if (idx >= 0) t[idx] = stored;
    else t.push(stored);
  }
}

/* ------------------------------------------------------------------ *
 * Fakes / helpers
 * ------------------------------------------------------------------ */

/** A fake Exa client returning one result per category-keyed query. */
function fakeExa(): { fn: GrowthExaSearchFn; queries: string[] } {
  const queries: string[] = [];
  const fn: GrowthExaSearchFn = async ({ query }) => {
    queries.push(query);
    const result: GrowthExaResult = {
      title: `Result for ${query}`,
      url: `https://example.com/${encodeURIComponent(query)}`,
      text: 'relevant content',
      publishedDate: '2024-06-01',
    };
    return [result];
  };
  return { fn, queries };
}

const FIXED_NOW = new Date('2024-06-15T00:00:00.000Z');

function buildAgent(exa?: GrowthExaSearchFn) {
  const db = new InMemoryDynamoDB();
  const agent = new GrowthAgentImpl({
    db,
    exaSearch: exa ?? fakeExa().fn,
    now: () => FIXED_NOW,
  });
  return { db, agent };
}

async function readGap(
  db: InMemoryDynamoDB,
  userId: string,
  skill: string,
): Promise<SkillGapRecord | undefined> {
  return db.get<SkillGapRecord>(SKILL_GAPS_TABLE, { user_id: userId, skill });
}

/* ------------------------------------------------------------------ *
 * onSkillGapFlagged — distinct-job trigger (Req 19.1)
 * ------------------------------------------------------------------ */

describe('GrowthAgentImpl.onSkillGapFlagged', () => {
  it('records the flagging job id without triggering below 3 distinct jobs', async () => {
    const { db, agent } = buildAgent();

    await agent.onSkillGapFlagged('u1', 'Kubernetes', 'job-1');
    await agent.onSkillGapFlagged('u1', 'Kubernetes', 'job-2');

    const gap = await readGap(db, 'u1', 'Kubernetes');
    expect(gap?.flagged_job_ids.sort()).toEqual(['job-1', 'job-2']);
    expect(gap?.times_flagged).toBe(2);
    expect(gap?.status).toBe('identified');
    expect(gap?.roadmap).toBeUndefined();
  });

  it('counts repeated flags of the same job once (Req 19.1)', async () => {
    const { db, agent } = buildAgent();

    await agent.onSkillGapFlagged('u1', 'Kubernetes', 'job-1');
    await agent.onSkillGapFlagged('u1', 'Kubernetes', 'job-1');
    await agent.onSkillGapFlagged('u1', 'Kubernetes', 'job-1');

    const gap = await readGap(db, 'u1', 'Kubernetes');
    expect(gap?.flagged_job_ids).toEqual(['job-1']);
    expect(gap?.times_flagged).toBe(1);
    expect(gap?.roadmap).toBeUndefined();
  });

  it('triggers and stores a roadmap at exactly 3 distinct jobs', async () => {
    const { db, agent } = buildAgent();

    await agent.onSkillGapFlagged('u1', 'Kubernetes', 'job-1');
    await agent.onSkillGapFlagged('u1', 'Kubernetes', 'job-2');
    await agent.onSkillGapFlagged('u1', 'Kubernetes', 'job-3');

    const gap = await readGap(db, 'u1', 'Kubernetes');
    expect(gap?.times_flagged).toBe(3);
    expect(gap?.status).toBe('roadmap_created');
    expect(gap?.roadmap).toBeDefined();
    expect(isWellFormedRoadmap(gap?.roadmap)).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * buildRoadmap — Exa research + roadmap storage (Req 19.2-19.4)
 * ------------------------------------------------------------------ */

describe('succinctWords and toRoadmapWeekInput', () => {
  it('limits roadmap titles to five words', () => {
    expect(
      succinctWords('Job Description Basics | Human Resources | Online Course', 5),
    ).toBe('Job Description Basics');
    const week = toRoadmapWeekInput('Kubernetes', 'course', {
      title: 'Complete Kubernetes Fundamentals for Platform Engineers Online Course',
      url: 'https://example.com/course',
    });
    expect(week.action.split(/\s+/).length).toBeLessThanOrEqual(5);
  });

  it('shortens verbose skill labels when building roadmaps', () => {
    expect(
      succinctWords('Healthcare domain experience not evidence in profile etc', 5),
    ).toBe('Healthcare domain experience not evidence…');
  });
});

describe('GrowthAgentImpl.buildRoadmap', () => {
  it('searches Exa per category including a Singapore-scoped event query (Req 19.2)', async () => {
    const exa = fakeExa();
    const db = new InMemoryDynamoDB();
    const agent = new GrowthAgentImpl({
      db,
      exaSearch: exa.fn,
      now: () => FIXED_NOW,
    });

    await agent.buildRoadmap('u1', 'GraphQL');

    expect(exa.queries).toContain(buildGrowthQuery('GraphQL', 'course'));
    expect(exa.queries).toContain(buildGrowthQuery('GraphQL', 'project'));
    expect(exa.queries).toContain(buildGrowthQuery('GraphQL', 'certification'));
    expect(exa.queries).toContain(buildGrowthQuery('GraphQL', 'event'));
    // The event query is Singapore-scoped.
    expect(buildGrowthQuery('GraphQL', 'event')).toContain('Singapore');
  });

  it('produces a well-formed four-week roadmap with projected improvement (Req 19.3, 19.4)', async () => {
    const { agent } = buildAgent();

    const roadmap: SkillGapRoadmap = await agent.buildRoadmap('u1', 'GraphQL');

    expect(isWellFormedRoadmap(roadmap)).toBe(true);
    expect(roadmap.weeks).toHaveLength(4);
    expect(roadmap.weeks.map((w) => w.type)).toEqual([
      'course',
      'project',
      'certification',
      'event',
    ]);
    expect(roadmap.projected_match_improvement).toMatch(/%/);
    expect(roadmap.networking_opportunities.length).toBeGreaterThan(0);
  });

  it('stores the roadmap keyed (user_id, skill) with skill + times flagged (Req 19.4)', async () => {
    const { db, agent } = buildAgent();

    // Seed a prior flag count so times_flagged is preserved on the roadmap.
    await agent.onSkillGapFlagged('u1', 'GraphQL', 'job-1');
    await agent.onSkillGapFlagged('u1', 'GraphQL', 'job-2');

    await agent.buildRoadmap('u1', 'GraphQL');

    const gap = await readGap(db, 'u1', 'GraphQL');
    expect(gap?.user_id).toBe('u1');
    expect(gap?.skill).toBe('GraphQL');
    expect(gap?.times_flagged).toBe(2);
    expect(gap?.status).toBe('roadmap_created');
    expect(isWellFormedRoadmap(gap?.roadmap)).toBe(true);
  });

  it('still builds a well-formed roadmap when an Exa query fails or returns nothing', async () => {
    const failingExa: GrowthExaSearchFn = async ({ query }) => {
      if (query.includes('certification')) {
        throw new Error('exa down');
      }
      return [];
    };
    const { agent } = buildAgent(failingExa);

    const roadmap = await agent.buildRoadmap('u1', 'Rust');

    expect(isWellFormedRoadmap(roadmap)).toBe(true);
    expect(roadmap.weeks).toHaveLength(4);
  });
});
