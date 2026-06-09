// @vitest-environment jsdom
/**
 * Component tests for RoadmapPlan (Req 19.5).
 *
 * Verifies the four-week plan:
 * - Renders all weeks
 * - Sorts weeks in ascending order regardless of input order
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { RoadmapPlan } from './RoadmapPlan';
import type { RoadmapWeek } from '@worksignal/shared';

function makeWeek(week: number): RoadmapWeek {
    return {
        week,
        action: `Action for week ${week}`,
        resource_url: `https://example.com/week-${week}`,
        cost: 'Free',
        time_hours: week + 2,
        type: 'course',
    };
}

describe('RoadmapPlan', () => {
    it('renders all four weeks', () => {
        const weeks = [makeWeek(1), makeWeek(2), makeWeek(3), makeWeek(4)];
        render(<RoadmapPlan weeks={weeks} />);

        const cards = screen.getAllByTestId('week-card');
        expect(cards).toHaveLength(4);
    });

    it('sorts weeks in ascending order when given out-of-order input', () => {
        const weeks = [makeWeek(3), makeWeek(1), makeWeek(4), makeWeek(2)];
        render(<RoadmapPlan weeks={weeks} />);

        const cards = screen.getAllByTestId('week-card');
        expect(cards[0]).toHaveAttribute('data-week', '1');
        expect(cards[1]).toHaveAttribute('data-week', '2');
        expect(cards[2]).toHaveAttribute('data-week', '3');
        expect(cards[3]).toHaveAttribute('data-week', '4');
    });

    it('renders the section heading', () => {
        const weeks = [makeWeek(1), makeWeek(2)];
        render(<RoadmapPlan weeks={weeks} />);

        expect(screen.getByText('Four-week plan')).toBeInTheDocument();
    });

    it('renders with a single week', () => {
        const weeks = [makeWeek(1)];
        render(<RoadmapPlan weeks={weeks} />);

        const cards = screen.getAllByTestId('week-card');
        expect(cards).toHaveLength(1);
    });
});
