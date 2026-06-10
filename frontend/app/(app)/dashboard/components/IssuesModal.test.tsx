/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IssuesModal } from './IssuesModal';
import type { DashboardIssue } from '../types';
import type { Filter_Relaxation_Suggestion } from '@/app/types/shared';

function makeIssue(): DashboardIssue {
  const suggestion: Filter_Relaxation_Suggestion = {
    suggestion_id: 'sug-001',
    user_id: 'user-123',
    created_at: '2024-06-01T00:00:00Z',
    scan_run_id: 'run-abc',
    target_non_negotiable: 'min_salary',
    current_value: 7000,
    proposed_value: 5600,
    rationale: 'Your filters may be too strict.',
    evidence_job_ids: ['job-1'],
    approval_state: 'pending',
  };
  return { type: 'relaxation_suggestion', suggestion };
}

describe('IssuesModal', () => {
  it('lists relaxation suggestions when open', () => {
    render(
      <IssuesModal
        open
        onClose={() => {}}
        issues={[makeIssue()]}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />,
    );

    expect(screen.getByTestId('issues-modal-body')).toBeDefined();
    expect(screen.getByTestId('relaxation-suggestion-prompt')).toBeDefined();
  });

  it('does not render when closed', () => {
    render(
      <IssuesModal
        open={false}
        onClose={() => {}}
        issues={[makeIssue()]}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('issues-modal-body')).toBeNull();
  });
});
