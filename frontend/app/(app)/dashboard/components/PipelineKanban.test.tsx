/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PipelineKanban } from './PipelineKanban';
import type { Application } from '@/app/types/shared';
import type { ActionNeededItem } from '../types';

function makeApplication(overrides?: Partial<Application>): Application {
  return {
    application_id: 'app-001',
    user_id: 'user-001',
    job_id: 'job-001',
    verdict_id: 'verdict-001',
    company: 'Grab',
    role_title: 'Product Analyst',
    customised_resume_s3_key: 'demo/resume.pdf',
    customisation_applied: true,
    cover_letter_text: 'Cover letter',
    sent_at: '2026-06-01T08:00:00Z',
    recipient_email: 'careers@grab.com',
    email_thread_id: 'thread-001',
    status: 'sent',
    redirect_source_url: null,
    redirected_at: null,
    status_updated_at: '2026-06-01T08:00:00Z',
    classification_confidence: 90,
    ...overrides,
  };
}

function makeActionItem(overrides?: Partial<ActionNeededItem>): ActionNeededItem {
  return {
    job_id: 'job-006',
    application_id: null,
    company: 'ByteDance',
    role_title: 'Data Analyst',
    decision: 'deadlock_escalate',
    user_action_required: true,
    reason: 'Agents split 2-2.',
    created_at: '2026-06-09T05:05:00Z',
    has_employer_email: false,
    source_url: 'https://jobs.example.com/123',
    ...overrides,
  };
}

const noop = async () => {};
const noopSync = () => {};

const baseProps = {
  onOpenJob: () => {},
  onOpenGhosted: () => {},
  onApply: noopSync,
  onSend: noop,
  onSkip: noop,
  onSave: noop,
  onMarkSent: noop,
};

describe('PipelineKanban', () => {
  it('renders Needs Decision as the first column', () => {
    render(
      <PipelineKanban
        {...baseProps}
        applications={[makeApplication()]}
        actionNeeded={[makeActionItem()]}
        pendingSend={[]}
      />,
    );

    const columns = screen.getAllByTestId(/kanban-column-/);
    expect(columns[0]?.getAttribute('data-testid')).toBe(
      'kanban-column-needs_decision',
    );
    expect(columns[1]?.getAttribute('data-testid')).toBe(
      'kanban-column-pending_send',
    );
  });

  it('renders decision actions on needs-decision cards only', () => {
    render(
      <PipelineKanban
        {...baseProps}
        applications={[makeApplication()]}
        actionNeeded={[makeActionItem()]}
        pendingSend={[]}
      />,
    );

    expect(screen.getByTestId('decision-action-review')).toBeDefined();
    expect(screen.getByTestId('decision-action-skip')).toBeDefined();
    expect(screen.queryAllByTestId('decision-action-send')).toHaveLength(0);
  });

  it('renders pending send cards with apply-on-site actions', () => {
    render(
      <PipelineKanban
        {...baseProps}
        applications={[]}
        actionNeeded={[]}
        pendingSend={[
          makeActionItem({
            job_id: 'job-007',
            company: 'Ninja Van',
            decision: 'apply_with_caveat',
            user_action_required: false,
          }),
        ]}
      />,
    );

    expect(screen.getByTestId('pending-send-kanban-card')).toBeDefined();
    expect(screen.getByTestId('pending-send-apply-link')).toBeDefined();
    expect(screen.getByTestId('pending-send-mark-sent')).toBeDefined();
  });

  it('opens ghosted modal trigger', () => {
    const onOpenGhosted = vi.fn();
    render(
      <PipelineKanban
        {...baseProps}
        onOpenGhosted={onOpenGhosted}
        applications={[
          makeApplication({ status: 'ghosted', company: 'Wise' }),
        ]}
        actionNeeded={[]}
        pendingSend={[]}
      />,
    );

    fireEvent.click(screen.getByTestId('pipeline-ghosted-tab'));
    expect(onOpenGhosted).toHaveBeenCalled();
    expect(screen.getByTestId('pipeline-ghosted-count')).toHaveTextContent('1');
    expect(screen.queryByTestId('kanban-column-ghosted')).toBeNull();
  });

  it('opens job modal with showActions true from decision cards', () => {
    const onOpenJob = vi.fn();
    render(
      <PipelineKanban
        {...baseProps}
        onOpenJob={onOpenJob}
        applications={[]}
        actionNeeded={[makeActionItem()]}
        pendingSend={[]}
      />,
    );

    fireEvent.click(screen.getByTestId('decision-kanban-card'));
    expect(onOpenJob).toHaveBeenCalledWith('job-006', { showActions: true });
  });

  it('opens job modal with showActions false from pipeline cards', () => {
    const onOpenJob = vi.fn();
    render(
      <PipelineKanban
        {...baseProps}
        onOpenJob={onOpenJob}
        applications={[makeApplication({ job_id: 'job-001' })]}
        actionNeeded={[]}
        pendingSend={[]}
      />,
    );

    fireEvent.click(screen.getByTestId('kanban-card'));
    expect(onOpenJob).toHaveBeenCalledWith('job-001', { showActions: false });
  });
});
