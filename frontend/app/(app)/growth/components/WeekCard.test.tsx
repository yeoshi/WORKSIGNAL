// @vitest-environment jsdom

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
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
  it('renders the action text', () => {
    render(<WeekCard week={mockWeek} />);
    expect(screen.getByTestId('week-action')).toHaveTextContent(
      'Complete advanced TypeScript patterns course',
    );
  });

  it('renders the resource link with correct href', () => {
    render(<WeekCard week={mockWeek} />);
    const link = screen.getByTestId('week-resource-link');
    expect(link).toHaveAttribute('href', 'https://example.com/ts-course');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('renders compact metadata strip', () => {
    render(<WeekCard week={mockWeek} />);
    expect(screen.getByTestId('week-metadata')).toHaveTextContent(
      'S$49 · 6 hours · Course',
    );
  });

  it('renders type icon badge for course', () => {
    render(<WeekCard week={mockWeek} />);
    const badge = screen.getByTestId('week-type-badge');
    expect(badge).toHaveAttribute('data-resource-type', 'course');
  });

  it('renders "Free" cost in metadata strip', () => {
    const freeWeek: RoadmapWeek = { ...mockWeek, cost: 'Free' };
    render(<WeekCard week={freeWeek} />);
    expect(screen.getByTestId('week-metadata')).toHaveTextContent('Free');
  });

  it('renders 1 hour singular in metadata strip', () => {
    const oneHourWeek: RoadmapWeek = { ...mockWeek, time_hours: 1 };
    render(<WeekCard week={oneHourWeek} />);
    expect(screen.getByTestId('week-metadata')).toHaveTextContent('1 hour');
  });

  it('toggles completion via checkbox', () => {
    const onToggleComplete = vi.fn();
    render(<WeekCard week={mockWeek} onToggleComplete={onToggleComplete} />);

    fireEvent.click(screen.getByTestId('week-complete-checkbox'));
    expect(onToggleComplete).toHaveBeenCalledWith(2);
  });

  it('shows completion message when completed', () => {
    render(<WeekCard week={mockWeek} completed />);
    expect(screen.getByTestId('week-complete-message')).toHaveTextContent(
      'Added to your resume profile',
    );
  });

  it('shows Skip by default', () => {
    render(<WeekCard week={mockWeek} />);
    expect(screen.getByTestId('week-skip-button')).toHaveTextContent('Skip');
  });

  it('toggles skip via button', () => {
    const onToggleSkip = vi.fn();
    render(<WeekCard week={mockWeek} onToggleSkip={onToggleSkip} />);

    fireEvent.click(screen.getByTestId('week-skip-button'));
    expect(onToggleSkip).toHaveBeenCalledWith(2);
  });

  it('shows undo skip only when skipped', () => {
    render(<WeekCard week={mockWeek} skipped />);
    expect(screen.getByTestId('week-skip-button')).toHaveTextContent('Undo skip');
  });

  it('shows custom project flow for project type', () => {
    const projectWeek: RoadmapWeek = { ...mockWeek, type: 'project' };
    const onSaveCustomProject = vi.fn();

    render(
      <WeekCard week={projectWeek} onSaveCustomProject={onSaveCustomProject} />,
    );

    fireEvent.click(screen.getByTestId('week-custom-project-button'));
    fireEvent.change(screen.getByTestId('week-custom-input'), {
      target: { value: 'My analytics dashboard' },
    });
    fireEvent.click(screen.getByTestId('week-custom-save'));

    expect(onSaveCustomProject).toHaveBeenCalledWith(2, 'My analytics dashboard');
  });

  it('renders custom project title and badge', () => {
    render(
      <WeekCard week={{ ...mockWeek, type: 'project' }} customProject="My portfolio site" />,
    );

    expect(screen.getByTestId('week-action')).toHaveTextContent(
      '[Custom] My portfolio site',
    );
    expect(screen.getByTestId('week-custom-badge')).toHaveTextContent('Custom');
  });
});
