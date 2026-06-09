// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SkillGapHeader } from './SkillGapHeader';

describe('SkillGapHeader', () => {
  it('renders the projected match-score improvement pill', () => {
    render(
      <SkillGapHeader
        projectedMatchImprovement="60% -> 82%"
        timesFlagged={3}
      />,
    );

    expect(screen.getByTestId('projected-improvement-value')).toHaveTextContent(
      '60% → 82% match',
    );
  });

  it('renders times flagged when provided', () => {
    render(
      <SkillGapHeader
        projectedMatchImprovement="50% -> 75%"
        timesFlagged={5}
      />,
    );

    expect(screen.getByTestId('times-flagged')).toHaveTextContent('Flagged across 5 jobs');
  });

  it('does not render times flagged when not provided', () => {
    render(<SkillGapHeader projectedMatchImprovement="40% -> 65%" />);

    expect(screen.queryByTestId('times-flagged')).not.toBeInTheDocument();
  });

  it('renders singular "job" for timesFlagged = 1', () => {
    render(
      <SkillGapHeader
        projectedMatchImprovement="55% -> 70%"
        timesFlagged={1}
      />,
    );

    expect(screen.getByTestId('times-flagged')).toHaveTextContent('Flagged across 1 job');
  });
});
