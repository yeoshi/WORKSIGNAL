// @vitest-environment jsdom

import { useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GrowthView } from './GrowthView';
import type { GrowthRoadmap } from '../lib/fetchGrowth';
import { loadArchivedSkills } from '../lib/growthStorage';

vi.mock('../lib/fetchGrowth', () => ({
  fetchGrowthAll: vi.fn(),
}));

vi.mock('../../../lib/confetti', () => ({
  fireCelebrationConfetti: vi.fn(),
}));

import { fetchGrowthAll } from '../lib/fetchGrowth';

const mockRoadmap: GrowthRoadmap = {
  skill: 'SQL & Data Analysis',
  times_flagged: 3,
  roadmap: {
    projected_match_improvement: '61% -> 79%',
    networking_opportunities: [],
    weeks: [
      {
        week: 1,
        action: 'Complete SQL basics',
        resource_url: 'https://example.com/1',
        cost: 'Free',
        time_hours: 4,
        type: 'course',
      },
      {
        week: 2,
        action: 'Practice joins',
        resource_url: 'https://example.com/2',
        cost: 'Free',
        time_hours: 4,
        type: 'course',
      },
    ],
  },
};

const secondRoadmap: GrowthRoadmap = {
  skill: 'A/B Testing',
  times_flagged: 2,
  roadmap: {
    projected_match_improvement: '55% -> 71%',
    networking_opportunities: [],
    weeks: [
      {
        week: 1,
        action: 'Udacity AB Testing',
        resource_url: 'https://example.com/ab',
        cost: 'Free',
        time_hours: 4,
        type: 'course',
      },
      {
        week: 2,
        action: 'Implement simulated AB',
        resource_url: 'https://example.com/ab2',
        cost: 'Free',
        time_hours: 4,
        type: 'project',
      },
    ],
  },
};

function TitleActionHost() {
  const [action, setAction] = useState<React.ReactNode>(null);
  return (
    <>
      <div data-testid="title-action-slot">{action}</div>
      <GrowthView onTitleActionChange={setAction} />
    </>
  );
}

async function resolveRoadmap() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function skipAllWeeks() {
  fireEvent.click(screen.getByTestId('week-skip-button'));
  await act(async () => {});

  fireEvent.click(screen.getAllByTestId('timeline-stage')[1]!);
  await act(async () => {});

  fireEvent.click(screen.getByTestId('week-skip-button'));
  await act(async () => {});
}

describe('GrowthView celebration', () => {
  beforeEach(() => {
    vi.mocked(fetchGrowthAll).mockResolvedValue([mockRoadmap]);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('shows confetti and celebration when all weeks are resolved', async () => {
    render(<GrowthView />);
    await resolveRoadmap();
    await skipAllWeeks();

    expect(screen.getByTestId('roadmap-celebration')).toBeInTheDocument();
    expect(screen.getByText("Nice job! Let's get you more callbacks!")).toBeInTheDocument();
  });

  it('shows all-complete only when every roadmap is archived', async () => {
    render(<GrowthView />);
    await resolveRoadmap();
    await skipAllWeeks();

    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(screen.getByTestId('growth-all-complete')).toBeInTheDocument();
    expect(loadArchivedSkills()).toEqual(new Set(['SQL & Data Analysis']));
  });

  it('switches to the next active roadmap after archiving one of many', async () => {
    vi.mocked(fetchGrowthAll).mockResolvedValue([mockRoadmap, secondRoadmap]);

    render(<GrowthView />);
    await resolveRoadmap();
    await skipAllWeeks();

    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(screen.queryByTestId('growth-all-complete')).not.toBeInTheDocument();
    expect(screen.getByTestId('growth-skill-tabs')).toBeInTheDocument();
    expect(screen.getByTestId('skill-gap-header')).toBeInTheDocument();
    expect(screen.getByTestId('roadmap-timeline')).toBeInTheDocument();
    expect(loadArchivedSkills()).toEqual(new Set(['SQL & Data Analysis']));
  });

  it('persists archived skills across remounts', async () => {
    const { unmount } = render(<GrowthView />);
    await resolveRoadmap();
    await skipAllWeeks();

    act(() => {
      vi.advanceTimersByTime(2500);
    });

    unmount();

    render(<GrowthView />);
    await resolveRoadmap();

    expect(loadArchivedSkills()).toEqual(new Set(['SQL & Data Analysis']));
    expect(screen.getByTestId('growth-all-complete')).toBeInTheDocument();
  });
});

describe('GrowthView archive tab', () => {
  beforeEach(() => {
    vi.mocked(fetchGrowthAll).mockResolvedValue([mockRoadmap, secondRoadmap]);
  });

  it('always renders the archive tab with a count when items exist', async () => {
    window.localStorage.setItem(
      'worksignal:growth-archived-skills',
      JSON.stringify(['SQL & Data Analysis']),
    );

    render(<TitleActionHost />);
    await resolveRoadmap();

    expect(screen.getByTestId('growth-archive-tab')).toBeInTheDocument();
    expect(screen.getByTestId('growth-archive-count')).toHaveTextContent('1');
    expect(screen.getByTestId('skill-gap-header')).toBeInTheDocument();
  });

  it('shows empty archive panel when archive tab is opened with no items', async () => {
    render(<TitleActionHost />);
    await resolveRoadmap();

    fireEvent.click(screen.getByTestId('growth-archive-tab'));
    await act(async () => {});

    expect(screen.getByTestId('growth-archive-empty')).toBeInTheDocument();
  });

  it('lists archived roadmaps in archive view', async () => {
    window.localStorage.setItem(
      'worksignal:growth-archived-skills',
      JSON.stringify(['SQL & Data Analysis']),
    );

    render(<TitleActionHost />);
    await resolveRoadmap();

    fireEvent.click(screen.getByTestId('growth-archive-tab'));
    await act(async () => {});

    expect(screen.getByTestId('growth-archive-panel')).toBeInTheDocument();
    expect(screen.getByText('SQL & Data Analysis')).toBeInTheDocument();
  });
});
