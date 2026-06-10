// @vitest-environment jsdom

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RoadmapTimeline, type WeekProgress } from './RoadmapTimeline';
import type { RoadmapWeek } from '@/app/types/shared';

const weeks: RoadmapWeek[] = [
  {
    week: 1,
    action: 'Solve LeetCode SQL Top 50 — focus on aggregations',
    resource_url: 'https://leetcode.com',
    cost: 'Free',
    time_hours: 5,
    type: 'project',
  },
];

const emptyProgress: WeekProgress = {
  completed: [],
  skipped: [],
  customProjects: {},
};

describe('RoadmapTimeline', () => {
  it('shows Custom Project label when week has a custom project', () => {
    render(
      <RoadmapTimeline
        weeks={weeks}
        progress={{ ...emptyProgress, customProjects: { 1: 'My app' } }}
        onProgressChange={() => {}}
      />,
    );

    expect(screen.getByText('Custom Project')).toBeInTheDocument();
    expect(screen.queryByText('LeetCode SQL Top')).not.toBeInTheDocument();
  });

  it('shows grey crossed dot when week is skipped', () => {
    render(
      <RoadmapTimeline
        weeks={weeks}
        progress={{ ...emptyProgress, skipped: [1] }}
        onProgressChange={() => {}}
      />,
    );

    const stage = screen.getByTestId('timeline-stage');
    expect(stage).toHaveAttribute('data-skipped', 'true');
    expect(stage.className).toContain('bg-gray-100');
  });

  it('marks week as skipped when Skip is clicked', () => {
    const onProgressChange = vi.fn();
    render(
      <RoadmapTimeline
        weeks={weeks}
        progress={emptyProgress}
        onProgressChange={onProgressChange}
      />,
    );

    fireEvent.click(screen.getByTestId('week-skip-button'));

    const next = onProgressChange.mock.calls[0]![0]!(emptyProgress);
    expect(next).toEqual({
      completed: [],
      skipped: [1],
      customProjects: {},
    });
  });
});
