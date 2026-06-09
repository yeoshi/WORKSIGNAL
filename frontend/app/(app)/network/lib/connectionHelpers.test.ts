import { describe, it, expect } from 'vitest';
import {
  formatRoleLine,
  getAgentReasoning,
  getInitials,
} from './connectionHelpers';
import type { EnrichedNetworkSuggestion } from './connectionHelpers';

const base: EnrichedNetworkSuggestion = {
  name: 'Li Wei',
  type: 'alumni',
  context: 'Product Analyst, Grab · NUS Business Analytics 2023',
  outreach_draft: 'Hello',
};

describe('connectionHelpers', () => {
  it('extracts initials from a full name', () => {
    expect(getInitials('Sarah Koh')).toBe('SK');
    expect(getInitials('Marcus')).toBe('M');
  });

  it('formats role line before middle dot', () => {
    expect(formatRoleLine(base.context)).toBe('Product Analyst, Grab');
  });

  it('uses custom reasoning when provided', () => {
    expect(
      getAgentReasoning(
        { ...base, reasoning: 'Same NUS cohort — alumni convert 2× better' },
        'Grab',
      ),
    ).toBe('Same NUS cohort — alumni convert 2× better');
  });
});
