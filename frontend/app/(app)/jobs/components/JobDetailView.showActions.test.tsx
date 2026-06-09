/**
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { JobDetailView } from './JobDetailView';
import type { JobDetailData } from './jobDetailTypes';

function makeData(): JobDetailData {
  return {
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
  };
}

describe('JobDetailView showActions', () => {
  it('hides action bar when showActions is false', () => {
    render(<JobDetailView data={makeData()} showActions={false} />);
    expect(screen.queryByTestId('action-bar')).toBeNull();
  });

  it('shows action bar by default', () => {
    render(<JobDetailView data={makeData()} onAction={() => {}} />);
    expect(screen.getByTestId('action-bar')).toBeDefined();
  });

  it('shows download-only materials when showActions is false', () => {
    render(<JobDetailView data={makeData()} showActions={false} />);
    expect(screen.getByTestId('cover-letter-download')).toBeDefined();
    expect(screen.getByTestId('cover-letter-download-btn')).toBeDefined();
    expect(screen.queryByTestId('cover-letter-textarea')).toBeNull();
  });

  it('shows editable cover letter with download when showActions is true', () => {
    render(<JobDetailView data={makeData()} showActions={true} onAction={() => {}} />);
    expect(screen.getByTestId('cover-letter-editor')).toBeDefined();
    expect(screen.getByTestId('cover-letter-textarea')).toBeDefined();
    expect(screen.getByTestId('cover-letter-download-btn')).toBeDefined();
  });

  it('shows enabled resume download when showActions is true', () => {
    render(
      <JobDetailView
        data={makeData()}
        showActions={true}
        resumeUrl="https://s3.example.com/resume.pdf"
        onAction={() => {}}
      />,
    );
    const download = screen.getByTestId('resume-download');
    expect(download.tagName).toBe('A');
    expect(download.getAttribute('href')).toBe('https://s3.example.com/resume.pdf');
  });

  it('hides job header when embedded', () => {
    render(<JobDetailView data={makeData()} embedded showActions={false} />);
    expect(screen.queryByTestId('job-header')).toBeNull();
  });

  it('shows job header when not embedded', () => {
    render(<JobDetailView data={makeData()} showActions={false} />);
    expect(screen.getByTestId('job-header')).toBeDefined();
  });

  it('hides Save in Needs Decision action bar', () => {
    render(<JobDetailView data={makeData()} showActions={true} onAction={() => {}} />);
    expect(screen.getByTestId('action-send')).toBeDefined();
    expect(screen.queryByTestId('action-save')).toBeNull();
  });

  it('shows resume download button in read-only mode', () => {
    render(<JobDetailView data={makeData()} showActions={false} />);
    expect(screen.getByTestId('resume-download')).toBeDefined();
  });
});
