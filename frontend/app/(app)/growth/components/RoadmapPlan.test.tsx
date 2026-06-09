// @vitest-environment jsdom

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
  it('renders timeline stages for all weeks', () => {
    const weeks = [makeWeek(1), makeWeek(2), makeWeek(3), makeWeek(4)];
    render(<RoadmapPlan weeks={weeks} />);

    const stages = screen.getAllByTestId('timeline-stage');
    expect(stages).toHaveLength(4);
  });

  it('sorts weeks in ascending order when given out-of-order input', () => {
    const weeks = [makeWeek(3), makeWeek(1), makeWeek(4), makeWeek(2)];
    render(<RoadmapPlan weeks={weeks} />);

    const stages = screen.getAllByTestId('timeline-stage');
    expect(stages[0]).toHaveAttribute('data-week', '1');
    expect(stages[1]).toHaveAttribute('data-week', '2');
    expect(stages[2]).toHaveAttribute('data-week', '3');
    expect(stages[3]).toHaveAttribute('data-week', '4');
  });

  it('shows selected week detail card', () => {
    const weeks = [makeWeek(1)];
    render(<RoadmapPlan weeks={weeks} />);

    expect(screen.getByTestId('week-card')).toHaveAttribute('data-week', '1');
  });
});
