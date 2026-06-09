import { describe, it, expect } from 'vitest';
import { getDecisionTier } from './getDecisionTier';

describe('getDecisionTier', () => {
  it('maps apply decisions to green', () => {
    expect(getDecisionTier('apply_consensus')).toBe('green');
    expect(getDecisionTier('apply_with_caveat')).toBe('green');
  });

  it('maps deadlock to yellow', () => {
    expect(getDecisionTier('deadlock_escalate')).toBe('yellow');
  });

  it('maps skip decisions to red', () => {
    expect(getDecisionTier('skip_consensus')).toBe('red');
    expect(getDecisionTier('veto_skip')).toBe('red');
  });
});
