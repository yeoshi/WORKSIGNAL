// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { BriefSummary } from './BriefSummary';

const mockBriefText = `Week of 2 Jun 2026

You sent 5 applications this week and received 1 callback.

Agent Accuracy
All four agents performed well.

Next Week
• Prep for your Grab callback.
• Message your Grab alumni contact this week.`;

describe('BriefSummary', () => {
  it('renders section headers in bold', () => {
    render(<BriefSummary briefText={mockBriefText} />);

    expect(screen.getByRole('heading', { name: 'Agent Accuracy' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Next Week' })).toBeInTheDocument();
  });

  it('renders action items for Next Week', () => {
    render(<BriefSummary briefText={mockBriefText} />);

    expect(screen.getByText('Prep for your Grab callback.')).toBeInTheDocument();
    expect(screen.getByText('Message your Grab alumni contact this week.')).toBeInTheDocument();
  });

  it('renders overview paragraph', () => {
    render(<BriefSummary briefText={mockBriefText} />);

    expect(
      screen.getByText(/You sent 5 applications this week and received 1 callback/)
    ).toBeInTheDocument();
  });
});
