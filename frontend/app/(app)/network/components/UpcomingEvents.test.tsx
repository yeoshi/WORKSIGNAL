// @vitest-environment jsdom
/**
 * Component tests for UpcomingEvents (Req 20.5).
 *
 * Verifies upcoming networking events render with names, dates, and links.
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { UpcomingEvents } from './UpcomingEvents';
import type { NetworkingOpportunity } from '@/app/types/shared';

const mockEvents: NetworkingOpportunity[] = [
    {
        name: 'Singapore Tech Meetup',
        date: '2024-03-15',
        url: 'https://example.com/meetup',
        type: 'event',
    },
    {
        name: 'NUS Alumni Networking Night',
        date: '2024-03-22',
        url: 'https://example.com/alumni-night',
        type: 'event',
    },
];

describe('UpcomingEvents', () => {
    it('renders all events', () => {
        render(<UpcomingEvents events={mockEvents} />);
        const items = screen.getAllByTestId('upcoming-event');
        expect(items).toHaveLength(2);
    });

    it('renders event names', () => {
        render(<UpcomingEvents events={mockEvents} />);
        expect(screen.getByText('Singapore Tech Meetup')).toBeInTheDocument();
        expect(screen.getByText('NUS Alumni Networking Night')).toBeInTheDocument();
    });

    it('renders event dates', () => {
        render(<UpcomingEvents events={mockEvents} />);
        expect(screen.getByText('15 Mar')).toBeInTheDocument();
        expect(screen.getByText('22 Mar')).toBeInTheDocument();
    });

    it('renders detail links with correct hrefs', () => {
        render(<UpcomingEvents events={mockEvents} />);
        const links = screen.getAllByRole('link', { name: /details/i });
        expect(links[0]).toHaveAttribute('href', 'https://example.com/meetup');
        expect(links[1]).toHaveAttribute('href', 'https://example.com/alumni-night');
    });

    it('renders nothing when events array is empty', () => {
        const { container } = render(<UpcomingEvents events={[]} />);
        expect(container).toBeEmptyDOMElement();
    });
});
