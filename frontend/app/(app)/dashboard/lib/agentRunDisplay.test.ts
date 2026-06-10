import { describe, expect, it } from 'vitest';
import { getDisplayDecision, toBulletPoints } from './agentRunDisplay';

describe('getDisplayDecision', () => {
  it('maps orchestrator apply to apply with caveat', () => {
    const display = getDisplayDecision('deadlock_escalate', {
      type: 'orchestrator_reasoning',
      job_id: 'j1',
      title: 'Role',
      base_decision: 'deadlock_escalate',
      scores: {},
      action: 'apply',
      confidence: 80,
      deciding_factor: 'Strong timing signal',
      holistic_summary: 'Apply now with a caveat.',
    });
    expect(display.label).toBe('Apply — with caveat');
  });

  it('falls back to consensus display when orchestrator is absent', () => {
    const display = getDisplayDecision('apply_consensus');
    expect(display.label).toBe('Apply — consensus');
  });
});

describe('toBulletPoints', () => {
  it('splits sentences into bullets', () => {
    expect(toBulletPoints('First point. Second point.')).toEqual([
      'First point.',
      'Second point.',
    ]);
  });
});
