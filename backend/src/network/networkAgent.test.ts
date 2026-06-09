/**
 * Unit tests for the Network_Agent background flow (Task 18.2, Req 20).
 *
 * Exercises the integration behaviour with injected fakes (no AWS / Exa /
 * Bedrock): the two-application trigger gating (20.1), Exa search per tier and
 * for SG events (20.2), the cap/ordering of suggestions (20.3, via the imported
 * pure logic), and the personalised outreach draft (20.4) including the
 * template fallback.
 */

import { describe, it, expect, vi } from 'vitest';
import type {
  Application,
  DynamoItem,
  NetworkSuggestionSet,
  UserConfig,
} from '@worksignal/shared';
import { DynamoDBWrapper, type DocumentClientLike } from '@worksignal/shared';
import {
  NetworkAgentImpl,
  buildTierQuery,
  buildEventQuery,
  scopeQuery,
  templateOutreachDraft,
  type RawNetworkResult,
} from './networkAgent.js';

/* ------------------------------------------------------------------ *
 * Fakes
 * ------------------------------------------------------------------ */

function makeApplication(company: string, i: number): Application {
  return {
    application_id: `a${i}`,
    user_id: 'u1',
    job_id: `j${i}`,
    verdict_id: `v${i}`,
    company,
    role_title: 'Engineer',
    customised_resume_s3_key: 'k',
    customisation_applied: true,
    cover_letter_text: 'cl',
    sent_at: '2024-01-01T00:00:00.000Z',
    recipient_email: 'hr@acme.test',
    email_thread_id: 't',
    status: 'sent',
    redirect_source_url: null,
    redirected_at: null,
    status_updated_at: '2024-01-01T00:00:00.000Z',
    classification_confidence: 0,
  };
}

const USER: UserConfig = {
  user_id: 'u1',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  career_stage: 'fresh_grad',
  residency_status: 'citizen',
  profile: {
    current_role: 'Analyst',
    years_experience: 1,
    skills: ['python'],
    education: 'BSc',
    university: 'NUS',
    target_roles: ['Engineer'],
    target_industries: ['tech'],
    dream_companies: ['Acme'],
    priority_ranking: ['salary', 'growth', 'balance', 'brand', 'purpose', 'stability'],
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
  updated_at: '2024-01-01T00:00:00.000Z',
  created_at: '2024-01-01T00:00:00.000Z',
};

/**
 * Build a DynamoDBWrapper backed by a fake client that returns the given
 * applications for the GSI query and the given user for a `get`.
 */
function fakeDb(opts: {
  applications: Application[];
  user?: UserConfig;
}): DynamoDBWrapper {
  const client: DocumentClientLike = {
    async send(command: unknown) {
      const c = command as { constructor: { name: string }; input: DynamoItem };
      const name = c.constructor.name;
      if (name === 'QueryCommand') {
        return { Items: opts.applications };
      }
      if (name === 'GetCommand') {
        return { Item: opts.user };
      }
      return {};
    },
  };
  return new DynamoDBWrapper({ client });
}

/** An Exa search fake keyed on substrings of the query. */
function fakeExa(map: Array<{ match: string; results: RawNetworkResult[] }>) {
  return vi.fn(async ({ query }: { query: string }) => {
    const hit = map.find((m) => query.includes(m.match));
    return hit ? hit.results : [];
  });
}

/* ------------------------------------------------------------------ *
 * Pure helper tests
 * ------------------------------------------------------------------ */

describe('Network_Agent query helpers', () => {
  it('scopeQuery appends Singapore exactly once', () => {
    expect(scopeQuery('acme jobs')).toBe('acme jobs Singapore');
    expect(scopeQuery('acme jobs Singapore')).toBe('acme jobs Singapore');
    expect(scopeQuery('roles in singapore')).toBe('roles in singapore');
  });

  it('buildTierQuery incorporates the university for alumni and is SG-scoped', () => {
    const q = buildTierQuery('alumni', 'Acme', 'NUS');
    expect(q).toContain('NUS');
    expect(q).toContain('Acme');
    expect(q).toContain('Singapore');
  });

  it('buildEventQuery is Singapore-scoped', () => {
    expect(buildEventQuery('Acme')).toContain('Singapore');
  });

  it('templateOutreachDraft personalises with name, company and context', () => {
    const draft = templateOutreachDraft(
      { name: 'Grace', type: 'alumni', context: 'Staff Engineer at Acme' },
      'Acme',
      { name: 'Ada Lovelace' },
    );
    expect(draft).toContain('Grace');
    expect(draft).toContain('Acme');
    expect(draft).toContain('Ada Lovelace');
    expect(draft).toContain('Staff Engineer at Acme');
  });
});

/* ------------------------------------------------------------------ *
 * Flow tests
 * ------------------------------------------------------------------ */

describe('NetworkAgentImpl.onCompanyInterest — trigger gating (Req 20.1)', () => {
  it('does not build suggestions below two applications', async () => {
    const exaSearch = fakeExa([]);
    const persistSuggestions = vi.fn(async () => {});
    const agent = new NetworkAgentImpl({
      db: fakeDb({ applications: [makeApplication('Acme', 1)], user: USER }),
      exaSearch,
      persistSuggestions,
    });

    await agent.onCompanyInterest('u1', 'Acme');

    expect(exaSearch).not.toHaveBeenCalled();
    expect(persistSuggestions).not.toHaveBeenCalled();
  });

  it('builds and persists suggestions at the two-application boundary', async () => {
    const exaSearch = fakeExa([
      {
        match: 'alumni',
        results: [{ name: 'Grace', text: 'Eng at Acme', url: 'https://x/grace' }],
      },
    ]);
    let captured: NetworkSuggestionSet | undefined;
    const persistSuggestions = vi.fn(
      async (_userId: string, set: NetworkSuggestionSet) => {
        captured = set;
      },
    );
    const agent = new NetworkAgentImpl({
      db: fakeDb({
        applications: [makeApplication('Acme', 1), makeApplication('Acme', 2)],
        user: USER,
      }),
      exaSearch,
      persistSuggestions,
    });

    await agent.onCompanyInterest('u1', 'Acme');

    expect(exaSearch).toHaveBeenCalled();
    expect(persistSuggestions).toHaveBeenCalledTimes(1);
    expect(captured?.company).toBe('Acme');
    expect(captured?.suggestions.length).toBeGreaterThan(0);
  });
});

describe('NetworkAgentImpl.buildSuggestions — Req 20.2/20.3/20.4', () => {
  it('caps at three and orders alumni → community → cold', async () => {
    const exaSearch = fakeExa([
      {
        match: 'alumni',
        results: [
          { name: 'Alum1', text: 'a1', url: 'u' },
          { name: 'Alum2', text: 'a2', url: 'u' },
        ],
      },
      { match: 'community', results: [{ name: 'Comm1', text: 'c1', url: 'u' }] },
      { match: 'recruiters', results: [{ name: 'Cold1', text: 'x1', url: 'u' }] },
      { match: 'events', results: [{ name: 'SG Meetup', date: '2024-02-01', url: 'e' }] },
    ]);
    const agent = new NetworkAgentImpl({
      db: fakeDb({ applications: [], user: USER }),
      exaSearch,
    });

    const set = await agent.buildSuggestions('u1', 'Acme');

    expect(set.suggestions).toHaveLength(3);
    expect(set.suggestions.map((s) => s.type)).toEqual([
      'alumni',
      'alumni',
      'community',
    ]);
    // Every suggestion carries a personalised outreach draft (Req 20.4).
    for (const s of set.suggestions) {
      expect(s.outreach_draft.length).toBeGreaterThan(0);
      expect(s.outreach_draft).toContain('Acme');
    }
    // Upcoming SG events surfaced (Req 20.2).
    expect(set.upcoming_events).toHaveLength(1);
    expect(set.upcoming_events[0]).toMatchObject({
      name: 'SG Meetup',
      type: 'event',
    });
  });

  it('uses the injected Bedrock client to draft outreach when available (Req 20.4)', async () => {
    const exaSearch = fakeExa([
      { match: 'alumni', results: [{ name: 'Grace', text: 'Eng', url: 'u' }] },
    ]);
    const bedrock = vi.fn(async () => 'Hi Grace, a tailored model-written note.');
    const agent = new NetworkAgentImpl({
      db: fakeDb({ applications: [], user: USER }),
      exaSearch,
      bedrock,
    });

    const set = await agent.buildSuggestions('u1', 'Acme');

    expect(bedrock).toHaveBeenCalled();
    const grace = set.suggestions.find((s) => s.name === 'Grace');
    expect(grace?.outreach_draft).toBe('Hi Grace, a tailored model-written note.');
  });

  it('falls back to the template when Bedrock drafting fails', async () => {
    const exaSearch = fakeExa([
      { match: 'alumni', results: [{ name: 'Grace', text: 'Eng', url: 'u' }] },
    ]);
    const bedrock = vi.fn(async () => {
      throw new Error('bedrock down');
    });
    const agent = new NetworkAgentImpl({
      db: fakeDb({ applications: [], user: USER }),
      exaSearch,
      bedrock,
    });

    const set = await agent.buildSuggestions('u1', 'Acme');
    const grace = set.suggestions.find((s) => s.name === 'Grace');
    expect(grace?.outreach_draft).toContain('Grace');
    expect(grace?.outreach_draft).toContain('Acme');
  });

  it('returns an empty, well-formed set when no Exa client is configured', async () => {
    const agent = new NetworkAgentImpl({
      db: fakeDb({ applications: [], user: USER }),
    });
    const set = await agent.buildSuggestions('u1', 'Acme');
    expect(set).toEqual({ company: 'Acme', suggestions: [], upcoming_events: [] });
  });
});
