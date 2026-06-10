// @vitest-environment jsdom

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResumeUploadStep } from './ResumeUploadStep';

vi.mock('../api', () => ({
  uploadResume: vi.fn(),
  uploadCoverLetter: vi.fn(),
  removeResume: vi.fn().mockResolvedValue({ ok: true }),
  removeCoverLetter: vi.fn().mockResolvedValue({ ok: true }),
}));

describe('ResumeUploadStep edit mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the current resume with remove and replace actions', () => {
    render(
      <ResumeUploadStep
        mode="edit"
        existingResumeS3Key="local/resumes/user-1/CV.pdf"
        existingResumeFileName="CV.pdf"
        onBack={() => {}}
        onComplete={() => {}}
      />,
    );

    expect(screen.getByTestId('current-resume-card')).toBeInTheDocument();
    expect(screen.getByText('CV.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).not.toBeDisabled();
  });

  it('shows the current cover letter sample when one exists', () => {
    render(
      <ResumeUploadStep
        mode="edit"
        existingResumeS3Key="local/resumes/user-1/CV.pdf"
        existingResumeFileName="CV.pdf"
        existingCoverLetterS3Key="local/cover-letters/user-1/sample.pdf"
        existingCoverLetterFileName="sample.pdf"
        onBack={() => {}}
        onComplete={() => {}}
      />,
    );

    expect(screen.getByTestId('current-cover-letter-card')).toBeInTheDocument();
    expect(screen.getByText('sample.pdf')).toBeInTheDocument();
  });

  it('returns to upload UI after removing the resume', async () => {
    const { removeResume } = await import('../api');

    render(
      <ResumeUploadStep
        mode="edit"
        existingResumeS3Key="local/resumes/user-1/CV.pdf"
        existingResumeFileName="CV.pdf"
        onBack={() => {}}
        onComplete={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(removeResume).toHaveBeenCalled();
      expect(screen.queryByTestId('current-resume-card')).not.toBeInTheDocument();
      expect(screen.getByText('Drop your resume here or choose a file')).toBeInTheDocument();
    });
  });
});
