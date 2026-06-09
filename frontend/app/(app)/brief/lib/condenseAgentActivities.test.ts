import { describe, it, expect } from 'vitest';
import {
  condenseGrowthActivities,
  condenseNetworkActivities,
} from './condenseAgentActivities';
import type { BriefGrowthActivity, BriefNetworkActivity } from './briefTypes';

const mockGrowth: BriefGrowthActivity[] = [
  {
    skill: 'SQL & Data Analysis',
    times_flagged: 3,
    projected_match_improvement: '61% → 79%',
    reason: 'Single skill reason.',
    summary: 'Single skill summary.',
  },
  {
    skill: 'A/B Testing',
    times_flagged: 2,
    projected_match_improvement: '55% → 71%',
    reason: 'Second skill reason.',
    summary: 'Second skill summary.',
  },
];

const mockNetwork: BriefNetworkActivity[] = [
  {
    company: 'Grab',
    application_count: 2,
    suggestion_count: 3,
    reason: 'Grab reason.',
    summary: 'Grab summary.',
  },
  {
    company: 'GovTech',
    application_count: 2,
    suggestion_count: 2,
    reason: 'GovTech reason.',
    summary: 'GovTech summary.',
  },
];

describe('condenseGrowthActivities', () => {
  it('returns null for an empty list', () => {
    expect(condenseGrowthActivities([])).toBeNull();
  });

  it('condenses multiple skills into one summary', () => {
    const result = condenseGrowthActivities(mockGrowth);

    expect(result?.teaser).toBe('2 roadmaps built · SQL & Data Analysis, A/B Testing');
    expect(result?.reason).toContain('SQL & Data Analysis (3 jobs)');
    expect(result?.reason).toContain('A/B Testing (2 jobs)');
    expect(result?.summary).toContain('SQL & Data Analysis and A/B Testing');
    expect(result?.detail).toContain('61% → 79%');
    expect(result?.detail).toContain('55% → 71%');
  });
});

describe('condenseNetworkActivities', () => {
  it('returns null for an empty list', () => {
    expect(condenseNetworkActivities([])).toBeNull();
  });

  it('condenses multiple companies into one summary', () => {
    const result = condenseNetworkActivities(mockNetwork);

    expect(result?.teaser).toBe('5 suggestions drafted · Grab, GovTech');
    expect(result?.reason).toContain('Grab and GovTech');
    expect(result?.summary).toContain('5 personalised outreach messages');
    expect(result?.detail).toContain('Grab: 3 suggestions');
    expect(result?.detail).toContain('GovTech: 2 suggestions');
  });
});
