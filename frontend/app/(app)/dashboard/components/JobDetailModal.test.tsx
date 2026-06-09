/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { JobDetailModal } from './JobDetailModal';

vi.mock('../../jobs/hooks/useJobDetail', () => ({
  useJobDetail: vi.fn(),
}));

import { useJobDetail } from '../../jobs/hooks/useJobDetail';

const mockUseJobDetail = vi.mocked(useJobDetail);

describe('JobDetailModal', () => {
  beforeEach(() => {
    mockUseJobDetail.mockReturnValue({
      state: { status: 'loading' },
      handleAction: vi.fn(),
    });
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
      state: {
        status: 'ready',
        resumeUrl: null,
        data: {
          job: {
            job_id: 'job-001',
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
            decision: 'apply_consensus',
            summary: 'Apply',
            agents_for: ['ambition', 'realism', 'risk', 'opportunity'],
            agents_against: [],
            user_action_required: false,
          },
          materials: {
            resume_s3_key: 'resume.pdf',
            cover_letter_text: 'Hello',
            customisation_applied: true,
          },
          coverLetter: 'Hello',
        },
      },
      handleAction: vi.fn(),
    });

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
  });
});
