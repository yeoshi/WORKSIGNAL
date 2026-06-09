import { describe, it, expect } from 'vitest';
import { daysSpanForReachOuts } from './networkCompletion';

describe('networkCompletion', () => {
  it('calculates day span across reach-out dates', () => {
    const span = daysSpanForReachOuts(
      'Grab',
      [{ name: 'A', type: 'alumni', context: 'x', outreach_draft: '' }],
      { 'Grab::A': '2026-06-08T00:00:00.000Z' },
    );
    expect(span).toBe(1);
  });
});
