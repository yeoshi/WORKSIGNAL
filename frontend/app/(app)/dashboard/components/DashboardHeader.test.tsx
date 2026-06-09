/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DashboardHeader } from './DashboardHeader';
import type { AgentStatusSummary } from '../types';

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { name: 'Test User' } } }),
}));

function makeStatus(overrides?: Partial<AgentStatusSummary>): AgentStatusSummary {
  return {
    scanning: false,
    last_scan_at: '2026-06-09T05:00:00Z',
    next_scan_at: '2026-06-09T17:00:00Z',
    jobs_in_review: 2,
    ...overrides,
  };
}

describe('DashboardHeader', () => {
  it('renders greeting under the dashboard title', () => {
    render(
      <DashboardHeader
        agentStatus={makeStatus()}
        issueCount={0}
        onOpenIssues={() => {}}
      />,
    );

    expect(screen.getByTestId('dashboard-greeting').textContent).toContain('Test');
  });

  it('renders agent last and next scan meta', () => {
    render(
      <DashboardHeader
        agentStatus={makeStatus()}
        issueCount={0}
        onOpenIssues={() => {}}
      />,
    );

    expect(screen.getByTestId('agent-last-scan').textContent).toContain(
      'Last scan',
    );
    expect(screen.getByTestId('agent-next-scan').textContent).toContain(
      'Next run',
    );
  });

  it('shows warning button with badge when issues exist', () => {
    const onOpenIssues = vi.fn();
    render(
      <DashboardHeader
        agentStatus={makeStatus()}
        issueCount={2}
        onOpenIssues={onOpenIssues}
      />,
    );

    expect(screen.getByTestId('dashboard-issues-button')).toBeDefined();
    expect(screen.getByTestId('dashboard-issues-badge').textContent).toBe('2');

    fireEvent.click(screen.getByTestId('dashboard-issues-button'));
    expect(onOpenIssues).toHaveBeenCalledOnce();
  });

  it('hides warning button when there are no issues', () => {
    render(
      <DashboardHeader
        agentStatus={makeStatus()}
        issueCount={0}
        onOpenIssues={() => {}}
      />,
    );

    expect(screen.queryByTestId('dashboard-issues-button')).toBeNull();
  });
});
