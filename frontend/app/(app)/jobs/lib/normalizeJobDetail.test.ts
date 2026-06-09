import { describe, it, expect } from 'vitest';
import { normalizeJobDetail } from './normalizeJobDetail';

describe('normalizeJobDetail', () => {
  it('maps legacy debate/masterDecision fields', () => {
    const result = normalizeJobDetail({
      job: { job_id: 'j1', company: 'Acme' },
      debate: { ambition: { verdict: 'apply', ambition_score: 80, reasoning: 'x', key_argument: 'y' } },
      masterDecision: {
        decision: 'apply_consensus',
        summary: 'Apply',
        agents_for: ['ambition'],
        agents_against: [],
        user_action_required: false,
      },
      coverLetterText: 'Hello',
    });

    expect(result?.verdicts.ambition?.verdict).toBe('apply');
    expect(result?.decision.summary).toBe('Apply');
    expect(result?.coverLetter).toBe('Hello');
  });

  it('returns null for invalid payloads', () => {
    expect(normalizeJobDetail(null)).toBeNull();
    expect(normalizeJobDetail({ job: {} })).toBeNull();
  });
});
