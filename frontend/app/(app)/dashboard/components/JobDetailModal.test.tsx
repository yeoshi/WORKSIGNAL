/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { JobDetailModal } from './JobDetailModal';

vi.mock('../../jobs/hooks/useJobDetail', () => ({
  useJobDetail: vi.fn(),
}));

import { useJobDetail } from '../../jobs/hooks/useJobDetail';

const mockUseJobDetail = vi.mocked(useJobDetail);

function makeReadyState(overrides: {
  jobId?: string;
  coverLetter?: string;
  tailoringNotes?: string;
  resumeUrl?: string | null;
  showActionsData?: boolean;
} = {}) {
  const jobId = overrides.jobId ?? 'job-001';
  return {
    status: 'ready' as const,
    resumeUrl: overrides.resumeUrl ?? 'https://example.com/resume.pdf',
    baseResumeUrl: null,
    baseResumeS3Key: 'demo/original-resume.pdf',
    data: {
      job: {
        job_id: jobId,
        user_id: 'user-001',
        company: 'Grab',
        role_title: 'Analyst',
        salary_min: 5000,
        salary_max: 7000,
        jd_text: 'JD',
        posted_at: '2026-06-01T00:00:00Z',
        source_url: 'https://example.com',
        employer_email: 'hiring@grab.com',
        employment_type: 'full_time',
        work_arrangement: 'hybrid_remote',
        location: 'Singapore',
        ep_sponsorship_signal: false,
        mcf_listing_days: 5,
        scanned_at: '2026-06-01T00:00:00Z',
      },
      verdicts: {
        ambition: {
          verdict: 'apply',
          ambition_score: 80,
          reasoning: 'Good',
          key_argument: 'Growth',
        },
        realism: {
          verdict: 'apply',
          match_score: 75,
          key_gaps: [],
          work_life_flags: [],
          reasoning: 'Match',
          key_argument: 'Skills',
        },
        risk: {
          verdict: 'safe',
          risk_score: 20,
          red_flags: [],
          glassdoor_score: 4.0,
          reasoning: 'Low risk',
          key_argument: 'Stable',
        },
        opportunity: {
          verdict: 'act_now',
          urgency_score: 70,
          timing_factors: ['Fresh listing'],
          reasoning: 'Good timing',
          key_argument: 'Hiring',
        },
      },
      decision: {
        decision: 'deadlock_escalate',
        summary: 'Agents split — your call',
        agents_for: ['ambition', 'realism'],
        agents_against: ['risk', 'opportunity'],
        user_action_required: true,
      },
      materials: {
        resume_s3_key: 'resume.pdf',
        cover_letter_text: overrides.coverLetter ?? 'Pre-generated letter',
        customisation_applied: true,
      },
      coverLetter: overrides.coverLetter ?? 'Pre-generated letter',
      tailoringNotes: overrides.tailoringNotes ?? '- Lead with SQL wins',
    },
  };
}

describe('JobDetailModal', () => {
  beforeEach(() => {
    mockUseJobDetail.mockReturnValue({
      state: { status: 'loading' },
      handleAction: vi.fn(),
    } as ReturnType<typeof useJobDetail>);
    vi.stubGlobal('fetch', vi.fn());
  });

  it('shows loading state when open', () => {
    render(
      <JobDetailModal
        open
        jobId="job-001"
        showActions={false}
        onClose={() => {}}
      />,
    );

    expect(screen.getByTestId('job-detail-modal-loading')).toBeDefined();
  });

  it('hides action bar when showActions is false', () => {
    mockUseJobDetail.mockReturnValue({
      state: makeReadyState(),
      handleAction: vi.fn(),
    } as ReturnType<typeof useJobDetail>);

    render(
      <JobDetailModal
        open
        jobId="job-001"
        showActions={false}
        onClose={() => {}}
      />,
    );

    expect(screen.getByTestId('job-detail-view')).toBeDefined();
    expect(screen.queryByTestId('action-bar')).toBeNull();
    expect(screen.getByTestId('cover-letter-download')).toBeDefined();
  });

  it('shows pre-generated materials when showActions is true', async () => {
    mockUseJobDetail.mockReturnValue({
      state: makeReadyState({
        coverLetter: 'Dear Grab team...',
        tailoringNotes: '- Open with fintech experience',
      }),
      handleAction: vi.fn(),
    } as ReturnType<typeof useJobDetail>);

    render(
      <JobDetailModal
        open
        jobId="job-001"
        showActions={true}
        onClose={() => {}}
      />,
    );

    await waitFor(() => {
      const textarea = screen.getByTestId('cover-letter-textarea') as HTMLTextAreaElement;
      expect(textarea.value).toBe('Dear Grab team...');
    });

    expect(screen.getByTestId('tailoring-notes-text').textContent).toContain(
      'fintech experience',
    );
    expect(screen.getByTestId('resume-preview-pdf')).toBeDefined();
  });

  it('calls onSkipJob when Skip is clicked', async () => {
    const onSkipJob = vi.fn().mockResolvedValue(undefined);

    mockUseJobDetail.mockReturnValue({
      state: makeReadyState({ jobId: 'job-006' }),
      handleAction: vi.fn(),
    } as ReturnType<typeof useJobDetail>);

    render(
      <JobDetailModal
        open
        jobId="job-006"
        showActions={true}
        onClose={() => {}}
        onSkipJob={onSkipJob}
      />,
    );

    fireEvent.click(screen.getByTestId('action-skip'));

    await waitFor(() => {
      expect(onSkipJob).toHaveBeenCalledWith('job-006');
    });
  });

  it('hides Save in Needs Decision footer', () => {
    mockUseJobDetail.mockReturnValue({
      state: makeReadyState(),
      handleAction: vi.fn(),
    } as ReturnType<typeof useJobDetail>);

    render(
      <JobDetailModal
        open
        jobId="job-001"
        showActions={true}
        onClose={() => {}}
      />,
    );

    expect(screen.getByTestId('action-send')).toBeDefined();
    expect(screen.getByTestId('action-skip')).toBeDefined();
    expect(screen.queryByTestId('action-save')).toBeNull();
  });
});
