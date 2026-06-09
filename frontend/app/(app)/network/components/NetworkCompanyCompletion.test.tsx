// @vitest-environment jsdom

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NetworkCompanyCompletion } from './NetworkCompanyCompletion';

describe('NetworkCompanyCompletion', () => {
  it('renders completion copy and pipeline action', () => {
    const onViewPipeline = vi.fn();
    render(
      <NetworkCompanyCompletion
        company="Grab"
        suggestions={[
          { name: 'Li Wei', type: 'alumni', context: 'PM', outreach_draft: '' },
          { name: 'Sarah Koh', type: 'community', context: 'PM', outreach_draft: '' },
        ]}
        reachedOutDates={{
          'Grab::Li Wei': '2026-06-08T00:00:00.000Z',
          'Grab::Sarah Koh': '2026-06-09T00:00:00.000Z',
        }}
        onViewPipeline={onViewPipeline}
      />,
    );

    expect(screen.getByTestId('network-completion-title')).toHaveTextContent(
      "You've reached out to all 2 Grab connections",
    );
    fireEvent.click(screen.getByTestId('network-view-pipeline'));
    expect(onViewPipeline).toHaveBeenCalledTimes(1);
  });
});
