// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { RelatedEventsSection } from './RelatedEventsSection';
import type { NetworkingOpportunity } from '@/app/types/shared';

const mockEvents: NetworkingOpportunity[] = [
  {
    name: 'Tech in Asia Singapore 2026',
    date: '2026-06-20',
    url: 'https://www.techinasia.com/events',
    type: 'event',
    week: 2,
  },
];

describe('RelatedEventsSection', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when events array is empty', () => {
    const { container } = render(<RelatedEventsSection events={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('formats event date without raw ISO', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-09T12:00:00Z'));

    render(<RelatedEventsSection events={mockEvents} />);

    expect(screen.getByTestId('related-event-date')).toHaveTextContent('20 Jun');
    expect(screen.queryByText('2026-06-20')).not.toBeInTheDocument();
  });

  it('shows urgency when event is within 14 days', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-09T12:00:00Z'));

    render(<RelatedEventsSection events={mockEvents} />);

    expect(screen.getByTestId('related-event-urgency')).toHaveTextContent('11 days away');
  });

  it('renders Details button instead of text link', () => {
    render(<RelatedEventsSection events={mockEvents} />);

    const details = screen.getByTestId('related-event-details');
    expect(details).toHaveTextContent('Details');
    expect(details).toHaveAttribute('href', 'https://www.techinasia.com/events');
  });
});
