// @vitest-environment jsdom
/**
 * Component tests for WeekCard (Req 19.5).
 *
 * Verifies each week card renders all fields:
 * - Week number label
 * - Action text
 * - Resource link (href)
 * - Cost display
 * - Time estimate display
 * - Resource type badge
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { WeekCard } from './WeekCard';
import type { RoadmapWeek } from '@worksignal/shared';

const mockWeek: RoadmapWeek = {
    week: 2,
    action: 'Complete advanced TypeScript patterns course',
    resource_url: 'https://example.com/ts-course',
    cost: 'S$49',
    time_hours: 6,
    type: 'course',
};

describe('WeekCard', () => {
    it('renders the week label', () => {
        render(<WeekCard week={mockWeek} />);
        expect(screen.getByTestId('week-label')).toHaveTextContent('Week 2');
    });

    it('renders the action text', () => {
        render(<WeekCard week={mockWeek} />);
        expect(screen.getByTestId('week-action')).toHaveTextContent(
            'Complete advanced TypeScript patterns course'
        );
    });

    it('renders the resource link with correct href', () => {
        render(<WeekCard week={mockWeek} />);
        const link = screen.getByTestId('week-resource-link');
        expect(link).toHaveAttribute('href', 'https://example.com/ts-course');
        expect(link).toHaveAttribute('target', '_blank');
    });

    it('renders the formatted cost', () => {
        render(<WeekCard week={mockWeek} />);
        expect(screen.getByTestId('week-cost')).toHaveTextContent('S$49');
    });

    it('renders the time estimate', () => {
        render(<WeekCard week={mockWeek} />);
        expect(screen.getByTestId('week-time')).toHaveTextContent('6 hours');
    });

    it('renders the resource type badge', () => {
        render(<WeekCard week={mockWeek} />);
        const badge = screen.getByTestId('resource-type-badge');
        expect(badge).toHaveTextContent('Course');
        expect(badge).toHaveAttribute('data-resource-type', 'course');
    });

    it('renders "Free" cost correctly', () => {
        const freeWeek: RoadmapWeek = { ...mockWeek, cost: 'Free' };
        render(<WeekCard week={freeWeek} />);
        expect(screen.getByTestId('week-cost')).toHaveTextContent('Free');
    });

    it('renders 1 hour singular', () => {
        const oneHourWeek: RoadmapWeek = { ...mockWeek, time_hours: 1 };
        render(<WeekCard week={oneHourWeek} />);
        expect(screen.getByTestId('week-time')).toHaveTextContent('1 hour');
    });
});
