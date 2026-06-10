// @vitest-environment jsdom

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ConnectionCard } from './ConnectionCard';
import type { NetworkSuggestion } from '@/app/types/shared';

const mockSuggestion: NetworkSuggestion = {
  name: 'Jane Doe',
  type: 'alumni',
  context: 'Senior Engineer at Google, NUS CS 2019',
  outreach_draft: 'Hi Jane, I noticed we both graduated from NUS CS...',
};

describe('ConnectionCard', () => {
  it('renders the connection name and role line', () => {
    render(<ConnectionCard suggestion={mockSuggestion} company="Grab" />);
    expect(screen.getByTestId('connection-name')).toHaveTextContent('Jane Doe');
    expect(screen.getByTestId('connection-context')).toHaveTextContent(
      'Senior Engineer at Google, NUS CS 2019',
    );
  });

  it('renders initials avatar when no image URL', () => {
    render(<ConnectionCard suggestion={mockSuggestion} company="Grab" />);
    expect(screen.getByTestId('connection-avatar')).toHaveTextContent('JD');
  });

  it('renders agent reasoning', () => {
    render(<ConnectionCard suggestion={mockSuggestion} company="Grab" />);
    expect(screen.getByTestId('connection-reasoning')).toBeInTheDocument();
  });

  it('collapses outreach draft by default', () => {
    render(<ConnectionCard suggestion={mockSuggestion} company="Grab" />);
    expect(screen.queryByTestId('outreach-draft')).not.toBeInTheDocument();
    expect(screen.getByTestId('draft-toggle')).toBeInTheDocument();
  });

  it('expands outreach draft on toggle click', () => {
    render(<ConnectionCard suggestion={mockSuggestion} company="Grab" />);
    fireEvent.click(screen.getByTestId('draft-toggle'));
    expect(screen.getByTestId('outreach-draft')).toHaveTextContent(
      'Hi Jane, I noticed we both graduated from NUS CS...',
    );
  });

  it('renders the connection type badge', () => {
    render(<ConnectionCard suggestion={mockSuggestion} company="Grab" />);
    expect(screen.getByTestId('badge-alumni')).toHaveTextContent('Alumni');
  });

  it('disables action buttons when contact info is missing', () => {
    render(<ConnectionCard suggestion={mockSuggestion} company="Grab" />);
    expect(screen.getByTestId('linkedin-action')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('email-action')).toHaveAttribute('aria-disabled', 'true');
  });

  it('enables LinkedIn action when URL is provided', () => {
    render(
      <ConnectionCard
        suggestion={{ ...mockSuggestion, linkedin_url: 'https://linkedin.com/in/jane' }}
        company="Grab"
      />,
    );
    expect(screen.getByTestId('linkedin-action')).toHaveAttribute(
      'href',
      'https://linkedin.com/in/jane',
    );
  });

  it('marks reached out via LinkedIn when LinkedIn is clicked', () => {
    const onReachOut = vi.fn();
    render(
      <ConnectionCard
        suggestion={{ ...mockSuggestion, linkedin_url: 'https://linkedin.com/in/jane' }}
        company="Grab"
        onReachOut={onReachOut}
      />,
    );

    fireEvent.click(screen.getByTestId('linkedin-action'));
    expect(onReachOut).toHaveBeenCalledWith('linkedin');
  });

  it('marks reached out via email when email is clicked', () => {
    const onReachOut = vi.fn();
    render(
      <ConnectionCard
        suggestion={{ ...mockSuggestion, email: 'jane@example.com' }}
        company="Grab"
        onReachOut={onReachOut}
      />,
    );

    fireEvent.click(screen.getByTestId('email-action'));
    expect(onReachOut).toHaveBeenCalledWith('email');
  });

  it('marks reached out when checkbox is checked without channel', () => {
    const onReachOut = vi.fn();
    render(
      <ConnectionCard suggestion={mockSuggestion} company="Grab" onReachOut={onReachOut} />,
    );

    fireEvent.click(screen.getByRole('checkbox'));
    expect(onReachOut).toHaveBeenCalledWith();
  });

  it('shows reached out styling with muted buttons and avatar badge', () => {
    render(
      <ConnectionCard
        suggestion={mockSuggestion}
        company="Grab"
        reachedOut
        reachOutChannel="linkedin"
        reachedOutDate="2026-06-09T00:00:00.000Z"
      />,
    );

    expect(screen.getByTestId('connection-reached-out')).toHaveTextContent(
      'Reached out on LinkedIn',
    );
    expect(screen.getByTestId('linkedin-action')).toBeInTheDocument();
    expect(screen.getByTestId('connection-avatar-badge')).toBeInTheDocument();
    expect(screen.getByTestId('connection-card')).toHaveAttribute('data-reached-out', 'true');
  });

  it('reverts reached out when checkbox is unchecked', () => {
    const onUndoReachOut = vi.fn();
    render(
      <ConnectionCard
        suggestion={mockSuggestion}
        company="Grab"
        reachedOut
        onUndoReachOut={onUndoReachOut}
      />,
    );

    fireEvent.click(screen.getByRole('checkbox'));
    expect(onUndoReachOut).toHaveBeenCalledTimes(1);
  });

  it('shows placeholder when outreach draft is empty', () => {
    const empty: NetworkSuggestion = { ...mockSuggestion, outreach_draft: '' };
    render(<ConnectionCard suggestion={empty} company="Grab" />);
    expect(screen.getByTestId('outreach-draft-empty')).toHaveTextContent(
      'Draft generating…',
    );
  });

  it('renders read-only archived row with LinkedIn reach-out status', () => {
    render(
      <ConnectionCard
        suggestion={mockSuggestion}
        company="Grab"
        readOnly
        reachOutChannel="linkedin"
        reachedOutDate="2026-06-09T00:00:00.000Z"
      />,
    );

    expect(screen.getByTestId('connection-card-readonly')).toBeInTheDocument();
    expect(screen.getByTestId('connection-reached-out-date')).toHaveTextContent(
      'Reached out on LinkedIn',
    );
    expect(screen.queryByTestId('linkedin-action')).not.toBeInTheDocument();
  });
});
